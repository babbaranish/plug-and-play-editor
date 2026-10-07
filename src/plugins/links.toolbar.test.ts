import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '../core/Editor';
import { createLinksPlugin } from './links';

// The toolbar's link button with the selection inside an existing link must
// edit that link. It used to open an empty "Insert Link" dialog, and saving it
// nested a new <a> inside the old one, which kept its old href.

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
    editor = new Editor(ta, [createLinksPlugin({ tokens: [] })]);
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

function clickInsertLink(ed: Editor): void {
    const btn = ed.toolbar.querySelector<HTMLButtonElement>('button[title="Insert Link"]');
    expect(btn).not.toBeNull();
    btn!.click();
}

const modal = (ed: Editor) => ed.container.querySelector('.play-editor-modal');
const modalTitle = (ed: Editor) => modal(ed)?.querySelector('.play-editor-modal-title')?.textContent;
const field = (ed: Editor, name: string) => modal(ed)?.querySelector<HTMLInputElement>(`input[name="${name}"]`);

function submit(ed: Editor, url: string): void {
    field(ed, 'url')!.value = url;
    modal(ed)!.querySelector<HTMLButtonElement>('.play-editor-modal-submit')!.click();
}

describe('links toolbar button', () => {
    it('edits the link under a collapsed caret instead of nesting a new one', () => {
        const ed = mount('<p>For more: <a href="https://old.test">executive education</a></p>');
        const a = ed.editorArea.querySelector('a')!;
        select(a.firstChild!, 3);

        clickInsertLink(ed);
        expect(modalTitle(ed)).toBe('Edit Link');
        expect(field(ed, 'url')!.value).toBe('https://old.test');

        submit(ed, 'https://new.test');
        const anchors = ed.editorArea.querySelectorAll('a');
        expect(anchors).toHaveLength(1);
        expect(anchors[0].getAttribute('href')).toBe('https://new.test');
        expect(anchors[0].textContent).toBe('executive education');
    });

    it('edits the link when the selection lies wholly inside it', () => {
        const ed = mount('<p><a href="https://old.test">Register now</a></p>');
        const text = ed.editorArea.querySelector('a')!.firstChild!;
        select(text, 0, text, 8);

        clickInsertLink(ed);
        expect(modalTitle(ed)).toBe('Edit Link');
    });

    it('still inserts a new link when the selection runs past a link', () => {
        const ed = mount('<p>Hi <a href="https://old.test">there</a> friend</p>');
        const p = ed.editorArea.querySelector('p')!;
        const a = ed.editorArea.querySelector('a')!;
        select(a.firstChild!, 1, p.lastChild!, 3);

        clickInsertLink(ed);
        expect(modalTitle(ed)).toBe('Insert Link');
    });

    it('still inserts a new link from plain text', () => {
        const ed = mount('<p>Plain text here</p>');
        select(ed.editorArea.querySelector('p')!.firstChild!, 0, ed.editorArea.querySelector('p')!.firstChild!, 5);

        clickInsertLink(ed);
        expect(modalTitle(ed)).toBe('Insert Link');
    });
});
