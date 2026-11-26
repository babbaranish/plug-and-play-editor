import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import type { ModalFormEntry, ModalListField, ModalListItem } from '../core/modal';
import type { AmpFormStyle } from '../amp/forms/types';
import type { AmpFeedbackConfig, AmpFeedbackConfigIssue, AmpFeedbackQuestion, AmpFeedbackScale } from '../amp/feedback/types';
import { icons } from '../core/icons';
import { openFormModal } from '../core/modal';
import { compactAmpFormStyle, normalizeAmpFormStyle, validateAmpFormStyle } from '../amp/forms/formStyle';
import { endpointIssue } from '../amp/forms/formValidator';
import { endpointLabel } from '../amp/forms/formRenderer';
import {
    AMP_FEEDBACK_CLASS,
    AMP_FEEDBACK_SUMMARY_ATTR,
    AmpFeedbackConfigError,
    parseAmpFeedbackConfig,
    readAmpFeedbackConfig,
    readStoredAmpFeedbackConfig
} from '../amp/feedback/feedbackConfig';
import { FEEDBACK_SCALES, MAX_FEEDBACK_QUESTIONS, validateAmpFeedbackConfig } from '../amp/feedback/feedbackValidator';
import { FEEDBACK_SCALE_LABELS, feedbackSummaryOf, renderAmpFeedbackBlock } from '../amp/feedback/feedbackRenderer';
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

/** Inserts a feedback block. Takes an {@link AmpFeedbackConfig}; returns the block, or null. */
export const AMP_FEEDBACK_INSERT_COMMAND = 'amp-feedback:insert';
/** Changes a feedback block. Takes the block and a partial config; returns the new block, or null. */
export const AMP_FEEDBACK_UPDATE_COMMAND = 'amp-feedback:update';

/** In the feedback dialog, the form design settings say what they style here. */
const FEEDBACK_DESIGN_LABELS = {
    buttonColor: 'Send button color',
    buttonTextColor: 'Send button text',
    buttonRadius: 'Send button corners (px)',
    buttonAlign: 'Send button position',
    buttonFullWidth: 'Full-width send button',
    fieldBorderColor: 'Border (boxes, comment)',
    fieldBackground: 'Background (boxes, comment)',
    fieldRadius: 'Corners (px)',
    labelColor: 'Question color',
    labelBold: 'Bold question',
    successColor: 'Thank-you color',
    fieldSpacing: 'Spacing (px)',
} as const;

const SCALE_CHOICES = FEEDBACK_SCALES.map(value => ({ value, label: FEEDBACK_SCALE_LABELS[value] }));

function insertFeedback(editor: Editor, config: unknown, after: Element | null, defaultStyle?: AmpFormStyle): HTMLElement | null {
    // Throws AmpFeedbackConfigError listing every problem.
    parseAmpFeedbackConfig(config);
    if (inAlternateView(editor)) return null;
    const block = renderAmpFeedbackBlock(withDefaultStyle(config as AmpFeedbackConfig, defaultStyle), document);
    placeBlock(editor, block, after);
    editor.notifyContentChange();
    return block;
}

/**
 * Applies `patch` over the settings stored on `block`. Settings the patch
 * doesn't name (the endpoint included) are kept; a key set to `undefined` is
 * removed. The block is replaced, so its summary and fallback follow.
 */
function updateFeedback(editor: Editor, block: Element, patch: Partial<AmpFeedbackConfig>): HTMLElement | null {
    if (!block.classList.contains(AMP_FEEDBACK_CLASS) || !editor.editorArea.contains(block)) return null;
    // Through JSON, so keys set to undefined are dropped.
    const next = JSON.parse(JSON.stringify({ ...readStoredAmpFeedbackConfig(block), ...patch })) as unknown;
    // Throws AmpFeedbackConfigError listing every problem; the block is left as it was.
    parseAmpFeedbackConfig(next);
    if (inAlternateView(editor)) return null;
    const replacement = renderAmpFeedbackBlock(next as AmpFeedbackConfig, document);
    block.replaceWith(replacement);
    editor.notifyContentChange();
    return replacement;
}

