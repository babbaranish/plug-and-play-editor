/**
 * Runs converter output through the official AMP validator (AMP4EMAIL).
 *
 * It downloads the validator from cdn.ampproject.org, so it only runs with
 * `npm run test:amp` (vitest --mode amp-validator), not in the offline
 * `npm test`.
 *
 * Variables are substituted first, as a sender does before sending: the
 * validator would otherwise see `href="{{pay_link}}"` as a relative URL.
 */
import { describe, it, expect, beforeAll } from 'vitest';
// @ts-expect-error amphtml-validator ships no types
import amphtmlValidator from 'amphtml-validator';
import { toAmpEmail } from './index';
import { renderAmpFormBlock } from './forms/formRenderer';
import type { AmpFormConfig } from './forms/types';
import { generateButtonHtmlForTest } from '../plugins/button-block';
import { Editor } from '../core/Editor';
import { AmpFormPlugin, addAmpForm } from '../plugins/amp-form';
import { renderAmpQuizBlock } from './quiz/quizRenderer';
import type { AmpQuizConfig } from './quiz/types';
import { renderAmpFeedbackBlock } from './feedback/feedbackRenderer';
import type { AmpFeedbackConfig } from './feedback/types';
import { renderAmpPollBlock } from './poll/pollRenderer';
import type { AmpPollConfig } from './poll/types';

const poll: AmpPollConfig = { action: 'https://example.com/api/poll', question: 'Which day? "Honestly" & <odd>', options: ['Monday', "Friday, after lunch", "Don't mind"] };

const feedback: AmpFeedbackConfig = { action: 'https://example.com/api/feedback', questions: [{ question: "How was it? \"Honestly\" & <odd>" }] };

interface ValidationResult {
    status: 'PASS' | 'FAIL';
    errors: { severity: string; line: number; col: number; message: string }[];
}
interface Validator {
    validateString(html: string, format: string): ValidationResult;
}

const SAMPLE_VALUES: Record<string, string> = {
    pay_link: 'https://pay.example.com/abc',
    first_name: 'Alice',
};

function substitute(html: string): string {
    return html.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (whole, key: string) => SAMPLE_VALUES[key] ?? whole);
}

const subscribe: AmpFormConfig = {
    action: 'https://example.com/api/subscribe',
    method: 'POST',
    fields: [
        { name: 'email', type: 'email', label: 'Email Address', placeholder: 'Enter your email', required: true },
        { name: 'name', type: 'text', label: 'Full Name', placeholder: 'Enter your name', required: true },
    ],
    submitText: 'Subscribe',
    successMessage: 'Successfully subscribed!',
    errorMessage: 'Something went wrong!',
};

const everyField: AmpFormConfig = {
    action: 'https://example.com/api/feedback',
    fields: [
        { name: 'email', type: 'email', label: 'Email', required: true },
        { name: 'age', type: 'number', label: 'Age', placeholder: '30' },
        { name: 'plan', type: 'select', label: 'Plan', placeholder: 'Choose…', required: true, options: ['Basic', { label: 'Pro', value: 'pro' }] },
        { name: 'comments', type: 'textarea', label: 'Comments', placeholder: 'Tell us more' },
        { name: 'nickname', type: 'text' },
    ],
    fallbackUrl: 'https://example.com/feedback',
};

const button = generateButtonHtmlForTest({
    text: 'Pay now', url: 'https://pay.test/abc', paddingV: 12, paddingH: 24,
    textColor: '#ffffff', bgColor: '#d63736', borderRadius: 4, hrefToken: 'pay_link',
} as Parameters<typeof generateButtonHtmlForTest>[0]);

const quiz: AmpQuizConfig = {
    questions: [
        { question: 'What is the capital of France?', options: ['London', 'Paris', 'Berlin'], answer: 'Paris' },
        { question: "It's \"quoted\" & <odd>", options: ['Yes, always', "Don't know"], answer: "Don't know", explanation: 'Because.' },
    ],
};

