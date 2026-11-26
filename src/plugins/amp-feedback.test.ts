import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '../core/Editor';
import type { Plugin } from '../core/Plugin';
import { AmpFeedbackPlugin, addAmpFeedback, createAmpFeedbackPlugin, updateAmpFeedback, AMP_FEEDBACK_INSERT_COMMAND } from './amp-feedback';
import { AmpFormPlugin, addAmpForm } from './amp-form';
import { AmpQuizPlugin, addAmpQuiz } from './amp-quiz';
import { SourceCodePlugin } from './source-code';
import { cleanHtml } from './paste-cleanup';
import { buildPreviewHtml, playFeedbackClick } from './side-preview';
import { AmpFeedbackConfigError, readStoredAmpFeedbackConfig } from '../amp/feedback/feedbackConfig';
import { renderAmpFeedbackBlock } from '../amp/feedback/feedbackRenderer';
import { readStoredAmpQuizConfig } from '../amp/quiz/quizConfig';
import type { AmpFeedbackConfig } from '../amp/feedback/types';
import { toAmpEmail } from '../amp';

const editors: Editor[] = [];

afterEach(() => {
    editors.splice(0).forEach((ed) => ed.destroy());
    document.body.innerHTML = '';
});

function mount(html: string, plugins: Plugin[] = [AmpFeedbackPlugin]): Editor {
    const ta = document.createElement('textarea');
    ta.value = html;
    document.body.appendChild(ta);
    const ed = new Editor(ta, plugins);
    editors.push(ed);
    return ed;
}

const feedback: AmpFeedbackConfig = { action: 'https://example.com/api/feedback', questions: [{ question: 'How was your order?' }] };

describe('addAmpFeedback', () => {
    it('inserts a block that converts to an AMP feedback form', () => {
        const ed = mount('<p>one</p>');
        window.getSelection()!.removeAllRanges();
        const block = addAmpFeedback(ed, feedback)!;
        expect(block.className).toBe('play-editor-amp-feedback');
        expect(block.nextElementSibling!.outerHTML).toBe('<p><br></p>');
        const result = toAmpEmail(ed.getContent());
        expect(result.valid).toBe(true);
        expect(result.html).toContain('action-xhr="https://example.com/api/feedback"');
    });

    it('throws every config problem and inserts nothing', () => {
        const ed = mount('<p>one</p>');
        expect(() => addAmpFeedback(ed, { action: 'http://x.test', questions: [] })).toThrow(AmpFeedbackConfigError);
        expect(ed.editorArea.querySelector('.play-editor-amp-feedback')).toBeNull();
    });

    it('returns null without the plugin or while the source view is open', () => {
        expect(addAmpFeedback(mount('<p>x</p>', []), feedback)).toBeNull();
        const ed = mount('<p>x</p>', [AmpFeedbackPlugin, SourceCodePlugin]);
        ed.toolbar.querySelector<HTMLButtonElement>('button[title="Source Code"]')!.click();
        expect(addAmpFeedback(ed, feedback)).toBeNull();
    });

    it('is reachable as a command, and stores the plugin\'s default design', () => {
        const ed = mount('<p>x</p>', [createAmpFeedbackPlugin({ defaultStyle: { buttonColor: '#d63736' } })]);
        expect(ed.hasCommand(AMP_FEEDBACK_INSERT_COMMAND)).toBe(true);
        const block = addAmpFeedback(ed, { ...feedback, style: { fieldRadius: 10 } })!;
        expect(readStoredAmpFeedbackConfig(block).style).toEqual({ buttonColor: '#d63736', fieldRadius: 10 });
        expect(() => createAmpFeedbackPlugin({ defaultStyle: { buttonColor: 'red' } })).toThrow(AmpFeedbackConfigError);
    });
});

describe('updateAmpFeedback', () => {
    it('keeps the endpoint and anything else the patch does not name', () => {
        const ed = mount('<p>x</p>');
        const block = addAmpFeedback(ed, { ...feedback, commentLabel: 'Why?' })!;
        const questions = [{ question: 'Delivery?', scale: 'emoji' as const }, { question: 'Product?' }];
        const next = updateAmpFeedback(ed, block, { questions, commentLabel: undefined })!;
        expect(readStoredAmpFeedbackConfig(next)).toEqual({ action: feedback.action, questions });
    });

    it('leaves the block as it was when the result is invalid', () => {
        const ed = mount('<p>x</p>');
        const block = addAmpFeedback(ed, feedback)!;
        expect(() => updateAmpFeedback(ed, block, { action: 'http://example.com' })).toThrow(AmpFeedbackConfigError);
        expect(ed.editorArea.contains(block)).toBe(true);
    });

    it('rewrites a first-version block in the current format, keeping its field name', () => {
        const ed = mount('<div class="play-editor-amp-feedback" contenteditable="false" data-action="https://example.com/f" data-question="How was it?" data-scale="1-10"><p>fallback</p></div>');
        const next = updateAmpFeedback(ed, ed.editorArea.querySelector('.play-editor-amp-feedback')!, { submitText: 'Send' })!;
        expect(next.hasAttribute('data-question')).toBe(false);
        expect(next.querySelector('[data-amp-rating]')!.outerHTML).toBe('<div data-amp-rating="How was it?" data-scale="1-10" data-name="rating"></div>');
    });
});

