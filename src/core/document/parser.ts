/**
 * Parser: DOM -> Document. The only module that reads the live DOM and
 * produces structured Nodes. Converse of serializer.ts.
 *
 * The parser is opinionated about normalisation:
 *  - Adjacent Text nodes with identical mark sets are merged.
 *  - Empty paragraphs are preserved (they are significant to the user).
 *  - Unknown tags are best-effort: if they contain inline content, they
 *    are unwrapped; if block content, they are coerced to <p>.
 *  - Styles are read only for the attributes we model in `Mark` or on
 *    block nodes (alignment, color, font-size). Everything else is
 *    dropped — round-tripping isn't the goal; round-tripping the
 *    editor's own output is.
 */

import type {
    BlockNode,
    Doc,
    HeadingNode,
    InlineNode,
    ListItemNode,
    ListNode,
    Mark,
    TableCellNode,
    TableRowNode,
    AccordionSectionNode,
    AccordionNode,
    TextNode,
    ParagraphNode
} from './types';
import {
    blockquote,
    doc,
    hardBreak,
    heading,
    hr,
    list,
    listItem,
    pageBreak,
    paragraph,
    text
} from './types';

/** Parse the editor's root element into a Doc. */
export function parseDom(root: HTMLElement): Doc {
    const blocks: BlockNode[] = [];
    collectBlocks(root, blocks);
    return doc(blocks);
}

function collectBlocks(parent: HTMLElement, out: BlockNode[]): void {
    for (const child of Array.from(parent.childNodes)) {
        const block = toBlock(child);
        if (block) {
            if (Array.isArray(block)) out.push(...block);
            else out.push(block);
        }
    }
}

