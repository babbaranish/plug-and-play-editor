import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '../core/Editor';
import type { Plugin } from '../core/Plugin';
import { AmpPollPlugin, addAmpPoll, createAmpPollPlugin, updateAmpPoll, AMP_POLL_INSERT_COMMAND } from './amp-poll';
import { AmpFeedbackPlugin, addAmpFeedback } from './amp-feedback';
import { SourceCodePlugin } from './source-code';
import { cleanHtml } from './paste-cleanup';
import { buildPreviewHtml, createSidePreviewPlugin, playPollClick, samplePollResults } from './side-preview';
import { AmpPollConfigError, readStoredAmpPollConfig } from '../amp/poll/pollConfig';
import { renderAmpPollBlock } from '../amp/poll/pollRenderer';
import type { AmpPollConfig } from '../amp/poll/types';
import { toAmpEmail } from '../amp';

const editors: Editor[] = [];

afterEach(() => {
    editors.splice(0).forEach((ed) => ed.destroy());
    document.body.innerHTML = '';
});

function mount(html: string, plugins: Plugin[] = [AmpPollPlugin]): Editor {
    const ta = document.createElement('textarea');
    ta.value = html;
    document.body.appendChild(ta);
    const ed = new Editor(ta, plugins);
    editors.push(ed);
    return ed;
}

const poll: AmpPollConfig = { action: 'https://example.com/api/poll', question: 'Which day suits you?', options: ['Monday', 'Wednesday', 'Friday'] };

describe('addAmpPoll', () => {
    it('inserts a poll block that converts to an AMP poll', () => {
        const ed = mount('<p>one</p>');
        window.getSelection()!.removeAllRanges();
        const block = addAmpPoll(ed, poll)!;
        expect(block.className).toBe('play-editor-amp-poll');
        expect(block.nextElementSibling!.outerHTML).toBe('<p><br></p>');
        const result = toAmpEmail(ed.getContent());
        expect(result.valid).toBe(true);
        expect(result.html).toContain('action-xhr="https://example.com/api/poll"');
    });

    it('throws every config problem and inserts nothing', () => {
        const ed = mount('<p>one</p>');
        expect(() => addAmpPoll(ed, { ...poll, options: ['Only'] })).toThrow(AmpPollConfigError);
        expect(ed.editorArea.querySelector('.play-editor-amp-poll')).toBeNull();
    });

    it('returns null without the plugin or while the source view is open', () => {
        expect(addAmpPoll(mount('<p>x</p>', []), poll)).toBeNull();
        const ed = mount('<p>x</p>', [AmpPollPlugin, SourceCodePlugin]);
        ed.toolbar.querySelector<HTMLButtonElement>('button[title="Source Code"]')!.click();
        expect(addAmpPoll(ed, poll)).toBeNull();
    });

    it('is reachable as a command, and stores the plugin\'s default design', () => {
        const ed = mount('<p>x</p>', [createAmpPollPlugin({ defaultStyle: { buttonColor: '#d63736' } })]);
        expect(ed.hasCommand(AMP_POLL_INSERT_COMMAND)).toBe(true);
        const block = addAmpPoll(ed, { ...poll, style: { fieldRadius: 10 } })!;
        expect(readStoredAmpPollConfig(block).style).toEqual({ buttonColor: '#d63736', fieldRadius: 10 });
        expect(() => createAmpPollPlugin({ defaultStyle: { buttonColor: 'red' } })).toThrow(AmpPollConfigError);
    });
});

describe('updateAmpPoll', () => {
    it('keeps the endpoint and anything else the patch does not name', () => {
        const ed = mount('<p>x</p>');
        const block = addAmpPoll(ed, { ...poll, submitText: 'Send' })!;
        const next = updateAmpPoll(ed, block, { options: ['Yes', 'No'], submitText: undefined })!;
        expect(readStoredAmpPollConfig(next)).toEqual({ ...poll, options: ['Yes', 'No'] });
    });

    it('leaves the poll as it was when the result is invalid', () => {
        const ed = mount('<p>x</p>');
        const block = addAmpPoll(ed, poll)!;
        expect(() => updateAmpPoll(ed, block, { action: 'http://example.com' })).toThrow(AmpPollConfigError);
        expect(ed.editorArea.contains(block)).toBe(true);
    });
});