describe('the feedback dialog', () => {
    const modal = (ed: Editor) => ed.container.querySelector('.play-editor-modal')!;
    const items = (ed: Editor) => Array.from(modal(ed).querySelectorAll<HTMLElement>('.play-editor-modal-list-item'));
    const set = (root: Element, name: string, value: string) => {
        const el = root.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
        if (el.getAttribute('type') === 'checkbox') el.checked = value === 'true';
        else el.value = value;
        el.dispatchEvent(new Event(el.tagName === 'SELECT' || el.getAttribute('type') === 'checkbox' ? 'change' : 'input', { bubbles: true }));
    };
    const save = (ed: Editor) => modal(ed).querySelector<HTMLButtonElement>('.play-editor-modal-submit')!.click();

    it('adds several rating questions, each with its own rating style, under one button', () => {
        const ed = mount('<p>x</p>');
        ed.toolbar.querySelector<HTMLButtonElement>('button[title="Insert AMP Feedback"]')!.click();
        expect(items(ed)).toHaveLength(1);
        expect(items(ed)[0].querySelector<HTMLInputElement>('[name="question"]')!.value).toBe('How was your experience?');
        save(ed);
        expect(modal(ed).querySelector('.play-editor-modal-error')!.textContent).toContain('needs an endpoint');

        set(modal(ed), 'action', 'https://example.com/api/feedback');
        set(items(ed)[0], 'scale', 'emoji');
        modal(ed).querySelector<HTMLButtonElement>('.play-editor-modal-list-add')!.click();
        set(items(ed)[1], 'question', 'Would you recommend us?');
        set(items(ed)[1], 'scale', '1-10');
        set(items(ed)[1], 'lowLabel', 'Not likely');
        set(items(ed)[1], 'name', 'recommend');
        set(items(ed)[1], 'required', '');
        save(ed);
        const block = ed.editorArea.querySelector('.play-editor-amp-feedback')!;
        expect(readStoredAmpFeedbackConfig(block)).toEqual({
            action: 'https://example.com/api/feedback',
            questions: [
                { question: 'How was your experience?', scale: 'emoji' },
                { question: 'Would you recommend us?', scale: '1-10', lowLabel: 'Not likely', name: 'recommend', required: false },
            ],
        });
        expect(toAmpEmail(ed.getContent()).html.match(/<button /g)).toHaveLength(1);
    });

    it('offers every rating style, 1–5 and 1–10 numbers included', () => {
        const ed = mount('<p>x</p>');
        ed.toolbar.querySelector<HTMLButtonElement>('button[title="Insert AMP Feedback"]')!.click();
        const options = Array.from(items(ed)[0].querySelectorAll<HTMLOptionElement>('[name="scale"] option')).map(o => `${o.value}: ${o.textContent}`);
        expect(options).toEqual([
            'stars: ★ Stars (1–5)', 'emoji: \u{1F642} Emoji (1–5)', '1-5: 1–5 numbers', '1-10: 1–10 numbers',
            'thumbs: \u{1F44D} / \u{1F44E} Thumbs',
        ]);
        set(modal(ed), 'action', 'https://example.com/api/feedback');
        set(items(ed)[0], 'scale', '1-5');
        save(ed);
        const block = ed.editorArea.querySelector('.play-editor-amp-feedback')!;
        expect(block.querySelector('[data-amp-rating]')!.getAttribute('data-scale')).toBe('1-5');
    });

    it('hides end labels for thumbs and flags a clashing field name', () => {
        const ed = mount('<p>x</p>');
        addAmpFeedback(ed, { ...feedback, questions: [{ question: 'A' }, { question: 'B' }] })!.click();
        const second = items(ed)[1];
        set(second, 'scale', 'thumbs');
        expect((second.querySelector('[data-field="lowLabel"]') as HTMLElement).style.display).toBe('none');
        expect((items(ed)[0].querySelector('[data-field="lowLabel"]') as HTMLElement).style.display).toBe('');
        set(second, 'name', 'rating1');
        expect(second.querySelector('.play-editor-modal-hint')!.textContent).toBe('Field name "rating1" is used twice.');
        save(ed);
        expect(modal(ed).querySelector('.play-editor-modal-error')!.textContent).toBe('Question 2: Field name "rating1" is used twice.');
    });

    it('edits the comment settings; "required" is dropped without a comment box', () => {
        const ed = mount('<p>x</p>');
        (addAmpFeedback(ed, feedback)!).click();
        expect(modal(ed).querySelector<HTMLInputElement>('[name="comment"]')!.checked).toBe(true);
        set(modal(ed), 'commentRequired', 'true');
        save(ed);
        let block = ed.editorArea.querySelector('.play-editor-amp-feedback') as HTMLElement;
        expect(readStoredAmpFeedbackConfig(block)).toMatchObject({ commentRequired: true });

        block.click();
        set(modal(ed), 'comment', '');
        save(ed);
        block = ed.editorArea.querySelector('.play-editor-amp-feedback') as HTMLElement;
        const stored = readStoredAmpFeedbackConfig(block);
        expect(stored.comment).toBe(false);
        expect(stored.commentRequired).toBeUndefined();
    });
});