function toBlock(node: Node): BlockNode | BlockNode[] | null {
    if (node.nodeType === Node.TEXT_NODE) {
        // Stray text at block level — wrap in paragraph.
        const value = (node as Text).data;
        if (value.trim() === '') return null;
        return paragraph([text(value)]);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node as HTMLElement;
    const tag = el.tagName;

    switch (tag) {
        case 'P': return paragraph(collectInline(el)) as ParagraphNode;
        case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
            return heading(parseInt(tag[1], 10) as HeadingNode['level'], collectInline(el));
        case 'BLOCKQUOTE': {
            const nested: BlockNode[] = [];
            collectBlocks(el, nested);
            return blockquote(nested);
        }
        case 'UL': return parseList(el, false);
        case 'OL': return parseList(el, true);
        case 'HR': return hr();
        case 'TABLE': return parseTable(el);
        case 'PRE': {
            const code = el.querySelector('code');
            const source = code ? code.textContent : el.textContent;
            return {
                type: 'code-block',
                language: code?.getAttribute('data-lang') || undefined,
                children: [text(source || '')]
            };
        }
        case 'IMG': {
            const src = el.getAttribute('src') || '';
            return {
                type: 'image',
                src,
                alt: el.getAttribute('alt') || undefined,
                width: parseIntOr(el.getAttribute('width')),
                height: parseIntOr(el.getAttribute('height'))
            };
        }
        case 'IFRAME': {
            const src = el.getAttribute('src') || '';
            return {
                type: 'embed',
                src,
                width: parseIntOr(el.getAttribute('width')),
                height: parseIntOr(el.getAttribute('height'))
            };
        }
        case 'DIV': {
            if (el.classList.contains('play-editor-page-break')) return pageBreak();
            if (el.classList.contains('play-editor-accordion')) return parseAccordion(el);
            if (el.classList.contains('play-editor-media-wrapper')) {
                const iframe = el.querySelector('iframe');
                if (iframe) {
                    return {
                        type: 'embed',
                        src: iframe.getAttribute('src') || '',
                        width: parseIntOr(iframe.getAttribute('width')),
                        height: parseIntOr(iframe.getAttribute('height'))
                    };
                }
            }
            // Unknown block-level div — coerce to paragraph with inline children.
            const inlines = collectInline(el);
            if (inlines.length === 0) return null;
            return paragraph(inlines);
        }
        default: {
            // Any other tag at block level — if inline-like, wrap in <p>.
            const inlines = collectInline(el);
            if (inlines.length > 0) return paragraph(inlines);
            return null;
        }
    }
}

function parseList(el: HTMLElement, ordered: boolean): ListNode {
    const items: ListItemNode[] = [];
    for (const child of Array.from(el.childNodes)) {
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const ch = child as HTMLElement;
        if (ch.tagName !== 'LI') continue;
        const blocks: BlockNode[] = [];
        const firstInlineSpan: InlineNode[] = [];
        // Split LI children into leading inlines (auto-wrapped in <p>) + nested blocks.
        for (const g of Array.from(ch.childNodes)) {
            if (g.nodeType === Node.ELEMENT_NODE && isBlockLevelTag((g as HTMLElement).tagName)) {
                if (firstInlineSpan.length > 0) {
                    blocks.push(paragraph([...firstInlineSpan]));
                    firstInlineSpan.length = 0;
                }
                const nested = toBlock(g);
                if (nested) {
                    if (Array.isArray(nested)) blocks.push(...nested);
                    else blocks.push(nested);
                }
            } else {
                firstInlineSpan.push(...inlineFromNode(g));
            }
        }
        if (firstInlineSpan.length > 0) blocks.push(paragraph(firstInlineSpan));
        if (blocks.length === 0) blocks.push(paragraph([]));
        items.push(listItem(blocks));
    }
    return list(ordered, items);
}

function parseTable(el: HTMLElement): BlockNode {
    const rows: TableRowNode[] = [];
    for (const tr of Array.from(el.querySelectorAll('tr'))) {
        const cells: TableCellNode[] = [];
        for (const td of Array.from(tr.children)) {
            const header = (td as HTMLElement).tagName === 'TH';
            const inner: BlockNode[] = [];
            collectBlocks(td as HTMLElement, inner);
            if (inner.length === 0) {
                const inlines = collectInline(td as HTMLElement);
                inner.push(paragraph(inlines));
            }
            cells.push({ type: 'table-cell', header, children: inner });
        }
        rows.push({ type: 'table-row', children: cells });
    }
    return { type: 'table', children: rows };
}

function parseAccordion(el: HTMLElement): AccordionNode {
    const sections: AccordionSectionNode[] = [];
    for (const det of Array.from(el.querySelectorAll(':scope > details, :scope > .play-editor-accordion-section'))) {
        const summary = det.querySelector('summary') || det.querySelector('.play-editor-accordion-summary');
        const summaryInline = summary ? collectInline(summary as HTMLElement) : [];
        const bodyRoot = det as HTMLElement;
        const bodyBlocks: BlockNode[] = [];
        for (const child of Array.from(bodyRoot.childNodes)) {
            if (child === summary) continue;
            const blk = toBlock(child);
            if (blk) {
                if (Array.isArray(blk)) bodyBlocks.push(...blk);
                else bodyBlocks.push(blk);
            }
        }
        sections.push({ type: 'accordion-section', summary: summaryInline, children: bodyBlocks });
    }
    return { type: 'accordion', children: sections };
}

function isBlockLevelTag(tag: string): boolean {
    return [
        'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE',
        'UL', 'OL', 'HR', 'TABLE', 'PRE', 'DIV', 'DETAILS'
    ].includes(tag);
}

function collectInline(parent: HTMLElement, accumulatedMarks: readonly Mark[] = []): InlineNode[] {
    const out: InlineNode[] = [];
    for (const node of Array.from(parent.childNodes)) {
        out.push(...inlineFromNode(node, accumulatedMarks));
    }
    return mergeAdjacentText(out);
}

function inlineFromNode(node: Node, accumulatedMarks: readonly Mark[] = []): InlineNode[] {
    if (node.nodeType === Node.TEXT_NODE) {
        const value = (node as Text).data;
        if (!value) return [];
        return [text(value, accumulatedMarks)];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const el = node as HTMLElement;
    const tag = el.tagName;

    switch (tag) {
        case 'BR': return [hardBreak()];
        case 'IMG': {
            return [{
                type: 'inline-image',
                src: el.getAttribute('src') || '',
                alt: el.getAttribute('alt') || undefined
            }];
        }
        case 'B': case 'STRONG':
            return collectInline(el, addMark(accumulatedMarks, { type: 'bold' }));
        case 'I': case 'EM':
            return collectInline(el, addMark(accumulatedMarks, { type: 'italic' }));
        case 'U':
            return collectInline(el, addMark(accumulatedMarks, { type: 'underline' }));
        case 'S': case 'STRIKE': case 'DEL':
            return collectInline(el, addMark(accumulatedMarks, { type: 'strike' }));
        case 'CODE':
            return collectInline(el, addMark(accumulatedMarks, { type: 'code' }));
        case 'A': {
            const href = el.getAttribute('href') || '';
            const mark: Mark = {
                type: 'link',
                href,
                target: el.getAttribute('target') || undefined,
                rel: el.getAttribute('rel') || undefined
            };
            return collectInline(el, addMark(accumulatedMarks, mark));
        }
        case 'SPAN': {
            if (el.classList.contains('play-editor-mention')) {
                return [{
                    type: 'mention',
                    userId: el.dataset.userId || '',
                    name: (el.textContent || '').replace(/^@/, '')
                }];
            }
            if (el.classList.contains('play-editor-token')) {
                return [{
                    type: 'token',
                    key: el.dataset.key || '',
                    label: el.textContent || el.dataset.key || ''
                }];
            }
            // Generic SPAN — inspect inline styles for font/color marks.
            let marks = accumulatedMarks;
            const style = el.style;
            if (style.color) marks = addMark(marks, { type: 'color', value: style.color });
            if (style.backgroundColor) marks = addMark(marks, { type: 'background', value: style.backgroundColor });
            if (style.fontSize) marks = addMark(marks, { type: 'font-size', value: style.fontSize });
            if (style.fontFamily) marks = addMark(marks, { type: 'font-family', value: style.fontFamily });
            return collectInline(el, marks);
        }
        default:
            // Unknown inline element — unwrap.
            return collectInline(el, accumulatedMarks);
    }
}

function addMark(existing: readonly Mark[], m: Mark): readonly Mark[] {
    // For singleton marks (bold, italic, etc.), avoid duplicates.
    if (existing.some(x => x.type === m.type && markEquals(x, m))) return existing;
    return [...existing, m];
}

function markEquals(a: Mark, b: Mark): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

function mergeAdjacentText(nodes: readonly InlineNode[]): InlineNode[] {
    const out: InlineNode[] = [];
    for (const n of nodes) {
        const last = out[out.length - 1];
        if (n.type === 'text' && last && last.type === 'text' && markSetsEqual(last.marks, n.marks)) {
            out[out.length - 1] = text(last.text + n.text, last.marks);
        } else {
            out.push(n);
        }
    }
    return out;
}

function markSetsEqual(a: readonly Mark[], b: readonly Mark[]): boolean {
    if (a.length !== b.length) return false;
    const ka = a.map(m => JSON.stringify(m)).sort();
    const kb = b.map(m => JSON.stringify(m)).sort();
    return ka.every((v, i) => v === kb[i]);
}

function parseIntOr(v: string | null): number | undefined {
    if (!v) return undefined;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
}

// Type narrowing: compile-time only assertion for exported TextNode/ParagraphNode symbols.
export type { TextNode, ParagraphNode };
