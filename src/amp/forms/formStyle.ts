import type { AmpFormConfigIssue, AmpFormStyle, NormalizedAmpFormStyle } from './types';

/**
 * Fonts a form can use: standard fonts every device has (AMP email can't
 * load web fonts), by name, with the font stack each one renders as. The same
 * fonts as the editor's font menu.
 */
export const AMP_FORM_FONTS: Readonly<Record<string, string>> = {
    'Arial': 'Arial, sans-serif',
    'Helvetica': 'Helvetica, sans-serif',
    'Georgia': 'Georgia, serif',
    'Times New Roman': '"Times New Roman", Times, serif',
    'Courier New': '"Courier New", Courier, monospace',
    'Verdana': 'Verdana, Geneva, sans-serif',
    'Trebuchet MS': '"Trebuchet MS", Helvetica, sans-serif',
    'Tahoma': 'Tahoma, Geneva, sans-serif',
    'Lucida Console': '"Lucida Console", Monaco, monospace',
};

type StyleKey = keyof AmpFormStyle;

interface StyleSettingBase {
    readonly key: StyleKey;
    /** The attribute that stores it on a form block, e.g. `data-button-color`. */
    readonly attr: string;
    /** Its label in the form dialog. */
    readonly label: string;
}

export type AmpFormStyleSetting =
    | StyleSettingBase & { readonly kind: 'color'; readonly default: string }
    | StyleSettingBase & { readonly kind: 'number'; readonly min: number; readonly max: number; readonly default: number }
    | StyleSettingBase & { readonly kind: 'boolean'; readonly default: boolean }
    | StyleSettingBase & { readonly kind: 'choice'; readonly choices: readonly { value: string; label: string }[]; readonly default: string };

/**
 * Every design setting: how it is stored, checked and offered in the dialog.
 * The defaults are the look a form has with no design settings.
 */
export const AMP_FORM_STYLE_SETTINGS: readonly AmpFormStyleSetting[] = [
    { key: 'buttonColor', attr: 'data-button-color', label: 'Button color', kind: 'color', default: '#3b82f6' },
    { key: 'buttonTextColor', attr: 'data-button-text-color', label: 'Button text', kind: 'color', default: '#ffffff' },
    { key: 'buttonRadius', attr: 'data-button-radius', label: 'Button corners (px)', kind: 'number', min: 0, max: 40, default: 4 },
    {
        key: 'buttonAlign', attr: 'data-button-align', label: 'Button position', kind: 'choice', default: 'left',
        choices: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }],
    },
    { key: 'buttonFullWidth', attr: 'data-button-full-width', label: 'Full-width button', kind: 'boolean', default: false },
    { key: 'fieldBorderColor', attr: 'data-field-border-color', label: 'Field border', kind: 'color', default: '#cbd5e1' },
    { key: 'fieldBackground', attr: 'data-field-background', label: 'Field background', kind: 'color', default: '#ffffff' },
    { key: 'fieldRadius', attr: 'data-field-radius', label: 'Field corners (px)', kind: 'number', min: 0, max: 24, default: 4 },
    { key: 'fieldTextSize', attr: 'data-field-text-size', label: 'Text size (px)', kind: 'number', min: 12, max: 24, default: 15 },
    { key: 'labelColor', attr: 'data-label-color', label: 'Label color', kind: 'color', default: '#1f2937' },
    { key: 'labelBold', attr: 'data-label-bold', label: 'Bold labels', kind: 'boolean', default: true },
    { key: 'successColor', attr: 'data-success-color', label: 'Success message', kind: 'color', default: '#047857' },
    { key: 'errorColor', attr: 'data-error-color', label: 'Error message', kind: 'color', default: '#b91c1c' },
    { key: 'fieldSpacing', attr: 'data-field-spacing', label: 'Space between fields (px)', kind: 'number', min: 0, max: 40, default: 12 },
    { key: 'maxWidth', attr: 'data-max-width', label: 'Max width (px, 0 = full)', kind: 'number', min: 0, max: 800, default: 0 },
    {
        key: 'fontFamily', attr: 'data-font-family', label: 'Font', kind: 'choice', default: '',
        choices: [{ value: '', label: "Email's font" }, ...Object.keys(AMP_FORM_FONTS).map(name => ({ value: name, label: name }))],
    },
];

