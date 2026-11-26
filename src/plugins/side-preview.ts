import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import type { AmpEmailResult } from '../amp/types';
import { icons } from '../core/icons';
import { DEFAULT_SAMPLE_DATA } from './preview';
import { AMP_FORM_CLASS, readAmpFormConfig } from '../amp/forms/formConfig';
import { renderAmpForm } from '../amp/forms/formRenderer';
import { AMP_QUIZ_CLASS, readAmpQuizConfig } from '../amp/quiz/quizConfig';
import { renderAmpQuiz } from '../amp/quiz/quizRenderer';
import { AMP_FEEDBACK_CLASS, readAmpFeedbackConfig } from '../amp/feedback/feedbackConfig';
import { renderAmpFeedback } from '../amp/feedback/feedbackRenderer';
import { AMP_POLL_CLASS, readAmpPollConfig } from '../amp/poll/pollConfig';
import { renderAmpPoll } from '../amp/poll/pollRenderer';

export type SidePreviewDevice = 'desktop' | 'mobile';
/** Which version of the email the preview shows: for AMP email apps, or for the rest. */
export type SidePreviewMode = 'amp' | 'html';

export interface SidePreviewPluginOptions {
    /** Sample values shown in place of variables. Merged over the Preview plugin's defaults. */
    sampleData?: Record<string, string>;
    /** Whether the pane starts open. Default `true`. */
    open?: boolean;
    /** Width the preview starts at. Default `'desktop'`. */
    device?: SidePreviewDevice;
    /**
     * Extra CSS for the preview document, e.g. the wrapper styles your sender
     * adds around the email. The preview otherwise shows the HTML with only
     * basic email-client defaults, not the editor's own stylesheet.
     */
    styles?: string;
    /**
     * Turns on the AMP version: an "AMP email / HTML email" switch in the
     * header, and in the AMP view a status line that says whether the content
     * converts cleanly, lists what needs fixing, and copies the AMP document.
     * Pass e.g. `(html) => toAmpEmail(html, { css })` from
     * `plug-and-play-editor/amp`; it is not bundled unless you do.
     */
    ampConverter?: (html: string) => AmpEmailResult;
    /** The version shown first when `ampConverter` is set. Default `'amp'`. */
    mode?: SidePreviewMode;
}

/** Toggles the pane; returns whether it is open afterwards. */
export const SIDE_PREVIEW_TOGGLE_COMMAND = 'side-preview:toggle';

const MOBILE_WIDTH = 375;
const UPDATE_DELAY_MS = 120;

const BASE_STYLES = `
html, body { margin: 0; background: #ffffff; }
body {
    padding: 16px;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 15px;
    line-height: 1.5;
    color: #1f2937;
    overflow-wrap: break-word;
}
img { max-width: 100%; }
table { border-collapse: collapse; }
/* As in AMP's own stylesheet: hidden wins over an inline display (a poll's bar segments). */
[hidden] { display: none !important; }
`;

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;

function fill(value: string, data: Record<string, string>): string {
    return value.replace(PLACEHOLDER, (whole, key: string) => data[key] ?? whole);
}

export interface BuildPreviewOptions {
    /**
     * Which version of the email to show. `'html'` (default): what email apps
     * without AMP show, so an AMP form shows its fallback. `'amp'`: what AMP
     * email apps show, so an AMP form is drawn as its form.
     */
    readonly version?: SidePreviewMode;
}

/**
 * The HTML the preview shows for `html`: variables replaced with sample
 * values where one exists, variable chips turned into plain text, and the
 * editor's `contenteditable` markers removed. Pure: `html` is parsed into an
 * inert template, so nothing in it loads or runs.
 */