describe('feedback blocks and other content', () => {
    it('keeps a pasted block\'s settings, and drops them anywhere else', () => {
        const full: AmpFeedbackConfig = {
            ...feedback,
            questions: [{ question: 'A', scale: '1-10', highLabel: 'Very likely', name: 'recommend' }, { question: 'B', required: false }],
            comment: false, style: { buttonColor: '#d63736' },
        };
        const pasted = document.createElement('div');
        pasted.innerHTML = cleanHtml(renderAmpFeedbackBlock(full, document).outerHTML);
        expect(readStoredAmpFeedbackConfig(pasted.querySelector('.play-editor-amp-feedback')!)).toEqual(full);

        pasted.innerHTML = cleanHtml('<div data-question="Q" data-action="https://x.test"><p data-amp-rating="Q" data-scale="nps" data-comment="false">hi</p></div>');
        expect(pasted.querySelector('[data-question], [data-scale], [data-action], [data-comment], [data-amp-rating]')).toBeNull();
    });

    it('does not mix up settings the blocks share when pasting a quiz', () => {
        const ed = mount('<p>x</p>', [AmpQuizPlugin]);
        const quiz = addAmpQuiz(ed, { questions: [{ question: 'Q', options: ['A', 'B'], answer: 'A' }], action: 'https://example.com/q', submitText: 'Go' })!;
        const pasted = document.createElement('div');
        pasted.innerHTML = cleanHtml(quiz.outerHTML);
        expect(readStoredAmpQuizConfig(pasted.firstElementChild!)).toMatchObject({ action: 'https://example.com/q', submitText: 'Go' });
    });

    it('converts alongside a form and a quiz', () => {
        const ed = mount('<p>x</p>', [AmpFormPlugin, AmpQuizPlugin, AmpFeedbackPlugin]);
        addAmpForm(ed, { action: 'https://example.com/f', fields: [{ name: 'email', type: 'email' }] });
        addAmpQuiz(ed, { questions: [{ question: 'Q', options: ['A', 'B'], answer: 'A' }] });
        addAmpFeedback(ed, feedback);
        const result = toAmpEmail(ed.getContent());
        expect(result.issues.filter(i => i.severity === 'error')).toEqual([]);
        expect(result.html.match(/<form /g)).toHaveLength(2);
    });
});

describe('feedback in the side preview', () => {
    const draw = (config: AmpFeedbackConfig) => {
        const frame = document.createElement('div');
        frame.innerHTML = buildPreviewHtml(renderAmpFeedbackBlock(config, document).outerHTML, {}, { version: 'amp' });
        document.body.appendChild(frame);
        return frame;
    };
    const ratings = (frame: Element, q: number) =>
        Array.from(frame.querySelectorAll('[data-pe-scale]')[q].querySelectorAll<HTMLElement>('[data-pe-rating]'));

    it('shows the fallback in the HTML version and the form in the AMP version, sending nothing', () => {
        expect(buildPreviewHtml(renderAmpFeedbackBlock(feedback, document).outerHTML, {}, { version: 'html' })).toContain('This email lets you rate us');
        const frame = draw(feedback);
        expect(frame.textContent).toContain('How was your order?');
        expect(frame.querySelector('amp-selector, [on], [action-xhr], [data-amp-bind-text], input[type="hidden"]')).toBeNull();
    });

    it('fills stars up to the one picked and lets it change', () => {
        const frame = draw(feedback);
        playFeedbackClick(ratings(frame, 0)[3]);
        expect(ratings(frame, 0).map(s => s.textContent).join('')).toBe('★★★★☆');
        playFeedbackClick(ratings(frame, 0)[1]);
        expect(ratings(frame, 0).map(s => s.textContent).join('')).toBe('★★☆☆☆');
    });

    it('keeps each question separate, and enables sending once every required one is rated', () => {
        const frame = draw({
            ...feedback,
            questions: [{ question: 'A', scale: 'emoji' }, { question: 'B' }, { question: 'C', scale: 'thumbs', required: false }],
        });
        const button = frame.querySelector('button')!;
        expect(button.disabled).toBe(true);
        playFeedbackClick(ratings(frame, 0)[4]);
        playFeedbackClick(ratings(frame, 0)[2]);
        expect(ratings(frame, 0).map(f => f.style.outline !== '')).toEqual([false, false, true, false, false]);
        // The stars of question B are untouched.
        expect(ratings(frame, 1).map(s => s.textContent).join('')).toBe('☆☆☆☆☆');
        expect(button.disabled).toBe(true);
        playFeedbackClick(ratings(frame, 1)[0]);
        // C is optional.
        expect(button.disabled).toBe(false);
    });
});
