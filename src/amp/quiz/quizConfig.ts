import type { AmpQuizConfig, AmpQuizConfigIssue, NormalizedAmpQuizConfig } from './types';
import { validateAmpQuizConfig } from './quizValidator';
import { AMP_FORM_STYLE_SETTINGS, normalizeAmpFormStyle, parseStyleAttribute } from '../forms/formStyle';
import { isUnknownSetting, settingName } from '../forms/formConfig';

/** The editor block that stands for a quiz. */
export const AMP_QUIZ_CLASS = 'play-editor-amp-quiz';
/** The block's attribute with a one-line summary, shown by the editor's stylesheet. */
export const AMP_QUIZ_SUMMARY_ATTR = 'data-amp-quiz-summary';
/** The element (inside a block) that stands for one question; its value is the question text. */
export const AMP_QUIZ_QUESTION_ATTR = 'data-amp-question';

export const DEFAULT_QUIZ_FALLBACK_TEXT = 'This email has a quiz you can take in an email app that supports interactive email, such as Gmail.';

/** Choices per row: `data-columns="2"`. A number, so it is stored apart from the text settings. */
const COLUMNS_ATTR = 'data-columns';

/** Quiz text settings and the block attributes that hold them, in the order they are written. */
const QUIZ_ATTRS = [
    ['correctMessage', 'data-correct-message'],
    ['wrongMessage', 'data-wrong-message'],
    ['scoreText', 'data-score-text'],
    ['action', 'data-action'],
    ['submitText', 'data-submit-text'],
    ['successMessage', 'data-success-message'],
    ['errorMessage', 'data-error-message'],
    ['submittingMessage', 'data-submitting-message'],
    ['fallbackText', 'data-fallback-text'],
    ['fallbackUrl', 'data-fallback-url'],
    ['fallbackLinkText', 'data-fallback-link-text'],
] as const;

/** Question settings beside the question text: `<div data-amp-question="…" data-options="A | B" data-answer="B">`. */
const QUESTION_ATTRS = ['data-options', 'data-answer', 'data-explanation'] as const;

/** Every attribute the stored quiz uses on its block, for code that copies blocks (paste clean-up). */
export const AMP_QUIZ_BLOCK_ATTRS: readonly string[] = [
    COLUMNS_ATTR,
    ...QUIZ_ATTRS.map(([, attr]) => attr),
    ...AMP_FORM_STYLE_SETTINGS.map(s => s.attr),
    AMP_QUIZ_SUMMARY_ATTR,
];
/** Every attribute the stored quiz uses on a question element. */
export const AMP_QUIZ_QUESTION_ATTRS: readonly string[] = [AMP_QUIZ_QUESTION_ATTR, ...QUESTION_ATTRS];

/** Thrown for a config that fails {@link validateAmpQuizConfig}; `issues` lists every problem. */
export class AmpQuizConfigError extends Error {
    readonly issues: readonly AmpQuizConfigIssue[];

    constructor(issues: readonly AmpQuizConfigIssue[]) {
        super(`Invalid AMP quiz config:\n${issues.map(i => `- ${i.path ? `${i.path}: ` : ''}${i.message}`).join('\n')}`);
        this.name = 'AmpQuizConfigError';
        this.issues = issues;
    }
}

/** Fills in defaults. `config` must already be valid. */
export function normalizeAmpQuizConfig(config: AmpQuizConfig): NormalizedAmpQuizConfig {
    return {
        questions: config.questions.map(q => {
            const options = q.options.map(o => o.trim());
            const answer = q.answer.trim();
            return { question: q.question.trim(), options, answer, answerIndex: options.indexOf(answer), explanation: q.explanation?.trim() ?? '' };
        }),
        columns: config.columns ?? 1,
        correctMessage: config.correctMessage?.trim() || 'Correct!',
        wrongMessage: config.wrongMessage?.trim() || 'Not quite.',
        scoreText: config.scoreText?.trim() || 'Your score:',
        action: config.action?.trim() ?? '',
        submitText: config.submitText?.trim() || 'Submit answers',
        successMessage: config.successMessage?.trim() || 'Thanks! Your answers were sent.',
        errorMessage: config.errorMessage?.trim() || 'Something went wrong. Please try again.',
        submittingMessage: config.submittingMessage?.trim() || 'Sending…',
        fallbackText: config.fallbackText?.trim() || DEFAULT_QUIZ_FALLBACK_TEXT,
        fallbackUrl: config.fallbackUrl?.trim() ?? '',
        fallbackLinkText: config.fallbackLinkText?.trim() || 'Take the quiz',
        style: normalizeAmpFormStyle(config.style),
    };
}

