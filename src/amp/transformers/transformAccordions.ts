import type { AmpTransformer } from '../types';

// Numeric node types: the global `Node` may not exist when converting on a server.
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function isBlankText(node: Node): boolean {
    return node.nodeType === TEXT_NODE && !(node.nodeValue ?? '').trim();
}

/** `details` and the run of `details` siblings that directly follow it, ignoring whitespace between them. */
function runFrom(first: Element): Element[] {
    const run = [first];
    let next = first.nextSibling;
    while (next) {
        if (isBlankText(next)) {
            next = next.nextSibling;
            continue;
        }
        if (next.nodeType === ELEMENT_NODE && (next as Element).tagName === 'DETAILS') {
            run.push(next as Element);
            next = next.nextSibling;
            continue;
        }
        break;
    }
    return run;
}

function toSection(details: Element, doc: Document): HTMLElement {
    const section = doc.createElement('section');
    if (details.hasAttribute('open')) section.setAttribute('expanded', '');

    const heading = doc.createElement('h4');
    const summary = Array.from(details.children).find(c => c.tagName === 'SUMMARY');
    if (summary) {
        while (summary.firstChild) heading.appendChild(summary.firstChild);
        summary.remove();
    }
    if (!heading.textContent?.trim()) heading.textContent = 'Details';

    // amp-accordion takes exactly one content element per section.
    const content = doc.createElement('div');
    const blocks = Array.from(details.childNodes).filter(n => !isBlankText(n));
    if (blocks.length === 1 && blocks[0].nodeType === ELEMENT_NODE && (blocks[0] as Element).tagName === 'DIV') {
        const only = blocks[0] as Element;
        while (only.firstChild) content.appendChild(only.firstChild);
        const style = only.getAttribute('style');
        if (style) content.setAttribute('style', style);
    } else {
        while (details.firstChild) content.appendChild(details.firstChild);
    }

    section.append(heading, content);
    return section;
}

/**
 * `<details>/<summary>` (the editor's accordion) become `<amp-accordion>`.
 * Adjacent `<details>` join one accordion, one section each; an open one
 * starts expanded. The HTML part of the email keeps the `<details>`.
 */
export const transformAccordions: AmpTransformer = (root, ctx) => {
    const { doc } = ctx;
    // Innermost first, so a nested accordion is converted before its parent moves it.
    const all = Array.from(root.querySelectorAll('details')).reverse();
    const done = new Set<Element>();
    for (const details of all) {
        if (done.has(details)) continue;
        // Start each run at its first member.
        let first: Element = details;
        let prev = first.previousSibling;
        while (prev && (isBlankText(prev) || (prev.nodeType === ELEMENT_NODE && (prev as Element).tagName === 'DETAILS'))) {
            if (prev.nodeType === ELEMENT_NODE) first = prev as Element;
            prev = prev.previousSibling;
        }
        const run = runFrom(first);
        run.forEach(d => done.add(d));

        const accordion = doc.createElement('amp-accordion');
        accordion.setAttribute('animate', '');
        first.before(accordion);
        for (const d of run) {
            accordion.appendChild(toSection(d, doc));
            d.remove();
        }
    }
};
