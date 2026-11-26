import type { AmpFeedbackConfig, AmpFeedbackScale, NormalizedAmpFeedbackConfig } from './types';
import type { NormalizedAmpFormStyle } from '../forms/types';
import { AMP_FEEDBACK_CLASS, AMP_FEEDBACK_SUMMARY_ATTR, normalizeAmpFeedbackConfig, writeAmpFeedbackSettings } from './feedbackConfig';
import { fontStack } from '../forms/formStyle';
import { endpointLabel } from '../forms/formRenderer';

/** A choice on a scale: the value posted as `rating`, what is shown, and its tooltip. */
interface RatingChoice {
    readonly value: string;
    readonly text: string;
    readonly title: string;
}

const STAR_EMPTY = '☆';
const STAR_FULL = '★';
/** Gold, the colour people read as a star rating. */
const STAR_COLOR = '#f59e0b';

/** Numbered boxes from `from` to `to`, each posted as its number. */
function numbers(from: number, to: number): RatingChoice[] {
    return Array.from({ length: to - from + 1 }, (_, i) => String(from + i)).map(n => ({ value: n, text: n, title: n }));
}

/** The scales shown as numbered boxes. */
const NUMBER_SCALES: ReadonlySet<AmpFeedbackScale> = new Set(['1-5', '1-10']);

/** The choices of each scale, low to high (thumbs: up first). */
export const FEEDBACK_CHOICES: Readonly<Record<AmpFeedbackScale, readonly RatingChoice[]>> = {
    stars: [1, 2, 3, 4, 5].map(n => ({ value: String(n), text: STAR_EMPTY, title: `${n} star${n === 1 ? '' : 's'}` })),
    emoji: [
        { value: '1', text: '\u{1F620}', title: 'Very unhappy' },
        { value: '2', text: '\u{1F641}', title: 'Unhappy' },
        { value: '3', text: '\u{1F610}', title: 'Neutral' },
        { value: '4', text: '\u{1F642}', title: 'Happy' },
        { value: '5', text: '\u{1F60D}', title: 'Very happy' },
    ],
    '1-5': numbers(1, 5),
    '1-10': numbers(1, 10),
    thumbs: [
        { value: '1', text: '\u{1F44D}', title: 'Yes' },
        { value: '0', text: '\u{1F44E}', title: 'No' },
    ],
};

/** How each scale shows: in the summary and the dialog. */
export const FEEDBACK_SCALE_LABELS: Readonly<Record<AmpFeedbackScale, string>> = {
    stars: '★ Stars (1–5)',
    emoji: '\u{1F642} Emoji (1–5)',
    '1-5': '1–5 numbers',
    '1-10': '1–10 numbers',
    thumbs: '\u{1F44D} / \u{1F44E} Thumbs',
};

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    if (text !== undefined) node.textContent = text;
    return node;
}

/** A short row of numbers (1–5) doesn't need the full width; its end labels match it. */
function narrowWidth(scale: AmpFeedbackScale): string {
    return NUMBER_SCALES.has(scale) && FEEDBACK_CHOICES[scale].length <= 5 ? '; max-width: 320px' : '';
}

function choicesCss(scale: AmpFeedbackScale): string {
    if (NUMBER_SCALES.has(scale)) {
        // One row of equal boxes.
        return `display: grid; grid-template-columns: repeat(${FEEDBACK_CHOICES[scale].length}, minmax(0, 1fr)); gap: 4px${narrowWidth(scale)}`;
    }
    return `display: flex; flex-wrap: wrap; gap: ${scale === 'stars' ? 2 : 8}px`;
}

function choiceCss(scale: AmpFeedbackScale, s: NormalizedAmpFormStyle): string {
    const box = `border: 1px solid ${s.fieldBorderColor}; border-radius: ${s.fieldRadius}px; background-color: ${s.fieldBackground}; cursor: pointer`;
    switch (scale) {
        // The filled stars show the rating, so no outline around the one picked.
        case 'stars': return `font-size: 34px; line-height: 1; color: ${STAR_COLOR}; padding: 0 2px; cursor: pointer; outline: none`;
        case 'emoji': return `font-size: 30px; line-height: 1; padding: 6px 8px; border-radius: ${s.fieldRadius}px; cursor: pointer`;
        case 'thumbs': return `font-size: 26px; line-height: 1; padding: 8px 18px; ${box}`;
        case '1-5':
        case '1-10': return `padding: 8px 0; text-align: center; font-size: ${s.fieldTextSize}px; ${box}`;
    }
}