describe('the poll dialog', () => {
    const modal = (ed: Editor) => ed.container.querySelector('.play-editor-modal')!;
    const set = (ed: Editor, name: string, value: string) => {
        const el = modal(ed).querySelector<HTMLInputElement>(`[name="${name}"]`)!;
        if (el.getAttribute('type') === 'checkbox') el.checked = value === 'true';
        else el.value = value;
        el.dispatchEvent(new Event(el.tagName === 'SELECT' || el.getAttribute('type') === 'checkbox' ? 'change' : 'input', { bubbles: true }));
    };
    const hintOf = (ed: Editor, name: string) =>
        document.getElementById(modal(ed).querySelector(`[name="${name}"]`)!.getAttribute('aria-describedby')!)!;
    const save = (ed: Editor) => modal(ed).querySelector<HTMLButtonElement>('.play-editor-modal-submit')!.click();

    it('needs an endpoint, checks the choices as you type, then inserts', () => {
        const ed = mount('<p>x</p>');
        ed.toolbar.querySelector<HTMLButtonElement>('button[title="Insert AMP Poll"]')!.click();
        expect(modal(ed).querySelector<HTMLInputElement>('[name="options"]')!.value).toBe('Yes | No');
        save(ed);
        expect(modal(ed).querySelector('.play-editor-modal-error')!.textContent).toContain('needs an endpoint');
        set(ed, 'action', 'https://example.com/api/poll');
        set(ed, 'options', 'Monday | Monday');
        expect(hintOf(ed, 'options').textContent).toBe('Choice 2: Choice "Monday" is listed twice.');
        set(ed, 'options', 'Monday | Friday, after lunch');
        set(ed, 'showResults', '');
        save(ed);
        const block = ed.editorArea.querySelector('.play-editor-amp-poll')!;
        expect(readStoredAmpPollConfig(block)).toEqual({
            action: 'https://example.com/api/poll',
            question: 'Which topic should we cover next?',
            options: ['Monday', 'Friday, after lunch'],
            showResults: false,
        });
    });

    it('edits a poll, keeping what was not changed', () => {
        const ed = mount('<p>x</p>');
        (addAmpPoll(ed, { ...poll, successMessage: 'Counted!' })!).click();
        expect(modal(ed).querySelector<HTMLInputElement>('[name="showResults"]')!.checked).toBe(true);
        set(ed, 'fallbackUrl', 'https://example.com/poll');
        save(ed);
        const block = ed.editorArea.querySelector('.play-editor-amp-poll')!;
        expect(readStoredAmpPollConfig(block)).toEqual({ ...poll, successMessage: 'Counted!', fallbackUrl: 'https://example.com/poll' });
        expect(block.querySelectorAll('a')).toHaveLength(3);
    });

    it('does not follow a choice link when the block is clicked', () => {
        const ed = mount('<p>x</p>');
        const link = addAmpPoll(ed, { ...poll, fallbackUrl: 'https://example.com/poll' })!.querySelector('a')!;
        const click = new MouseEvent('click', { bubbles: true, cancelable: true });
        link.dispatchEvent(click);
        expect(click.defaultPrevented).toBe(true);
        expect(modal(ed)).not.toBeNull();
    });
});

