/**
 * Configuration for an AMP email form. Plain, JSON-serialisable data: it is
 * stored on the form's block in the editor's HTML, and the same object will
 * feed a visual form builder later.
 *
 * There are deliberately no callbacks. The form runs inside the recipient's
 * email client, where none of your JavaScript exists: submissions go to
 * `action` as an AMP form POST, and your backend does the work there.
 */

export type AmpFormFieldType = 'text' | 'email' | 'number' | 'select' | 'textarea';

export interface AmpFormSelectOption {
    readonly label: string;
    readonly value: string;
}

export interface AmpFormField {
    /** Posted field name. Letters, digits, `_`, `-` and `.`, starting with a letter; unique in the form. */
    readonly name: string;
    readonly type: AmpFormFieldType;
    readonly label?: string;
    /** Not used by `select`; there, it becomes a disabled first option instead. */
    readonly placeholder?: string;
    readonly required?: boolean;
    /** Choices for a `select`: strings (label and value alike) or `{ label, value }`. Only for `select`. */
    readonly options?: readonly (string | AmpFormSelectOption)[];
}

/**
 * How a form looks. Every setting is optional; an unset one keeps the
 * default look. Colours are hex (`#d63736`), sizes whole pixels, and the font
 * one of the standard email-safe fonts (see `AMP_FORM_FONTS`), so nothing set
 * here can break the email's CSS.
 */
export interface AmpFormStyle {
    readonly buttonColor?: string;
    readonly buttonTextColor?: string;
    /** Corner radius in px, 0–40. */
    readonly buttonRadius?: number;
    readonly buttonFullWidth?: boolean;
    readonly buttonAlign?: 'left' | 'center' | 'right';
    readonly fieldBorderColor?: string;
    readonly fieldBackground?: string;
    /** Corner radius in px, 0–24. */
    readonly fieldRadius?: number;
    /** Text size of fields and button in px, 12–24. */
    readonly fieldTextSize?: number;
    readonly labelColor?: string;
    readonly labelBold?: boolean;
    readonly successColor?: string;
    readonly errorColor?: string;
    /** Space below each field in px, 0–40. */
    readonly fieldSpacing?: number;
    /** Maximum width of the form in px, 0–800; 0 is the full width. */
    readonly maxWidth?: number;
    /** A font name from `AMP_FORM_FONTS`, e.g. `'Georgia'`. Unset: the email's font. */
    readonly fontFamily?: string;
}

export type NormalizedAmpFormStyle = { readonly [K in keyof AmpFormStyle]-?: NonNullable<AmpFormStyle[K]> };

export interface AmpFormConfig {
    /**
     * The https endpoint that receives submissions (`action-xhr`). It must
     * answer with AMP for Email's CORS headers, and the email must come from a
     * sender registered for AMP email, or clients won't submit.
     */
    readonly action: string;
    /** AMP email forms are posted. Only `'POST'` is accepted. */
    readonly method?: 'POST' | 'post';
    readonly fields: readonly AmpFormField[];
    /** Default `'Submit'`. */
    readonly submitText?: string;
    /** Shown after a successful submission. */
    readonly successMessage?: string;
    /** Shown when the endpoint answers with an error. */
    readonly errorMessage?: string;
    /** Shown while submitting. */
    readonly submittingMessage?: string;
    /**
     * What recipients see in the HTML version of the email, and what the
     * editor shows in the block. AMP forms only work in the AMP version.
     */
    readonly fallbackText?: string;
    /** Optional web version of the form, linked from the HTML version. Must be http(s). */
    readonly fallbackUrl?: string;
    /** How the form looks. Applies to the AMP form and to the HTML version's link. */
    readonly style?: AmpFormStyle;
}

/** A config with defaults filled in and select options as `{ label, value }`. */
export interface NormalizedAmpFormField {
    readonly name: string;
    readonly type: AmpFormFieldType;
    readonly label: string;
    readonly placeholder: string;
    readonly required: boolean;
    readonly options: readonly AmpFormSelectOption[];
}

export interface NormalizedAmpFormConfig {
    readonly action: string;
    readonly method: 'POST';
    readonly fields: readonly NormalizedAmpFormField[];
    readonly submitText: string;
    readonly successMessage: string;
    readonly errorMessage: string;
    readonly submittingMessage: string;
    readonly fallbackText: string;
    readonly fallbackUrl: string;
    readonly style: NormalizedAmpFormStyle;
}

export interface AmpFormConfigIssue {
    /** Where in the config, e.g. `fields[1].name`. Empty for the config as a whole. */
    readonly path: string;
    readonly message: string;
}
