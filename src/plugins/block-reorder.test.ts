import { describe, it, expect, afterEach, vi } from 'vitest';
import { Editor } from '../core/Editor';
import type { Plugin } from '../core/Plugin';
import { BlockReorderPlugin, BLOCK_MOVE_DOWN_COMMAND, BLOCK_MOVE_UP_COMMAND, dropPointAt, staysPut } from './block-reorder';
import { SourceCodePlugin } from './source-code';
import { ALL_PLUGINS } from '../react-defaults';

const editors: Editor[] = [];

afterEach(() => {
    editors.splice(0).forEach((ed) => ed.destroy());
    document.body.innerHTML = '';
});

function mount(html: string, plugins: Plugin[] = [BlockReorderPlugin]): Editor {
    const ta = document.createElement('textarea');
    ta.value = html;
    document.body.appendChild(ta);
    const ed = new Editor(ta, plugins);
    editors.push(ed);
    return ed;
}

/** Gives each top-level block a height: block i spans 100*i to 100*i + 80. */
function layOut(ed: Editor): void {
    Array.from(ed.editorArea.children).forEach((child, i) => {
        const top = 100 * i;
        (child as HTMLElement).getBoundingClientRect = () => ({ top, bottom: top + 80, height: 80, left: 24, right: 600, width: 576, x: 24, y: top, toJSON() {} }) as DOMRect;
    });
    ed.editorArea.getBoundingClientRect = () => ({ top: -1000, bottom: 2000, height: 3000, left: 0, right: 624, width: 624, x: 0, y: -1000, toJSON() {} }) as DOMRect;
}

function pointer(target: EventTarget, type: string, y: number, extra: Record<string, unknown> = {}): Event {
    const e = new Event(type, { bubbles: true, cancelable: true });
    for (const [k, v] of Object.entries({ clientX: 10, clientY: y, button: 0, isPrimary: true, pointerId: 1, relatedTarget: null, ...extra })) {
        Object.defineProperty(e, k, { value: v });
    }
    target.dispatchEvent(e);
    return e;
}

const handle = (ed: Editor) => ed.container.querySelector<HTMLElement>('.play-editor-block-handle')!;
const line = (ed: Editor) => ed.container.querySelector<HTMLElement>('.play-editor-drop-indicator')!;
const ghost = (ed: Editor) => ed.container.querySelector<HTMLElement>('.play-editor-block-ghost')!;
const order = (ed: Editor) => Array.from(ed.editorArea.children).map(c => c.textContent || c.className || c.tagName);

/** Hovers the block at `fromY`, grabs its grip and drops it at `toY`. */
function dragBlock(ed: Editor, fromY: number, toY: number, { release = true } = {}): void {
    pointer(ed.editorArea, 'pointermove', fromY);
    pointer(handle(ed), 'pointerdown', fromY);
    pointer(document, 'pointermove', toY);
    if (release) pointer(document, 'pointerup', toY);
}

function caretIn(node: Node): void {
    const range = document.createRange();
    range.setStart(node, 0);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
}

describe('the drag grip', () => {
    it('shows beside the hovered block, in the margin, and hides when the pointer leaves', () => {
        const ed = mount('<p>one</p><h2>two</h2>');
        layOut(ed);
        expect(handle(ed).hidden).toBe(true);
        pointer(ed.editorArea, 'pointermove', 130);
        expect(handle(ed).hidden).toBe(false);
        expect(handle(ed).style.top).toBe('102px');
        // Over the grip itself: it stays.
        pointer(ed.editorArea, 'pointerleave', 130, { relatedTarget: handle(ed) });
        expect(handle(ed).hidden).toBe(false);
        pointer(ed.editorArea, 'pointerleave', 130, { relatedTarget: document.body });
        expect(handle(ed).hidden).toBe(true);
    });

    it('hides while typing, and in the source view', () => {
        const ed = mount('<p>one</p>', [BlockReorderPlugin, SourceCodePlugin]);
        layOut(ed);
        pointer(ed.editorArea, 'pointermove', 40);
        ed.editorArea.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
        expect(handle(ed).hidden).toBe(true);
        ed.toolbar.querySelector<HTMLButtonElement>('button[title="Source Code"]')!.click();
        pointer(ed.editorArea, 'pointermove', 40);
        expect(handle(ed).hidden).toBe(true);
    });

    it('adds nothing to the content', () => {
        const ed = mount('<p>one</p>');
        layOut(ed);
        pointer(ed.editorArea, 'pointermove', 40);
        expect(ed.getContent()).toBe('<p>one</p>');
        expect(ed.editorArea.querySelector('.play-editor-block-handle, .play-editor-drop-indicator')).toBeNull();
    });
});

