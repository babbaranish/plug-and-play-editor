import { describe, it, expect, afterEach, vi } from 'vitest';
import { findMatchingTag } from './source-code-match';
import { Editor } from '../core/Editor';
import { SourceCodePlugin } from './source-code';
import { formatHtml } from './source-code-format';

/** Index of the nth (0-based) occurrence of `needle`, so expectations read as text. */
function at(src: string, needle: string, nth = 0): number {
    let idx = -1;
    for (let k = 0; k <= nth; k++) {
        idx = src.indexOf(needle, idx + 1);
        if (idx === -1) throw new Error(`"${needle}" occurrence ${nth} not found`);
    }
    return idx;
}

/** Range from `start` through the next `>` (the whole tag). */
function tagAt(src: string, start: number): [number, number] {
    return [start, src.indexOf('>', start) + 1];
}

describe('findMatchingTag', () => {
    it('pairs a simple paragraph from its opening tag', () => {
        const src = '<p class="x">hi</p>';
        expect(findMatchingTag(src, 3)).toEqual({
            open: tagAt(src, 0),
            close: tagAt(src, at(src, '</p>')),
        });
    });

    it('pairs from the closing tag back to the opening tag', () => {
        const src = '<p class="x">hi</p>';
        const closeStart = at(src, '</p>');
        expect(findMatchingTag(src, closeStart + 2)).toEqual({
            open: tagAt(src, 0),
            close: tagAt(src, closeStart),
        });
    });

    it('handles nested same-name tags: inner caret pairs inner, outer caret pairs outer', () => {
        const src = '<div><div><p>x</p></div></div>';
        const innerOpen = at(src, '<div>', 1);
        const innerClose = at(src, '</div>', 0);
        const outerOpen = at(src, '<div>', 0);
        const outerClose = at(src, '</div>', 1);

        expect(findMatchingTag(src, innerOpen + 1)).toEqual({
            open: tagAt(src, innerOpen),
            close: tagAt(src, innerClose),
        });
        expect(findMatchingTag(src, innerClose + 3)).toEqual({
            open: tagAt(src, innerOpen),
            close: tagAt(src, innerClose),
        });
        expect(findMatchingTag(src, outerOpen + 2)).toEqual({
            open: tagAt(src, outerOpen),
            close: tagAt(src, outerClose),
        });
        expect(findMatchingTag(src, outerClose + 2)).toEqual({
            open: tagAt(src, outerOpen),
            close: tagAt(src, outerClose),
        });
    });

    it('pairs by the nearest closer when same-name tags are siblings', () => {
        const src = '<div>a</div><div>b</div>';
        const second = at(src, '<div>', 1);
        expect(findMatchingTag(src, second + 1)).toEqual({
            open: tagAt(src, second),
            close: tagAt(src, at(src, '</div>', 1)),
        });
    });

    it('does not end a tag at a > inside a quoted attribute value', () => {
        const src = '<a title="a > b" href=\'x>y\'>link</a>';
        expect(findMatchingTag(src, 4)).toEqual({
            open: [0, src.indexOf("'>") + 2],
            close: tagAt(src, at(src, '</a>')),
        });
    });

    it('treats an apostrophe in an unquoted value as text, not a quote', () => {
        const src = '<span data-x=don\'t>t</span>';
        expect(findMatchingTag(src, 2)).toEqual({
            open: tagAt(src, 0),
            close: tagAt(src, at(src, '</span>')),
        });
    });

    it('returns null for void elements', () => {
        const src = '<p>a<br>b<img src="x.png"></p>';
        expect(findMatchingTag(src, at(src, '<br>') + 2)).toBeNull();
        expect(findMatchingTag(src, at(src, '<img') + 3)).toBeNull();
    });

    it('returns null for a closing void tag', () => {
        const src = '<p>a</br></p>';
        expect(findMatchingTag(src, at(src, '</br>') + 3)).toBeNull();
    });

    it('returns null for self-closing tags', () => {
        const src = '<div><br /><span/></div>';
        expect(findMatchingTag(src, at(src, '<br') + 2)).toBeNull();
        expect(findMatchingTag(src, at(src, '<span/>') + 2)).toBeNull();
    });

    it('ignores tags inside comments', () => {
        const src = '<!-- <div> </p> --><p>x</p>';
        const caretInComment = at(src, '<div>') + 1;
        expect(findMatchingTag(src, caretInComment)).toBeNull();
        // The first "</p>" sits inside the comment, so the real closer is the second one.
        expect(findMatchingTag(src, at(src, '</p>', 1) + 2)).toEqual({
            open: tagAt(src, at(src, '<p>')),
            close: tagAt(src, at(src, '</p>', 1)),
        });
    });

    it('ignores the doctype', () => {
        const src = '<!DOCTYPE html><html><body></body></html>';
        expect(findMatchingTag(src, 2)).toBeNull();
        expect(findMatchingTag(src, at(src, '<html>') + 1)).toEqual({
            open: tagAt(src, at(src, '<html>')),
            close: tagAt(src, at(src, '</html>')),
        });
    });

    it('returns null for an unmatched opener', () => {
        const src = '<div><p>x</div>';
        expect(findMatchingTag(src, at(src, '<p>') + 1)).toBeNull();
        expect(findMatchingTag(src, at(src, '<div>') + 1)).toEqual({
            open: tagAt(src, 0),
            close: tagAt(src, at(src, '</div>')),
        });
    });

    it('returns null for an unmatched closer', () => {
        const src = 'x</span>';
        expect(findMatchingTag(src, 3)).toBeNull();
    });

    it('matches uppercase and mixed-case names case-insensitively', () => {
        const src = '<P CLASS="x">hi</p>';
        expect(findMatchingTag(src, 1)).toEqual({
            open: tagAt(src, 0),
            close: tagAt(src, at(src, '</p>')),
        });
        // "<DiV><div>x</DIV></div>": the inner <div> pairs with </DIV>, the outer with the last </div>.
        const mixed = '<DiV><div>x</DIV></div>';
        expect(findMatchingTag(mixed, 2)).toEqual({
            open: tagAt(mixed, 0),
            close: tagAt(mixed, at(mixed, '</div>')),
        });
        expect(findMatchingTag(mixed, 7)).toEqual({
            open: tagAt(mixed, 5),
            close: tagAt(mixed, at(mixed, '</DIV>')),
        });
    });

    it('ignores a closing tag written inside script', () => {
        const src = '<div><script>if (a</div>b)</script></div>';
        const outerOpen = 0;
        const outerClose = at(src, '</div>', 1);
        expect(findMatchingTag(src, outerOpen + 2)).toEqual({
            open: tagAt(src, outerOpen),
            close: tagAt(src, outerClose),
        });
        expect(findMatchingTag(src, at(src, '<script>') + 3)).toEqual({
            open: tagAt(src, at(src, '<script>')),
            close: tagAt(src, at(src, '</script>')),
        });
    });

    it('ignores a closing tag written inside style', () => {
        const src = '<div><style>a::after{content:"</div>"}</style></div>';
        expect(findMatchingTag(src, 2)).toEqual({
            open: tagAt(src, 0),
            close: tagAt(src, at(src, '</div>', 1)),
        });
    });

    describe('boundaries', () => {
        const src = '<p class="x">hi</p>';

        it('counts the position of the < as inside the tag', () => {
            expect(findMatchingTag(src, 0)).not.toBeNull();
            expect(findMatchingTag(src, at(src, '</p>'))).not.toBeNull();
        });

        it('counts the position just after the > as inside the tag', () => {
            expect(findMatchingTag(src, 13)).toEqual({
                open: [0, 13],
                close: tagAt(src, 15),
            });
            expect(findMatchingTag(src, at(src, '</p>') + 4)).not.toBeNull();
        });

        it('returns null one step further, in the text', () => {
            expect(findMatchingTag(src, 14)).toBeNull();
        });

        it('returns null for a caret in the text between tags', () => {
            // Position 4 is the "b" of "ab", between the open and close tags.
            expect(findMatchingTag('<p>ab</p>', 4)).toBeNull();
        });

        it('returns null for a caret past the end of the source', () => {
            expect(findMatchingTag(src, src.length + 5)).toBeNull();
        });

        it('returns null for empty input', () => {
            expect(findMatchingTag('', 0)).toBeNull();
        });

        it('prefers the tag starting at the caret where two tags touch', () => {
            const touching = '<p></p>';
            // Caret at 3 is just after the open tag's > and at the start of </p>.
            expect(findMatchingTag(touching, 3)).toEqual({
                open: [0, 3],
                close: [3, 7],
            });
        });
    });

    it('treats the contents of textarea as raw text', () => {
        const src = '<div><textarea></div></textarea></div>';
        expect(findMatchingTag(src, 2)).toEqual({
            open: tagAt(src, 0),
            close: tagAt(src, at(src, '</div>', 1)),
        });
        expect(findMatchingTag(src, at(src, '<textarea>') + 2)).toEqual({
            open: tagAt(src, at(src, '<textarea>')),
            close: tagAt(src, at(src, '</textarea>')),
        });
    });

    it('treats the contents of title as raw text', () => {
        const src = '<title>a</p></title><p>x</p>';
        expect(findMatchingTag(src, 2)).toEqual({
            open: tagAt(src, 0),
            close: tagAt(src, at(src, '</title>')),
        });
        // The "</p>" inside the title is text, so the caret in <p> pairs with the real closer.
        expect(findMatchingTag(src, at(src, '<p>') + 1)).toEqual({
            open: tagAt(src, at(src, '<p>')),
            close: tagAt(src, at(src, '</p>', 1)),
        });
    });

    it('returns null for an unterminated tag or unclosed quote', () => {
        expect(findMatchingTag('<a title="x>', 1)).toBeNull();
        expect(findMatchingTag('<p>x</p', 4)).toBeNull();
    });

    it('stays fast on a 200 KB source', () => {
        const deep = '<div>'.repeat(20000) + 'x' + '</div>'.repeat(20000);
        const caret = at(deep, '<div>', 10000) + 1;
        const start = performance.now();
        const match = findMatchingTag(deep, caret);
        const elapsed = performance.now() - start;
        expect(match).not.toBeNull();
        expect(elapsed).toBeLessThan(2000);
    });

    it('stays linear on pathological unclosed openers', () => {
        const junk = '<a'.repeat(100000) + '>';
        const start = performance.now();
        expect(findMatchingTag(junk, 0)).toBeNull();
        expect(findMatchingTag(junk, junk.length - 2)).toBeNull();
        expect(performance.now() - start).toBeLessThan(2000);
    });
});