const CASES: Record<string, string> = {
    'a poll': renderAmpPollBlock(poll, document).outerHTML,
    'a poll without results, six choices, a web poll and every design setting': renderAmpPollBlock({
        ...poll, options: ['A', 'B', 'C', 'D', 'E', 'F'], showResults: false, fallbackUrl: 'https://example.com/poll?src=email',
        style: {
            buttonColor: '#d63736', buttonRadius: 20, buttonFullWidth: true, buttonAlign: 'center',
            fieldBorderColor: '#999999', fieldBackground: '#fafafa', fieldRadius: 8, fieldTextSize: 17,
            labelColor: '#333333', labelBold: false, successColor: '#006600', errorColor: '#990000',
            fieldSpacing: 20, maxWidth: 480, fontFamily: 'Georgia',
        },
    }, document).outerHTML,
    'two polls next to feedback': renderAmpPollBlock(poll, document).outerHTML + renderAmpPollBlock(poll, document).outerHTML +
        renderAmpFeedbackBlock(feedback, document).outerHTML,
    'feedback with stars': renderAmpFeedbackBlock(feedback, document).outerHTML,
    'feedback with emoji, no comment': renderAmpFeedbackBlock({ ...feedback, questions: [{ question: 'Q', scale: 'emoji' }], comment: false }, document).outerHTML,
    'feedback with every rating style in one block, a required comment and every design setting': renderAmpFeedbackBlock({
        ...feedback,
        questions: [
            { question: 'Delivery?', scale: 'emoji', name: 'delivery' },
            { question: 'Product?', scale: 'stars', name: 'product' },
            { question: 'Recommend us?', scale: '1-10', lowLabel: 'Not likely', highLabel: 'Very likely', name: 'recommend', required: false },
            { question: 'Order again?', scale: 'thumbs', name: 'again' },
            { question: 'Packaging?', scale: '1-5', lowLabel: 'Poor', highLabel: 'Great', name: 'packaging' },
            { question: 'Price?', scale: '1-10', name: 'price' },
        ],
        commentRequired: true, commentPlaceholder: 'Why?',
        fallbackUrl: 'https://example.com/feedback',
        style: {
            buttonColor: '#d63736', buttonRadius: 20, buttonFullWidth: true, buttonAlign: 'center',
            fieldBorderColor: '#999999', fieldBackground: '#fafafa', fieldRadius: 8, fieldTextSize: 17,
            labelColor: '#333333', labelBold: false, successColor: '#006600', errorColor: '#990000',
            fieldSpacing: 20, maxWidth: 480, fontFamily: 'Verdana',
        },
    }, document).outerHTML,
    'feedback with thumbs, next to a quiz and a form': renderAmpFeedbackBlock({ ...feedback, questions: [{ question: 'Q', scale: 'thumbs' }] }, document).outerHTML +
        renderAmpQuizBlock({ questions: [{ question: 'Q', options: ['A', 'B'], answer: 'A' }] }, document).outerHTML +
        renderAmpFormBlock(subscribe, document).outerHTML,
    'a quiz': renderAmpQuizBlock(quiz, document).outerHTML,
    'a quiz that records answers, with every design setting': renderAmpQuizBlock({
        ...quiz,
        columns: 3,
        action: 'https://example.com/api/quiz',
        fallbackUrl: 'https://example.com/quiz',
        style: {
            buttonColor: '#d63736', buttonRadius: 20, buttonFullWidth: true, buttonAlign: 'center',
            fieldBorderColor: '#999999', fieldBackground: '#fafafa', fieldRadius: 8, fieldTextSize: 17,
            labelColor: '#333333', labelBold: false, successColor: '#006600', errorColor: '#990000',
            fieldSpacing: 20, maxWidth: 480, fontFamily: 'Georgia',
        },
    }, document).outerHTML,
    'two quizzes and a form': renderAmpQuizBlock(quiz, document).outerHTML +
        renderAmpFormBlock(subscribe, document).outerHTML +
        renderAmpQuizBlock({ questions: [{ question: 'Q', options: ['A', 'B'], answer: 'B' }], columns: 2 }, document).outerHTML,
    'the proposed subscribe form': renderAmpFormBlock(subscribe, document).outerHTML,
    'every field type': renderAmpFormBlock(everyField, document).outerHTML,
    'two forms': renderAmpFormBlock(subscribe, document).outerHTML + renderAmpFormBlock(everyField, document).outerHTML,
    'a template without forms': '<h2>News</h2><p>Read <a href="https://example.com">more</a>.</p><ul><li>One</li><li>Two</li></ul>',
    'a form with every design setting': renderAmpFormBlock({
        ...everyField,
        style: {
            buttonColor: '#d63736', buttonTextColor: '#ffffff', buttonRadius: 20, buttonFullWidth: true, buttonAlign: 'center',
            fieldBorderColor: '#999999', fieldBackground: '#fafafa', fieldRadius: 8, fieldTextSize: 17,
            labelColor: '#333333', labelBold: false, successColor: '#006600', errorColor: '#990000',
            fieldSpacing: 20, maxWidth: 480, fontFamily: 'Times New Roman',
        },
    }, document).outerHTML,
    'a typical email with a form': `
        <h2>Welcome, <span class="play-editor-token" contenteditable="false" data-token="first_name">{{first_name}}</span></h2>
        <p style="line-height: 1.8">Thanks for joining <strong>Acme</strong>. <a href="https://acme.test/start" target="_blank" rel="noopener noreferrer">Get started</a>.</p>
        <p><img src="https://cdn.test/hero.png" style="max-width: 100%; height: 300px; width: 600px; border-radius: 6px"></p>
        ${button}
        <table class="play-editor-table" cellpadding="4" width="100%"><tbody><tr><td valign="top">Plan</td><td>Pro</td></tr></tbody></table>
        <details class="play-editor-accordion" open><summary class="play-editor-accordion-title">FAQ</summary><div class="play-editor-accordion-content"><p>Answer</p></div></details>
        ${renderAmpFormBlock(subscribe, document).outerHTML}
        <div class="play-editor-page-break" contenteditable="false"><span>Page Break</span></div>
        <p><font color="#ff0000">legacy</font> <strike>old</strike> <time datetime="2026-11-23">today</time></p>`,
};

