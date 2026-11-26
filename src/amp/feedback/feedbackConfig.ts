import type { AmpFeedbackConfig, AmpFeedbackConfigIssue, NormalizedAmpFeedbackConfig } from './types';
import { validateAmpFeedbackConfig } from './feedbackValidator';
import { AMP_FORM_STYLE_SETTINGS, normalizeAmpFormStyle, parseStyleAttribute } from '../forms/formStyle';
import { isUnknownSetting, settingName } from '../forms/formConfig';

/** The editor block that stands for a feedback block. */
export const AMP_FEEDBACK_CLASS = 'play-editor-amp-feedback';
/** The block's attribute with a one-line summary, shown by the editor's stylesheet. */
export const AMP_FEEDBACK_SUMMARY_ATTR = 'data-amp-feedback-summary';
/** The element (inside a block) that stands for one rating question; its value is the question text. */
export const AMP_FEEDBACK_QUESTION_ATTR = 'data-amp-rating';

export const DEFAULT_FEEDBACK_FALLBACK_TEXT = 'This email lets you rate us right here in an email app that supports interactive email, such as Gmail.';

/** Block text settings and their attributes, in the order they are written. */
const TEXT_ATTRS = [
    ['action', 'data-action'],
    ['commentLabel', 'data-comment-label'],
    ['commentPlaceholder', 'data-comment-placeholder'],
    ['submitText', 'data-submit-text'],
    ['successMessage', 'data-success-message'],
    ['errorMessage', 'data-error-message'],
    ['submittingMessage', 'data-submitting-message'],
    ['fallbackText', 'data-fallback-text'],
    ['fallbackUrl', 'data-fallback-url'],
    ['fallbackLinkText', 'data-fallback-link-text'],
] as const;

/** Block yes/no settings: `data-comment="false"`, `data-comment-required`. */
const BOOLEAN_ATTRS = [
    ['comment', 'data-comment'],
    ['commentRequired', 'data-comment-required'],
] as const;

/** Question text settings beside the question: `<div data-amp-rating="…" data-scale="emoji" data-low-label="Bad">`. */
const QUESTION_TEXT_ATTRS = [
    ['scale', 'data-scale'],
    ['lowLabel', 'data-low-label'],
    ['highLabel', 'data-high-label'],
    ['name', 'data-name'],
] as const;

/**
 * The single-question format of the first version, with the question's
 * settings on the block itself. Still read, as one question; a block is
 * written in the current format when it is next saved.
 */
const LEGACY_QUESTION_ATTRS = ['data-question', 'data-scale', 'data-low-label', 'data-high-label'] as const;

/** Every attribute the stored block uses on itself, for code that copies blocks (paste clean-up). */
export const AMP_FEEDBACK_BLOCK_ATTRS: readonly string[] = [
    ...TEXT_ATTRS.map(([, attr]) => attr),
    ...BOOLEAN_ATTRS.map(([, attr]) => attr),
    ...AMP_FORM_STYLE_SETTINGS.map(s => s.attr),
    ...LEGACY_QUESTION_ATTRS,
    AMP_FEEDBACK_SUMMARY_ATTR,
];
/** Every attribute the stored block uses on a question element. */
export const AMP_FEEDBACK_QUESTION_ATTRS: readonly string[] = [
    AMP_FEEDBACK_QUESTION_ATTR,
    ...QUESTION_TEXT_ATTRS.map(([, attr]) => attr),
    'data-required',
];

/** Thrown for a config that fails {@link validateAmpFeedbackConfig}; `issues` lists every problem. */
export class AmpFeedbackConfigError extends Error {
    readonly issues: readonly AmpFeedbackConfigIssue[];

    constructor(issues: readonly AmpFeedbackConfigIssue[]) {
        super(`Invalid AMP feedback config:\n${issues.map(i => `- ${i.path ? `${i.path}: ` : ''}${i.message}`).join('\n')}`);
        this.name = 'AmpFeedbackConfigError';
        this.issues = issues;
    }
}

/** Fills in defaults. `config` must already be valid. */
export function normalizeAmpFeedbackConfig(config: AmpFeedbackConfig): NormalizedAmpFeedbackConfig {
    const comment = config.comment ?? true;
    return {
        action: config.action.trim(),
        questions: config.questions.map((q, i) => ({
            question: q.question.trim(),
            scale: q.scale ?? 'stars',
            lowLabel: q.lowLabel?.trim() ?? '',
            highLabel: q.highLabel?.trim() ?? '',
            name: q.name ?? `rating${i + 1}`,
            required: q.required ?? true,
        })),
        comment,
        commentLabel: config.commentLabel?.trim() || 'Anything else you would like to tell us?',
        commentPlaceholder: config.commentPlaceholder?.trim() ?? '',
        commentRequired: comment && (config.commentRequired ?? false),
        submitText: config.submitText?.trim() || 'Send feedback',
        successMessage: config.successMessage?.trim() || 'Thanks for your feedback!',
        errorMessage: config.errorMessage?.trim() || 'Something went wrong. Please try again.',
        submittingMessage: config.submittingMessage?.trim() || 'Sending…',
        fallbackText: config.fallbackText?.trim() || DEFAULT_FEEDBACK_FALLBACK_TEXT,
        fallbackUrl: config.fallbackUrl?.trim() ?? '',
        fallbackLinkText: config.fallbackLinkText?.trim() || 'Give feedback',
        style: normalizeAmpFormStyle(config.style),
    };
}