export interface RenderAmpFeedbackOptions {
    /**
     * Adds `data-pe-*` markers describing the block's behaviour, so the
     * editor's preview (which runs no AMP) can act it out. Not for sending.
     */
    readonly preview?: boolean;
}

/**
 * The AMP email markup for a feedback block: a `<form>` posting to the
 * endpoint, with each rating question as an `amp-selector` (its choice kept
 * in amp-bind state `feedback<index>q<n>`), an optional comment and one send
 * button, enabled once every required question is rated. Posts each rating
 * under its question's name and `comment`. After a successful send the
 * ratings lock and the button hides. No script, no `target`.
 *
 * `index` keeps state names and ids unique when an email has several.
 */
export function renderAmpFeedback(config: NormalizedAmpFeedbackConfig, doc: Document, index = 1, options: RenderAmpFeedbackOptions = {}): HTMLFormElement {
    const s = config.style;
    const font = fontStack(s.fontFamily);
    const fontDecl = font ? `; font-family: ${font}` : '';
    const mark = (node: Element, name: string, value = '') => {
        if (options.preview) node.setAttribute(`data-pe-${name}`, value);
    };
    const stateOf = (q: number) => `feedback${index}q${q + 1}`;
    const sent = `feedback${index}sent`;

    const form = el(doc, 'form', {
        method: 'post',
        'action-xhr': config.action,
        on: `submit-success:AMP.setState({${sent}: true})`,
    });
    const formCss = [s.maxWidth > 0 ? `max-width: ${s.maxWidth}px` : '', font ? `font-family: ${font}` : ''].filter(Boolean).join('; ');
    if (formCss) form.setAttribute('style', formCss);
    mark(form, 'feedback');

    config.questions.forEach((question, q) => {
        const state = stateOf(q);
        const wrap = el(doc, 'div', { style: `margin: 0 0 ${s.fieldSpacing + 4}px` });
        mark(wrap, 'scale', question.scale);
        mark(wrap, 'required', String(question.required));
        wrap.appendChild(el(doc, 'p', { style: `margin: 0 0 8px; color: ${s.labelColor}${s.labelBold ? '; font-weight: bold' : ''}` }, question.question));

        const selector = doc.createElement('amp-selector');
        selector.setAttribute('layout', 'container');
        selector.setAttribute('data-amp-bind-disabled', `${sent} == true`);
        selector.setAttribute('on', `select:AMP.setState({${state}: event.targetOption})`);
        selector.setAttribute('style', choicesCss(question.scale));
        const choices = FEEDBACK_CHOICES[question.scale];
        for (const choice of choices) {
            const option = el(doc, 'div', { option: choice.value, title: choice.title, style: choiceCss(question.scale, s) }, choice.text);
            mark(option, 'rating', choice.value);
            if (question.scale === 'stars') {
                // Lit up to the star picked: values are strings, so "at least n" is a list.
                const atLeast = choices.filter(c => Number(c.value) >= Number(choice.value)).map(c => `'${c.value}'`).join(', ');
                option.setAttribute('data-amp-bind-text', `[${atLeast}].includes(${state}) ? '${STAR_FULL}' : '${STAR_EMPTY}'`);
            }
            selector.appendChild(option);
        }
        wrap.appendChild(selector);
        if (question.scale !== 'thumbs' && (question.lowLabel || question.highLabel)) {
            const ends = el(doc, 'div', { style: `display: flex; justify-content: space-between; margin: 4px 0 0; font-size: 12px; color: #64748b${narrowWidth(question.scale)}` });
            ends.append(el(doc, 'span', {}, question.lowLabel), el(doc, 'span', {}, question.highLabel));
            wrap.appendChild(ends);
        }
        form.appendChild(wrap);
    });

    if (config.comment) {
        const id = `amp-feedback-${index}-comment`;
        const wrap = el(doc, 'div', { style: `margin: 0 0 ${s.fieldSpacing}px` });
        wrap.appendChild(el(doc, 'label', {
            for: id,
            style: `display: block;${s.labelBold ? ' font-weight: bold;' : ''} color: ${s.labelColor}; margin: 0 0 4px`,
        }, config.commentLabel));
        const textarea = el(doc, 'textarea', {
            id, name: 'comment', rows: '3', maxlength: '2000',
            style: `display: block; width: 100%; padding: 8px; border: 1px solid ${s.fieldBorderColor}; border-radius: ${s.fieldRadius}px;` +
                ` background-color: ${s.fieldBackground}; box-sizing: border-box; font-size: ${s.fieldTextSize}px${fontDecl}`,
        });
        if (config.commentPlaceholder) textarea.setAttribute('placeholder', config.commentPlaceholder);
        if (config.commentRequired) textarea.setAttribute('required', '');
        wrap.appendChild(textarea);
        form.appendChild(wrap);
    }

    config.questions.forEach((question, q) => {
        form.appendChild(el(doc, 'input', { type: 'hidden', name: question.name, value: '', 'data-amp-bind-value': `${stateOf(q)} == null ? '' : ${stateOf(q)}` }));
    });

    const buttonWrap = el(doc, 'div', { style: `text-align: ${s.buttonAlign}`, 'data-amp-bind-hidden': `${sent} == true` });
    const button = el(doc, 'button', {
        type: 'submit',
        style: `padding: 10px 20px; background-color: ${s.buttonColor}; color: ${s.buttonTextColor}; border: 0;` +
            ` border-radius: ${s.buttonRadius}px; font-size: ${s.fieldTextSize}px; font-weight: bold; cursor: pointer` +
            `${s.buttonFullWidth ? '; width: 100%' : ''}${fontDecl}`,
    }, config.submitText);
    // Enabled once every required question is rated; with none required, always.
    const required = config.questions.map((question, q) => (question.required ? `${stateOf(q)} != null` : '')).filter(Boolean);
    if (required.length) {
        button.setAttribute('disabled', '');
        button.setAttribute('data-amp-bind-disabled', `!(${required.join(' && ')})`);
    }
    mark(button, 'enable', 'rated');
    buttonWrap.appendChild(button);
    form.appendChild(buttonWrap);

    const states: [string, string, string][] = [
        ['submitting', config.submittingMessage, '#475569'],
        ['submit-success', config.successMessage, s.successColor],
        ['submit-error', config.errorMessage, s.errorColor],
    ];
    for (const [attr, text, color] of states) {
        const box = el(doc, 'div', { [attr]: '' });
        box.appendChild(el(doc, 'p', { style: `margin: 12px 0 0; color: ${color}` }, text));
        form.appendChild(box);
    }
    return form;
}

