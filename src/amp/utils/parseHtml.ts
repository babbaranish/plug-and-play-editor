/**
 * Parses an HTML fragment into an inert DocumentFragment: a <template>'s
 * content, so nothing in it loads, runs or touches the live page.
 */
export function parseHtml(html: string, doc: Document): DocumentFragment {
    const template = doc.createElement('template');
    template.innerHTML = html;
    return template.content;
}

/** The start of an element's markup, for issue messages. */
export function snippetOf(el: Element, max = 120): string {
    const html = el.outerHTML.replace(/\s+/g, ' ').trim();
    return html.length > max ? `${html.slice(0, max - 1)}…` : html;
}

/** Replaces `el` with its children. */
export function unwrap(el: Element): void {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
}

/** Replaces `el` with a new element of `tag`, keeping its attributes and children. */
export function rename(el: Element, tag: string): HTMLElement {
    const out = el.ownerDocument.createElement(tag);
    for (const a of Array.from(el.attributes)) out.setAttribute(a.name, a.value);
    while (el.firstChild) out.appendChild(el.firstChild);
    el.replaceWith(out);
    return out;
}
