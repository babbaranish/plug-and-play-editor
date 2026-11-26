import { describe, it, expect } from 'vitest';
import { toAmpEmail } from '../index';
import type { AmpQuizConfig } from './types';
import { validateAmpQuizConfig } from './quizValidator';
import {
    AmpQuizConfigError,
    parseAmpQuizChoices,
    parseAmpQuizConfig,
    readAmpQuizConfig,
    readStoredAmpQuizConfig
} from './quizConfig';
import { renderAmpQuiz, renderAmpQuizBlock } from './quizRenderer';

const quiz: AmpQuizConfig = {
    questions: [
        { question: 'What is the capital of France?', options: ['London', 'Paris', 'Berlin'], answer: 'Paris' },
        { question: 'Which planet is red?', options: ['Venus', 'Mars'], answer: 'Mars', explanation: 'Iron oxide dust.' },
    ],
};

function blockHtml(config: AmpQuizConfig): string {
    return renderAmpQuizBlock(config, document).outerHTML;
}

function body(html: string): string {
    return html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
}

describe('validateAmpQuizConfig', () => {
    it('accepts a minimal quiz', () => {
        expect(validateAmpQuizConfig(quiz)).toEqual([]);
    });

    it('needs questions, 2–6 unique choices and an answer among them', () => {
        expect(validateAmpQuizConfig({ questions: [] })).toEqual([{ path: 'questions', message: 'The quiz needs at least one question.' }]);
        const issues = validateAmpQuizConfig({
            questions: [
                { question: '', options: ['Only one'], answer: 'Only one' },
                { question: 'Q', options: ['A', 'A', 'B|C'], answer: 'D' },
            ],
        });
        expect(issues).toEqual([
            { path: 'questions[0].question', message: 'The question needs text.' },
            { path: 'questions[0].options', message: 'A question needs 2 to 6 choices.' },
            { path: 'questions[1].options[1]', message: 'Choice "A" is listed twice.' },
            { path: 'questions[1].options[2]', message: 'Choice "B|C" can\'t contain "|".' },
            { path: 'questions[1].answer', message: 'The correct answer "D" must be one of the choices.' },
        ]);
    });

    it('caps the number of questions', () => {
        const many = Array.from({ length: 21 }, () => quiz.questions[0]);
        expect(validateAmpQuizConfig({ questions: many })[0].message).toBe('A quiz can have at most 20 questions.');
    });

    it('checks an endpoint only when one is given, with the form endpoint rules', () => {
        expect(validateAmpQuizConfig({ ...quiz, action: '' })).toEqual([]);
        expect(validateAmpQuizConfig({ ...quiz, action: 'https://example.com/api/quiz' })).toEqual([]);
        expect(validateAmpQuizConfig({ ...quiz, action: 'http://example.com/quiz' })[0].message).toContain('uses http');
        expect(validateAmpQuizConfig({ ...quiz, action: 'https://example.com/{{list}}' })[0].message).toContain('unresolved variable');
    });

    it('rejects callbacks and unknown options, and checks the design', () => {
        const issues = validateAmpQuizConfig({ ...quiz, onAnswer: () => {}, colour: 'red', style: { buttonColor: 'red' } });
        expect(issues.map(i => i.path)).toEqual(['onAnswer', 'colour', 'style.buttonColor']);
        expect(issues[0].message).toContain("runs in the recipient's email client");
    });

    it('takes 1, 2 or 3 choices per row', () => {
        for (const columns of [1, 2, 3]) expect(validateAmpQuizConfig({ ...quiz, columns })).toEqual([]);
        for (const columns of [0, 4, 2.5, '2']) {
            expect(validateAmpQuizConfig({ ...quiz, columns })).toEqual([{ path: 'columns', message: 'columns (choices per row) must be 1, 2 or 3.' }]);
        }
    });

    it('parseAmpQuizConfig throws every problem', () => {
        expect(() => parseAmpQuizConfig({ questions: [{ question: 'Q', options: ['A', 'B'], answer: 'C' }] }))
            .toThrow(AmpQuizConfigError);
    });
});

