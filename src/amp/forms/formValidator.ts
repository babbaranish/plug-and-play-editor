import type { AmpFormConfigIssue, AmpFormFieldType } from './types';
import { validateAmpFormStyle } from './formStyle';

export const FIELD_TYPES: readonly AmpFormFieldType[] = ['text', 'email', 'number', 'select', 'textarea'];

const CONFIG_KEYS = new Set([
    'action', 'method', 'fields', 'submitText', 'successMessage', 'errorMessage',
    'submittingMessage', 'fallbackText', 'fallbackUrl', 'style',
]);
const FIELD_KEYS = new Set(['name', 'type', 'label', 'placeholder', 'required', 'options']);
const TEXT_KEYS = ['submitText', 'successMessage', 'errorMessage', 'submittingMessage', 'fallbackText'] as const;

/** Starts with a letter, so it can never be one of AMP's reserved `__amp…` names. */
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_.-]*$/;

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function urlProtocol(value: string): string | null {
    try {
        return new URL(value).protocol;
    } catch {
        return null;
    }
}

/**
 * Placeholder syntax a sender or template language would still have to
 * resolve: `{{key}}`, `{key}`, `%key%`, `[[key]]`, `${key}`. A `%` is only
 * allowed as a percent-escape (`%20`).
 */
const UNRESOLVED_RAW = /[{}]|\[\[|\]\]|\$\{|%(?![0-9a-f]{2})/i;

function hasUnresolvedVariable(action: string): boolean {
    if (UNRESOLVED_RAW.test(action)) return true;
    // Encoded braces, e.g. %7B%7Bkey%7D%7D, are the same variable.
    try {
        return /[{}]/.test(decodeURI(action));
    } catch {
        return false;
    }
}

/**
 * Why `action` can't be a form's endpoint, or null when it can: required,
 * an absolute https URL, fully resolved. Shared by config validation and the
 * editor's form dialog, so both say the same thing.
 */
export function endpointIssue(action: unknown): string | null {
    if (action === undefined || action === null || (typeof action === 'string' && !action.trim())) {
        return 'The form needs an endpoint (action): the https URL that receives submissions.';
    }
    if (typeof action !== 'string') return 'The endpoint (action) must be a URL string.';
    const value = action.trim();
    if (hasUnresolvedVariable(value)) {
        return `The endpoint "${value}" contains an unresolved variable. Use the final https URL; it can't be filled in at send time.`;
    }
    const protocol = urlProtocol(value);
    if (protocol === null) return `The endpoint "${value}" is not a valid absolute URL.`;
    if (protocol === 'http:') return `The endpoint "${value}" uses http. AMP email forms can only post to https.`;
    if (protocol !== 'https:') return `The endpoint "${value}" must be an https URL.`;
    return null;
}

function unsupportedKeys(obj: Record<string, unknown>, allowed: Set<string>, path: string, issues: AmpFormConfigIssue[]): void {
    for (const key of Object.keys(obj)) {
        if (allowed.has(key)) continue;
        const message = /^on[A-Z]/.test(key) || typeof obj[key] === 'function'
            ? `"${key}" is not supported: the form runs in the recipient's email client, where your JavaScript doesn't. Handle submissions in your backend at "action".`
            : `"${key}" is not a supported option.`;
        issues.push({ path: path ? `${path}.${key}` : key, message });
    }
}

function checkOptions(field: Record<string, unknown>, path: string, issues: AmpFormConfigIssue[]): void {
    const options = field.options;
    if (field.type !== 'select') {
        if (options !== undefined) issues.push({ path: `${path}.options`, message: 'Only select fields take options.' });
        return;
    }
    if (!Array.isArray(options) || options.length === 0) {
        issues.push({ path: `${path}.options`, message: 'A select field needs at least one option.' });
        return;
    }
    const values = new Set<string>();
    options.forEach((option: unknown, i) => {
        const at = `${path}.options[${i}]`;
        let value: unknown;
        if (typeof option === 'string') {
            value = option;
        } else if (isObject(option)) {
            unsupportedKeys(option, new Set(['label', 'value']), at, issues);
            if (typeof option.label !== 'string' || !option.label.trim()) {
                issues.push({ path: `${at}.label`, message: 'An option needs a label.' });
            }
            value = option.value;
        } else {
            issues.push({ path: at, message: 'An option is a string or { label, value }.' });
            return;
        }
        if (typeof value !== 'string' || !value.trim()) {
            issues.push({ path: at, message: 'An option needs a non-empty value.' });
        } else if (values.has(value)) {
            issues.push({ path: at, message: `Option value "${value}" is used twice.` });
        } else {
            values.add(value);
        }
    });
}

/**
 * Checks a form config before anything is generated from it. Accepts
 * `unknown` because configs also arrive as JSON (stored on the editor block,
 * pasted, or edited in the source view). Returns every problem; empty means
 * valid.
 */
export function validateAmpFormConfig(config: unknown): AmpFormConfigIssue[] {
    const issues: AmpFormConfigIssue[] = [];
    if (!isObject(config)) {
        return [{ path: '', message: 'The form config must be an object.' }];
    }
    unsupportedKeys(config, CONFIG_KEYS, '', issues);

    const actionProblem = endpointIssue(config.action);
    if (actionProblem) issues.push({ path: 'action', message: actionProblem });

    if (config.method !== undefined && (typeof config.method !== 'string' || config.method.toUpperCase() !== 'POST')) {
        issues.push({ path: 'method', message: 'AMP email forms are sent with POST.' });
    }

    for (const key of TEXT_KEYS) {
        const v = config[key];
        if (v !== undefined && (typeof v !== 'string' || !v.trim())) {
            issues.push({ path: key, message: `${key} must be non-empty text.` });
        }
    }

    if (config.fallbackUrl !== undefined) {
        const url = config.fallbackUrl;
        const protocol = typeof url === 'string' ? urlProtocol(url.trim()) : null;
        if (protocol !== 'http:' && protocol !== 'https:') {
            issues.push({ path: 'fallbackUrl', message: 'fallbackUrl must be an http(s) URL.' });
        }
    }

    if (config.style !== undefined) issues.push(...validateAmpFormStyle(config.style));

    const fields = config.fields;
    if (!Array.isArray(fields) || fields.length === 0) {
        issues.push({ path: 'fields', message: 'The form needs at least one field.' });
        return issues;
    }

    const names = new Set<string>();
    fields.forEach((field: unknown, i) => {
        const path = `fields[${i}]`;
        if (!isObject(field)) {
            issues.push({ path, message: 'A field must be an object.' });
            return;
        }
        unsupportedKeys(field, FIELD_KEYS, path, issues);

        const name = field.name;
        if (typeof name !== 'string' || !name.trim()) {
            issues.push({ path: `${path}.name`, message: 'A field needs a name.' });
        } else if (!FIELD_NAME.test(name)) {
            issues.push({ path: `${path}.name`, message: `Field name "${name}" must start with a letter and use only letters, digits, _ - or .` });
        } else if (names.has(name)) {
            issues.push({ path: `${path}.name`, message: `Field name "${name}" is used twice.` });
        } else {
            names.add(name);
        }

        if (typeof field.type !== 'string' || !FIELD_TYPES.includes(field.type as AmpFormFieldType)) {
            issues.push({ path: `${path}.type`, message: `Field type must be one of ${FIELD_TYPES.join(', ')}.` });
        }
        for (const key of ['label', 'placeholder'] as const) {
            if (field[key] !== undefined && typeof field[key] !== 'string') {
                issues.push({ path: `${path}.${key}`, message: `${key} must be text.` });
            }
        }
        if (field.required !== undefined && typeof field.required !== 'boolean') {
            issues.push({ path: `${path}.required`, message: 'required must be true or false.' });
        }
        checkOptions(field, path, issues);
    });

    return issues;
}
