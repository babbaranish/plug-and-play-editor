import type { AmpFeedbackConfigIssue, AmpFeedbackScale } from './types';
import { endpointIssue } from '../forms/formValidator';
import { validateAmpFormStyle } from '../forms/formStyle';

export const FEEDBACK_SCALES: readonly AmpFeedbackScale[] = ['stars', 'emoji', '1-5', '1-10', 'thumbs'];
export const MAX_FEEDBACK_QUESTIONS = 10;

const CONFIG_KEYS = new Set([
    'action', 'questions', 'comment', 'commentLabel', 'commentPlaceholder', 'commentRequired',
    'submitText', 'successMessage', 'errorMessage', 'submittingMessage',
    'fallbackText', 'fallbackUrl', 'fallbackLinkText', 'style',
]);
const QUESTION_KEYS = new Set(['question', 'scale', 'lowLabel', 'highLabel', 'name', 'required']);
const TEXT_KEYS = [
    'commentLabel', 'commentPlaceholder', 'submitText', 'successMessage',
    'errorMessage', 'submittingMessage', 'fallbackText', 'fallbackLinkText',
] as const;

/** Starts with a letter, so it can never be one of AMP's reserved `__amp…` names. */
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_.-]*$/;

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unsupportedKeys(obj: Record<string, unknown>, allowed: Set<string>, path: string, issues: AmpFeedbackConfigIssue[]): void {
    for (const key of Object.keys(obj)) {
        if (allowed.has(key)) continue;
        issues.push({
            path: path ? `${path}.${key}` : key,
            message: /^on[A-Z]/.test(key) || typeof obj[key] === 'function'
                ? `"${key}" is not supported: the feedback block runs in the recipient's email client, where your JavaScript doesn't. Handle the feedback in your backend at "action".`
                : `"${key}" is not a supported option.`,
        });
    }
}

function checkQuestion(q: unknown, i: number, names: Set<string>, issues: AmpFeedbackConfigIssue[]): void {
    const path = `questions[${i}]`;
    if (!isObject(q)) {
        issues.push({ path, message: 'A question must be an object.' });
        return;
    }
    unsupportedKeys(q, QUESTION_KEYS, path, issues);
    if (typeof q.question !== 'string' || !q.question.trim()) {
        issues.push({ path: `${path}.question`, message: 'The question needs text, e.g. "How was the delivery?".' });
    }
    if (q.scale !== undefined && !FEEDBACK_SCALES.includes(q.scale as AmpFeedbackScale)) {
        issues.push({ path: `${path}.scale`, message: `The rating must be one of ${FEEDBACK_SCALES.join(', ')}.` });
    }
    for (const key of ['lowLabel', 'highLabel'] as const) {
        const v = q[key];
        if (v !== undefined && (typeof v !== 'string' || !v.trim())) {
            issues.push({ path: `${path}.${key}`, message: `${key} must be non-empty text.` });
        }
    }
    if (q.required !== undefined && typeof q.required !== 'boolean') {
        issues.push({ path: `${path}.required`, message: 'required must be true or false.' });
    }
    // The default name is by position; a given one must be a valid, unused field name.
    const name = q.name === undefined ? `rating${i + 1}` : q.name;
    if (typeof name !== 'string' || !FIELD_NAME.test(name)) {
        issues.push({ path: `${path}.name`, message: `Field name "${String(name)}" must start with a letter and use only letters, digits, _ - or .` });
    } else if (name === 'comment') {
        issues.push({ path: `${path}.name`, message: 'Field name "comment" is used by the comment box.' });
    } else if (names.has(name)) {
        issues.push({ path: `${path}.name`, message: `Field name "${name}" is used twice.` });
    } else {
        names.add(name);
    }
}

/**
 * Checks a feedback config before anything is generated from it. Accepts
 * `unknown` because configs also arrive from stored HTML (pasted, or edited
 * in the source view). Returns every problem; empty means valid.
 */
export function validateAmpFeedbackConfig(config: unknown): AmpFeedbackConfigIssue[] {
    if (!isObject(config)) return [{ path: '', message: 'The feedback config must be an object.' }];
    const issues: AmpFeedbackConfigIssue[] = [];
    unsupportedKeys(config, CONFIG_KEYS, '', issues);

    const actionProblem = endpointIssue(config.action);
    if (actionProblem) {
        issues.push({ path: 'action', message: actionProblem.replace('The form needs an endpoint (action): the https URL that receives submissions', 'The feedback block needs an endpoint (action): the https URL that receives the feedback') });
    }

    for (const key of TEXT_KEYS) {
        const v = config[key];
        if (v !== undefined && (typeof v !== 'string' || !v.trim())) {
            issues.push({ path: key, message: `${key} must be non-empty text.` });
        }
    }
    for (const key of ['comment', 'commentRequired'] as const) {
        if (config[key] !== undefined && typeof config[key] !== 'boolean') {
            issues.push({ path: key, message: `${key} must be true or false.` });
        }
    }
    if (config.commentRequired === true && config.comment === false) {
        issues.push({ path: 'commentRequired', message: 'A comment can only be required when the block asks for one.' });
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

    const questions = config.questions;
    if (!Array.isArray(questions) || questions.length === 0) {
        issues.push({ path: 'questions', message: 'The feedback block needs at least one rating question.' });
    } else if (questions.length > MAX_FEEDBACK_QUESTIONS) {
        issues.push({ path: 'questions', message: `A feedback block can have at most ${MAX_FEEDBACK_QUESTIONS} rating questions.` });
    } else {
        const names = new Set<string>();
        questions.forEach((q: unknown, i) => checkQuestion(q, i, names, issues));
    }
    return issues;
}
