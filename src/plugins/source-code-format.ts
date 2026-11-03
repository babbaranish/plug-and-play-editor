const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/**
 * Elements that start a new line when they sit between other block elements.
 * Anything not listed here (span, a, strong, unknown tags, ...) is inline.
 */
const BLOCK_ELEMENTS = new Set([
    'html', 'head', 'body', 'title', 'meta', 'link', 'base', 'style', 'script',
    'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'hr', 'center',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'menu',
    'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
    'blockquote', 'section', 'article', 'aside', 'nav', 'main', 'header', 'footer',
    'address', 'figure', 'figcaption', 'form', 'fieldset', 'details', 'summary',
]);

/**
 * Emitted as outerHTML, never reformatted: their whitespace and newlines are content.
 * template is here because its children live in .content, not childNodes.
 */
const VERBATIM_ELEMENTS = new Set(['pre', 'textarea', 'script', 'style', 'code', 'template']);

/** white-space values that make spaces and newlines significant (as <pre> does). */
const PRESERVE_WHITESPACE_VALUES = new Set(['pre', 'pre-wrap', 'pre-line', 'break-spaces']);

/** Inline-level display values, after lowercasing and collapsing whitespace. */
const INLINE_DISPLAY = /^inline(?:[ -][a-z-]+)?$/;

/** HTML whitespace only. Deliberately excludes U+00A0, which is content. */
const HTML_WHITESPACE_ONLY = /^[ \t\n\r\f]*$/;

/** A doctype or a html/head/body tag means the input is a full document, not a fragment. */
const DOCUMENT_MARKER = /<!doctype[\s>]|<(html|head|body)[\s/>]/i;

function escapeText(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/ /g, '&nbsp;');
}