describe('the stored quiz block', () => {
    it('is readable: settings as attributes, one empty element per question', () => {
        const block = renderAmpQuizBlock({ ...quiz, correctMessage: 'Yes!', style: { buttonColor: '#d63736' } }, document);
        expect(block.getAttribute('data-correct-message')).toBe('Yes!');
        expect(block.getAttribute('data-button-color')).toBe('#d63736');
        const questions = block.querySelectorAll('[data-amp-question]');
        expect(questions[0].outerHTML).toBe('<div data-amp-question="What is the capital of France?" data-options="London | Paris | Berlin" data-answer="Paris"></div>');
        expect(questions[1].getAttribute('data-explanation')).toBe('Iron oxide dust.');
        expect((questions[0] as HTMLElement).textContent).toBe('');
        expect(block.getAttribute('data-amp-quiz-summary')).toBe('AMP quiz · 2 questions · "What is the capital of France?"');
    });

    it('reads back exactly what was written', () => {
        const full: AmpQuizConfig = {
            ...quiz,
            columns: 3,
            correctMessage: 'Yes!', wrongMessage: 'Nope.', scoreText: 'Score:',
            action: 'https://example.com/api/quiz', submitText: 'Send', successMessage: 'Sent', errorMessage: 'Failed',
            submittingMessage: 'Sending', fallbackText: 'Open in Gmail', fallbackUrl: 'https://example.com/quiz', fallbackLinkText: 'Play',
            style: { fieldRadius: 8, labelBold: false },
        };
        expect(readStoredAmpQuizConfig(renderAmpQuizBlock(full, document))).toEqual(full);
    });

    it('shows only the fallback, and a link when given, in the HTML version', () => {
        const block = renderAmpQuizBlock({ ...quiz, fallbackUrl: 'https://example.com/quiz' }, document);
        expect(block.textContent).toBe('This email has a quiz you can take in an email app that supports interactive email, such as Gmail.Take the quiz');
        expect(block.querySelector('a')!.getAttribute('href')).toBe('https://example.com/quiz');
    });

    it('splits choices on | so a choice can contain commas', () => {
        expect(parseAmpQuizChoices('Yes, always | No, never |  | Sometimes')).toEqual(['Yes, always', 'No, never', 'Sometimes']);
    });

    it('reports a hand-edited block with a misspelt setting or a wrong answer', () => {
        const holder = document.createElement('div');
        holder.innerHTML = '<div class="play-editor-amp-quiz" data-corect-message="x"><div data-amp-question="Q" data-options="A | B" data-answer="C"></div></div>';
        const read = readAmpQuizConfig(holder.firstElementChild!);
        expect('issues' in read && read.issues.map(i => i.path)).toEqual(['corectMessage', 'questions[0].answer']);
    });
});

describe('renderAmpQuiz', () => {
    const normalized = parseAmpQuizConfig(quiz);

    it('makes each question an amp-selector whose choice is kept in amp-bind state', () => {
        const el = renderAmpQuiz(normalized, document, 3);
        const selector = el.querySelector('amp-selector')!;
        expect(selector.getAttribute('layout')).toBe('container');
        expect(selector.getAttribute('on')).toBe('select:AMP.setState({quiz3q1: event.targetOption})');
        // Locked once answered.
        expect(selector.getAttribute('data-amp-bind-disabled')).toBe('quiz3q1 != null');
        expect(Array.from(selector.querySelectorAll('[option]')).map(o => o.getAttribute('option'))).toEqual(['1', '2', '3']);
    });

    it('lists the choices by default, and lays them out in a grid of 2 or 3', () => {
        const list = renderAmpQuiz(normalized, document).querySelector('amp-selector')!;
        expect(list.hasAttribute('style')).toBe(false);
        expect(list.querySelector('[option]')!.getAttribute('style')).toContain('margin: 0 0 6px');

        for (const columns of [2, 3] as const) {
            const grid = renderAmpQuiz(parseAmpQuizConfig({ ...quiz, columns }), document).querySelector('amp-selector')!;
            expect(grid.getAttribute('style')).toBe(`display: grid; grid-template-columns: repeat(${columns}, minmax(0, 1fr)); gap: 6px`);
            // The gap spaces the choices.
            expect(grid.querySelector('[option]')!.getAttribute('style')).toContain('margin: 0;');
        }
    });

    it('stores choices per row as data-columns, and reports a bad hand-edited value', () => {
        expect(renderAmpQuizBlock({ ...quiz, columns: 2 }, document).getAttribute('data-columns')).toBe('2');
        expect(renderAmpQuizBlock(quiz, document).hasAttribute('data-columns')).toBe(false);
        const block = renderAmpQuizBlock(quiz, document);
        block.setAttribute('data-columns', 'two');
        const read = readAmpQuizConfig(block);
        expect('issues' in read && read.issues.map(i => i.path)).toEqual(['columns']);
    });

    it('starts feedback hidden and shows it through bindings', () => {
        const el = renderAmpQuiz(normalized, document, 1);
        const q1 = el.firstElementChild!;
        const [right, wrong] = Array.from(q1.querySelectorAll(':scope > p[hidden]'));
        expect(right.getAttribute('data-amp-bind-hidden')).toBe("quiz1q1 != '2'");
        expect(right.textContent).toBe('Correct!');
        expect(wrong.getAttribute('data-amp-bind-hidden')).toBe("quiz1q1 == null || quiz1q1 == '2'");
        expect(wrong.textContent).toBe('Not quite. The answer is Paris.');
        // A tick on the right choice once answered; a cross on a wrong choice when it is picked.
        const signs = Array.from(q1.querySelectorAll('[option] > span'));
        expect(signs.map(s => [s.textContent, s.getAttribute('data-amp-bind-hidden')])).toEqual([
            [' ✗', "quiz1q1 != '1'"],
            [' ✓', 'quiz1q1 == null'],
            [' ✗', "quiz1q1 != '3'"],
        ]);
    });

    it('shows the score once every question is answered', () => {
        const el = renderAmpQuiz(normalized, document, 1);
        const score = el.querySelector('[data-amp-bind-text]')!;
        expect(score.getAttribute('data-amp-bind-text')).toBe("(quiz1q1 == '2' ? 1 : 0) + (quiz1q2 == '2' ? 1 : 0)");
        expect(score.parentElement!.getAttribute('data-amp-bind-hidden')).toBe('!(quiz1q1 != null && quiz1q2 != null)');
        expect(score.parentElement!.textContent).toBe('Your score: 0 / 2');
    });

    it('is a plain div without an endpoint, and a form posting the answers with one', () => {
        expect(renderAmpQuiz(normalized, document).tagName).toBe('DIV');
        const form = renderAmpQuiz(parseAmpQuizConfig({ ...quiz, action: 'https://example.com/api/quiz' }), document);
        expect(form.tagName).toBe('FORM');
        expect(form.getAttribute('action-xhr')).toBe('https://example.com/api/quiz');
        expect(form.hasAttribute('target')).toBe(false);
        expect(Array.from(form.querySelectorAll('input[type="hidden"]')).map(i => i.getAttribute('name'))).toEqual(['q1', 'q2', 'score', 'total']);
        const button = form.querySelector('button')!;
        expect(button.hasAttribute('disabled')).toBe(true);
        expect(button.getAttribute('data-amp-bind-disabled')).toBe('!(quiz1q1 != null && quiz1q2 != null)');
        expect(form.querySelector('[submit-success]')!.textContent).toBe('Thanks! Your answers were sent.');
    });

    it('keeps user text out of binding expressions', () => {
        const tricky = parseAmpQuizConfig({
            questions: [{ question: `It's "quoted" <b>`, options: [`A' + x + '`, 'B'], answer: `A' + x + '`, explanation: '</p><script>' }],
        });
        const el = renderAmpQuiz(tricky, document);
        for (const node of [el, ...Array.from(el.querySelectorAll('*'))]) {
            for (const attr of Array.from(node.attributes)) {
                if (attr.name.startsWith('data-amp-bind-') || attr.name === 'on') expect(attr.value).not.toMatch(/quoted|x \+|script/);
            }
        }
        expect(el.querySelector('script, b')).toBeNull();
        expect(el.querySelector('p')!.textContent).toBe(`It's "quoted" <b>`);
    });

    it('adds preview markers only when asked', () => {
        expect(renderAmpQuiz(normalized, document).outerHTML).not.toContain('data-pe-');
        const preview = renderAmpQuiz(normalized, document, 1, { preview: true });
        expect(preview.querySelector('[data-pe-question]')!.getAttribute('data-pe-question')).toBe('2');
    });
});

