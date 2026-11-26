/**
 * Configuration for an AMP email poll: one question, 2–6 choices, a vote
 * button. Plain, JSON-serialisable data, stored on the block in the editor's
 * HTML.
 *
 * Voting posts `choice` (the text of the choice picked) to `action` as an
 * AMP form. To show results, the endpoint answers with
 * `{ "results": [62, 38] }`: one percentage (0–100) per choice, in order.
 * The poll then shows each choice's percentage and a bar. There are no
 * callbacks: the poll runs in the recipient's email client, where your
 * JavaScript doesn't.
 */

import type { AmpFormStyle, NormalizedAmpFormStyle } from '../forms/types';

export interface AmpPollConfig {
    /** The https endpoint that receives votes (and answers with results). Same rules as a form's. */
    readonly action: string;
    readonly question: string;
    /** 2–6 choices, each unique. A choice can't contain `|` (the stored separator). */
    readonly options: readonly string[];
    /** Show the results the endpoint answers with. Default `true`. */
    readonly showResults?: boolean;
    /** Default `'Vote'`. */
    readonly submitText?: string;
    /** Shown after voting. Default `'Thanks for voting!'`. */
    readonly successMessage?: string;
    readonly errorMessage?: string;
    readonly submittingMessage?: string;
    /** What recipients of the HTML version see above the choices. */
    readonly fallbackText?: string;
    /**
     * Optional web poll. In the HTML version, each choice links to it with
     * `?choice=<choice>` added, so recipients without AMP vote with one click.
     * Must be http(s).
     */
    readonly fallbackUrl?: string;
    /** The same design settings as forms. */
    readonly style?: AmpFormStyle;
}

export interface NormalizedAmpPollConfig {
    readonly action: string;
    readonly question: string;
    readonly options: readonly string[];
    readonly showResults: boolean;
    readonly submitText: string;
    readonly successMessage: string;
    readonly errorMessage: string;
    readonly submittingMessage: string;
    readonly fallbackText: string;
    readonly fallbackUrl: string;
    readonly style: NormalizedAmpFormStyle;
}

export interface AmpPollConfigIssue {
    /** Where in the config, e.g. `options[1]`. Empty for the config as a whole. */
    readonly path: string;
    readonly message: string;
}
