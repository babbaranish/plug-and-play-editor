import { describe, it, expect, afterEach, vi } from 'vitest';
import { Editor } from '../core/Editor';
import { SourceCodePlugin } from './source-code';

const editors: Editor[] = [];

afterEach(() => {
    editors.splice(0).forEach((ed) => ed.destroy());
    document.body.innerHTML = '';
});

function mount(html: string): Editor {
    const ta = document.createElement('textarea');
    ta.value = html;
    document.body.appendChild(ta);
    const ed = new Editor(ta, [SourceCodePlugin]);
    editors.push(ed);
    return ed;
}

function openSource(ed: Editor): HTMLTextAreaElement {
    ed.toolbar.querySelector<HTMLButtonElement>('button[title="Source Code"]')!.click();
    return ed.container.querySelector<HTMLTextAreaElement>('.play-editor-source-textarea')!;
}

function closeSource(ed: Editor) {
    ed.toolbar.querySelector<HTMLButtonElement>('button[title="Source Code"]')!.click();
}

/** Clicks the gutter fold toggle on a line (0-based), as a user would. */
function clickFoldToggle(ed: Editor, line: number) {
    ed.container.querySelector<HTMLButtonElement>(`.play-editor-fold-toggle[data-line="${line}"]`)!.click();
}

// Formats to four lines: the section opener is line 0 and folds its two children.
const SOURCE = '<section><p>a</p></section><p>after</p>';

describe('SourceCodePlugin folding', () => {
    it('getContent returns the full HTML with no fold marker while a block is folded', () => {
        const ed = mount(SOURCE);
        const ta = openSource(ed);
        const full = ta.value;

        clickFoldToggle(ed, 0);

        expect(ta.value).toContain(' lines…⟩');
        expect(ta.value).not.toBe(full);
        expect(ed.getContent()).toBe(full);
        expect(ed.getContent()).not.toContain('⟨');
    });

    it('does not change the textarea when reading the full source', () => {
        const ed = mount(SOURCE);
        const ta = openSource(ed);
        clickFoldToggle(ed, 0);
        const folded = ta.value;

        ed.getContent();
        expect(ta.value).toBe(folded);
    });

    it('saves the full HTML when the view is closed while folded and edited', () => {
        const ed = mount(SOURCE);
        const ta = openSource(ed);
        const full = ta.value;
        clickFoldToggle(ed, 0);

        // Only the visible line can be edited while the block is folded.
        ta.value = ta.value.replace('after', 'after!');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        closeSource(ed);

        expect(ed.textArea.value).toBe(full.replace('after', 'after!'));
        expect(ed.textArea.value).not.toContain('⟨');
    });

    it('leaves the editor alone when closed while folded without edits', () => {
        const ed = mount(SOURCE);
        const before = ed.editorArea.innerHTML;
        const ta = openSource(ed);
        clickFoldToggle(ed, 0);
        expect(ta.value).toContain(' lines…⟩');

        const setContent = vi.spyOn(ed, 'setContent');
        closeSource(ed);
        expect(setContent).not.toHaveBeenCalled();
        expect(ed.editorArea.innerHTML).toBe(before);
    });

    it('keeps later folds on the right line when an earlier fold opens or closes', () => {
        const ed = mount('<section><p>a</p></section><div><p>b</p></div>');
        const ta = openSource(ed);
        const full = ta.value;

        // Fold the div (line 3), then the section above it (line 0), which moves the div up.
        clickFoldToggle(ed, 3);
        clickFoldToggle(ed, 0);
        expect(ta.value.split('\n')[1]).toContain(' lines…⟩');
        expect(ed.getContent()).toBe(full);

        // Opening the section moves the div back down; it must still expand cleanly.
        clickFoldToggle(ed, 0);
        expect(ed.getContent()).toBe(full);
        clickFoldToggle(ed, 3);
        expect(ta.value).toBe(full);
    });
});

describe('SourceCodePlugin host notification on exit', () => {
    it('does not notify the host when the view closes with no input at all', () => {
        const ed = mount('<p>Hi</p>');
        openSource(ed);
        const onInput = vi.fn();
        ed.editorArea.addEventListener('input', onInput);

        closeSource(ed);
        expect(onInput).not.toHaveBeenCalled();
    });

    it('notifies the host on close after an edit was undone, so it gets the original HTML', () => {
        const ed = mount('<p>Hi</p>');
        const original = ed.editorArea.innerHTML;
        const ta = openSource(ed);
        const onInput = vi.fn();
        ed.editorArea.addEventListener('input', onInput);

        ta.value = '<p>Changed</p>';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.value = original;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        onInput.mockClear();

        closeSource(ed);
        expect(onInput).toHaveBeenCalledTimes(1);
        expect(ed.textArea.value).toBe(original);
    });
});