describe('poll blocks and other content', () => {
    it('keeps a pasted poll\'s settings and choice links, and drops the settings anywhere else', () => {
        const full: AmpPollConfig = { ...poll, showResults: false, fallbackUrl: 'https://example.com/poll', style: { buttonColor: '#d63736' } };
        const pasted = document.createElement('div');
        pasted.innerHTML = cleanHtml(renderAmpPollBlock(full, document).outerHTML);
        const block = pasted.querySelector('.play-editor-amp-poll')!;
        expect(readStoredAmpPollConfig(block)).toEqual(full);
        expect(block.querySelector('a')!.getAttribute('href')).toBe('https://example.com/poll?choice=Monday');

        pasted.innerHTML = cleanHtml('<div data-question="Q" data-options="A | B" data-show-results="false">hi</div>');
        expect(pasted.querySelector('[data-question], [data-options], [data-show-results]')).toBeNull();
    });

    it('does not mix up settings it shares with a feedback block when pasting one', () => {
        const ed = mount('<p>x</p>', [AmpFeedbackPlugin]);
        const fb = addAmpFeedback(ed, { action: 'https://example.com/f', questions: [{ question: 'Q' }], submitText: 'Go' })!;
        const pasted = document.createElement('div');
        pasted.innerHTML = cleanHtml(fb.outerHTML);
        expect(pasted.firstElementChild!.getAttribute('data-submit-text')).toBe('Go');
        expect(pasted.firstElementChild!.getAttribute('data-action')).toBe('https://example.com/f');
    });
});

describe('the poll in the side preview', () => {
    const draw = (config: AmpPollConfig) => {
        const frame = document.createElement('div');
        frame.innerHTML = buildPreviewHtml(renderAmpPollBlock(config, document).outerHTML, {}, { version: 'amp' });
        document.body.appendChild(frame);
        return frame;
    };

    it('shows the fallback in the HTML version and the poll in the AMP version, sending nothing', () => {
        expect(buildPreviewHtml(renderAmpPollBlock(poll, document).outerHTML, {}, { version: 'html' })).toContain('This email has a poll');
        const frame = draw(poll);
        expect(frame.textContent).toContain('Which day suits you?');
        expect(frame.querySelector('amp-selector, [on], [action-xhr], [data-amp-bind-text], input[type="hidden"]')).toBeNull();
    });

    it('picks a choice, then shows sample results on Vote and locks', () => {
        const frame = draw(poll);
        const choices = Array.from(frame.querySelectorAll<HTMLElement>('[data-pe-choice]'));
        const button = frame.querySelector('button')!;
        expect(button.disabled).toBe(true);
        playPollClick(button); // nothing picked yet
        expect(frame.querySelector('[data-pe-voted]')).toBeNull();

        playPollClick(choices[2]);
        expect(choices.map(c => c.style.outline !== '')).toEqual([false, false, true]);
        expect(button.disabled).toBe(false);

        playPollClick(button);
        expect(Array.from(frame.querySelectorAll('[data-pe-percent]')).map(p => p.textContent)).toEqual(['30%', '30%', '40%']);
        const bars = Array.from(frame.querySelectorAll<HTMLElement>('[data-pe-bar]'));
        expect(bars.map(b => Array.from(b.children).filter(s => !(s as HTMLElement).hidden).length)).toEqual([3, 3, 4]);
        expect((frame.querySelector('[data-pe-vote-wrap]') as HTMLElement).hidden).toBe(true);
        expect(frame.textContent).toContain('Preview: sample results.');
        playPollClick(choices[0]); // locked
        expect(choices[0].style.outline).toBe('');
    });

    it('lets hidden win over an inline display in the preview frame, as AMP does, so bars are not drawn full', () => {
        const ta = document.createElement('textarea');
        document.body.appendChild(ta);
        const ed = new Editor(ta, [createSidePreviewPlugin()]);
        editors.push(ed);
        expect(ed.container.querySelector<HTMLIFrameElement>('.play-editor-side-preview-frame')!.srcdoc)
            .toContain('[hidden] { display: none !important; }');
    });

    it('makes sample results that add up to 100 with the picked choice leading', () => {
        for (const count of [2, 3, 4, 5, 6]) {
            for (let picked = 0; picked < count; picked++) {
                const results = samplePollResults(count, picked);
                expect(results.reduce((a, b) => a + b, 0)).toBe(100);
                expect(Math.max(...results)).toBe(results[picked]);
            }
        }
    });
});