export function buildPreviewHtml(
    html: string,
    sampleData: Record<string, string> = DEFAULT_SAMPLE_DATA,
    options: BuildPreviewOptions = {}
): string {
    const template = document.createElement('template');
    template.innerHTML = html;
    const root = template.content;

    root.querySelectorAll<HTMLElement>('.play-editor-token').forEach((chip) => {
        const key = (chip.dataset.token ?? chip.dataset.key ?? '').trim();
        const text = key && key in sampleData ? sampleData[key] : chip.textContent ?? '';
        chip.replaceWith(document.createTextNode(fill(text, sampleData)));
    });

    // Before variables are filled in, so the stored JSON is read as written;
    // the form's text is filled in with the rest below.
    if (options.version === 'amp') {
        drawAmpForms(root);
        drawAmpQuizzes(root);
        drawAmpFeedback(root);
        drawAmpPolls(root);
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.nodeValue ?? '';
        if (text.includes('{{')) node.nodeValue = fill(text, sampleData);
    }

    root.querySelectorAll('*').forEach((el) => {
        el.removeAttribute('contenteditable');
        for (const attr of Array.from(el.attributes)) {
            if (attr.value.includes('{{')) el.setAttribute(attr.name, fill(attr.value, sampleData));
        }
        // A destination kept in data-href-token behind an inert href.
        const hrefToken = el.getAttribute('data-href-token')?.trim();
        if (el.tagName === 'A' && hrefToken && hrefToken in sampleData) {
            const href = el.getAttribute('href') ?? '';
            if (href === '' || href === '#') el.setAttribute('href', sampleData[hrefToken]);
        }
    });

    const out = document.createElement('div');
    out.appendChild(root);
    return out.innerHTML;
}

/**
 * Draws each AMP form block as its form, the way AMP email apps (Gmail and
 * others) show it. Preview only: the stored HTML keeps the fallback, which is
 * what the HTML version shows. The drawn form can't be submitted (the
 * preview frame doesn't allow forms), and its submitting / success / error
 * messages are left out, since nothing would hide them. A block whose
 * settings are invalid keeps its fallback; the AMP status line reports why.
 */
function drawAmpForms(root: DocumentFragment): void {
    let index = 0;
    root.querySelectorAll(`.${AMP_FORM_CLASS}`).forEach((block) => {
        index++;
        const read = readAmpFormConfig(block);
        if ('issues' in read) return;
        const form = renderAmpForm(read.config, document, index);
        form.querySelectorAll('[submitting], [submit-success], [submit-error]').forEach(el => el.remove());
        form.removeAttribute('action-xhr');
        // Spacing around it, without replacing the form's own style (max width, font).
        const own = form.getAttribute('style');
        form.setAttribute('style', own ? `margin: 1em 0; ${own}` : 'margin: 1em 0');
        block.replaceWith(form);
    });
}

/**
 * Draws each AMP quiz block as its quiz, the way AMP email apps show it.
 * The preview runs no AMP, so the amp-bind markup is replaced by the
 * `data-pe-*` markers {@link playQuizClick} acts on: picking a choice in the
 * preview behaves as it will in the email. Answers are never sent.
 */
function drawAmpQuizzes(root: DocumentFragment): void {
    let index = 0;
    root.querySelectorAll(`.${AMP_QUIZ_CLASS}`).forEach((block) => {
        index++;
        const read = readAmpQuizConfig(block);
        if ('issues' in read) return;
        block.replaceWith(forPreview(renderAmpQuiz(read.config, document, index, { preview: true })));
    });
}

/** Draws each AMP feedback block as its form; {@link playFeedbackClick} acts out picking a rating. */
function drawAmpFeedback(root: DocumentFragment): void {
    let index = 0;
    root.querySelectorAll(`.${AMP_FEEDBACK_CLASS}`).forEach((block) => {
        index++;
        const read = readAmpFeedbackConfig(block);
        if ('issues' in read) return;
        block.replaceWith(forPreview(renderAmpFeedback(read.config, document, index, { preview: true })));
    });
}

/** Draws each AMP poll as its form; {@link playPollClick} acts out picking and voting. */
function drawAmpPolls(root: DocumentFragment): void {
    let index = 0;
    root.querySelectorAll(`.${AMP_POLL_CLASS}`).forEach((block) => {
        index++;
        const read = readAmpPollConfig(block);
        if ('issues' in read) return;
        block.replaceWith(forPreview(renderAmpPoll(read.config, document, index, { preview: true })));
    });
}

/**
 * Sample percentages for the preview's results: the picked choice leads,
 * the rest share what is left. They add up to 100.
 */
export function samplePollResults(count: number, picked: number): number[] {
    const lead = count === 2 ? 60 : 40;
    const share = Math.floor((100 - lead) / (count - 1));
    const results = Array.from({ length: count }, (_, i) => (i === picked ? lead : share));
    results[picked === 0 ? 1 : 0] += 100 - results.reduce((a, b) => a + b, 0);
    return results;
}

/**
 * Acts out a click on a drawn poll in the preview, as amp-bind does in the
 * email: picking a choice outlines it and enables Vote; Vote shows the
 * results the way they look once the endpoint answers, with sample numbers
 * (nothing is sent), locks the choices and hides the button.
 */
