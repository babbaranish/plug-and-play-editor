import { describe, it, expect, afterEach, vi } from 'vitest';
import { Editor } from './Editor';
import { ButtonBlockPlugin, BUTTON_BLOCK_OPEN_COMMAND, openButtonDialog } from '../plugins/button-block';

const editors: Editor[] = [];

afterEach(() => {
    editors.splice(0).forEach((ed) => ed.destroy());
    document.body.innerHTML = '';
});

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function mount(html = '<p>Hello</p>', plugins = [ButtonBlockPlugin]): Editor {
    const ta = document.createElement('textarea');
    ta.value = html;
    document.body.appendChild(ta);
    const ed = new Editor(ta, plugins);
    editors.push(ed);
    return ed;
}

describe('Editor command registry', () => {
    it('registers, reports and runs a command with its arguments', () => {
        const ed = mount('<p>x</p>', []);
        const handler = vi.fn((a: number, b: number) => a + b);
        ed.registerCommand('sum', handler);
        expect(ed.hasCommand('sum')).toBe(true);
        expect(ed.runCommand<number>('sum', 2, 3)).toBe(5);
        expect(handler).toHaveBeenCalledWith(2, 3);
    });

    it('returns undefined for a command nobody registered', () => {
        const ed = mount('<p>x</p>', []);
        expect(ed.hasCommand('missing')).toBe(false);
        expect(ed.runCommand('missing')).toBeUndefined();
    });

    it('unregisters through the returned function', () => {
        const ed = mount('<p>x</p>', []);
        const off = ed.registerCommand('ping', () => 'pong');
        off();
        expect(ed.hasCommand('ping')).toBe(false);
        expect(ed.runCommand('ping')).toBeUndefined();
    });

    it('lets a later registration win and ignores a stale unregister', () => {
        const ed = mount('<p>x</p>', []);
        const offFirst = ed.registerCommand('who', () => 'first');
        ed.registerCommand('who', () => 'second');
        offFirst();
        expect(ed.runCommand('who')).toBe('second');
    });

    it('clears every command on destroy', () => {
        const ed = mount('<p>x</p>', []);
        ed.registerCommand('ping', () => 'pong');
        ed.destroy();
        editors.splice(editors.indexOf(ed), 1);
        expect(ed.hasCommand('ping')).toBe(false);
    });

    it('reports whether a content source is active', () => {
        const ed = mount('<p>x</p>', []);
        expect(ed.hasActiveContentSource()).toBe(false);
        const off = ed.registerContentSource(() => '<p>raw</p>');
        expect(ed.hasActiveContentSource()).toBe(true);
        off();
        expect(ed.hasActiveContentSource()).toBe(false);
    });

    it('runs the input subscribers on the next frame once the active content source is released', async () => {
        const ed = mount('<p>x</p>', []);
        const sub = vi.fn();
        ed.onInput(sub);

        const offFirst = ed.registerContentSource(() => 'first');
        const offSecond = ed.registerContentSource(() => 'second');
        offFirst();
        await frame();
        expect(sub).not.toHaveBeenCalled();

        offSecond();
        expect(sub).not.toHaveBeenCalled();
        await frame();
        expect(sub).toHaveBeenCalledTimes(1);

        offSecond();
        await frame();
        expect(sub).toHaveBeenCalledTimes(1);
    });

    it('keeps the commands of a shared plugin apart per editor', () => {
        const first = mount('<p id="one">One</p>');
        const second = mount('<p id="two">Two</p>');
        expect(first.hasCommand(BUTTON_BLOCK_OPEN_COMMAND)).toBe(true);
        expect(second.hasCommand(BUTTON_BLOCK_OPEN_COMMAND)).toBe(true);

        first.destroy();
        editors.splice(editors.indexOf(first), 1);
        expect(first.hasCommand(BUTTON_BLOCK_OPEN_COMMAND)).toBe(false);

        expect(openButtonDialog(second, { url: 'https://pay.test', text: 'Go' })).toBe(true);
        const modal = second.container.querySelector('.play-editor-modal')!;
        modal.querySelector<HTMLButtonElement>('.play-editor-modal-submit')!.click();
        expect(second.editorArea.querySelector('.play-editor-button-block a')!.getAttribute('href')).toBe('https://pay.test');
    });
});
