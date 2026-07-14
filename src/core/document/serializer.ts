/**
 * Serializer: Document -> DOM / HTML string. Converse of parser.ts.
 *
 * Produces the same HTML shape the editor's plugins currently produce,
 * so a round-trip (parse -> serialize -> parse) is idempotent. That is
 * the correctness contract relied on by the renderer and the transform
 * replay layer.
 */

import type {
    AccordionSectionNode,
    BlockNode,
    Doc,
    InlineNode,
    ListItemNode,
    Mark,
    TableCellNode,
    TableRowNode,
    TextNode
} from './types';
import { assertNever } from '../selection';

// Alias the DOM's Node type so we can refer to it unambiguously below —
// the document-model's `Node` is deliberately not imported here so it
// can't shadow the DOM one.
type DomNode = globalThis.Node;

export function serializeToDom(docNode: Doc, target: Document = document): DocumentFragment {
    const frag = target.createDocumentFragment();
    for (const block of docNode.children) {
        const el = blockToDom(block, target);
        if (el) frag.appendChild(el);
    }
    return frag;
}

export function serializeToHtml(docNode: Doc): string {
    const frag = serializeToDom(docNode);
    const wrapper = document.createElement('div');
    wrapper.appendChild(frag);
    return wrapper.innerHTML;
}

function blockToDom(node: BlockNode, target: Document): HTMLElement | null {
    switch (node.type) {
        case 'paragraph': {
            const p = target.createElement('p');
            if (node.align) p.style.textAlign = node.align;
            appendInline(p, node.children, target);
            ensureAtLeastBr(p, target);
            return p;
        }
        case 'heading': {
            const h = target.createElement(`h${node.level}`);
            appendInline(h, node.children, target);
            return h;
        }
        case 'blockquote': {
            const q = target.createElement('blockquote');
            for (const child of node.children) {
                const el = blockToDom(child, target);
                if (el) q.appendChild(el);
            }
            return q;
        }
        case 'list': {
            const l = target.createElement(node.ordered ? 'ol' : 'ul');
            for (const item of node.children) l.appendChild(listItemToDom(item, target));
            return l;
        }
        case 'code-block': {
            const pre = target.createElement('pre');
            const code = target.createElement('code');
            if (node.language) code.setAttribute('data-lang', node.language);
            code.textContent = node.children.map(t => t.text).join('');
            pre.appendChild(code);
            return pre;
        }
        case 'hr': return target.createElement('hr');
        case 'page-break': {
            const div = target.createElement('div');
            div.className = 'play-editor-page-break';
            return div;
        }
        case 'image': {
            const img = target.createElement('img');
            img.src = node.src;
            if (node.alt) img.alt = node.alt;
            if (node.width) img.width = node.width;
            if (node.height) img.height = node.height;
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            return img;
        }
        case 'embed': {
            const wrapper = target.createElement('div');
            wrapper.className = 'play-editor-media-wrapper';
            const iframe = target.createElement('iframe');
            iframe.src = node.src;
            iframe.setAttribute('frameborder', '0');
            iframe.setAttribute('allowfullscreen', '');
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-presentation');
            iframe.setAttribute('referrerpolicy', 'no-referrer');
            iframe.setAttribute('loading', 'lazy');
            if (node.width) iframe.width = String(node.width);
            if (node.height) iframe.height = String(node.height);
            iframe.style.maxWidth = '100%';
            wrapper.appendChild(iframe);
            return wrapper;
        }
        case 'table': {
            const table = target.createElement('table');
            table.className = 'play-editor-table';
            const tbody = target.createElement('tbody');
            for (const row of node.children) tbody.appendChild(tableRowToDom(row, target));
            table.appendChild(tbody);
            return table;
        }
        case 'accordion': {
            const div = target.createElement('div');
            div.className = 'play-editor-accordion';
            for (const section of node.children) div.appendChild(accordionSectionToDom(section, target));
            return div;
        }
        default:
            return assertNever(node as never);
    }
}

function listItemToDom(item: ListItemNode, target: Document): HTMLElement {
    const li = target.createElement('li');
    // If the item has exactly one paragraph, inline its children directly (so
    // lists don't render as "<li><p>text</p></li>").
    if (item.children.length === 1 && item.children[0].type === 'paragraph') {
        appendInline(li, item.children[0].children, target);
    } else {
        for (const child of item.children) {
            const el = blockToDom(child, target);
            if (el) li.appendChild(el);
        }
    }
    return li;
}