/** Dialog wording for an issue: "questions[1].name: …" → "Question 2: …", and design settings by their label. */
function readableIssue(issue: AmpFeedbackConfigIssue): string {
    const m = /^questions\[(\d+)\]/.exec(issue.path);
    if (m) return `Question ${Number(m[1]) + 1}: ${issue.message}`;
    return readableStyleIssue(issue, FEEDBACK_DESIGN_LABELS) ?? issue.message;
}

// ── Rating questions section of the dialog ────────────────────────

/** The question a block made from the toolbar starts with. */
const STARTER_QUESTIONS: AmpFeedbackQuestion[] = [{ question: 'How was your experience?' }];

function itemFromQuestion(q: Partial<AmpFeedbackQuestion>): ModalListItem {
    return {
        question: q.question ?? '',
        scale: FEEDBACK_SCALES.includes(q.scale as AmpFeedbackScale) ? q.scale as string : 'stars',
        lowLabel: q.lowLabel ?? '',
        highLabel: q.highLabel ?? '',
        name: q.name ?? '',
        required: q.required === false ? '' : 'true',
    };
}

/** Only what differs from the defaults: stars, position-based name, required. */
function questionFromItem(item: ModalListItem): AmpFeedbackQuestion {
    const q: { -readonly [K in keyof AmpFeedbackQuestion]?: AmpFeedbackQuestion[K] } = { question: item.question.trim() };
    if (item.scale !== 'stars') q.scale = item.scale as AmpFeedbackScale;
    if (item.scale !== 'thumbs') {
        if (item.lowLabel.trim()) q.lowLabel = item.lowLabel.trim();
        if (item.highLabel.trim()) q.highLabel = item.highLabel.trim();
    }
    if (item.name.trim()) q.name = item.name.trim();
    if (item.required !== 'true') q.required = false;
    return q as AmpFeedbackQuestion;
}

function questionsList(questions: readonly Partial<AmpFeedbackQuestion>[]): ModalListField {
    return {
        kind: 'list',
        name: 'questions',
        label: 'Rating questions (sent together with one button)',
        itemLabel: 'question',
        addLabel: 'Add rating question',
        minItems: 1,
        maxItems: MAX_FEEDBACK_QUESTIONS,
        items: questions.map(itemFromQuestion),
        newItem: () => itemFromQuestion({}),
        itemFields: [
            { name: 'question', label: 'Question', placeholder: 'How was the delivery?' },
            { name: 'scale', label: 'Rating', type: 'select', options: SCALE_CHOICES },
            { name: 'lowLabel', label: 'Low end label', placeholder: 'Optional' },
            { name: 'highLabel', label: 'High end label', placeholder: 'Optional' },
            { name: 'name', label: 'Field name', placeholder: 'rating1, rating2… by position' },
            { name: 'required', label: 'Required', type: 'checkbox' },
        ],
        // Thumbs have no ends to label.
        isFieldVisible: (item, field) => item.scale !== 'thumbs' || (field !== 'lowLabel' && field !== 'highLabel'),
        itemHint: (_item, index, items) => {
            const issue = validateAmpFeedbackConfig({ action: 'https://example.com/', questions: items.map(questionFromItem) })
                .find(i => i.path.startsWith(`questions[${index}]`));
            return issue ? { text: issue.message, tone: 'error' } : null;
        },
    };
}

/**
 * The Insert / Edit AMP feedback dialog: the endpoint (required, checked as
 * you type), the rating questions (add, remove, reorder, each with its own
 * rating style), the comment box, messages, the HTML-version fallback, and
 * the design.
 */
