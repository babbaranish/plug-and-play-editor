import type { AmpQuizConfig, NormalizedAmpQuizConfig } from './types';
import type { NormalizedAmpFormStyle } from '../forms/types';
import { AMP_QUIZ_CLASS, AMP_QUIZ_SUMMARY_ATTR, normalizeAmpQuizConfig, writeAmpQuizSettings } from './quizConfig';
import { fontStack } from '../forms/formStyle';
import { endpointLabel } from '../forms/formRenderer';

// Inline styles, as for forms: email clients drop most <style> rules. Every
// value comes from a validated design setting.

interface QuizCss {
    quiz: string;
    question: string;
    prompt: string;
    /** The amp-selector holding the choices: '' for a list, a grid otherwise. */
    choices: string;
    option: string;
    correct: string;
    wrong: string;
    note: string;
    score: string;
    buttonWrap: string;
    button: string;
}

function cssFor(style: NormalizedAmpFormStyle, columns: number): QuizCss {
    const font = fontStack(style.fontFamily);
    const fontDecl = font ? `; font-family: ${font}` : '';
    // A grid spaces its choices with `gap` (AMP email allows it; not grid-gap).
    const grid = columns > 1;
    return {
        quiz: [style.maxWidth > 0 ? `max-width: ${style.maxWidth}px` : '', font ? `font-family: ${font}` : ''].filter(Boolean).join('; '),
        question: `margin: 0 0 ${style.fieldSpacing + 8}px`,
        prompt: `margin: 0 0 8px; color: ${style.labelColor}${style.labelBold ? '; font-weight: bold' : ''}`,
        choices: grid ? `display: grid; grid-template-columns: repeat(${columns}, minmax(0, 1fr)); gap: 6px` : '',
        option: `display: block; box-sizing: border-box; margin: ${grid ? '0' : '0 0 6px'}; padding: 10px 12px; border: 1px solid ${style.fieldBorderColor};` +
            ` border-radius: ${style.fieldRadius}px; background-color: ${style.fieldBackground}; font-size: ${style.fieldTextSize}px; cursor: pointer`,
        correct: `margin: 6px 0 0; color: ${style.successColor}; font-weight: bold`,
        wrong: `margin: 6px 0 0; color: ${style.errorColor}; font-weight: bold`,
        note: 'margin: 4px 0 0; color: #475569',
        score: `margin: 0 0 12px; color: ${style.labelColor}; font-weight: bold; font-size: ${style.fieldTextSize + 2}px`,
        buttonWrap: `text-align: ${style.buttonAlign}`,
        button: `padding: 10px 20px; background-color: ${style.buttonColor}; color: ${style.buttonTextColor}; border: 0;` +
            ` border-radius: ${style.buttonRadius}px; font-size: ${style.fieldTextSize}px; font-weight: bold; cursor: pointer` +
            `${style.buttonFullWidth ? '; width: 100%' : ''}${fontDecl}`,
    };
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    if (text !== undefined) node.textContent = text;
    return node;
}

/** Any tag, for `amp-selector`, which the DOM's tag map doesn't know. */
function custom(doc: Document, tag: string, attrs: Record<string, string>): HTMLElement {
    const node = doc.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    return node;
}

export interface RenderAmpQuizOptions {
    /**
     * Adds `data-pe-*` markers describing the quiz's behaviour, so the
     * editor's preview (which runs no AMP) can act it out. Not for sending.
     */
    readonly preview?: boolean;
}

/**
 * The AMP email markup for a quiz. Each question is an `amp-selector` whose
 * choice is kept in amp-bind state (`quiz<index>q<n>`, the number of the
 * choice picked, from 1). Picking one locks the question and shows marks and
 * feedback through `[hidden]` bindings; the score shows once every question
 * is answered. With an endpoint, the quiz is a `<form>` that posts the
 * answers, the score and the total. No script, no `target`.
 *
 * `index` keeps state names unique when an email has several quizzes.
 */