// ── Plugin level ─────────────────────────────────────────────────────────

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

describe('SourceCodePlugin source view', () => {
    it('opens pretty-printed', () => {
        const ed = mount('<div><p>Hi</p></div>');
        const before = ed.editorArea.innerHTML;
        const ta = openSource(ed);
        expect(ta.value).toBe(formatHtml(before));
        expect(ta.value).toContain('\n');
    });

    it('leaves the editor HTML alone when closed without edits', () => {
        const ed = mount('<div><p>Hi</p></div>');
        const before = ed.editorArea.innerHTML;
        const setContent = vi.spyOn(ed, 'setContent');
        openSource(ed);
        closeSource(ed);
        expect(setContent).not.toHaveBeenCalled();
        expect(ed.editorArea.innerHTML).toBe(before);
        expect(ed.textArea.value).toBe(before);
    });

    it('writes the source back when the view was edited', () => {
        const ed = mount('<p>Hi</p>');
        const ta = openSource(ed);
        ta.value = '<p>Changed</p>';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        closeSource(ed);
        expect(ed.editorArea.innerHTML).toBe('<p>Changed</p>');
    });

    it('marks the matching tag pair for a caret in the open tag', () => {
        const ed = mount('<p>Hi</p>');
        const ta = openSource(ed);
        ta.value = '<p class="x">hi</p>';
        ta.focus();
        ta.setSelectionRange(3, 3);
        ta.dispatchEvent(new Event('keyup'));

        const layer = ed.container.querySelector<HTMLElement>('.play-editor-source-match')!;
        const marks = Array.from(layer.querySelectorAll('mark.pe-tag-match')).map((m) => m.textContent);
        expect(marks).toEqual(['<p class="x">', '</p>']);
        expect(layer.textContent).toBe(ta.value);
    });

    it('keeps the match layer scrolled with the textarea when it fills in after a scroll', () => {
        const ed = mount('<p>Hi</p>');
        const ta = openSource(ed);
        ta.value = '<p class="x">hi</p>';
        // The layer is empty (the textarea is unfocused), so it was never given a scroll offset.
        ta.scrollTop = 40;

        ta.focus();
        ta.setSelectionRange(3, 3);
        ta.dispatchEvent(new Event('keyup'));

        const layer = ed.container.querySelector<HTMLElement>('.play-editor-source-match')!;
        expect(layer.querySelectorAll('mark.pe-tag-match').length).toBe(2);
        expect(ta.scrollTop).toBe(40);
        expect(layer.scrollTop).toBe(ta.scrollTop);
    });

    it('clears the marks when the selection is a range', () => {
        const ed = mount('<p>Hi</p>');
        const ta = openSource(ed);
        ta.value = '<p>hi</p>';
        ta.focus();
        ta.setSelectionRange(1, 1);
        ta.dispatchEvent(new Event('click'));
        expect(ed.container.querySelectorAll('mark.pe-tag-match').length).toBe(2);

        ta.setSelectionRange(1, 3);
        ta.dispatchEvent(new Event('click'));
        expect(ed.container.querySelectorAll('mark.pe-tag-match').length).toBe(0);
    });

    it('keeps the match layer character-exact with the textarea, including escaped text', () => {
        const ed = mount('<p>Hi</p>');
        const ta = openSource(ed);
        ta.value = '<p>a &amp; <b>b</b> &lt; c</p>';
        ta.focus();
        ta.setSelectionRange(1, 1);
        ta.dispatchEvent(new Event('keyup'));
        const layer = ed.container.querySelector<HTMLElement>('.play-editor-source-match')!;
        expect(layer.textContent).toBe(ta.value);
    });

    it('stops listening to selection changes after the view closes', () => {
        const ed = mount('<p>Hi</p>');
        const ta = openSource(ed);
        ta.value = '<p>hi</p>';
        ta.focus();
        ta.setSelectionRange(1, 1);
        ta.dispatchEvent(new Event('keyup'));
        closeSource(ed);
        expect(() => document.dispatchEvent(new Event('selectionchange'))).not.toThrow();
    });
});
