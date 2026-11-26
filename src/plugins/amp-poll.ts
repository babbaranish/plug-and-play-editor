import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import type { ModalFormEntry } from '../core/modal';
import type { AmpFormStyle } from '../amp/forms/types';
import type { AmpPollConfig, AmpPollConfigIssue } from '../amp/poll/types';
import { icons } from '../core/icons';
import { openFormModal } from '../core/modal';
import { compactAmpFormStyle, normalizeAmpFormStyle, validateAmpFormStyle } from '../amp/forms/formStyle';
import { endpointIssue } from '../amp/forms/formValidator';
import { endpointLabel } from '../amp/forms/formRenderer';
import {
    AMP_POLL_CLASS,
    AMP_POLL_SUMMARY_ATTR,
    AmpPollConfigError,
    formatAmpPollChoices,
    parseAmpPollChoices,
    parseAmpPollConfig,
    readAmpPollConfig,
    readStoredAmpPollConfig
} from '../amp/poll/pollConfig';
import { validateAmpPollConfig } from '../amp/poll/pollValidator';
import { pollSummaryOf, renderAmpPollBlock } from '../amp/poll/pollRenderer';
import {
    caretBlock,
    designRows,
    inAlternateView,
    optional,
    placeBlock,
    readableStyleIssue,
    startingStyle,
    styleFromValues,
    withDefaultStyle
} from './amp-shared';

/** Inserts a poll block. Takes an {@link AmpPollConfig}; returns the block, or null. */
export const AMP_POLL_INSERT_COMMAND = 'amp-poll:insert';
/** Changes a poll block. Takes the block and a partial config; returns the new block, or null. */
export const AMP_POLL_UPDATE_COMMAND = 'amp-poll:update';

/** In the poll dialog, the form design settings say what they style here. */
const POLL_DESIGN_LABELS = {
    buttonColor: 'Vote button & bars',
    buttonTextColor: 'Vote button text',
    buttonRadius: 'Vote button corners (px)',
    buttonAlign: 'Vote button position',
    buttonFullWidth: 'Full-width vote button',
    fieldBorderColor: 'Choice border',
    fieldBackground: 'Choice background',
    fieldRadius: 'Choice corners (px)',
    labelColor: 'Question color',
    labelBold: 'Bold question',
    successColor: 'Thank-you color',
    fieldSpacing: 'Spacing (px)',
} as const;

function insertPoll(editor: Editor, config: unknown, after: Element | null, defaultStyle?: AmpFormStyle): HTMLElement | null {
    // Throws AmpPollConfigError listing every problem.
    parseAmpPollConfig(config);
    if (inAlternateView(editor)) return null;
    const block = renderAmpPollBlock(withDefaultStyle(config as AmpPollConfig, defaultStyle), document);
    placeBlock(editor, block, after);
    editor.notifyContentChange();
    return block;
}

/**
 * Applies `patch` over the settings stored on `block`. Settings the patch
 * doesn't name (the endpoint included) are kept; a key set to `undefined` is
 * removed. The block is replaced, so its summary and fallback follow.
 */
function updatePoll(editor: Editor, block: Element, patch: Partial<AmpPollConfig>): HTMLElement | null {
    if (!block.classList.contains(AMP_POLL_CLASS) || !editor.editorArea.contains(block)) return null;
    // Through JSON, so keys set to undefined are dropped.
    const next = JSON.parse(JSON.stringify({ ...readStoredAmpPollConfig(block), ...patch })) as unknown;
    // Throws AmpPollConfigError listing every problem; the block is left as it was.
    parseAmpPollConfig(next);
    if (inAlternateView(editor)) return null;
    const replacement = renderAmpPollBlock(next as AmpPollConfig, document);
    block.replaceWith(replacement);
    editor.notifyContentChange();
    return replacement;
}

/** Dialog wording for an issue: "options[1]: …" → "Choice 2: …", and design settings by their label. */
function readableIssue(issue: AmpPollConfigIssue): string {
    const m = /^options\[(\d+)\]/.exec(issue.path);
    if (m) return `Choice ${Number(m[1]) + 1}: ${issue.message}`;
    return readableStyleIssue(issue, POLL_DESIGN_LABELS) ?? issue.message;
}

/**
 * The Insert / Edit AMP poll dialog: the endpoint (required, checked as you
 * type), the question and choices, whether to show results, messages, the
 * HTML version (fallback text or a web poll to link each choice to), and the
 * design.
 */
