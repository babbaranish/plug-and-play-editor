import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '../core/Editor';
import type { Plugin } from '../core/Plugin';
import { AmpQuizPlugin, addAmpQuiz, createAmpQuizPlugin, updateAmpQuiz, AMP_QUIZ_INSERT_COMMAND } from './amp-quiz';
import { AmpFormPlugin, addAmpForm } from './amp-form';
import { SourceCodePlugin } from './source-code';
import { cleanHtml } from './paste-cleanup';
import { buildPreviewHtml, playQuizClick } from './side-preview';
import { AmpQuizConfigError, readStoredAmpQuizConfig } from '../amp/quiz/quizConfig';
import { renderAmpQuizBlock } from '../amp/quiz/quizRenderer';
import { readStoredAmpFormConfig } from '../amp/forms/formConfig';
import type { AmpQuizConfig } from '../amp/quiz/types';
import { toAmpEmail } from '../amp';

const editors: Editor[] = [];

afterEach(() => {
    editors.splice(0).forEach((ed) => ed.destroy());
    document.body.innerHTML = '';
});

function mount(html: string, plugins: Plugin[] = [AmpQuizPlugin]): Editor {
    const ta = document.createElement('textarea');
    ta.value = html;
    document.body.appendChild(ta);
    const ed = new Editor(ta, plugins);
    editors.push(ed);
    return ed;
}

const quiz: AmpQuizConfig = {
    questions: [
        { question: 'What is the capital of France?', options: ['London', 'Paris', 'Berlin'], answer: 'Paris' },
        { question: 'Which planet is red?', options: ['Venus', 'Mars'], answer: 'Mars', explanation: 'Iron oxide dust.' },
    ],
};

describe('addAmpQuiz', () => {
    it('inserts a quiz block that converts to an AMP quiz', () => {
        const ed = mount('<p>one</p>');
        window.getSelection()!.removeAllRanges();
        const block = addAmpQuiz(ed, quiz)!;
        expect(block.className).toBe('play-editor-amp-quiz');
        expect(block.nextElementSibling!.outerHTML).toBe('<p><br></p>');
        const result = toAmpEmail(ed.getContent());
        expect(result.valid).toBe(true);
        expect(result.html).toContain('<amp-selector');
    });

    it('throws every config problem and inserts nothing', () => {
        const ed = mount('<p>one</p>');
        expect(() => addAmpQuiz(ed, { questions: [{ question: 'Q', options: ['A', 'B'], answer: 'C' }] })).toThrow(AmpQuizConfigError);
        expect(ed.editorArea.querySelector('.play-editor-amp-quiz')).toBeNull();
    });

    it('returns null without the plugin or while the source view is open', () => {
        expect(addAmpQuiz(mount('<p>x</p>', []), quiz)).toBeNull();
        const ed = mount('<p>x</p>', [AmpQuizPlugin, SourceCodePlugin]);
        ed.toolbar.querySelector<HTMLButtonElement>('button[title="Source Code"]')!.click();
        expect(addAmpQuiz(ed, quiz)).toBeNull();
    });

    it('is reachable as a command', () => {
        const ed = mount('<p>x</p>');
        expect(ed.hasCommand(AMP_QUIZ_INSERT_COMMAND)).toBe(true);
    });

    it('stores the plugin\'s default design under the quiz\'s own', () => {
        const ed = mount('<p>x</p>', [createAmpQuizPlugin({ defaultStyle: { buttonColor: '#d63736', fieldRadius: 8 } })]);
        const block = addAmpQuiz(ed, { ...quiz, style: { fieldRadius: 12 } })!;
        expect(readStoredAmpQuizConfig(block).style).toEqual({ buttonColor: '#d63736', fieldRadius: 12 });
    });

    it('rejects an invalid default design', () => {
        expect(() => createAmpQuizPlugin({ defaultStyle: { buttonColor: 'red' } })).toThrow(AmpQuizConfigError);
    });
});

describe('updateAmpQuiz', () => {
    it('keeps settings the patch does not name, and removes ones set to undefined', () => {
        const ed = mount('<p>x</p>');
        const block = addAmpQuiz(ed, { ...quiz, correctMessage: 'Yes!', action: 'https://example.com/api/quiz' })!;
        const next = updateAmpQuiz(ed, block, { wrongMessage: 'Nope.', action: undefined })!;
        const stored = readStoredAmpQuizConfig(next);
        expect(stored.correctMessage).toBe('Yes!');
        expect(stored.wrongMessage).toBe('Nope.');
        expect(stored.action).toBeUndefined();
        expect(ed.editorArea.contains(block)).toBe(false);
    });

    it('leaves the quiz as it was when the result is invalid', () => {
        const ed = mount('<p>x</p>');
        const block = addAmpQuiz(ed, quiz)!;
        expect(() => updateAmpQuiz(ed, block, { questions: [] })).toThrow(AmpQuizConfigError);
        expect(ed.editorArea.contains(block)).toBe(true);
    });
});