const SETTING_BY_KEY = new Map(AMP_FORM_STYLE_SETTINGS.map(s => [s.key, s]));

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#ABC` → `#aabbcc`: the form a colour picker takes. */
export function normalizeHexColor(value: string): string {
    const v = value.trim().toLowerCase();
    return v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;
}

function checkSetting(setting: AmpFormStyleSetting, value: unknown): string | null {
    switch (setting.kind) {
        case 'color':
            return typeof value === 'string' && HEX_COLOR.test(value.trim())
                ? null : `${setting.key} must be a hex color such as #3b82f6.`;
        case 'number':
            return typeof value === 'number' && Number.isInteger(value) && value >= setting.min && value <= setting.max
                ? null : `${setting.key} must be a whole number from ${setting.min} to ${setting.max}.`;
        case 'boolean':
            return typeof value === 'boolean' ? null : `${setting.key} must be true or false.`;
        case 'choice':
            return typeof value === 'string' && setting.choices.some(c => c.value === value)
                ? null : `${setting.key} must be one of ${setting.choices.filter(c => c.value).map(c => c.value).join(', ')}.`;
    }
}

/** Problems with a `style` object, at paths like `style.buttonColor`. */
export function validateAmpFormStyle(style: unknown, path = 'style'): AmpFormConfigIssue[] {
    if (typeof style !== 'object' || style === null || Array.isArray(style)) {
        return [{ path, message: 'style must be an object of design settings.' }];
    }
    const issues: AmpFormConfigIssue[] = [];
    for (const [key, value] of Object.entries(style)) {
        const setting = SETTING_BY_KEY.get(key as StyleKey);
        if (!setting) {
            issues.push({ path: `${path}.${key}`, message: `"${key}" is not a design setting.` });
            continue;
        }
        if (value === undefined) continue;
        const problem = checkSetting(setting, value);
        if (problem) issues.push({ path: `${path}.${key}`, message: problem });
    }
    return issues;
}

/** Every design setting, with defaults for the unset ones. `style` must be valid. */
export function normalizeAmpFormStyle(style: AmpFormStyle | undefined): NormalizedAmpFormStyle {
    const out: Record<string, unknown> = {};
    for (const setting of AMP_FORM_STYLE_SETTINGS) {
        const value = style?.[setting.key];
        out[setting.key] = value === undefined
            ? setting.default
            : setting.kind === 'color' ? normalizeHexColor(value as string) : value;
    }
    return out as NormalizedAmpFormStyle;
}

/**
 * Only the settings that differ from the default look, or undefined when
 * none do. What gets stored, so a form keeps a short source.
 */
export function compactAmpFormStyle(style: AmpFormStyle): AmpFormStyle | undefined {
    const out: Record<string, unknown> = {};
    for (const setting of AMP_FORM_STYLE_SETTINGS) {
        const value = style[setting.key];
        if (value === undefined) continue;
        const comparable = setting.kind === 'color' ? normalizeHexColor(value as string) : value;
        if (comparable !== setting.default) out[setting.key] = comparable;
    }
    return Object.keys(out).length ? out as AmpFormStyle : undefined;
}

/** A stored attribute value back into its setting's type. A malformed number stays a string, so validation names it. */
export function parseStyleAttribute(setting: AmpFormStyleSetting, raw: string): unknown {
    switch (setting.kind) {
        case 'number': {
            const n = Number(raw.trim());
            return raw.trim() !== '' && Number.isFinite(n) ? n : raw;
        }
        case 'boolean':
            return raw.trim().toLowerCase() !== 'false';
        default:
            return raw.trim();
    }
}

/** The font stack for a font name, or '' for the email's font. */
export function fontStack(name: string): string {
    return AMP_FORM_FONTS[name] ?? '';
}