export function playPollClick(target: Element): void {
    const poll = target.closest('[data-pe-poll]');
    if (!poll || poll.hasAttribute('data-pe-voted')) return;
    const choice = target.closest<HTMLElement>('[data-pe-choice]');
    if (choice) {
        poll.querySelectorAll<HTMLElement>('[data-pe-choice]').forEach((el) => { el.style.outline = el === choice ? PICKED_OUTLINE : ''; });
        poll.setAttribute('data-pe-chosen', choice.getAttribute('data-pe-choice') ?? '');
        poll.querySelectorAll<HTMLButtonElement>('[data-pe-vote]').forEach((el) => { el.disabled = false; });
        return;
    }
    if (!target.closest('[data-pe-vote]') || !poll.hasAttribute('data-pe-chosen')) return;
    poll.setAttribute('data-pe-voted', '');
    const count = poll.querySelectorAll('[data-pe-choice]').length;
    const results = samplePollResults(count, Number(poll.getAttribute('data-pe-chosen')));
    poll.querySelectorAll('[data-pe-percent]').forEach((el) => { el.textContent = `${results[Number(el.getAttribute('data-pe-percent'))]}%`; });
    poll.querySelectorAll<HTMLElement>('[data-pe-bar]').forEach((bar) => {
        const value = results[Number(bar.getAttribute('data-pe-bar'))];
        bar.hidden = false;
        bar.querySelectorAll<HTMLElement>('[data-pe-segment]').forEach((seg) => { seg.hidden = value < Number(seg.getAttribute('data-pe-segment')); });
    });
    poll.querySelectorAll<HTMLElement>('[data-pe-vote-wrap]').forEach((el) => { el.hidden = true; });
    const note = poll.ownerDocument.createElement('p');
    note.setAttribute('style', 'margin: 8px 0 0; font-size: 12px; color: #64748b');
    note.textContent = 'Preview: sample results. In the email, they come from your endpoint.';
    poll.appendChild(note);
}

/**
 * Generated AMP markup made inert for the preview: nothing to send, no
 * submit states (nothing would hide them), amp-selector as a plain div
 * (keeping its layout) and no amp-bind attributes. The `data-pe-*` markers
 * stay for the preview to act on.
 */
function forPreview(generated: HTMLElement): HTMLElement {
    generated.querySelectorAll('[submitting], [submit-success], [submit-error], input[type="hidden"]').forEach(el => el.remove());
    generated.removeAttribute('action-xhr');
    generated.querySelectorAll('amp-selector').forEach((selector) => {
        const div = document.createElement('div');
        const style = selector.getAttribute('style');
        if (style) div.setAttribute('style', style);
        div.append(...Array.from(selector.childNodes));
        selector.replaceWith(div);
    });
    for (const el of [generated, ...Array.from(generated.querySelectorAll('*'))]) {
        for (const attr of Array.from(el.attributes)) {
            if (attr.name.startsWith('data-amp-bind-') || attr.name === 'on') el.removeAttribute(attr.name);
        }
    }
    const own = generated.getAttribute('style');
    generated.setAttribute('style', own ? `margin: 1em 0; ${own}` : 'margin: 1em 0');
    return generated;
}

/**
 * Acts out a click on a drawn feedback block in the preview, as amp-bind
 * does in the email: a rating can be changed until sent; stars fill up to
 * the one picked, other scales outline it; the send button is enabled once
 * every required question is rated.
 */
export function playFeedbackClick(target: Element): void {
    const option = target.closest('[data-pe-rating]');
    const question = option?.closest('[data-pe-scale]');
    const block = question?.closest('[data-pe-feedback]');
    if (!option || !question || !block) return;
    const value = option.getAttribute('data-pe-rating') ?? '';
    const stars = question.getAttribute('data-pe-scale') === 'stars';
    question.querySelectorAll<HTMLElement>('[data-pe-rating]').forEach((el) => {
        if (stars) el.textContent = Number(el.getAttribute('data-pe-rating')) <= Number(value) ? '★' : '☆';
        else el.style.outline = el === option ? PICKED_OUTLINE : '';
    });
    question.setAttribute('data-pe-chosen', value);
    const ready = Array.from(block.querySelectorAll('[data-pe-scale]'))
        .every(q => q.getAttribute('data-pe-required') !== 'true' || q.hasAttribute('data-pe-chosen'));
    block.querySelectorAll<HTMLButtonElement>('[data-pe-enable="rated"]').forEach((el) => { el.disabled = !ready; });
}