function openPollDialog(editor: Editor, block: Element | null, insertAfter: Element | null, defaultStyle?: AmpFormStyle): void {
    const stored = block ? readStoredAmpPollConfig(block) : {};
    const text = (key: string) => (typeof stored[key] === 'string' ? stored[key] as string : '');
    const style = block ? startingStyle(stored.style) : normalizeAmpFormStyle(defaultStyle);
    const options = Array.isArray(stored.options) && stored.options.length ? stored.options as string[] : ['Yes', 'No'];

    const rows: ModalFormEntry[] = [
        {
            name: 'action',
            label: 'Endpoint URL (receives the votes)',
            type: 'url',
            value: text('action'),
            placeholder: 'https://example.com/api/poll',
            hint: (value) => {
                if (!value.trim()) return null;
                const problem = endpointIssue(value);
                return problem ? { text: problem, tone: 'error' } : { text: `Posts "choice" to ${endpointLabel(value.trim())}`, tone: 'ok' };
            },
        },
        { name: 'question', label: 'Question', value: text('question') || (block ? '' : 'Which topic should we cover next?'), placeholder: 'Which day suits you?' },
        {
            name: 'options',
            label: 'Choices (2–6, separate with |)',
            value: formatAmpPollChoices(options),
            placeholder: 'Monday | Wednesday | Friday',
            hint: (value) => {
                const issue = validateAmpPollConfig({ action: 'https://example.com/', question: 'Q', options: parseAmpPollChoices(value) })
                    .find(i => i.path.startsWith('options'));
                return issue ? { text: readableIssue(issue), tone: 'error' } : null;
            },
        },
        {
            name: 'showResults',
            label: 'Show results after voting (your endpoint answers {"results": [62, 38]})',
            type: 'checkbox',
            value: stored.showResults === false ? '' : 'true',
        },
        [
            { name: 'submitText', label: 'Button text', value: text('submitText'), placeholder: 'Vote' },
            { name: 'successMessage', label: 'After voting', value: text('successMessage'), placeholder: 'Thanks for voting!' },
            { name: 'errorMessage', label: 'If sending fails', value: text('errorMessage'), placeholder: 'Something went wrong. Please try again.' },
        ],
        { name: 'fallbackUrl', label: 'Web poll (optional): each choice links here with ?choice=… where AMP is not supported', type: 'url', value: text('fallbackUrl'), placeholder: 'https://example.com/poll' },
        { name: 'fallbackText', label: 'Shown where AMP is not supported', type: 'textarea', value: text('fallbackText'), placeholder: 'This email has a poll you can answer in an email app that supports interactive email, such as Gmail.' },
        ...designRows(style, POLL_DESIGN_LABELS),
    ];

    openFormModal(editor, {
        title: block ? 'Edit AMP poll' : 'Insert AMP poll',
        fields: rows,
        wide: true,
        submitLabel: block ? 'Save' : 'Insert',
        onSubmit: (values, { showError, close }) => {
            const patch: { -readonly [K in keyof AmpPollConfig]?: AmpPollConfig[K] } = {
                action: values.action.trim(),
                question: values.question.trim(),
                options: parseAmpPollChoices(values.options),
                // On by default, so only "off" is stored.
                showResults: values.showResults === 'true' ? undefined : false,
                submitText: optional(values.submitText),
                successMessage: optional(values.successMessage),
                errorMessage: optional(values.errorMessage),
                fallbackText: optional(values.fallbackText),
                fallbackUrl: optional(values.fallbackUrl),
            };
            const enteredStyle = styleFromValues(values);
            const next = block ? { ...stored, ...patch } : patch;
            const issues = [
                ...validateAmpFormStyle(enteredStyle),
                ...validateAmpPollConfig(JSON.parse(JSON.stringify({ ...next, style: undefined }))),
            ];
            if (issues.length) {
                showError(issues.map(readableIssue).join(' '));
                return;
            }
            // Only what differs from the default look is stored.
            patch.style = compactAmpFormStyle(enteredStyle as AmpFormStyle);
            if (block) updatePoll(editor, block, patch);
            else insertPoll(editor, JSON.parse(JSON.stringify(patch)), insertAfter);
            close();
        },
    });
}

export interface AmpPollPluginOptions {
    /**
     * The design new polls start with, e.g. your brand colours. The same
     * settings as forms. Each poll stores its design, so changing this later
     * doesn't restyle existing polls.
     */
    defaultStyle?: AmpFormStyle;
}