/** Validates and normalizes, or throws {@link AmpFeedbackConfigError}. */
export function parseAmpFeedbackConfig(config: unknown): NormalizedAmpFeedbackConfig {
    const issues = validateAmpFeedbackConfig(config);
    if (issues.length) throw new AmpFeedbackConfigError(issues);
    return normalizeAmpFeedbackConfig(config as AmpFeedbackConfig);
}

function questionElements(block: Element): Element[] {
    return Array.from(block.children).filter(child => child.hasAttribute(AMP_FEEDBACK_QUESTION_ATTR));
}

/**
 * Writes `config` onto `block`: settings as attributes on the block, and
 * returns one empty `<div data-amp-rating>` per question, in order, for the
 * caller to place. Settings the config leaves out are left out; yes/no
 * settings are written only when they differ from their default.
 */
export function writeAmpFeedbackSettings(block: Element, config: AmpFeedbackConfig): Element[] {
    const values = config as unknown as Record<string, unknown>;
    for (const [key, attr] of TEXT_ATTRS) {
        const value = values[key];
        if (typeof value === 'string' && value !== '') block.setAttribute(attr, value);
    }
    if (config.comment === false) block.setAttribute('data-comment', 'false');
    if (config.commentRequired === true) block.setAttribute('data-comment-required', '');
    for (const setting of AMP_FORM_STYLE_SETTINGS) {
        const value = config.style?.[setting.key];
        if (value !== undefined) block.setAttribute(setting.attr, String(value));
    }
    return config.questions.map(q => {
        const el = block.ownerDocument.createElement('div');
        el.setAttribute(AMP_FEEDBACK_QUESTION_ATTR, q.question);
        const qValues = q as unknown as Record<string, unknown>;
        for (const [key, attr] of QUESTION_TEXT_ATTRS) {
            const value = qValues[key];
            if (typeof value === 'string' && value !== '') el.setAttribute(attr, value);
        }
        if (q.required === false) el.setAttribute('data-required', 'false');
        return el;
    });
}

function readQuestion(el: Element): Record<string, unknown> {
    const q: Record<string, unknown> = { question: el.getAttribute(AMP_FEEDBACK_QUESTION_ATTR) ?? '' };
    for (const [key, attr] of QUESTION_TEXT_ATTRS) {
        const value = el.getAttribute(attr);
        if (value !== null) q[key] = value;
    }
    const required = el.getAttribute('data-required');
    if (required !== null) q.required = required.trim().toLowerCase() !== 'false';
    const known = new Set<string>(AMP_FEEDBACK_QUESTION_ATTRS);
    for (const attr of Array.from(el.attributes)) {
        if (isUnknownSetting(attr.name, known)) q[settingName(attr.name)] = attr.value;
    }
    return q;
}

/** A block in the first version's format: its one question, from the block's own attributes. */
function readLegacyQuestion(block: Element): Record<string, unknown> | null {
    const question = block.getAttribute('data-question');
    if (question === null) return null;
    const q: Record<string, unknown> = { question };
    for (const [key, attr] of [['scale', 'data-scale'], ['lowLabel', 'data-low-label'], ['highLabel', 'data-high-label']] as const) {
        const value = block.getAttribute(attr);
        if (value !== null) q[key] = value;
    }
    // Its rating was posted as "rating".
    q.name = 'rating';
    return q;
}

/**
 * The config exactly as stored on a block (no defaults filled in). What an
 * edit starts from, so saving keeps every setting it didn't change.
 * Attributes the format doesn't have are passed on, so validation names them.
 */
export function readStoredAmpFeedbackConfig(block: Element): Record<string, unknown> {
    const config: Record<string, unknown> = {};
    for (const [key, attr] of TEXT_ATTRS) {
        const value = block.getAttribute(attr);
        if (value !== null) config[key] = value;
    }
    for (const [key, attr] of BOOLEAN_ATTRS) {
        const value = block.getAttribute(attr);
        if (value !== null) config[key] = value.trim().toLowerCase() !== 'false';
    }
    const style: Record<string, unknown> = {};
    for (const setting of AMP_FORM_STYLE_SETTINGS) {
        const raw = block.getAttribute(setting.attr);
        if (raw !== null) style[setting.key] = parseStyleAttribute(setting, raw);
    }
    if (Object.keys(style).length) config.style = style;
    const known = new Set<string>(AMP_FEEDBACK_BLOCK_ATTRS);
    for (const attr of Array.from(block.attributes)) {
        if (isUnknownSetting(attr.name, known)) config[settingName(attr.name)] = attr.value;
    }
    const elements = questionElements(block);
    const legacy = elements.length ? null : readLegacyQuestion(block);
    config.questions = legacy ? [legacy] : elements.map(readQuestion);
    return config;
}

/** Reads the config stored on a feedback block, or the issues when it is invalid (it can be hand-edited). */
export function readAmpFeedbackConfig(block: Element): { config: NormalizedAmpFeedbackConfig } | { issues: AmpFeedbackConfigIssue[] } {
    const raw = readStoredAmpFeedbackConfig(block);
    const issues = validateAmpFeedbackConfig(raw);
    return issues.length ? { issues } : { config: normalizeAmpFeedbackConfig(raw as unknown as AmpFeedbackConfig) };
}
