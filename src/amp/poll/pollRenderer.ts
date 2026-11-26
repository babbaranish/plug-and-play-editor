import type { AmpPollConfig, NormalizedAmpPollConfig } from './types';
import { AMP_POLL_CLASS, AMP_POLL_SUMMARY_ATTR, normalizeAmpPollConfig, writeAmpPollSettings } from './pollConfig';
import { fontStack } from '../forms/formStyle';
import { endpointLabel } from '../forms/formRenderer';

/** Steps in a result bar: a segment per 10%. */
const BAR_STEPS = 10;

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    if (text !== undefined) node.textContent = text;
    return node;
}

export interface RenderAmpPollOptions {
    /**
     * Adds `data-pe-*` markers describing the poll's behaviour, so the
     * editor's preview (which runs no AMP) can act it out. Not for sending.
     */
    readonly preview?: boolean;
}

/**
 * The AMP email markup for a poll: a `<form>` posting `choice` to the
 * endpoint, the choices as an `amp-selector` (kept in amp-bind state
 * `poll<index>`) and a vote button enabled once a choice is picked. After a
 * successful vote the form keeps the endpoint's answer in state
 * `poll<index>r` (`event.response`): each choice then shows
 * `results[i]` as a percentage and a bar of ten segments, each shown through
 * a `[hidden]` binding (AMP email can't bind a width). The choices lock and
 * the button hides. No script, no template, no `target`.
 *
 * `index` keeps state names unique when an email has several polls.
 */
