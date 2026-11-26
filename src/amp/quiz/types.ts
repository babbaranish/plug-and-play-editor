/**
 * Configuration for an AMP email quiz. Plain, JSON-serialisable data, stored
 * on the quiz's block in the editor's HTML.
 *
 * The quiz runs in the recipient's email client with AMP's own components
 * (amp-selector and amp-bind): picking a choice locks the question, shows
 * whether it was right, and once every question is answered the score shows.
 * No server is needed for that. Give `action` to also record the answers.
 */

import type { AmpFormStyle, NormalizedAmpFormStyle } from '../forms/types';

export interface AmpQuizQuestion {
    readonly question: string;
    /** 2–6 choices, each unique within the question. A choice can't contain `|` (the stored separator). */
    readonly options: readonly string[];
    /** The correct choice: exactly one of `options`. */
    readonly answer: string;
    /** Shown under the question once it is answered, right or wrong. */
    readonly explanation?: string;
}

export interface AmpQuizConfig {
    /** 1–20 questions. */
    readonly questions: readonly AmpQuizQuestion[];
    /**
     * Choices per row: 1 (a list, the default), 2 or 3 (a grid). A grid
     * keeps its columns on narrow screens too, so 3 suits short choices.
     */
    readonly columns?: 1 | 2 | 3;
    /** Shown under a question answered right. Default `'Correct!'`. */
    readonly correctMessage?: string;
    /** Shown under a question answered wrong, followed by "The answer is …". Default `'Not quite.'`. */
    readonly wrongMessage?: string;
    /** Shown before the score once every question is answered: "Your score: 2 / 3". Default `'Your score:'`. */
    readonly scoreText?: string;
    /**
     * Optional https endpoint that records the answers. When set, the quiz
     * gets a submit button (enabled once every question is answered) that
     * posts `q1`, `q2`, … (the number of the choice picked, from 1), `score`
     * and `total`. Same rules as a form's endpoint: absolute https, no
     * variables, AMP for Email CORS headers, registered sender.
     */
    readonly action?: string;
    /** Submit button text when `action` is set. Default `'Submit answers'`. */
    readonly submitText?: string;
    readonly successMessage?: string;
    readonly errorMessage?: string;
    readonly submittingMessage?: string;
    /** What recipients of the HTML version see, and what the editor shows in the block. */
    readonly fallbackText?: string;
    /** Optional web version of the quiz, linked from the HTML version. Must be http(s). */
    readonly fallbackUrl?: string;
    /** Text of that link. Default `'Take the quiz'`. */
    readonly fallbackLinkText?: string;
    /**
     * How the quiz looks: the same design settings as forms. The choices use
     * the field settings, the questions the label settings, the feedback the
     * success and error colours.
     */
    readonly style?: AmpFormStyle;
}

export interface NormalizedAmpQuizQuestion {
    readonly question: string;
    readonly options: readonly string[];
    readonly answer: string;
    /** Position of `answer` in `options`, from 0. */
    readonly answerIndex: number;
    readonly explanation: string;
}

export interface NormalizedAmpQuizConfig {
    readonly questions: readonly NormalizedAmpQuizQuestion[];
    readonly columns: 1 | 2 | 3;
    readonly correctMessage: string;
    readonly wrongMessage: string;
    readonly scoreText: string;
    /** '' when answers aren't recorded. */
    readonly action: string;
    readonly submitText: string;
    readonly successMessage: string;
    readonly errorMessage: string;
    readonly submittingMessage: string;
    readonly fallbackText: string;
    readonly fallbackUrl: string;
    readonly fallbackLinkText: string;
    readonly style: NormalizedAmpFormStyle;
}

export interface AmpQuizConfigIssue {
    /** Where in the config, e.g. `questions[1].answer`. Empty for the config as a whole. */
    readonly path: string;
    readonly message: string;
}