/** Validates and normalizes, or throws {@link AmpQuizConfigError}. */
export function parseAmpQuizConfig(config: unknown): NormalizedAmpQuizConfig {
    const issues = validateAmpQuizConfig(config);
    if (issues.length) throw new AmpQuizConfigError(issues);
    return normalizeAmpQuizConfig(config as AmpQuizConfig);
}

// ── Choices: "London | Paris | Berlin" ────────────────────────────

/** Choices as written in `data-options` and the quiz dialog: separated by `|`, so a choice can contain commas. */
export function parseAmpQuizChoices(text: string): string[] {
    return text.split('|').map(part => part.trim()).filter(Boolean);
}

export function formatAmpQuizChoices(options: readonly string[]): string {
    return options.join(' | ');
}

// ── Stored format ─────────────────────────────────────────────────

function questionElements(block: Element): Element[] {
    return Array.from(block.children).filter(child => child.hasAttribute(AMP_QUIZ_QUESTION_ATTR));
}

/**
 * Writes `config` onto `block` in the readable format: settings as
 * attributes on the block, one empty `<div data-amp-question>` per question,
 * in order. Returns the question elements for the caller to place. They are
 * empty, so the HTML version of the email shows nothing for them.
 */
export function writeAmpQuizSettings(block: Element, config: AmpQuizConfig): Element[] {
    const values = config as unknown as Record<string, unknown>;
    if (config.columns !== undefined) block.setAttribute(COLUMNS_ATTR, String(config.columns));
    for (const [key, attr] of QUIZ_ATTRS) {
        const value = values[key];
        if (typeof value === 'string' && value !== '') block.setAttribute(attr, value);
    }
    for (const setting of AMP_FORM_STYLE_SETTINGS) {
        const value = config.style?.[setting.key];
        if (value !== undefined) block.setAttribute(setting.attr, String(value));
    }
    return config.questions.map(q => {
        const el = block.ownerDocument.createElement('div');
        el.setAttribute(AMP_QUIZ_QUESTION_ATTR, q.question);
        el.setAttribute('data-options', formatAmpQuizChoices(q.options));
        el.setAttribute('data-answer', q.answer);
        if (q.explanation) el.setAttribute('data-explanation', q.explanation);
        return el;
    });
}

/**
 * The config exactly as stored on a block (no defaults filled in). What an
 * edit starts from, so saving keeps every setting it didn't change.
 * Attributes the format doesn't have are passed on, so validation names them.
 */
export function readStoredAmpQuizConfig(block: Element): Record<string, unknown> {
    const config: Record<string, unknown> = {};
    const known = new Set<string>(AMP_QUIZ_BLOCK_ATTRS);
    const columns = block.getAttribute(COLUMNS_ATTR);
    if (columns !== null) {
        // A malformed value stays text, so validation names it.
        const n = Number(columns.trim());
        config.columns = columns.trim() !== '' && Number.isFinite(n) ? n : columns;
    }
    for (const [key, attr] of QUIZ_ATTRS) {
        const value = block.getAttribute(attr);
        if (value !== null) config[key] = value;
    }
    const style: Record<string, unknown> = {};
    for (const setting of AMP_FORM_STYLE_SETTINGS) {
        const raw = block.getAttribute(setting.attr);
        if (raw !== null) style[setting.key] = parseStyleAttribute(setting, raw);
    }
    if (Object.keys(style).length) config.style = style;
    for (const attr of Array.from(block.attributes)) {
        if (isUnknownSetting(attr.name, known)) config[settingName(attr.name)] = attr.value;
    }

    const knownQuestion = new Set<string>(AMP_QUIZ_QUESTION_ATTRS);
    config.questions = questionElements(block).map(el => {
        const q: Record<string, unknown> = {
            question: el.getAttribute(AMP_QUIZ_QUESTION_ATTR) ?? '',
            options: parseAmpQuizChoices(el.getAttribute('data-options') ?? ''),
        };
        const answer = el.getAttribute('data-answer');
        if (answer !== null) q.answer = answer;
        const explanation = el.getAttribute('data-explanation');
        if (explanation !== null) q.explanation = explanation;
        for (const attr of Array.from(el.attributes)) {
            if (isUnknownSetting(attr.name, knownQuestion)) q[settingName(attr.name)] = attr.value;
        }
        return q;
    });
    return config;
}

/** Reads the config stored on a quiz block, or the issues when it is invalid (it can be hand-edited). */
export function readAmpQuizConfig(block: Element): { config: NormalizedAmpQuizConfig } | { issues: AmpQuizConfigIssue[] } {
    const raw = readStoredAmpQuizConfig(block);
    const issues = validateAmpQuizConfig(raw);
    return issues.length ? { issues } : { config: normalizeAmpQuizConfig(raw as unknown as AmpQuizConfig) };
}