/** How AMP outlines a picked choice. */
const PICKED_OUTLINE = '1px solid rgba(0, 0, 0, 0.7)';

/**
 * Acts out a click on a drawn quiz in the preview, as amp-bind does in the
 * email: the first pick locks the question and shows its marks and feedback;
 * once every question is answered, the score shows and submit is enabled.
 */
export function playQuizClick(target: Element): void {
    const option = target.closest('[data-pe-option]');
    const question = option?.closest('[data-pe-question]');
    const quiz = question?.closest('[data-pe-quiz]');
    if (!option || !question || !quiz || question.hasAttribute('data-pe-chosen')) return;
    question.setAttribute('data-pe-chosen', option.getAttribute('data-pe-option') ?? '');
    (option as HTMLElement).style.outline = PICKED_OUTLINE;

    let score = 0;
    let done = true;
    quiz.querySelectorAll('[data-pe-question]').forEach((q) => {
        const chosen = q.getAttribute('data-pe-chosen');
        const answer = q.getAttribute('data-pe-question');
        if (chosen === null) done = false;
        else if (chosen === answer) score++;
        q.querySelectorAll<HTMLElement>('[data-pe-when]').forEach((el) => {
            const when = el.getAttribute('data-pe-when');
            const show = chosen !== null && (
                when === 'answered' ||
                (when === 'correct' && chosen === answer) ||
                (when === 'wrong' && chosen !== answer) ||
                (when === 'chosen' && el.closest('[data-pe-option]')?.getAttribute('data-pe-option') === chosen));
            el.hidden = !show;
        });
    });
    quiz.querySelectorAll<HTMLElement>('[data-pe-when="complete"]').forEach((el) => { el.hidden = !done; });
    quiz.querySelectorAll('[data-pe-score]').forEach((el) => { el.textContent = String(score); });
    quiz.querySelectorAll<HTMLButtonElement>('[data-pe-enable="complete"]').forEach((el) => { el.disabled = !done; });
}

function frameDocument(extraStyles: string): string {
    // Host-supplied CSS must not be able to close the <style> element.
    const extra = extraStyles.replace(/<\/style/gi, '<\\/style');
    return '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        // Links try to open a new window, which the sandbox blocks, so a click
        // never navigates the preview away from the email.
        '<base target="_blank">' +
        `<style>${BASE_STYLES}</style>` +
        (extra ? `<style>${extra}</style>` : '') +
        '</head><body></body></html>';
}

