import type { AmpPollConfigIssue } from './types';
import { endpointIssue } from '../forms/formValidator';
import { validateAmpFormStyle } from '../forms/formStyle';

export const MIN_POLL_CHOICES = 2;
export const MAX_POLL_CHOICES = 6;

const CONFIG_KEYS = new Set([
    'action', 'question', 'options', 'showResults', 'submitText', 'successMessage',
    'errorMessage', 'submittingMessage', 'fallbackText', 'fallbackUrl', 'style',
]);
const TEXT_KEYS = ['submitText', 'successMessage', 'errorMessage', 'submittingMessage', 'fallbackText'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks a poll config before anything is generated from it. Accepts
 * `unknown` because configs also arrive from stored HTML (pasted, or edited
 * in the source view). Returns every problem; empty means valid.
 */
export function validateAmpPollConfig(config: unknown): AmpPollConfigIssue[] {
    if (!isObject(config)) return [{ path: '', message: 'The poll config must be an object.' }];
    const issues: AmpPollConfigIssue[] = [];

    for (const key of Object.keys(config)) {
        if (CONFIG_KEYS.has(key)) continue;
        issues.push({
            path: key,
            message: /^on[A-Z]/.test(key) || typeof config[key] === 'function'
                ? `"${key}" is not supported: the poll runs in the recipient's email client, where your JavaScript doesn't. Count the votes in your backend at "action".`
                : `"${key}" is not a supported option.`,
        });
    }

    const actionProblem = endpointIssue(config.action);
    if (actionProblem) {
        issues.push({ path: 'action', message: actionProblem.replace('The form needs an endpoint (action): the https URL that receives submissions', 'The poll needs an endpoint (action): the https URL that receives the votes') });
    }
    if (typeof config.question !== 'string' || !config.question.trim()) {
        issues.push({ path: 'question', message: 'The poll needs a question.' });
    }

    const options = config.options;
    if (!Array.isArray(options) || options.length < MIN_POLL_CHOICES || options.length > MAX_POLL_CHOICES) {
        issues.push({ path: 'options', message: `A poll needs ${MIN_POLL_CHOICES} to ${MAX_POLL_CHOICES} choices.` });
    } else {
        const seen = new Set<string>();
        options.forEach((option: unknown, i) => {
            const at = `options[${i}]`;
            if (typeof option !== 'string' || !option.trim()) {
                issues.push({ path: at, message: 'A choice needs text.' });
            } else if (option.includes('|')) {
                issues.push({ path: at, message: `Choice "${option.trim()}" can't contain "|".` });
            } else if (seen.has(option.trim())) {
                issues.push({ path: at, message: `Choice "${option.trim()}" is listed twice.` });
            } else {
                seen.add(option.trim());
            }
        });
    }

    if (config.showResults !== undefined && typeof config.showResults !== 'boolean') {
        issues.push({ path: 'showResults', message: 'showResults must be true or false.' });
    }
    for (const key of TEXT_KEYS) {
        const v = config[key];
        if (v !== undefined && (typeof v !== 'string' || !v.trim())) {
            issues.push({ path: key, message: `${key} must be non-empty text.` });
        }
    }
    if (config.fallbackUrl !== undefined) {
        let protocol: string | null = null;
        try {
            protocol = typeof config.fallbackUrl === 'string' ? new URL(config.fallbackUrl.trim()).protocol : null;
        } catch { /* not a URL */ }
        if (protocol !== 'http:' && protocol !== 'https:') {
            issues.push({ path: 'fallbackUrl', message: 'fallbackUrl must be an http(s) URL.' });
        }
    }
    if (config.style !== undefined) issues.push(...validateAmpFormStyle(config.style));
    return issues;
}
