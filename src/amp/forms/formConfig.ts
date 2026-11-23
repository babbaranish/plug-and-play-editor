import type { AmpFormConfig, AmpFormConfigIssue, AmpFormSelectOption, NormalizedAmpFormConfig } from './types';
import { validateAmpFormConfig } from './formValidator';
import { AMP_FORM_STYLE_SETTINGS, normalizeAmpFormStyle, parseStyleAttribute } from './formStyle';

/** The editor block that stands for a form. */
export const AMP_FORM_CLASS = 'play-editor-amp-form';
/** The block's attribute with a one-line summary, shown by the editor's stylesheet. */
export const AMP_FORM_SUMMARY_ATTR = 'data-amp-form-summary';
/** The element (inside a block) that stands for one field; its value is the field name. */
export const AMP_FORM_FIELD_ATTR = 'data-amp-field';
/**
 * Where forms saved before the readable format kept their whole config, as
 * JSON. Still read; a form is written in the readable format when it is
 * next saved.
 */
export const LEGACY_AMP_FORM_CONFIG_ATTR = 'data-amp-form';

export const DEFAULT_FALLBACK_TEXT = 'This email has a form you can fill in using an email app that supports interactive email, such as Gmail.';

/**
 * Form settings and the block attributes that hold them, in the order they
 * are written: `<div class="play-editor-amp-form" data-action="https://…" data-submit-text="Join" …>`.
 */
const FORM_ATTRS = [
    ['action', 'data-action'],
    ['method', 'data-method'],
    ['submitText', 'data-submit-text'],
    ['successMessage', 'data-success-message'],
    ['errorMessage', 'data-error-message'],
    ['submittingMessage', 'data-submitting-message'],
    ['fallbackText', 'data-fallback-text'],
    ['fallbackUrl', 'data-fallback-url'],
] as const;

/** Field settings and their attributes: `<div data-amp-field="email" data-type="email" data-label="Email" data-required>`. */
const FIELD_ATTRS = [
    ['type', 'data-type'],
    ['label', 'data-label'],
    ['placeholder', 'data-placeholder'],
    ['required', 'data-required'],
    ['options', 'data-options'],
] as const;

/** Every attribute the stored form uses on its block, for code that copies blocks (paste clean-up). */
export const AMP_FORM_BLOCK_ATTRS: readonly string[] = [
    ...FORM_ATTRS.map(([, attr]) => attr),
    ...AMP_FORM_STYLE_SETTINGS.map(s => s.attr),
    AMP_FORM_SUMMARY_ATTR,
    LEGACY_AMP_FORM_CONFIG_ATTR,
];
/** Every attribute the stored form uses on a field element. */
export const AMP_FORM_FIELD_ATTRS: readonly string[] = [AMP_FORM_FIELD_ATTR, ...FIELD_ATTRS.map(([, attr]) => attr)];

/** Thrown for a config that fails {@link validateAmpFormConfig}; `issues` lists every problem. */
export class AmpFormConfigError extends Error {
    readonly issues: readonly AmpFormConfigIssue[];

    constructor(issues: readonly AmpFormConfigIssue[]) {
        super(`Invalid AMP form config:\n${issues.map(i => `- ${i.path ? `${i.path}: ` : ''}${i.message}`).join('\n')}`);
        this.name = 'AmpFormConfigError';
        this.issues = issues;
    }
}

/** Fills in defaults. `config` must already be valid. */
export function normalizeAmpFormConfig(config: AmpFormConfig): NormalizedAmpFormConfig {
    return {
        action: config.action.trim(),
        method: 'POST',
        fields: config.fields.map(f => ({
            name: f.name,
            type: f.type,
            label: f.label?.trim() ?? '',
            placeholder: f.placeholder?.trim() ?? '',
            required: f.required ?? false,
            options: (f.options ?? []).map(o => (typeof o === 'string' ? { label: o, value: o } : { label: o.label, value: o.value })),
        })),
        submitText: config.submitText?.trim() || 'Submit',
        successMessage: config.successMessage?.trim() || 'Thanks! Your response was sent.',
        errorMessage: config.errorMessage?.trim() || 'Something went wrong. Please try again.',
        submittingMessage: config.submittingMessage?.trim() || 'Sending…',
        fallbackText: config.fallbackText?.trim() || DEFAULT_FALLBACK_TEXT,
        fallbackUrl: config.fallbackUrl?.trim() ?? '',
        style: normalizeAmpFormStyle(config.style),
    };
}

/** Validates and normalizes, or throws {@link AmpFormConfigError}. */
export function parseAmpFormConfig(config: unknown): NormalizedAmpFormConfig {
    const issues = validateAmpFormConfig(config);
    if (issues.length) throw new AmpFormConfigError(issues);
    return normalizeAmpFormConfig(config as AmpFormConfig);
}

// ── Choices: "Basic, Pro plan = pro" ──────────────────────────────

/**
 * Dropdown choices as written in `data-options` and in the form dialog:
 * comma-separated, and `label = value` when the value sent differs from the
 * label shown.
 */
export function parseAmpFormChoices(text: string): (string | AmpFormSelectOption)[] {
    return text.split(',').map(part => part.trim()).filter(Boolean).map(part => {
        const eq = part.indexOf('=');
        if (eq === -1) return part;
        const label = part.slice(0, eq).trim();
        const value = part.slice(eq + 1).trim();
        return label === value ? label : { label, value };
    });
}

/** The reverse of {@link parseAmpFormChoices}. */
export function formatAmpFormChoices(options: unknown): string {
    if (!Array.isArray(options)) return '';
    return options.map((o: unknown) => {
        if (typeof o === 'string') return o;
        const opt = o as Partial<AmpFormSelectOption>;
        return opt.label === opt.value ? `${opt.label ?? ''}` : `${opt.label ?? ''} = ${opt.value ?? ''}`;
    }).join(', ');
}

