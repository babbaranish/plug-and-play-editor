import type { AmpQuizConfigIssue } from './types';
import { endpointIssue } from '../forms/formValidator';
import { validateAmpFormStyle } from '../forms/formStyle';

export const MAX_QUESTIONS = 20;
export const MIN_CHOICES = 2;
export const MAX_CHOICES = 6;

const CONFIG_KEYS = new Set([
    'questions', 'columns', 'correctMessage', 'wrongMessage', 'scoreText', 'action', 'submitText', 'successMessage',
    'errorMessage', 'submittingMessage', 'fallbackText', 'fallbackUrl', 'fallbackLinkText', 'style',
]);
const QUESTION_KEYS = new Set(['question', 'options', 'answer', 'explanation']);
const TEXT_KEYS = [
    'correctMessage', 'wrongMessage', 'scoreText', 'submitText', 'successMessage',
    'errorMessage', 'submittingMessage', 'fallbackText', 'fallbackLinkText',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unsupportedKeys(obj: Record<string, unknown>, allowed: Set<string>, path: string, issues: AmpQuizConfigIssue[]): void {
    for (const key of Object.keys(obj)) {
        if (allowed.has(key)) continue;
        const message = /^on[A-Z]/.test(key) || typeof obj[key] === 'function'
            ? `"${key}" is not supported: the quiz runs in the recipient's email client, where your JavaScript doesn't. To record answers, give an endpoint (action).`
            : `"${key}" is not a supported option.`;
        issues.push({ path: path ? `${path}.${key}` : key, message });
    }
}

function checkQuestion(q: unknown, path: string, issues: AmpQuizConfigIssue[]): void {
    if (!isObject(q)) {
        issues.push({ path, message: 'A question must be an object.' });
        return;
    }
    unsupportedKeys(q, QUESTION_KEYS, path, issues);

    if (typeof q.question !== 'string' || !q.question.trim()) {
        issues.push({ path: `${path}.question`, message: 'The question needs text.' });
    }
    if (q.explanation !== undefined && typeof q.explanation !== 'string') {
        issues.push({ path: `${path}.explanation`, message: 'explanation must be text.' });
    }

    const options = q.options;
    if (!Array.isArray(options) || options.length < MIN_CHOICES || options.length > MAX_CHOICES) {
        issues.push({ path: `${path}.options`, message: `A question needs ${MIN_CHOICES} to ${MAX_CHOICES} choices.` });
        return;
    }
    const seen = new Set<string>();
    options.forEach((option: unknown, i) => {
        const at = `${path}.options[${i}]`;
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

    if (typeof q.answer !== 'string' || !q.answer.trim()) {
        issues.push({ path: `${path}.answer`, message: 'The question needs a correct answer.' });
    } else if (!seen.has(q.answer.trim())) {
        issues.push({ path: `${path}.answer`, message: `The correct answer "${q.answer.trim()}" must be one of the choices.` });
    }
}

/**
 * Checks a quiz config before anything is generated from it. Accepts
 * `unknown` because configs also arrive from stored HTML (pasted, or edited
 * in the source view). Returns every problem; empty means valid.
 */
export function validateAmpQuizConfig(config: unknown): AmpQuizConfigIssue[] {
    if (!isObject(config)) return [{ path: '', message: 'The quiz config must be an object.' }];
    const issues: AmpQuizConfigIssue[] = [];
    unsupportedKeys(config, CONFIG_KEYS, '', issues);

    // Optional: without it the quiz still works, it just isn't recorded.
    if (config.action !== undefined && config.action !== '') {
        const problem = endpointIssue(config.action);
        if (problem) issues.push({ path: 'action', message: problem.replace('The form needs', 'The quiz needs') });
    }

    if (config.columns !== undefined && config.columns !== 1 && config.columns !== 2 && config.columns !== 3) {
        issues.push({ path: 'columns', message: 'columns (choices per row) must be 1, 2 or 3.' });
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

    const questions = config.questions;
    if (!Array.isArray(questions) || questions.length === 0) {
        issues.push({ path: 'questions', message: 'The quiz needs at least one question.' });
    } else if (questions.length > MAX_QUESTIONS) {
        issues.push({ path: 'questions', message: `A quiz can have at most ${MAX_QUESTIONS} questions.` });
    } else {
        questions.forEach((q: unknown, i) => checkQuestion(q, `questions[${i}]`, issues));
    }
    return issues;
}