function openFeedbackDialog(editor: Editor, block: Element | null, insertAfter: Element | null, defaultStyle?: AmpFormStyle): void {
    const stored = block ? readStoredAmpFeedbackConfig(block) : {};
    const text = (key: string) => (typeof stored[key] === 'string' ? stored[key] as string : '');
    const style = block ? startingStyle(stored.style) : normalizeAmpFormStyle(defaultStyle);
    const questions = Array.isArray(stored.questions) && stored.questions.length
        ? stored.questions as Partial<AmpFeedbackQuestion>[]
        : STARTER_QUESTIONS;

    const rows: ModalFormEntry[] = [
        {
            name: 'action',
            label: 'Endpoint URL (receives the feedback)',
            type: 'url',
            value: text('action'),
            placeholder: 'https://example.com/api/feedback',
            hint: (value) => {
                if (!value.trim()) return null;
                const problem = endpointIssue(value);
                return problem ? { text: problem, tone: 'error' } : { text: `Posts the ratings and comment to ${endpointLabel(value.trim())}`, tone: 'ok' };
            },
        },
        questionsList(questions),
        [
            { name: 'comment', label: 'Ask for a comment', type: 'checkbox', value: stored.comment === false ? '' : 'true' },
            { name: 'commentRequired', label: 'Comment required', type: 'checkbox', value: stored.commentRequired === true ? 'true' : '' },
        ],
        [
            { name: 'commentLabel', label: 'Comment label', value: text('commentLabel'), placeholder: 'Anything else you would like to tell us?' },
            { name: 'commentPlaceholder', label: 'Comment placeholder', value: text('commentPlaceholder'), placeholder: 'Optional' },
        ],
        [
            { name: 'submitText', label: 'Button text', value: text('submitText'), placeholder: 'Send feedback' },
            { name: 'successMessage', label: 'After sending', value: text('successMessage'), placeholder: 'Thanks for your feedback!' },
            { name: 'errorMessage', label: 'If sending fails', value: text('errorMessage'), placeholder: 'Something went wrong. Please try again.' },
        ],
        { name: 'fallbackText', label: 'Shown where AMP is not supported', type: 'textarea', value: text('fallbackText'), placeholder: 'This email lets you rate us right here in an email app that supports interactive email, such as Gmail.' },
        [
            { name: 'fallbackUrl', label: 'Web feedback page (optional)', type: 'url', value: text('fallbackUrl'), placeholder: 'https://example.com/feedback' },
            { name: 'fallbackLinkText', label: 'Its link text', value: text('fallbackLinkText'), placeholder: 'Give feedback' },
        ],
        ...designRows(style, FEEDBACK_DESIGN_LABELS),
    ];

    openFormModal(editor, {
        title: block ? 'Edit AMP feedback' : 'Insert AMP feedback',
        fields: rows,
        wide: true,
        submitLabel: block ? 'Save' : 'Insert',
        onSubmit: (values, { showError, close, lists }) => {
            const comment = values.comment === 'true';
            const patch: { -readonly [K in keyof AmpFeedbackConfig]?: AmpFeedbackConfig[K] } = {
                action: values.action.trim(),
                questions: (lists.questions ?? []).map(questionFromItem),
                // On by default, so only "off" is stored; "required" only means something with a comment box.
                comment: comment ? undefined : false,
                commentRequired: comment && values.commentRequired === 'true' ? true : undefined,
                commentLabel: optional(values.commentLabel),
                commentPlaceholder: optional(values.commentPlaceholder),
                submitText: optional(values.submitText),
                successMessage: optional(values.successMessage),
                errorMessage: optional(values.errorMessage),
                fallbackText: optional(values.fallbackText),
                fallbackUrl: optional(values.fallbackUrl),
                fallbackLinkText: optional(values.fallbackLinkText),
            };
            const enteredStyle = styleFromValues(values);
            const next = block ? { ...stored, ...patch } : patch;
            const issues = [
                ...validateAmpFormStyle(enteredStyle),
                ...validateAmpFeedbackConfig(JSON.parse(JSON.stringify({ ...next, style: undefined }))),
            ];
            if (issues.length) {
                showError(issues.map(readableIssue).join(' '));
                return;
            }
            // Only what differs from the default look is stored.
            patch.style = compactAmpFormStyle(enteredStyle as AmpFormStyle);
            if (block) updateFeedback(editor, block, patch);
            else insertFeedback(editor, JSON.parse(JSON.stringify(patch)), insertAfter);
            close();
        },
    });
}

export interface AmpFeedbackPluginOptions {
    /**
     * The design new feedback blocks start with, e.g. your brand colours. The
     * same settings as forms. Each block stores its design, so changing this
     * later doesn't restyle existing ones.
     */
    defaultStyle?: AmpFormStyle;
}