function escapeAttrValue(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Value of one property in the element's inline style attribute, normalised
 * (trimmed, lowercased, !important dropped, runs of whitespace collapsed).
 * The last declaration wins, as in CSS.
 */
function inlineStyleValue(el: Element, property: string): string | undefined {
    const style = el.getAttribute('style');
    if (!style) return undefined;
    let value: string | undefined;
    for (const decl of style.split(';')) {
        const colon = decl.indexOf(':');
        if (colon < 0 || decl.slice(0, colon).trim().toLowerCase() !== property) continue;
        value = decl
            .slice(colon + 1)
            .replace(/!\s*important/i, '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
    }
    return value;
}

/** An element set to an inline display (inline-block etc.) sits in a line of text, so it is inline. */
function hasInlineDisplay(el: Element): boolean {
    const display = inlineStyleValue(el, 'display');
    return display !== undefined && INLINE_DISPLAY.test(display);
}

function preservesWhitespace(el: Element): boolean {
    const whiteSpace = inlineStyleValue(el, 'white-space');
    return whiteSpace !== undefined && PRESERVE_WHITESPACE_VALUES.has(whiteSpace);
}

/** Written as outerHTML: a verbatim tag, or an element whose style keeps its whitespace. */
function isVerbatim(el: Element): boolean {
    return VERBATIM_ELEMENTS.has(el.localName) || preservesWhitespace(el);
}

function serializeAttrs(el: Element): string {
    return Array.from(el.attributes)
        .map(attr => ` ${attr.name}="${escapeAttrValue(attr.value)}"`)
        .join('');
}

function openTag(el: Element): string {
    return `<${el.localName}${serializeAttrs(el)}>`;
}

function serializeDoctype(doctype: DocumentType): string {
    let out = `<!DOCTYPE ${doctype.name}`;
    if (doctype.publicId) out += ` PUBLIC "${doctype.publicId}"`;
    if (doctype.systemId) out += `${doctype.publicId ? '' : ' SYSTEM'} "${doctype.systemId}"`;
    return `${out}>`;
}

function isWhitespaceText(node: Node): boolean {
    return node.nodeType === Node.TEXT_NODE && HTML_WHITESPACE_ONLY.test(node.textContent || '');
}

function isBlockElement(node: Node): boolean {
    return node.nodeType === Node.ELEMENT_NODE
        && BLOCK_ELEMENTS.has((node as Element).localName)
        && !hasInlineDisplay(node as Element);
}

/**
 * MSO conditional comments (`<!--[if mso]>...<![endif]-->`) and their downlevel
 * variants. They often carry table tags that only Outlook reads, so a newline
 * next to one can change how Outlook lays the email out.
 */
function isConditionalComment(node: Node): boolean {
    if (node.nodeType !== Node.COMMENT_NODE) return false;
    const text = node.textContent || '';
    return text.startsWith('[if') || text.endsWith('<![endif]');
}

/**
 * A block context holds at least one block-level child element and nothing else
 * but whitespace and comments. Its whitespace is insignificant between blocks, so
 * it can be laid out one child per line. Every other element is an inline context
 * and is written on a single line with all its text kept as-is. A context holding
 * a conditional comment is never a block context.
 */
function isBlockContext(parent: Node): boolean {
    let hasBlock = false;
    for (const child of Array.from(parent.childNodes)) {
        if (isConditionalComment(child)) return false;
        if (child.nodeType === Node.COMMENT_NODE || isWhitespaceText(child)) continue;
        if (!isBlockElement(child)) return false;
        hasBlock = true;
    }
    return hasBlock;
}

/** Single-line serialisation. Used for inline contexts, so nothing is trimmed or collapsed. */
function serializeInline(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent || '');
    if (node.nodeType === Node.COMMENT_NODE) return `<!--${node.textContent}-->`;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as Element;
    const tag = el.localName;
    if (isVerbatim(el)) return el.outerHTML;
    if (VOID_ELEMENTS.has(tag)) return `<${tag}${serializeAttrs(el)} />`;

    const inner = Array.from(el.childNodes).map(serializeInline).join('');
    return `${openTag(el)}${inner}</${tag}>`;
}

function formatNode(node: Node, depth: number, lines: string[]): void {
    const indent = '  '.repeat(depth);

    if (node.nodeType === Node.COMMENT_NODE) {
        lines.push(`${indent}<!--${node.textContent}-->`);
        return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tag = el.localName;

    if (isVerbatim(el)) {
        lines.push(`${indent}${el.outerHTML}`);
        return;
    }
    if (VOID_ELEMENTS.has(tag) || !isBlockContext(el)) {
        lines.push(`${indent}${serializeInline(el)}`);
        return;
    }

    lines.push(`${indent}${openTag(el)}`);
    formatChildren(el, depth + 1, lines);
    lines.push(`${indent}</${tag}>`);
}

/** Lays out the children of a block context. Whitespace-only text between blocks is dropped. */
function formatChildren(parent: Node, depth: number, lines: string[]): void {
    for (const child of Array.from(parent.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) continue;
        formatNode(child, depth, lines);
    }
}

/**
 * Pretty-prints HTML with line breaks and 2-space indentation at block-level
 * boundaries only. Inline content is never reflowed, so the rendered email is
 * unchanged. Full documents keep their doctype, html, head and body; fragments
 * stay fragments.
 */
export function formatHtml(html: string): string {
    if (HTML_WHITESPACE_ONLY.test(html)) return '';

    const parser = new DOMParser();
    const lines: string[] = [];

    if (DOCUMENT_MARKER.test(html)) {
        const doc = parser.parseFromString(html, 'text/html');
        Array.from(doc.childNodes).forEach(node => {
            if (node.nodeType === Node.DOCUMENT_TYPE_NODE) {
                lines.push(serializeDoctype(node as DocumentType));
            } else {
                formatNode(node, 0, lines);
            }
        });
        return lines.join('\n');
    }

    const doc = parser.parseFromString(
        `<!doctype html><html><body>${html}</body></html>`,
        'text/html'
    );
    const body = doc.body;
    if (isBlockContext(body)) {
        formatChildren(body, 0, lines);
    } else {
        lines.push(Array.from(body.childNodes).map(serializeInline).join(''));
    }
    return lines.join('\n');
}