/**
 * Lets an editor hold AMP email polls: a question, 2–6 choices and a vote
 * button posting to the poll's own endpoint, which can answer with results
 * to show. The HTML version of the email shows the fallback text, or links
 * each choice to a web poll. `toAmpEmail` turns the block into a working AMP
 * form. Click a poll to edit it; the toolbar button adds one.
 *
 * Throws an `AmpPollConfigError` when `defaultStyle` is invalid.
 */
export function createAmpPollPlugin(options: AmpPollPluginOptions = {}): Plugin {
    if (options.defaultStyle !== undefined) {
        const issues = validateAmpFormStyle(options.defaultStyle, 'defaultStyle');
        if (issues.length) throw new AmpPollConfigError(issues);
    }
    const defaultStyle = options.defaultStyle ? compactAmpFormStyle(options.defaultStyle) : undefined;
    return {
        name: 'amp-poll',
        init(editor: Editor) {
            initAmpPolls(editor, defaultStyle);
        }
    };
}

/** Polls with the default design. */
export const AmpPollPlugin: Plugin = createAmpPollPlugin();

function initAmpPolls(editor: Editor, defaultStyle: AmpFormStyle | undefined): void {
    editor.addToolbarButton(icons.poll, 'Insert AMP Poll', () => {
        if (inAlternateView(editor)) return;
        openPollDialog(editor, null, caretBlock(editor), defaultStyle);
    });

    const onClick = (e: MouseEvent) => {
        const block = (e.target as Element | null)?.closest?.(`.${AMP_POLL_CLASS}`);
        if (!block || !editor.editorArea.contains(block)) return;
        // The HTML version's choice links mustn't open from the editor.
        e.preventDefault();
        if (inAlternateView(editor) || editor.editorArea.contentEditable === 'false') return;
        openPollDialog(editor, block, null);
    };
    editor.editorArea.addEventListener('click', onClick);

    const unregisterInsert = editor.registerCommand(AMP_POLL_INSERT_COMMAND, (config: unknown) => insertPoll(editor, config, caretBlock(editor), defaultStyle));
    const unregisterUpdate = editor.registerCommand(AMP_POLL_UPDATE_COMMAND, (block: Element, patch: Partial<AmpPollConfig>) => updatePoll(editor, block, patch));
    // A block edited by hand (source view, paste) keeps its summary current.
    const refreshSummaries = () => {
        if (inAlternateView(editor)) return;
        let changed = false;
        editor.editorArea.querySelectorAll(`.${AMP_POLL_CLASS}`).forEach((block) => {
            const read = readAmpPollConfig(block);
            if ('issues' in read) return;
            const summary = pollSummaryOf(read.config);
            if (block.getAttribute(AMP_POLL_SUMMARY_ATTR) !== summary) {
                block.setAttribute(AMP_POLL_SUMMARY_ATTR, summary);
                changed = true;
            }
        });
        if (changed) editor.notifyContentChange();
    };
    const unsubscribeInput = editor.onInput(refreshSummaries);
    refreshSummaries();

    editor.onDestroy(() => {
        editor.editorArea.removeEventListener('click', onClick);
        unregisterInsert();
        unregisterUpdate();
        unsubscribeInput();
    });
}

/**
 * Adds an AMP poll to `editor` from a config. The editor needs
 * `AmpPollPlugin`. Returns the inserted block, or `null` when the editor has
 * no `AmpPollPlugin` or its source view or preview is open. Throws an
 * `AmpPollConfigError` listing every problem when the config is invalid.
 */
export function addAmpPoll(editor: Editor, config: AmpPollConfig): HTMLElement | null {
    if (!editor.hasCommand(AMP_POLL_INSERT_COMMAND)) return null;
    return editor.runCommand<HTMLElement | null>(AMP_POLL_INSERT_COMMAND, config) ?? null;
}

/**
 * Changes a poll already in `editor`: `patch` is applied over its stored
 * settings, so anything not named (its endpoint included) is kept. Returns
 * the replacement block, or `null` when the editor has no `AmpPollPlugin`,
 * the block isn't one of its polls, or its source view or preview is open.
 * Throws an `AmpPollConfigError` when the result would be invalid, leaving
 * the poll unchanged.
 */
export function updateAmpPoll(editor: Editor, block: Element, patch: Partial<AmpPollConfig>): HTMLElement | null {
    if (!editor.hasCommand(AMP_POLL_UPDATE_COMMAND)) return null;
    return editor.runCommand<HTMLElement | null>(AMP_POLL_UPDATE_COMMAND, block, patch) ?? null;
}