/**
 * Lets an editor hold AMP email feedback blocks: a rating (stars, emoji, a
 * 1–5 or 1–10 numbers, or thumbs) and an optional comment, sent to the block's own
 * endpoint. The HTML version of the email shows the fallback text (and
 * link); `toAmpEmail` turns the block into a working AMP form. Click a block
 * to edit it; the toolbar button adds one.
 *
 * Throws an `AmpFeedbackConfigError` when `defaultStyle` is invalid.
 */
export function createAmpFeedbackPlugin(options: AmpFeedbackPluginOptions = {}): Plugin {
    if (options.defaultStyle !== undefined) {
        const issues = validateAmpFormStyle(options.defaultStyle, 'defaultStyle');
        if (issues.length) throw new AmpFeedbackConfigError(issues);
    }
    const defaultStyle = options.defaultStyle ? compactAmpFormStyle(options.defaultStyle) : undefined;
    return {
        name: 'amp-feedback',
        init(editor: Editor) {
            initAmpFeedback(editor, defaultStyle);
        }
    };
}

/** Feedback blocks with the default design. */
export const AmpFeedbackPlugin: Plugin = createAmpFeedbackPlugin();

function initAmpFeedback(editor: Editor, defaultStyle: AmpFormStyle | undefined): void {
    editor.addToolbarButton(icons.feedback, 'Insert AMP Feedback', () => {
        if (inAlternateView(editor)) return;
        openFeedbackDialog(editor, null, caretBlock(editor), defaultStyle);
    });

    const onClick = (e: MouseEvent) => {
        const block = (e.target as Element | null)?.closest?.(`.${AMP_FEEDBACK_CLASS}`);
        if (!block || !editor.editorArea.contains(block)) return;
        e.preventDefault();
        if (inAlternateView(editor) || editor.editorArea.contentEditable === 'false') return;
        openFeedbackDialog(editor, block, null);
    };
    editor.editorArea.addEventListener('click', onClick);

    const unregisterInsert = editor.registerCommand(AMP_FEEDBACK_INSERT_COMMAND, (config: unknown) => insertFeedback(editor, config, caretBlock(editor), defaultStyle));
    const unregisterUpdate = editor.registerCommand(AMP_FEEDBACK_UPDATE_COMMAND, (block: Element, patch: Partial<AmpFeedbackConfig>) => updateFeedback(editor, block, patch));
    // A block edited by hand (source view, paste) keeps its summary current.
    const refreshSummaries = () => {
        if (inAlternateView(editor)) return;
        let changed = false;
        editor.editorArea.querySelectorAll(`.${AMP_FEEDBACK_CLASS}`).forEach((block) => {
            const read = readAmpFeedbackConfig(block);
            if ('issues' in read) return;
            const summary = feedbackSummaryOf(read.config);
            if (block.getAttribute(AMP_FEEDBACK_SUMMARY_ATTR) !== summary) {
                block.setAttribute(AMP_FEEDBACK_SUMMARY_ATTR, summary);
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
 * Adds an AMP feedback block to `editor` from a config. The editor needs
 * `AmpFeedbackPlugin`. Returns the inserted block, or `null` when the editor
 * has no `AmpFeedbackPlugin` or its source view or preview is open. Throws an
 * `AmpFeedbackConfigError` listing every problem when the config is invalid.
 */
export function addAmpFeedback(editor: Editor, config: AmpFeedbackConfig): HTMLElement | null {
    if (!editor.hasCommand(AMP_FEEDBACK_INSERT_COMMAND)) return null;
    return editor.runCommand<HTMLElement | null>(AMP_FEEDBACK_INSERT_COMMAND, config) ?? null;
}

/**
 * Changes a feedback block already in `editor`: `patch` is applied over its
 * stored settings, so anything not named (its endpoint included) is kept.
 * Returns the replacement block, or `null` when the editor has no
 * `AmpFeedbackPlugin`, the block isn't one of its feedback blocks, or its
 * source view or preview is open. Throws an `AmpFeedbackConfigError` when
 * the result would be invalid, leaving the block unchanged.
 */
export function updateAmpFeedback(editor: Editor, block: Element, patch: Partial<AmpFeedbackConfig>): HTMLElement | null {
    if (!editor.hasCommand(AMP_FEEDBACK_UPDATE_COMMAND)) return null;
    return editor.runCommand<HTMLElement | null>(AMP_FEEDBACK_UPDATE_COMMAND, block, patch) ?? null;
}
