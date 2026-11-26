/**
 * Configuration for an AMP email feedback block: one or more rating
 * questions (each with its own scale: stars, emoji, 1–5 or 1–10 numbers, or thumbs), an
 * optional comment and one send button. Plain, JSON-serialisable data,
 * stored on the block in the editor's HTML.
 *
 * It posts each question's rating under its `name` (default `rating1`,
 * `rating2`, …) and, when asked for, `comment` to `action` as an AMP form.
 * There are no callbacks: the block runs in the recipient's email client,
 * where your JavaScript doesn't.
 */

import type { AmpFormStyle, NormalizedAmpFormStyle } from '../forms/types';

/**
 * - `stars`: ★ 1–5
 * - `emoji`: 😠 🙁 😐 🙂 😍, posted as 1–5
 * - `1-5`: numbered boxes 1–5
 * - `1-10`: numbered boxes 1–10
 * - `thumbs`: 👍 / 👎, posted as 1 / 0
 */
export type AmpFeedbackScale = 'stars' | 'emoji' | '1-5' | '1-10' | 'thumbs';

export interface AmpFeedbackQuestion {
    /** The question above the rating, e.g. "How was the delivery?". */
    readonly question: string;
    /** Default `'stars'`. */
    readonly scale?: AmpFeedbackScale;
    /** Under the low end of the scale, e.g. "Not likely". Not for `thumbs`. */
    readonly lowLabel?: string;
    /** Under the high end of the scale, e.g. "Very likely". Not for `thumbs`. */
    readonly highLabel?: string;
    /**
     * The field the rating is posted as. Letters, digits, `_`, `-` and `.`,
     * starting with a letter; unique in the block, and not `comment`.
     * Default `rating1`, `rating2`, … by position.
     */
    readonly name?: string;
    /** Whether it must be rated before sending. Default `true`. */
    readonly required?: boolean;
}

export interface AmpFeedbackConfig {
    /** The https endpoint that receives the feedback. Same rules as a form's. */
    readonly action: string;
    /** 1–10 rating questions, sent together with one button. */
    readonly questions: readonly AmpFeedbackQuestion[];
    /** Whether to ask for a comment too. Default `true`. */
    readonly comment?: boolean;
    /** Default `'Anything else you would like to tell us?'`. */
    readonly commentLabel?: string;
    readonly commentPlaceholder?: string;
    /** Whether the comment must be filled in. Default `false`. */
    readonly commentRequired?: boolean;
    /** Default `'Send feedback'`. */
    readonly submitText?: string;
    readonly successMessage?: string;
    readonly errorMessage?: string;
    readonly submittingMessage?: string;
    /** What recipients of the HTML version see, and what the editor shows in the block. */
    readonly fallbackText?: string;
    /** Optional web feedback page, linked from the HTML version. Must be http(s). */
    readonly fallbackUrl?: string;
    /** Text of that link. Default `'Give feedback'`. */
    readonly fallbackLinkText?: string;
    /** The same design settings as forms. */
    readonly style?: AmpFormStyle;
}

export interface NormalizedAmpFeedbackQuestion {
    readonly question: string;
    readonly scale: AmpFeedbackScale;
    readonly lowLabel: string;
    readonly highLabel: string;
    readonly name: string;
    readonly required: boolean;
}

export interface NormalizedAmpFeedbackConfig {
    readonly action: string;
    readonly questions: readonly NormalizedAmpFeedbackQuestion[];
    readonly comment: boolean;
    readonly commentLabel: string;
    readonly commentPlaceholder: string;
    readonly commentRequired: boolean;
    readonly submitText: string;
    readonly successMessage: string;
    readonly errorMessage: string;
    readonly submittingMessage: string;
    readonly fallbackText: string;
    readonly fallbackUrl: string;
    readonly fallbackLinkText: string;
    readonly style: NormalizedAmpFormStyle;
}

export interface AmpFeedbackConfigIssue {
    /** Where in the config, e.g. `questions[1].scale`. Empty for the config as a whole. */
    readonly path: string;
    readonly message: string;
}