export function renderAmpPoll(config: NormalizedAmpPollConfig, doc: Document, index = 1, options: RenderAmpPollOptions = {}): HTMLFormElement {
    const s = config.style;
    const font = fontStack(s.fontFamily);
    const fontDecl = font ? `; font-family: ${font}` : '';
    const mark = (node: Element, name: string, value = '') => {
        if (options.preview) node.setAttribute(`data-pe-${name}`, value);
    };
    const state = `poll${index}`;
    const sent = `poll${index}sent`;
    const result = `poll${index}r`;
    const hasResults = `${result} && ${result}.results`;

    const form = el(doc, 'form', {
        method: 'post',
        'action-xhr': config.action,
        on: `submit-success:AMP.setState({${sent}: true${config.showResults ? `, ${result}: event.response` : ''}})`,
    });
    const formCss = [s.maxWidth > 0 ? `max-width: ${s.maxWidth}px` : '', font ? `font-family: ${font}` : ''].filter(Boolean).join('; ');
    if (formCss) form.setAttribute('style', formCss);
    mark(form, 'poll');

    form.appendChild(el(doc, 'p', { style: `margin: 0 0 8px; color: ${s.labelColor}${s.labelBold ? '; font-weight: bold' : ''}` }, config.question));

    const selector = doc.createElement('amp-selector');
    selector.setAttribute('layout', 'container');
    selector.setAttribute('data-amp-bind-disabled', `${sent} == true`);
    selector.setAttribute('on', `select:AMP.setState({${state}: event.targetOption})`);
    config.options.forEach((label, i) => {
        // The choice's text is its value: posted as "choice", never put in an expression.
        const option = el(doc, 'div', {
            option: label,
            style: `display: block; margin: 0 0 6px; padding: 10px 12px; border: 1px solid ${s.fieldBorderColor}; border-radius: ${s.fieldRadius}px;` +
                ` background-color: ${s.fieldBackground}; font-size: ${s.fieldTextSize}px; cursor: pointer`,
        });
        mark(option, 'choice', String(i));
        const line = el(doc, 'div', { style: 'display: flex; justify-content: space-between' });
        line.appendChild(el(doc, 'span', {}, label));
        option.appendChild(line);
        if (config.showResults) {
            const percent = el(doc, 'span', {
                style: `font-weight: bold; color: ${s.labelColor}`,
                'data-amp-bind-text': `${hasResults} ? ${result}.results[${i}] + '%' : ''`,
            });
            mark(percent, 'percent', String(i));
            line.appendChild(percent);
            const bar = el(doc, 'div', {
                hidden: '',
                'data-amp-bind-hidden': `!(${hasResults})`,
                style: 'margin: 6px 0 0; height: 6px; background-color: #e2e8f0; border-radius: 3px; overflow: hidden; font-size: 0; line-height: 0',
            });
            mark(bar, 'bar', String(i));
            for (let step = 1; step <= BAR_STEPS; step++) {
                // A segment per 10%, rounded: 62% shows six.
                const threshold = step * (100 / BAR_STEPS) - (100 / BAR_STEPS) / 2;
                const segment = el(doc, 'span', {
                    hidden: '',
                    'data-amp-bind-hidden': `!(${hasResults} && ${result}.results[${i}] >= ${threshold})`,
                    style: `display: inline-block; width: ${100 / BAR_STEPS}%; height: 6px; background-color: ${s.buttonColor}`,
                });
                mark(segment, 'segment', String(threshold));
                bar.appendChild(segment);
            }
            option.appendChild(bar);
        }
        selector.appendChild(option);
    });
    const choices = el(doc, 'div', { style: `margin: 0 0 ${s.fieldSpacing}px` });
    choices.appendChild(selector);
    form.appendChild(choices);

    form.appendChild(el(doc, 'input', { type: 'hidden', name: 'choice', value: '', 'data-amp-bind-value': `${state} == null ? '' : ${state}` }));

    const buttonWrap = el(doc, 'div', { style: `text-align: ${s.buttonAlign}`, 'data-amp-bind-hidden': `${sent} == true` });
    mark(buttonWrap, 'vote-wrap');
    const button = el(doc, 'button', {
        type: 'submit',
        disabled: '',
        'data-amp-bind-disabled': `${state} == null`,
        style: `padding: 10px 20px; background-color: ${s.buttonColor}; color: ${s.buttonTextColor}; border: 0;` +
            ` border-radius: ${s.buttonRadius}px; font-size: ${s.fieldTextSize}px; font-weight: bold; cursor: pointer` +
            `${s.buttonFullWidth ? '; width: 100%' : ''}${fontDecl}`,
    }, config.submitText);
    mark(button, 'vote');
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

/** The one-line summary the editor shows on a poll block. */
export function pollSummaryOf(config: NormalizedAmpPollConfig): string {
    const q = config.question.length > 50 ? `${config.question.slice(0, 49)}…` : config.question;
    return `AMP poll · ${config.options.length} choices · "${q}" → ${endpointLabel(config.action)}`;
}

/** The web poll's address for one choice: `fallbackUrl` with `choice` set. */
export function pollChoiceUrl(fallbackUrl: string, choice: string): string {
    const url = new URL(fallbackUrl);
    url.searchParams.set('choice', choice);
    return url.toString();
}

/**
 * The block the editor stores for a poll, settings as attributes:
 *
 * ```html
 * <div class="play-editor-amp-poll" contenteditable="false" data-action="https://example.com/api/poll"
 *      data-question="Which day suits you?" data-options="Monday | Friday">
 *   <p>This email has a poll…</p>
 * </div>
 * ```
 *
 * The content is what recipients of the HTML version see. With a web poll
 * (`fallbackUrl`) that is the question and one link per choice, so they can
 * vote with a click; without one, the fallback text. The AMP converter
 * replaces the whole block with {@link renderAmpPoll}'s markup.
 */
export function renderAmpPollBlock(config: AmpPollConfig, doc: Document): HTMLDivElement {
    const normalized = normalizeAmpPollConfig(config);
    const s = normalized.style;
    const block = el(doc, 'div', { class: AMP_POLL_CLASS, contenteditable: 'false' });
    writeAmpPollSettings(block, config);
    block.setAttribute(AMP_POLL_SUMMARY_ATTR, pollSummaryOf(normalized));
    block.setAttribute('style', 'margin: 1em 0');
    if (!normalized.fallbackUrl) {
        block.appendChild(el(doc, 'p', { style: 'margin: 0' }, normalized.fallbackText));
        return block;
    }
    const font = fontStack(s.fontFamily);
    block.appendChild(el(doc, 'p', { style: `margin: 0 0 8px; color: ${s.labelColor}${s.labelBold ? '; font-weight: bold' : ''}` }, normalized.question));
    if (config.fallbackText?.trim()) block.appendChild(el(doc, 'p', { style: 'margin: 0 0 8px' }, normalized.fallbackText));
    for (const choice of normalized.options) {
        const p = el(doc, 'p', { style: 'margin: 0 0 6px' });
        p.appendChild(el(doc, 'a', {
            href: pollChoiceUrl(normalized.fallbackUrl, choice),
            target: '_blank',
            rel: 'noopener noreferrer',
            style: `display: block; padding: 10px 12px; border: 1px solid ${s.fieldBorderColor}; border-radius: ${s.fieldRadius}px;` +
                ` background-color: ${s.fieldBackground}; color: ${s.labelColor}; text-decoration: none${font ? `; font-family: ${font}` : ''}`,
        }, choice));
        block.appendChild(p);
    }
    return block;
}
