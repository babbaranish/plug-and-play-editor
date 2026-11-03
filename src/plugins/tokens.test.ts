import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '../core/Editor';
import { createTokensPlugin } from './tokens';

// Inserting a token from the dropdown must not add a character after the chip.
// The caret lands right after the chip, with no stray space.

let editor: Editor | null = null;

afterEach(() => {
    editor?.destroy();
    editor = null;
    document.body.innerHTML = '';
});

function mount(html: string): Editor {
    const ta = document.createElement('textarea');
    ta.value = html;
    document.body.appendChild(ta);
    editor = new Editor(ta, [createTokensPlugin({ tokens: [{ key: 'registered_name', label: 'Registered Name' }] })]);
    return editor;
}

function select(startNode: Node, startOffset: number, endNode: Node = startNode, endOffset: number = startOffset): void {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
}

/** Opens the Insert Variable dropdown and picks the token with the given label. */
function insertFromDropdown(ed: Editor, label: string): void {
    const btn = ed.toolbar.querySelector<HTMLButtonElement>('button[title="Insert Variable"]');
    expect(btn).not.toBeNull();
    btn!.click();

    const items = Array.from(ed.container.querySelectorAll<HTMLElement>('.play-editor-token-item'));
    const item = items.find(el => el.querySelector('.play-editor-token-item-label')?.textContent === label);
    expect(item).toBeDefined();
    item!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

describe('token insertion spacing', () => {
    it('inserts between "Dear " and "," with no character after the chip', () => {
        const ed = mount('<p>Dear ,</p>');
        const p = ed.editorArea.querySelector('p')!;
        const text = p.firstChild!;
        select(text, 5); // caret after "Dear "

        insertFromDropdown(ed, 'Registered Name');

        const span = p.querySelector<HTMLElement>('span.play-editor-token')!;
        expect(span).not.toBeNull();
        expect(span.dataset.token).toBe('registered_name');
        expect(p.textContent).toBe('Dear {{registered_name}},');
        expect(p.innerHTML).not.toContain('&nbsp;');
        expect(p.innerHTML).not.toContain(' ');
        expect(span.nextSibling!.nodeType).toBe(Node.TEXT_NODE);
        expect(span.nextSibling!.textContent).toBe(',');
        expect(ed.textArea.value).toBe(ed.editorArea.innerHTML);
    });

    it('leaves no trailing character when inserted at the end of a paragraph', () => {
        const ed = mount('<p>Dear </p>');
        const p = ed.editorArea.querySelector('p')!;
        select(p.firstChild!, 5); // caret at the end of "Dear "

        insertFromDropdown(ed, 'Registered Name');

        const span = p.querySelector('span.play-editor-token')!;
        expect(span).not.toBeNull();
        expect(p.textContent).toBe('Dear {{registered_name}}');
        expect(p.innerHTML).not.toContain('&nbsp;');
        expect(p.innerHTML).not.toContain(' ');
        expect(p.innerHTML.endsWith('</span>')).toBe(true);
        expect(ed.textArea.value).toBe(ed.editorArea.innerHTML);
    });

    it('collapses the selection right after the chip', () => {
        const ed = mount('<p>Dear ,</p>');
        const p = ed.editorArea.querySelector('p')!;
        select(p.firstChild!, 5);

        insertFromDropdown(ed, 'Registered Name');

        const span = p.querySelector('span.play-editor-token')!;
        const sel = window.getSelection()!;
        expect(sel.rangeCount).toBe(1);
        expect(sel.isCollapsed).toBe(true);
        expect(sel.anchorNode).toBe(span.nextSibling);
        expect(sel.anchorOffset).toBe(0);
    });

    it('collapses the selection into the empty text node when the chip ends the paragraph', () => {
        const ed = mount('<p>Dear </p>');
        const p = ed.editorArea.querySelector('p')!;
        select(p.firstChild!, 5);

        insertFromDropdown(ed, 'Registered Name');

        const span = p.querySelector('span.play-editor-token')!;
        const sel = window.getSelection()!;
        expect(sel.isCollapsed).toBe(true);
        expect(sel.anchorNode).toBe(span.nextSibling);
        expect(sel.anchorNode!.nodeType).toBe(Node.TEXT_NODE);
        expect(sel.anchorNode!.textContent).toBe('');
        expect(sel.anchorOffset).toBe(0);
    });
});
