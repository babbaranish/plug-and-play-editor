import type { AmpPollConfig, AmpPollConfigIssue, NormalizedAmpPollConfig } from './types';
import { validateAmpPollConfig } from './pollValidator';
import { AMP_FORM_STYLE_SETTINGS, normalizeAmpFormStyle, parseStyleAttribute } from '../forms/formStyle';
import { isUnknownSetting, settingName } from '../forms/formConfig';

/** The editor block that stands for a poll. */
export const AMP_POLL_CLASS = 'play-editor-amp-poll';
/** The block's attribute with a one-line summary, shown by the editor's stylesheet. */
export const AMP_POLL_SUMMARY_ATTR = 'data-amp-poll-summary';

export const DEFAULT_POLL_FALLBACK_TEXT = 'This email has a poll you can answer in an email app that supports interactive email, such as Gmail.';

/** Text settings and the block attributes that hold them, in the order they are written. */
const TEXT_ATTRS = [
    ['action', 'data-action'],
    ['question', 'data-question'],
    ['submitText', 'data-submit-text'],
    ['successMessage', 'data-success-message'],
    ['errorMessage', 'data-error-message'],
    ['submittingMessage', 'data-submitting-message'],
    ['fallbackText', 'data-fallback-text'],
    ['fallbackUrl', 'data-fallback-url'],
] as const;

/** Every attribute the stored block uses, for code that copies blocks (paste clean-up). */
export const AMP_POLL_BLOCK_ATTRS: readonly string[] = [
    ...TEXT_ATTRS.map(([, attr]) => attr),
    'data-options',
    'data-show-results',
    ...AMP_FORM_STYLE_SETTINGS.map(s => s.attr),
    AMP_POLL_SUMMARY_ATTR,
];

/** Thrown for a config that fails {@link validateAmpPollConfig}; `issues` lists every problem. */
export class AmpPollConfigError extends Error {
    readonly issues: readonly AmpPollConfigIssue[];

    constructor(issues: readonly AmpPollConfigIssue[]) {
        super(`Invalid AMP poll config:\n${issues.map(i => `- ${i.path ? `${i.path}: ` : ''}${i.message}`).join('\n')}`);
        this.name = 'AmpPollConfigError';
        this.issues = issues;
    }
}

/** Fills in defaults. `config` must already be valid. */
export function normalizeAmpPollConfig(config: AmpPollConfig): NormalizedAmpPollConfig {
    return {
        action: config.action.trim(),
        question: config.question.trim(),
        options: config.options.map(o => o.trim()),
        showResults: config.showResults ?? true,
        submitText: config.submitText?.trim() || 'Vote',
        successMessage: config.successMessage?.trim() || 'Thanks for voting!',
        errorMessage: config.errorMessage?.trim() || 'Something went wrong. Please try again.',
        submittingMessage: config.submittingMessage?.trim() || 'Sending…',
        fallbackText: config.fallbackText?.trim() || DEFAULT_POLL_FALLBACK_TEXT,
        fallbackUrl: config.fallbackUrl?.trim() ?? '',
        style: normalizeAmpFormStyle(config.style),
    };
}

/** Validates and normalizes, or throws {@link AmpPollConfigError}. */
export function parseAmpPollConfig(config: unknown): NormalizedAmpPollConfig {
    const issues = validateAmpPollConfig(config);
    if (issues.length) throw new AmpPollConfigError(issues);
    return normalizeAmpPollConfig(config as AmpPollConfig);
}

/** Choices as written in `data-options` and the poll dialog: separated by `|`, so a choice can contain commas. */
export function parseAmpPollChoices(text: string): string[] {
    return text.split('|').map(part => part.trim()).filter(Boolean);
}

export function formatAmpPollChoices(options: readonly string[]): string {
    return options.join(' | ');
}

/**
 * Writes `config` onto `block` as attributes. Settings the config leaves out
 * are left out; `showResults` only when it is off (it defaults on).
 */
export function writeAmpPollSettings(block: Element, config: AmpPollConfig): void {
    const values = config as unknown as Record<string, unknown>;
    for (const [key, attr] of TEXT_ATTRS) {
        const value = values[key];
        if (typeof value === 'string' && value !== '') block.setAttribute(attr, value);
    }
    block.setAttribute('data-options', formatAmpPollChoices(config.options));
    if (config.showResults === false) block.setAttribute('data-show-results', 'false');
    for (const setting of AMP_FORM_STYLE_SETTINGS) {
        const value = config.style?.[setting.key];
        if (value !== undefined) block.setAttribute(setting.attr, String(value));
    }
}

/**
 * The config exactly as stored on a block (no defaults filled in). What an
 * edit starts from, so saving keeps every setting it didn't change.
 * Attributes the format doesn't have are passed on, so validation names them.
 */
export function readStoredAmpPollConfig(block: Element): Record<string, unknown> {
    const config: Record<string, unknown> = {};
    for (const [key, attr] of TEXT_ATTRS) {
        const value = block.getAttribute(attr);
        if (value !== null) config[key] = value;
    }
    config.options = parseAmpPollChoices(block.getAttribute('data-options') ?? '');
    const showResults = block.getAttribute('data-show-results');
    if (showResults !== null) config.showResults = showResults.trim().toLowerCase() !== 'false';
    const style: Record<string, unknown> = {};
    for (const setting of AMP_FORM_STYLE_SETTINGS) {
        const raw = block.getAttribute(setting.attr);
        if (raw !== null) style[setting.key] = parseStyleAttribute(setting, raw);
    }
    if (Object.keys(style).length) config.style = style;
    const known = new Set<string>(AMP_POLL_BLOCK_ATTRS);
    for (const attr of Array.from(block.attributes)) {
        if (isUnknownSetting(attr.name, known)) config[settingName(attr.name)] = attr.value;
    }
    return config;
}

/** Reads the config stored on a poll block, or the issues when it is invalid (it can be hand-edited). */
export function readAmpPollConfig(block: Element): { config: NormalizedAmpPollConfig } | { issues: AmpPollConfigIssue[] } {
    const raw = readStoredAmpPollConfig(block);
    const issues = validateAmpPollConfig(raw);
    return issues.length ? { issues } : { config: normalizeAmpPollConfig(raw as unknown as AmpPollConfig) };
}