describe('dragging a block', () => {
    it('moves any kind of block to where it is dropped', async () => {
        const ed = mount('<h2>Title</h2><p>Text</p><ul><li>List</li></ul><table><tbody><tr><td>Cell</td></tr></tbody></table>');
        layOut(ed);
        const onInput = vi.fn();
        ed.onInput(onInput);
        // The table (300–380) to above the paragraph (100–180).
        dragBlock(ed, 340, 110);
        expect(order(ed)).toEqual(['Title', 'Cell', 'Text', 'List']);
        layOut(ed);
        // The heading to the very end.
        dragBlock(ed, 40, 900);
        expect(order(ed)).toEqual(['Cell', 'Text', 'List', 'Title']);
        await new Promise(r => requestAnimationFrame(() => r(null)));
        expect(onInput).toHaveBeenCalled();
        expect(ed.getContent()).toMatch(/^<table>.*<\/table><p>Text<\/p><ul>.*<\/ul><h2>Title<\/h2>$/);
    });

    it('shows the line and highlights the block while dragging, but no line where the block already is', () => {
        const ed = mount('<p>one</p><p>two</p><p>three</p>');
        layOut(ed);
        dragBlock(ed, 40, 60, { release: false });
        expect(ghost(ed).hidden).toBe(false);
        expect(handle(ed).hidden).toBe(true);
        expect(line(ed).hidden).toBe(true);
        // Above the middle of "three" (200–280): between "two" and "three".
        pointer(document, 'pointermove', 210);
        expect(line(ed).hidden).toBe(false);
        expect(ed.container.classList.contains('play-editor-block-moving')).toBe(true);
        pointer(document, 'pointerup', 210);
        expect(line(ed).hidden).toBe(true);
        expect(ghost(ed).hidden).toBe(true);
        expect(ed.container.classList.contains('play-editor-block-moving')).toBe(false);
        expect(order(ed)).toEqual(['two', 'one', 'three']);
    });

    it('leaves the block where it was when dropped on its own spot', () => {
        const ed = mount('<p>one</p><p>two</p>');
        layOut(ed);
        const onChange = vi.spyOn(ed, 'notifyContentChange');
        dragBlock(ed, 140, 150);
        expect(order(ed)).toEqual(['one', 'two']);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('cancels with Escape', () => {
        const ed = mount('<p>one</p><p>two</p>');
        layOut(ed);
        dragBlock(ed, 40, 900, { release: false });
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        pointer(document, 'pointerup', 900);
        expect(order(ed)).toEqual(['one', 'two']);
        expect(line(ed).hidden).toBe(true);
    });

    it('adds a paragraph after a non-editable block moved to the end', () => {
        const ed = mount('<div class="button" contenteditable="false">Pay</div><p>text</p>');
        layOut(ed);
        dragBlock(ed, 40, 900);
        expect(order(ed)).toEqual(['text', 'Pay', 'P']);
        expect(ed.editorArea.lastElementChild!.outerHTML).toBe('<p><br></p>');
    });

    it('ignores a right-button press on the grip', () => {
        const ed = mount('<p>one</p><p>two</p>');
        layOut(ed);
        pointer(ed.editorArea, 'pointermove', 40);
        pointer(handle(ed), 'pointerdown', 40, { button: 2 });
        pointer(document, 'pointermove', 900);
        pointer(document, 'pointerup', 900);
        expect(order(ed)).toEqual(['one', 'two']);
    });
});

describe('moving the caret\'s block from the keyboard', () => {
    it('moves it with Alt+Shift+Up / Down, keeping the caret in it', () => {
        const ed = mount('<p>one</p><p>two</p><p>three</p>');
        const two = ed.editorArea.children[1];
        caretIn(two.firstChild!);
        const up = new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, shiftKey: true, bubbles: true, cancelable: true });
        ed.editorArea.dispatchEvent(up);
        expect(up.defaultPrevented).toBe(true);
        expect(order(ed)).toEqual(['two', 'one', 'three']);
        expect(window.getSelection()!.anchorNode).toBe(two.firstChild);

        ed.editorArea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
        ed.editorArea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
        expect(order(ed)).toEqual(['one', 'three', 'two']);
    });

    it('does nothing at the ends, and leaves other shortcuts alone', () => {
        const ed = mount('<p>one</p><p>two</p>');
        caretIn(ed.editorArea.firstElementChild!.firstChild!);
        expect(ed.runCommand(BLOCK_MOVE_UP_COMMAND)).toBe(false);
        const plain = new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true });
        ed.editorArea.dispatchEvent(plain);
        expect(plain.defaultPrevented).toBe(false);
        expect(ed.runCommand(BLOCK_MOVE_DOWN_COMMAND)).toBe(true);
        expect(order(ed)).toEqual(['two', 'one']);
    });
});

describe('dropPointAt and staysPut', () => {
    it('picks the gap nearest the pointer, leaving the moved block out', () => {
        const ed = mount('<p>a</p><p>b</p><p>c</p>');
        layOut(ed);
        const [a, b, c] = Array.from(ed.editorArea.children);
        expect(dropPointAt(ed, 5)).toEqual({ point: { ref: a, side: 'before' }, lineY: 0 });
        expect(dropPointAt(ed, 130)).toEqual({ point: { ref: b, side: 'before' }, lineY: 90 });
        expect(dropPointAt(ed, 400)).toEqual({ point: { ref: c, side: 'after' }, lineY: 280 });
        expect(dropPointAt(ed, 150, b)).toEqual({ point: { ref: c, side: 'before' }, lineY: 140 });
        expect(staysPut(b, { ref: c, side: 'before' })).toBe(true);
        expect(staysPut(b, { ref: a, side: 'after' })).toBe(true);
        expect(staysPut(b, { ref: a, side: 'before' })).toBe(false);
    });
});

describe('registration', () => {
    it('is one of the React defaults, and cleans up on destroy', () => {
        expect(ALL_PLUGINS).toContain(BlockReorderPlugin);
        const ed = mount('<p>one</p>');
        const container = ed.container;
        ed.destroy();
        editors.splice(editors.indexOf(ed), 1);
        expect(container.querySelector('.play-editor-block-handle, .play-editor-drop-indicator, .play-editor-block-ghost')).toBeNull();
    });
});