function plural(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`;
}

export function createSidePreviewPlugin(options: SidePreviewPluginOptions = {}): Plugin {
    const sampleData = { ...DEFAULT_SAMPLE_DATA, ...options.sampleData };
    const ampConverter = options.ampConverter;

    return {
        name: 'side-preview',
        init(editor: Editor) {
            let open = options.open ?? true;
            let device: SidePreviewDevice = options.device ?? 'desktop';
            // Without a converter there is only the HTML version.
            let mode: SidePreviewMode = ampConverter ? options.mode ?? 'amp' : 'html';
            let destroyed = false;
            let frameReady = false;
            let lastHtml: string | null = null;
            let lastAmpSource: string | null = null;
            let ampOutput = '';
            let timer: ReturnType<typeof setTimeout> | null = null;

            // ── Layout: [ editorArea | preview ] in place of editorArea ──
            const split = document.createElement('div');
            split.className = 'play-editor-split';
            const main = document.createElement('div');
            main.className = 'play-editor-split-main';
            editor.editorArea.before(split);
            main.appendChild(editor.editorArea);
            split.appendChild(main);

            const pane = document.createElement('aside');
            pane.className = 'play-editor-side-preview';
            pane.setAttribute('aria-label', 'Preview');

            const header = document.createElement('div');
            header.className = 'play-editor-side-preview-header';
            const title = document.createElement('span');
            title.className = 'play-editor-side-preview-title';
            title.textContent = 'Preview';
            const hint = document.createElement('span');
            hint.className = 'play-editor-side-preview-hint';
            hint.textContent = 'Variables show sample data';
            title.appendChild(hint);
            header.appendChild(title);

            // AMP email / HTML email switch, only when the AMP version exists.
            const modeButtons = new Map<SidePreviewMode, HTMLButtonElement>();
            if (ampConverter) {
                const modes = document.createElement('div');
                modes.className = 'play-editor-side-preview-modes';
                modes.setAttribute('role', 'group');
                modes.setAttribute('aria-label', 'Email version');
                const choices: [SidePreviewMode, string, string][] = [
                    ['amp', 'AMP email', 'As AMP email apps show it (Gmail and others)'],
                    ['html', 'HTML email', 'As email apps without AMP show it'],
                ];
                for (const [value, label, tip] of choices) {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'play-editor-side-preview-mode';
                    b.textContent = label;
                    b.title = tip;
                    b.addEventListener('click', (e) => {
                        e.preventDefault();
                        setMode(value);
                    });
                    modeButtons.set(value, b);
                    modes.appendChild(b);
                }
                header.appendChild(modes);
            }

            const headerButton = (icon: string, label: string, onClick: () => void) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'play-editor-side-preview-btn';
                b.title = label;
                b.setAttribute('aria-label', label);
                // icon is a trusted SVG string from icons.ts
                b.innerHTML = icon;
                b.addEventListener('click', (e) => {
                    e.preventDefault();
                    onClick();
                });
                return b;
            };

            const controls = document.createElement('div');
            controls.className = 'play-editor-side-preview-controls';
            controls.setAttribute('role', 'group');
            controls.setAttribute('aria-label', 'Preview width');
            const desktopBtn = headerButton(icons.monitor, 'Desktop width', () => setDevice('desktop'));
            const mobileBtn = headerButton(icons.smartphone, `Mobile width (${MOBILE_WIDTH}px)`, () => setDevice('mobile'));
            const closeBtn = headerButton(icons.x, 'Close preview', () => setOpen(false));
            controls.append(desktopBtn, mobileBtn);
            header.append(controls, closeBtn);
            pane.appendChild(header);

            // ── AMP status (AMP view): the same content, checked as AMP. ──
            const ampBar = document.createElement('div');
            ampBar.className = 'play-editor-side-preview-amp-bar';
            const ampIssues = document.createElement('details');
            ampIssues.className = 'play-editor-side-preview-amp-issues';
            const ampSummary = document.createElement('summary');
            ampSummary.className = 'play-editor-side-preview-amp-summary';
            const ampList = document.createElement('ul');
            ampList.className = 'play-editor-side-preview-amp-list';
            ampIssues.append(ampSummary, ampList);
            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'play-editor-side-preview-amp-copy';
            copyBtn.textContent = 'Copy AMP';
            copyBtn.title = 'Copy the AMP version of this email';
            copyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (!ampOutput) return;
                const done = (label: string) => {
                    copyBtn.textContent = label;
                    setTimeout(() => { if (!destroyed) copyBtn.textContent = 'Copy AMP'; }, 1500);
                };
                navigator.clipboard?.writeText(ampOutput).then(() => done('Copied'), () => done('Copy failed'))
                    ?? done('Copy failed');
            });
            ampBar.append(ampIssues, copyBtn);
            if (ampConverter) {
                pane.classList.add('play-editor-side-preview-has-amp');
                pane.appendChild(ampBar);
            }

            const stage = document.createElement('div');
            stage.className = 'play-editor-side-preview-stage';
            const frame = document.createElement('iframe');
            frame.className = 'play-editor-side-preview-frame';
            frame.title = 'Email preview';
            // No allow-scripts: nothing in the email can run. allow-same-origin
            // only lets the editor write into the frame without reloading it,
            // which keeps the preview's scroll position while you type.
            frame.setAttribute('sandbox', 'allow-same-origin');
            frame.setAttribute('referrerpolicy', 'no-referrer');
            frame.addEventListener('load', () => {
                frameReady = true;
                lastHtml = null;
                // The editor plays drawn quizzes and feedback; the frame itself runs no script.
                frame.contentDocument?.addEventListener('click', (e) => {
                    const target = e.target as Node | null;
                    const el = target && (target.nodeType === Node.ELEMENT_NODE ? target as Element : target.parentElement);
                    if (!el) return;
                    playQuizClick(el);
                    playFeedbackClick(el);
                    playPollClick(el);
                });
                render();
            });
            frame.srcdoc = frameDocument(options.styles ?? '');
            stage.appendChild(frame);
            pane.appendChild(stage);
            split.appendChild(pane);

            function renderPreview(source: string) {
                if (!frameReady) return;
                const body = frame.contentDocument?.body;
                if (!body) return;
                const html = buildPreviewHtml(source, sampleData, { version: mode });
                if (html === lastHtml) return;
                lastHtml = html;
                body.innerHTML = html;
            }

            function renderIssues(result: AmpEmailResult) {
                const errors = result.issues.filter(i => i.severity === 'error');
                const warnings = result.issues.filter(i => i.severity === 'warning');
                ampBar.classList.toggle('play-editor-side-preview-amp-invalid', errors.length > 0);
                ampSummary.textContent = errors.length
                    ? `AMP: ${plural(errors.length, 'problem', 'problems')} to fix`
                    : `AMP: ready${warnings.length ? ` · ${plural(warnings.length, 'automatic change', 'automatic changes')}` : ''}`;
                ampList.replaceChildren();
                for (const issue of [...errors, ...warnings]) {
                    const li = document.createElement('li');
                    li.className = `play-editor-side-preview-amp-issue play-editor-side-preview-amp-${issue.severity}`;
                    const label = document.createElement('strong');
                    label.textContent = issue.severity === 'error' ? 'Fix' : 'Changed';
                    const message = document.createElement('span');
                    message.textContent = ` ${issue.message}`;
                    li.append(label, message);
                    if (issue.snippet) {
                        // Content markup: shown as text, never parsed.
                        const code = document.createElement('code');
                        code.textContent = issue.snippet;
                        li.appendChild(code);
                    }
                    ampList.appendChild(li);
                }
                ampIssues.classList.toggle('play-editor-side-preview-amp-empty', result.issues.length === 0);
            }

            function renderAmpStatus(source: string) {
                if (!ampConverter || source === lastAmpSource) return;
                lastAmpSource = source;
                try {
                    // Checked and copied as written: variables stay for the sender.
                    const result = ampConverter(source);
                    ampOutput = result.html;
                    renderIssues(result);
                } catch (err) {
                    ampOutput = '';
                    ampBar.classList.add('play-editor-side-preview-amp-invalid');
                    ampSummary.textContent = `AMP: conversion failed (${err instanceof Error ? err.message : String(err)})`;
                    ampList.replaceChildren();
                }
            }

            function render() {
                if (destroyed || !open) return;
                // One source for both: what the editor (or its source view) holds.
                const source = editor.getContent();
                renderPreview(source);
                renderAmpStatus(source);
            }

            function schedule() {
                if (destroyed || !open || timer !== null) return;
                timer = setTimeout(() => {
                    timer = null;
                    render();
                }, UPDATE_DELAY_MS);
            }

            function setMode(next: SidePreviewMode) {
                mode = ampConverter ? next : 'html';
                pane.classList.toggle('play-editor-side-preview-html-mode', mode === 'html');
                modeButtons.forEach((b, value) => b.setAttribute('aria-pressed', String(value === mode)));
                frame.title = mode === 'amp' ? 'AMP email preview' : 'HTML email preview';
                render();
            }

            function setDevice(next: SidePreviewDevice) {
                device = next;
                stage.classList.toggle('play-editor-side-preview-mobile', device === 'mobile');
                desktopBtn.setAttribute('aria-pressed', String(device === 'desktop'));
                mobileBtn.setAttribute('aria-pressed', String(device === 'mobile'));
            }

            function setOpen(next: boolean): boolean {
                open = next;
                editor.container.classList.toggle('play-editor-side-preview-open', open);
                toggleBtn.classList.toggle('play-editor-btn-active', open);
                toggleBtn.setAttribute('aria-pressed', String(open));
                if (open) render();
                return open;
            }

            const toggleBtn = editor.addToolbarButton(icons.panelRight, 'Side Preview', () => setOpen(!open));

            // Plugins that change content without an input event (resize, spacing,
            // table rows, ...) are caught by watching the DOM itself. Typing in the
            // source view arrives through onInput.
            const observer = new MutationObserver(schedule);
            observer.observe(editor.editorArea, { childList: true, subtree: true, characterData: true, attributes: true });
            const unsubscribeInput = editor.onInput(schedule);
            const unregisterToggle = editor.registerCommand(SIDE_PREVIEW_TOGGLE_COMMAND, () => setOpen(!open));

            setDevice(device);
            setMode(mode);
            setOpen(open);

            editor.onDestroy(() => {
                destroyed = true;
                if (timer !== null) clearTimeout(timer);
                observer.disconnect();
                unsubscribeInput();
                unregisterToggle();
            });
        }
    };
}

/** Side-by-side preview with the default sample data, open on start. */
export const SidePreviewPlugin = createSidePreviewPlugin();