/** The one-line summary the editor shows on a feedback block. */
export function feedbackSummaryOf(config: NormalizedAmpFeedbackConfig): string {
    const first = config.questions[0];
    const q = first.question.length > 50 ? `${first.question.slice(0, 49)}…` : first.question;
    const what = config.questions.length === 1 ? FEEDBACK_SCALE_LABELS[first.scale] : `${config.questions.length} ratings`;
    return `AMP feedback · ${what} · "${q}" → ${endpointLabel(config.action)}`;
}

/**
 * The block the editor stores for a feedback block: settings as attributes,
 * one empty element per rating question:
 *
 * ```html
 * <div class="play-editor-amp-feedback" contenteditable="false" data-action="https://example.com/api/feedback">
 *   <div data-amp-rating="How was the delivery?" data-scale="emoji"></div>
 *   <div data-amp-rating="How likely are you to recommend us?" data-scale="1-10" data-name="recommend"></div>
 *   <p>This email lets you rate us…</p>
 * </div>
 * ```
 *
 * The content (what recipients of the HTML version see) is just the
 * fallback text and, when given, a link to a web feedback page. The AMP
 * converter replaces the whole block with {@link renderAmpFeedback}'s markup.
 */
export function renderAmpFeedbackBlock(config: AmpFeedbackConfig, doc: Document): HTMLDivElement {
    const normalized = normalizeAmpFeedbackConfig(config);
    const block = el(doc, 'div', { class: AMP_FEEDBACK_CLASS, contenteditable: 'false' });
    const questions = writeAmpFeedbackSettings(block, config);
    block.setAttribute(AMP_FEEDBACK_SUMMARY_ATTR, feedbackSummaryOf(normalized));
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