// ── Stored format ─────────────────────────────────────────────────

/** `data-submit-text` → `submitText`, for reporting attributes the format doesn't have. */
function settingName(attr: string): string {
    return attr.replace(/^data-/, '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * A `data-` attribute that isn't one of the format's, and so is reported as
 * an unsupported setting. The editor's own markers (`data-pe-…`, e.g. the one
 * paste clean-up adds for a moment) are not settings.
 */
function isUnknownSetting(name: string, known: ReadonlySet<string>): boolean {
    return name.startsWith('data-') && !name.startsWith('data-pe-') && !known.has(name);
}

function fieldElements(block: Element): Element[] {
    return Array.from(block.children).filter(child => child.hasAttribute(AMP_FORM_FIELD_ATTR));
}

/**
 * Writes `config` onto `block` in the readable format: settings as
 * attributes on the block, one empty `<div data-amp-field>` per field, in
 * order. Settings the config leaves out are left out. The field elements are
 * empty, so the HTML version of the email shows nothing for them.
 */
export function writeAmpFormSettings(block: Element, config: AmpFormConfig): Element[] {
    const doc = block.ownerDocument;
    const values = config as unknown as Record<string, unknown>;
    for (const [key, attr] of FORM_ATTRS) {
        const value = values[key];
        if (typeof value === 'string' && value !== '') block.setAttribute(attr, value);
    }
    // Design settings: data-button-color="#d63736", data-label-bold="false", …
    for (const setting of AMP_FORM_STYLE_SETTINGS) {
        const value = config.style?.[setting.key];
        if (value !== undefined) block.setAttribute(setting.attr, String(value));
    }
    return config.fields.map(field => {
        const el = doc.createElement('div');
        el.setAttribute(AMP_FORM_FIELD_ATTR, field.name);
        if (field.type) el.setAttribute('data-type', field.type);
        if (field.label) el.setAttribute('data-label', field.label);
        if (field.placeholder) el.setAttribute('data-placeholder', field.placeholder);
        if (field.required) el.setAttribute('data-required', '');
        if (field.options) el.setAttribute('data-options', formatAmpFormChoices(field.options));
        return el;
    });
}

function readReadableFormat(block: Element): Record<string, unknown> {
    const config: Record<string, unknown> = {};
    const known = new Set<string>([...AMP_FORM_BLOCK_ATTRS]);
    for (const [key, attr] of FORM_ATTRS) {
        const value = block.getAttribute(attr);
        if (value !== null) config[key] = value;
    }
    const style: Record<string, unknown> = {};
    for (const setting of AMP_FORM_STYLE_SETTINGS) {
        const raw = block.getAttribute(setting.attr);
        if (raw !== null) style[setting.key] = parseStyleAttribute(setting, raw);
    }
    if (Object.keys(style).length) config.style = style;
    // A misspelt setting (data-sumbit-text) is passed on, so validation names it.
    for (const attr of Array.from(block.attributes)) {
        if (isUnknownSetting(attr.name, known)) config[settingName(attr.name)] = attr.value;
    }

    const knownField = new Set<string>(AMP_FORM_FIELD_ATTRS);
    config.fields = fieldElements(block).map(el => {
        const field: Record<string, unknown> = { name: el.getAttribute(AMP_FORM_FIELD_ATTR) ?? '' };
        const type = el.getAttribute('data-type');
        if (type !== null) field.type = type;
        const label = el.getAttribute('data-label');
        if (label !== null) field.label = label;
        const placeholder = el.getAttribute('data-placeholder');
        if (placeholder !== null) field.placeholder = placeholder;
        const required = el.getAttribute('data-required');
        if (required !== null && required.trim().toLowerCase() !== 'false') field.required = true;
        const options = el.getAttribute('data-options');
        if (options !== null) field.options = parseAmpFormChoices(options);
        for (const attr of Array.from(el.attributes)) {
            if (isUnknownSetting(attr.name, knownField)) field[settingName(attr.name)] = attr.value;
        }
        return field;
    });
    return config;
}

/** Whether `block` stores its settings in the readable format (as opposed to legacy JSON). */
function isReadableFormat(block: Element): boolean {
    return block.hasAttribute('data-action') || fieldElements(block).length > 0 || !block.hasAttribute(LEGACY_AMP_FORM_CONFIG_ATTR);
}

/**
 * The config exactly as stored on a block (no defaults filled in), from the
 * readable format or, for forms saved earlier, the legacy JSON. Null when the
 * legacy JSON isn't readable. What an edit starts from, so saving keeps every
 * setting it didn't change, the endpoint included.
 */
export function readStoredAmpFormConfig(block: Element): Record<string, unknown> | null {
    if (isReadableFormat(block)) return readReadableFormat(block);
    try {
        const raw: unknown = JSON.parse(block.getAttribute(LEGACY_AMP_FORM_CONFIG_ATTR) ?? '');
        return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
    } catch {
        return null;
    }
}

/**
 * Reads the config stored on a form block. Returns the issues instead when
 * it is unreadable or invalid (it can be edited in the source view or pasted).
 */
export function readAmpFormConfig(block: Element): { config: NormalizedAmpFormConfig } | { issues: AmpFormConfigIssue[] } {
    const raw = readStoredAmpFormConfig(block);
    if (raw === null) {
        return { issues: [{ path: '', message: 'The form settings stored on this block are not readable JSON.' }] };
    }
    const issues = validateAmpFormConfig(raw);
    return issues.length ? { issues } : { config: normalizeAmpFormConfig(raw as unknown as AmpFormConfig) };
}