export function renderAmpQuiz(config: NormalizedAmpQuizConfig, doc: Document, index = 1, options: RenderAmpQuizOptions = {}): HTMLElement {
    const css = cssFor(config.style, config.columns);
    const mark =(node: Element, name: string, value = '') => {
        if (options.preview) node.setAttribute(`data-pe-${name}`, value);
    };
    const state = (q: number) => `quiz${index}q${q + 1}`;
    const all = config.questions.map((_, q) => `${state(q)} != null`).join(' && ');
    const score = config.questions.map((question, q) => `(${state(q)} == '${question.answerIndex + 1}' ? 1 : 0)`).join(' + ');

    const quiz = config.action
        ? el(doc, 'form', { method: 'post', 'action-xhr': config.action })
        : el(doc, 'div');
    if (css.quiz) quiz.setAttribute('style', css.quiz);
    mark(quiz, 'quiz');

    config.questions.forEach((question, q) => {
        const s = state(q);
        const correct = String(question.answerIndex + 1);
        const wrap = el(doc, 'div', { style: css.question });
        mark(wrap, 'question', correct);
        wrap.appendChild(el(doc, 'p', { style: css.prompt }, config.questions.length > 1 ? `${q + 1}. ${question.question}` : question.question));

        const selector = custom(doc, 'amp-selector', {
            layout: 'container',
            'data-amp-bind-disabled': `${s} != null`,
            on: `select:AMP.setState({${s}: event.targetOption})`,
        });
        if (css.choices) selector.setAttribute('style', css.choices);
        question.options.forEach((label, i) => {
            const value = String(i + 1);
            const option = el(doc, 'div', { option: value, style: css.option }, label);
            mark(option, 'option', value);
            // After answering: a tick on the right choice, a cross on a wrong one picked.
            const isAnswer = i === question.answerIndex;
            const sign = el(doc, 'span', {
                hidden: '',
                'data-amp-bind-hidden': isAnswer ? `${s} == null` : `${s} != '${value}'`,
                style: `color: ${isAnswer ? config.style.successColor : config.style.errorColor}; font-weight: bold`,
            }, isAnswer ? ' ✓' : ' ✗');
            mark(sign, 'when', isAnswer ? 'answered' : 'chosen');
            option.appendChild(sign);
            selector.appendChild(option);
        });
        wrap.appendChild(selector);

        const right = el(doc, 'p', { hidden: '', 'data-amp-bind-hidden': `${s} != '${correct}'`, style: css.correct }, config.correctMessage);
        mark(right, 'when', 'correct');
        const wrong = el(doc, 'p', { hidden: '', 'data-amp-bind-hidden': `${s} == null || ${s} == '${correct}'`, style: css.wrong },
            `${config.wrongMessage} The answer is ${question.answer}.`);
        mark(wrong, 'when', 'wrong');
        wrap.append(right, wrong);
        if (question.explanation) {
            const note = el(doc, 'p', { hidden: '', 'data-amp-bind-hidden': `${s} == null`, style: css.note }, question.explanation);
            mark(note, 'when', 'answered');
            wrap.appendChild(note);
        }
        quiz.appendChild(wrap);
    });

    const total = String(config.questions.length);
    const result = el(doc, 'p', { hidden: '', 'data-amp-bind-hidden': `!(${all})`, style: css.score }, `${config.scoreText} `);
    mark(result, 'when', 'complete');
    const points = el(doc, 'span', { 'data-amp-bind-text': score }, '0');
    mark(points, 'score');
    result.append(points, doc.createTextNode(` / ${total}`));
    quiz.appendChild(result);

    if (config.action) {
        config.questions.forEach((_, q) => {
            quiz.appendChild(el(doc, 'input', { type: 'hidden', name: `q${q + 1}`, value: '', 'data-amp-bind-value': `${state(q)} == null ? '' : ${state(q)}` }));
        });
        quiz.appendChild(el(doc, 'input', { type: 'hidden', name: 'score', value: '0', 'data-amp-bind-value': score }));
        quiz.appendChild(el(doc, 'input', { type: 'hidden', name: 'total', value: total }));
        const buttonWrap = el(doc, 'div', { style: css.buttonWrap });
        const button = el(doc, 'button', { type: 'submit', disabled: '', 'data-amp-bind-disabled': `!(${all})`, style: css.button }, config.submitText);
        mark(button, 'enable', 'complete');
        buttonWrap.appendChild(button);
        quiz.appendChild(buttonWrap);
        const states: [string, string, string][] = [
            ['submitting', config.submittingMessage, '#475569'],
            ['submit-success', config.successMessage, config.style.successColor],
            ['submit-error', config.errorMessage, config.style.errorColor],
        ];
        for (const [attr, text, color] of states) {
            const box = el(doc, 'div', { [attr]: '' });
            box.appendChild(el(doc, 'p', { style: `margin: 12px 0 0; color: ${color}` }, text));
            quiz.appendChild(box);
        }
    }
    return quiz;
}

/** The one-line summary the editor shows on a quiz block. */
export function quizSummaryOf(config: NormalizedAmpQuizConfig): string {
    const n = config.questions.length;
    const first = config.questions[0].question;
    const lead = first.length > 50 ? `${first.slice(0, 49)}…` : first;
    const recorded = config.action ? ` → ${endpointLabel(config.action)}` : '';
    return `AMP quiz · ${n} question${n === 1 ? '' : 's'} · "${lead}"${recorded}`;
}

/**
 * The block the editor stores for a quiz, in a readable format:
 *
 * ```html
 * <div class="play-editor-amp-quiz" contenteditable="false" data-correct-message="Yes!">
 *   <div data-amp-question="Capital of France?" data-options="London | Paris" data-answer="Paris"></div>
 *   <p>This email has a quiz…</p>
 * </div>
 * ```
 *
 * The content (what recipients of the HTML version see) is just the
 * fallback text and, when given, a link to a web version of the quiz. The
 * AMP converter replaces the whole block with {@link renderAmpQuiz}'s markup.
 */
export function renderAmpQuizBlock(config: AmpQuizConfig, doc: Document): HTMLDivElement {
    const normalized = normalizeAmpQuizConfig(config);
    const block = el(doc, 'div', { class: AMP_QUIZ_CLASS, contenteditable: 'false' });
    const questions = writeAmpQuizSettings(block, config);
    block.setAttribute(AMP_QUIZ_SUMMARY_ATTR, quizSummaryOf(normalized));
    block.setAttribute('style', 'margin: 1em 0');
    block.append(...questions);
    block.appendChild(el(doc, 'p', { style: 'margin: 0 0 8px' }, normalized.fallbackText));
    if (normalized.fallbackUrl) {
        const s = normalized.style;
        const font = fontStack(s.fontFamily);
        const p = el(doc, 'p', { style: 'margin: 0' });
        p.appendChild(el(doc, 'a', {
            href: normalized.fallbackUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
            style: `display: inline-block; padding: 10px 20px; background-color: ${s.buttonColor}; color: ${s.buttonTextColor};` +
                ` border-radius: ${s.buttonRadius}px; text-decoration: none; font-weight: bold${font ? `; font-family: ${font}` : ''}`,
        }, normalized.fallbackLinkText));
        block.appendChild(p);
    }
    return block;
}