function tableRowToDom(row: TableRowNode, target: Document): HTMLElement {
    const tr = target.createElement('tr');
    for (const cell of row.children) tr.appendChild(tableCellToDom(cell, target));
    return tr;
}

function tableCellToDom(cell: TableCellNode, target: Document): HTMLElement {
    const td = target.createElement(cell.header ? 'th' : 'td');
    if (cell.children.length === 1 && cell.children[0].type === 'paragraph') {
        appendInline(td, cell.children[0].children, target);
    } else {
        for (const child of cell.children) {
            const el = blockToDom(child, target);
            if (el) td.appendChild(el);
        }
    }
    if (td.childNodes.length === 0) td.appendChild(target.createElement('br'));
    return td;
}

function accordionSectionToDom(section: AccordionSectionNode, target: Document): HTMLElement {
    const details = target.createElement('details');
    details.className = 'play-editor-accordion-section';
    const summary = target.createElement('summary');
    summary.className = 'play-editor-accordion-summary';
    appendInline(summary, section.summary, target);
    details.appendChild(summary);
    for (const child of section.children) {
        const el = blockToDom(child, target);
        if (el) details.appendChild(el);
    }
    return details;
}

function appendInline(parent: HTMLElement, inlines: readonly InlineNode[], target: Document): void {
    for (const inline of inlines) {
        const node = inlineToDom(inline, target);
        if (node) parent.appendChild(node);
    }
}

function inlineToDom(node: InlineNode, target: Document): DomNode | null {
    switch (node.type) {
        case 'text': return wrapMarks(target.createTextNode(node.text), node.marks, target);
        case 'break': return target.createElement('br');
        case 'inline-image': {
            const img = target.createElement('img');
            img.src = node.src;
            if (node.alt) img.alt = node.alt;
            return img;
        }
        case 'mention': {
            const span = target.createElement('span');
            span.className = 'play-editor-mention';
            span.contentEditable = 'false';
            span.dataset.userId = node.userId;
            span.textContent = `@${node.name}`;
            return span;
        }
        case 'token': {
            const span = target.createElement('span');
            span.className = 'play-editor-token';
            span.contentEditable = 'false';
            span.dataset.key = node.key;
            span.textContent = node.label;
            return span;
        }
        default:
            return assertNever(node);
    }
}

function wrapMarks(inner: DomNode, marks: readonly Mark[], target: Document): DomNode {
    if (marks.length === 0) return inner;
    // Apply marks from innermost (first in the array) outward.
    let current: DomNode = inner;
    for (const mark of marks) current = wrapOneMark(current, mark, target);
    return current;
}

function wrapOneMark(inner: DomNode, mark: Mark, target: Document): HTMLElement {
    switch (mark.type) {
        case 'bold': return wrapTag(inner, 'strong', target);
        case 'italic': return wrapTag(inner, 'em', target);
        case 'underline': return wrapTag(inner, 'u', target);
        case 'strike': return wrapTag(inner, 's', target);
        case 'code': return wrapTag(inner, 'code', target);
        case 'link': {
            const a = target.createElement('a');
            a.href = mark.href;
            if (mark.target) a.target = mark.target;
            if (mark.rel) a.rel = mark.rel;
            a.appendChild(inner);
            return a;
        }
        case 'color':
        case 'background':
        case 'font-size':
        case 'font-family': {
            const span = target.createElement('span');
            if (mark.type === 'color') span.style.color = mark.value;
            if (mark.type === 'background') span.style.backgroundColor = mark.value;
            if (mark.type === 'font-size') span.style.fontSize = mark.value;
            if (mark.type === 'font-family') span.style.fontFamily = mark.value;
            span.appendChild(inner);
            return span;
        }
        default:
            return assertNever(mark);
    }
}

function wrapTag(inner: DomNode, tag: string, target: Document): HTMLElement {
    const el = target.createElement(tag);
    el.appendChild(inner);
    return el;
}

function ensureAtLeastBr(el: HTMLElement, target: Document): void {
    // Empty paragraphs need an explicit <br> or the browser collapses them.
    if (el.childNodes.length === 0) el.appendChild(target.createElement('br'));
}

// Re-export for convenience.
export type { TextNode };