describe('the quiz dialog', () => {
    const modal = (ed: Editor) => ed.container.querySelector('.play-editor-modal')!;
    const items = (ed: Editor) => Array.from(modal(ed).querySelectorAll<HTMLElement>('.play-editor-modal-list-item'));
    const set = (root: Element, name: string, value: string) => {
        const el = root.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
        el.value = value;
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    };
    const save = (ed: Editor) => modal(ed).querySelector<HTMLButtonElement>('.play-editor-modal-submit')!.click();

    it('inserts a quiz from the toolbar, starting with an example question', () => {
        const ed = mount('<p>x</p>');
        ed.toolbar.querySelector<HTMLButtonElement>('button[title="Insert AMP Quiz"]')!.click();
        expect(items(ed)).toHaveLength(1);
        expect(items(ed)[0].querySelector<HTMLInputElement>('[name="options"]')!.value).toBe('Venus | Mars | Jupiter');
        modal(ed).querySelector<HTMLButtonElement>('.play-editor-modal-list-add')!.click();
        const second = items(ed)[1];
        set(second, 'question', 'Largest ocean?');
        set(second, 'options', 'Atlantic | Pacific');
        set(second, 'answer', 'Pacific');
        save(ed);
        const block = ed.editorArea.querySelector('.play-editor-amp-quiz')!;
        expect(readStoredAmpQuizConfig(block).questions).toEqual([
            { question: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter'], answer: 'Mars' },
            { question: 'Largest ocean?', options: ['Atlantic', 'Pacific'], answer: 'Pacific' },
        ]);
        // Empty optional settings aren't stored.
        expect(block.hasAttribute('data-action')).toBe(false);
        expect(block.hasAttribute('data-button-color')).toBe(false);
    });

    it('flags an answer that is not one of the choices, and does not save', () => {
        const ed = mount('<p>x</p>');
        const block = addAmpQuiz(ed, quiz)!;
        block.click();
        const first = items(ed)[0];
        set(first, 'answer', 'Rome');
        expect(first.querySelector('.play-editor-modal-hint')!.textContent).toBe('The correct answer "Rome" must be one of the choices.');
        save(ed);
        expect(modal(ed).querySelector('.play-editor-modal-error')!.textContent).toBe('Question 1: The correct answer "Rome" must be one of the choices.');
        expect(ed.editorArea.contains(block)).toBe(true);
    });

    it('sets choices per row, storing only a grid', () => {
        const ed = mount('<p>x</p>');
        addAmpQuiz(ed, quiz)!.click();
        expect(modal(ed).querySelector<HTMLSelectElement>('[name="columns"]')!.value).toBe('1');
        set(modal(ed), 'columns', '3');
        save(ed);
        const block = ed.editorArea.querySelector('.play-editor-amp-quiz') as HTMLElement;
        expect(block.getAttribute('data-columns')).toBe('3');

        block.click();
        expect(modal(ed).querySelector<HTMLSelectElement>('[name="columns"]')!.value).toBe('3');
        set(modal(ed), 'columns', '1');
        save(ed);
        expect(ed.editorArea.querySelector('.play-editor-amp-quiz')!.hasAttribute('data-columns')).toBe(false);
    });

    it('edits a quiz, keeping what was not changed and checking the endpoint', () => {
        const ed = mount('<p>x</p>');
        const block = addAmpQuiz(ed, { ...quiz, correctMessage: 'Yes!', style: { fieldRadius: 8 } })!;
        block.click();
        expect(modal(ed).querySelector<HTMLInputElement>('[name="style.fieldRadius"]')!.value).toBe('8');
        expect(modal(ed).textContent).toContain('Choice corners (px)');
        set(modal(ed), 'action', 'http://example.com/quiz');
        save(ed);
        expect(modal(ed).querySelector('.play-editor-modal-error')!.textContent).toContain('uses http');
        set(modal(ed), 'action', 'https://example.com/api/quiz');
        save(ed);
        const stored = readStoredAmpQuizConfig(ed.editorArea.querySelector('.play-editor-amp-quiz')!);
        expect(stored.action).toBe('https://example.com/api/quiz');
        expect(stored.correctMessage).toBe('Yes!');
        expect(stored.style).toEqual({ fieldRadius: 8 });
    });
});

describe('quiz blocks and other content', () => {
    it('keeps a pasted quiz block\'s settings, and drops them anywhere else', () => {
        const full: AmpQuizConfig = { ...quiz, action: 'https://example.com/api/quiz', correctMessage: 'Yes!', style: { buttonColor: '#d63736' } };
        const pasted = document.createElement('div');
        pasted.innerHTML = cleanHtml(renderAmpQuizBlock(full, document).outerHTML);
        expect(readStoredAmpQuizConfig(pasted.querySelector('.play-editor-amp-quiz')!)).toEqual(full);

        pasted.innerHTML = cleanHtml('<div data-correct-message="x"><div data-amp-question="Q" data-answer="A"></div></div>');
        expect(pasted.querySelector('[data-correct-message], [data-amp-question], [data-answer]')).toBeNull();
    });

    it('still keeps a pasted form\'s settings that share names with a quiz\'s', () => {
        const ed = mount('<p>x</p>', [AmpFormPlugin]);
        const form = addAmpForm(ed, { action: 'https://example.com/f', fields: [{ name: 'email', type: 'email' }], submitText: 'Go' })!;
        const pasted = document.createElement('div');
        pasted.innerHTML = cleanHtml(form.outerHTML);
        expect(readStoredAmpFormConfig(pasted.firstElementChild!)).toMatchObject({ action: 'https://example.com/f', submitText: 'Go' });
    });

    it('converts alongside a form', () => {
        const ed = mount('<p>x</p>', [AmpFormPlugin, AmpQuizPlugin]);
        addAmpForm(ed, { action: 'https://example.com/f', fields: [{ name: 'email', type: 'email' }] });
        addAmpQuiz(ed, quiz);
        const result = toAmpEmail(ed.getContent());
        expect(result.valid).toBe(true);
        expect(result.extensions).toEqual(['amp-bind', 'amp-form', 'amp-selector']);
    });
});

describe('the quiz in the side preview', () => {
    const draw = (config: AmpQuizConfig) => {
        const frame = document.createElement('div');
        frame.innerHTML = buildPreviewHtml(renderAmpQuizBlock(config, document).outerHTML, {}, { version: 'amp' });
        document.body.appendChild(frame);
        return frame;
    };
    const visible = (root: Element) => Array.from(root.querySelectorAll<HTMLElement>('p, span'))
        .filter(el => !el.hidden && !el.closest('[hidden]')).map(el => el.textContent);

    it('shows the fallback in the HTML version and the quiz in the AMP version', () => {
        const html = buildPreviewHtml(renderAmpQuizBlock(quiz, document).outerHTML, {}, { version: 'html' });
        expect(html).toContain('This email has a quiz');
        const frame = draw(quiz);
        expect(frame.textContent).not.toContain('This email has a quiz');
        expect(frame.querySelector('amp-selector, [on], [data-amp-bind-hidden]')).toBeNull();
        expect(visible(frame)).toEqual(['1. What is the capital of France?', '2. Which planet is red?']);
    });

    it('draws the choices as a grid when the quiz has several per row', () => {
        const frame = draw({ ...quiz, columns: 2 });
        const choices = frame.querySelector('[data-pe-option]')!.parentElement!;
        expect(choices.getAttribute('style')).toBe('display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px');
    });

    it('plays the quiz: feedback, locking, then the score', () => {
        const frame = draw({ ...quiz, action: 'https://example.com/api/quiz' });
        const options = (q: number) => Array.from(frame.querySelectorAll('[data-pe-question]')[q].querySelectorAll('[data-pe-option]'));
        const button = frame.querySelector('button')!;
        expect(button.disabled).toBe(true);

        playQuizClick(options(0)[0]); // London: wrong
        expect(visible(frame)).toEqual([
            '1. What is the capital of France?', ' ✗', ' ✓', 'Not quite. The answer is Paris.', '2. Which planet is red?',
        ]);
        playQuizClick(options(0)[1]); // locked: ignored
        expect(frame.querySelectorAll('[data-pe-question]')[0].getAttribute('data-pe-chosen')).toBe('1');
        expect(button.disabled).toBe(true);

        playQuizClick(options(1)[1]); // Mars: right
        expect(visible(frame)).toContain('Correct!');
        expect(visible(frame)).toContain('Iron oxide dust.');
        expect(visible(frame)).toContain('Your score: 1 / 2');
        expect(button.disabled).toBe(false);
        // Nothing is sent from the preview.
        expect(frame.querySelector('[action-xhr], input[type="hidden"]')).toBeNull();
    });
});
