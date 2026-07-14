const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function escapeText(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttrValue(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function serializeAttrs(el: Element): string {
    return Array.from(el.attributes)
        .map(attr => ` ${attr.name}="${escapeAttrValue(attr.value)}"`)
        .join('');
}

function collapsedText(node: Node): string {
    return escapeText((node.textContent || '').replace(/\s+/g, ' ').trim());
}

function formatNode(node: Node, depth: number, lines: string[]): void {
    const indent = '  '.repeat(depth);

    if (node.nodeType === Node.TEXT_NODE) {
        const text = collapsedText(node);
        if (text) lines.push(`${indent}${text}`);
        return;
    }

    if (node.nodeType === Node.COMMENT_NODE) {
        lines.push(`${indent}<!--${node.textContent}-->`);
        return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const attrs = serializeAttrs(el);

    if (VOID_ELEMENTS.has(tag)) {
        lines.push(`${indent}<${tag}${attrs} />`);
        return;
    }

    const openTag = `<${tag}${attrs}>`;
    const children = Array.from(el.childNodes).filter(
        n => !(n.nodeType === Node.TEXT_NODE && !(n.textContent || '').trim())
    );

    if (children.length === 0) {
        lines.push(`${indent}${openTag}</${tag}>`);
        return;
    }

    // Collapse a single text-only child onto one line, e.g. <p>Hello</p>
    if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
        lines.push(`${indent}${openTag}${collapsedText(children[0])}</${tag}>`);
        return;
    }

    lines.push(`${indent}${openTag}`);
    children.forEach(child => formatNode(child, depth + 1, lines));
    lines.push(`${indent}</${tag}>`);
}

/** Pretty-prints an HTML fragment string with 2-space indentation per nesting level. */
export function formatHtml(html: string): string {
    const trimmed = html.trim();
    if (!trimmed) return '';

    const doc = new DOMParser().parseFromString(
        `<!doctype html><html><body>${html}</body></html>`,
        'text/html'
    );

    const lines: string[] = [];
    Array.from(doc.body.childNodes).forEach(node => formatNode(node, 0, lines));
    return lines.join('\n');
}