describe('toAmpEmail with quizzes', () => {
    it('converts a quiz into valid AMP with amp-bind and amp-selector', () => {
        const result = toAmpEmail(`<p>Quiz time</p>${blockHtml(quiz)}`);
        expect(result.issues.filter(i => i.severity === 'error')).toEqual([]);
        expect(result.valid).toBe(true);
        expect(result.extensions).toEqual(['amp-bind', 'amp-selector']);
        expect(result.html).toContain('<script async custom-element="amp-bind" src="https://cdn.ampproject.org/v0/amp-bind-0.1.js"></script>');
        expect(body(result.html)).not.toContain('play-editor');
        expect(body(result.html)).not.toContain('data-amp-question');
        expect(body(result.html)).not.toContain('data-pe-');
    });

    it('keeps each quiz\'s state separate', () => {
        const result = toAmpEmail(blockHtml(quiz) + blockHtml(quiz));
        expect(result.html).toContain('quiz1q1');
        expect(result.html).toContain('quiz2q1');
    });

    it('adds amp-form for a quiz that records answers', () => {
        const result = toAmpEmail(blockHtml({ ...quiz, action: 'https://example.com/api/quiz' }));
        expect(result.issues.filter(i => i.severity === 'error')).toEqual([]);
        expect(result.extensions).toEqual(['amp-bind', 'amp-form', 'amp-selector']);
    });

    it('reports an invalid quiz and keeps its fallback', () => {
        const holder = document.createElement('div');
        holder.innerHTML = blockHtml(quiz);
        holder.querySelector('[data-amp-question]')!.setAttribute('data-answer', 'Rome');
        const result = toAmpEmail(holder.innerHTML);
        expect(result.valid).toBe(false);
        expect(result.issues.find(i => i.code === 'quiz-invalid')!.message)
            .toBe('Quiz 1: questions[0].answer: The correct answer "Rome" must be one of the choices.');
        expect(body(result.html)).toContain('This email has a quiz');
        expect(body(result.html)).not.toContain('amp-selector');
    });

    it('does not let hand-written content use the quiz\'s AMP markup', () => {
        const result = toAmpEmail('<amp-selector on="select:AMP.navigateTo(url=\'https://x.test\')"><div option="1" hidden>A</div></amp-selector>' +
            '<p data-amp-bind-text="1" on="tap:AMP.setState({a: 1})">B</p>');
        const out = body(result.html);
        expect(out.trim()).toBe('<div>A</div><p>B</p>');
        expect(result.extensions).toEqual([]);
    });
});
