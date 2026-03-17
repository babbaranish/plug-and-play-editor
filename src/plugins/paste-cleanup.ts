import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';

const ALLOWED_TAGS = new Set([
    'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE',
    'A', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH',
    'IMG', 'HR', 'SUP', 'SUB', 'SPAN',
]);

const BLOCK_TAGS = new Set([
    'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'NAV', 'ASIDE',
]);

function cleanHtml(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const body = doc.body;

    // Remove style, script, xml, meta, link, and MSO elements
    body.querySelectorAll('style, script, xml, meta, link, title').forEach(el => el.remove());

    // Remove MSO-specific elements (o:p, w:sdt, etc.)
    body.querySelectorAll('*').forEach(el => {
        if (el.tagName.includes(':')) el.remove();
    });

    // Remove comments
    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_COMMENT);
    const comments: Comment[] = [];
    while (walker.nextNode()) comments.push(walker.currentNode as Comment);
    comments.forEach(c => c.remove());

    // Process all elements
    const allEls = Array.from(body.querySelectorAll('*'));
    for (const el of allEls) {
        if (!el.parentNode) continue;
        const tag = el.tagName;

        // Convert block-level non-semantic tags to <p>
        if (BLOCK_TAGS.has(tag)) {
            const p = doc.createElement('p');
            while (el.firstChild) p.appendChild(el.firstChild);
            el.parentNode.replaceChild(p, el);
            continue;
        }

        // Unwrap <font> elements — keep children
        if (tag === 'FONT') {
            const frag = doc.createDocumentFragment();
            while (el.firstChild) frag.appendChild(el.firstChild);
            el.parentNode.replaceChild(frag, el);
            continue;
        }

        // Remove disallowed tags but keep children
        if (!ALLOWED_TAGS.has(tag)) {
            const frag = doc.createDocumentFragment();
            while (el.firstChild) frag.appendChild(el.firstChild);
            el.parentNode.replaceChild(frag, el);
            continue;
        }

        // Strip attributes (keep href/target/rel on links, src/alt on images)
        const attrsToRemove: string[] = [];
        for (let i = 0; i < el.attributes.length; i++) {
            const name = el.attributes[i].name;
            if (tag === 'A' && (name === 'href' || name === 'target' || name === 'rel')) continue;
            if (tag === 'IMG' && (name === 'src' || name === 'alt' || name === 'width' || name === 'height')) continue;
            // Keep text-align style on block elements
            if (name === 'style' && el.getAttribute('style')?.includes('text-align')) {
                const match = el.getAttribute('style')?.match(/text-align:\s*\w+/);
                if (match) {
                    el.setAttribute('style', match[0]);
                    continue;
                }
            }
            attrsToRemove.push(name);
        }
        attrsToRemove.forEach(a => el.removeAttribute(a));
    }

    return body.innerHTML;
}

export const PasteCleanupPlugin: Plugin = {
    name: 'paste-cleanup',
    init(editor: Editor) {
        const pasteHandler = (e: ClipboardEvent) => {
            if (!e.clipboardData) return;

            // Let PasteImagePlugin handle image pastes
            const items = Array.from(e.clipboardData.items);
            if (items.some(item => item.type.startsWith('image/'))) return;

            const html = e.clipboardData.getData('text/html');
            if (!html) return; // Plain text pastes are fine as-is

            e.preventDefault();
            const cleaned = cleanHtml(html);
            editor.exec('insertHTML', cleaned);
        };

        const keydownHandler = (e: KeyboardEvent) => {
            // Ctrl+Shift+V = paste as plain text
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'v') {
                e.preventDefault();
                navigator.clipboard.readText().then(text => {
                    if (text) {
                        editor.exec('insertText', text);
                    }
                }).catch(() => {
                    // Clipboard API not available, silently fail
                });
            }
        };

        editor.editorArea.addEventListener('paste', pasteHandler);
        editor.editorArea.addEventListener('keydown', keydownHandler);

        editor.onDestroy(() => {
            editor.editorArea.removeEventListener('paste', pasteHandler);
            editor.editorArea.removeEventListener('keydown', keydownHandler);
        });
    }
};