describe.runIf(import.meta.env.MODE === 'amp-validator')('official AMP4EMAIL validator', () => {
    let validator: Validator;

    beforeAll(async () => {
        validator = await amphtmlValidator.getInstance();
    }, 60_000);

    it('passes: forms added with addAmpForm, each posting to its own endpoint', () => {
        const ta = document.createElement('textarea');
        ta.value = '<p>Two forms</p>';
        document.body.appendChild(ta);
        const editor = new Editor(ta, [AmpFormPlugin]);
        try {
            addAmpForm(editor, subscribe);
            addAmpForm(editor, { ...everyField, action: 'https://example.com/api/feedback?src=email' });
            const result = toAmpEmail(editor.getContent());
            const forms = Array.from(result.html.matchAll(/<form [^>]*>/g)).map(m => m[0]);
            expect(forms).toEqual([
                '<form method="post" action-xhr="https://example.com/api/subscribe">',
                '<form method="post" action-xhr="https://example.com/api/feedback?src=email">',
            ]);
            const official = validator.validateString(substitute(result.html), 'AMP4EMAIL');
            expect(official.errors.map(e => `L${e.line}:${e.col} ${e.message}`)).toEqual([]);
            expect(official.status).toBe('PASS');
        } finally {
            editor.destroy();
            ta.remove();
        }
    });

    for (const [name, html] of Object.entries(CASES)) {
        it(`passes: ${name}`, () => {
            const result = toAmpEmail(html, { css: 'p { margin: 0 0 12px; }' });
            expect(result.issues.filter(i => i.severity === 'error')).toEqual([]);
            const official = validator.validateString(substitute(result.html), 'AMP4EMAIL');
            expect(official.errors.map(e => `L${e.line}:${e.col} ${e.message}`)).toEqual([]);
            expect(official.status).toBe('PASS');
        });
    }
});
