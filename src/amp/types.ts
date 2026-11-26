/**
 * Types for converting the editor's HTML into an AMP for Email document.
 *
 * Division of labour: transformers rewrite what they can and report each
 * change as a `warning`. Whatever is still wrong afterwards is reported as an
 * `error` by validation, so every remaining problem is reported once.
 */

export type AmpIssueSeverity = 'error' | 'warning';

export type AmpIssueCode =
    // Reported by transformers (something was changed)
    | 'embed-replaced'
    | 'link-in-page-removed'
    | 'link-relative-removed'
    | 'link-unsafe-removed'
    | 'element-removed'
    | 'element-unwrapped'
    | 'attribute-removed'
    | 'css-important-removed'
    | 'css-unsafe-removed'
    // Reported by validation (still wrong in the output)
    | 'invalid-element'
    | 'invalid-attribute'
    | 'invalid-url'
    | 'missing-destination'
    | 'image-missing-size'
    | 'image-invalid-src'
    | 'invalid-accordion'
    | 'form-invalid'
    | 'quiz-invalid'
    | 'feedback-invalid'
    | 'poll-invalid'
    | 'css-important'
    | 'css-unsafe'
    | 'css-too-large';

export interface AmpIssue {
    readonly severity: AmpIssueSeverity;
    readonly code: AmpIssueCode;
    readonly message: string;
    /** The start of the element's markup, to help find it in the content. */
    readonly snippet?: string;
}

export interface ImageSize {
    readonly width: number;
    readonly height: number;
}

/** A pass over the parsed content. It may mutate `root` and report issues through `ctx`. */
export type AmpTransformer = (root: DocumentFragment, ctx: AmpContext) => void;

export interface ToAmpEmailOptions {
    /**
     * The Document used to parse and build nodes. Defaults to the global
     * `document`; pass a jsdom / happy-dom document to convert on a server.
     */
    document?: Document;
    /** CSS for the document's `<style amp-custom>` element. */
    css?: string;
    /**
     * The variable delimiters the content uses, e.g. `DELIMITER_MAP['double-curly']`.
     * Defaults to `['{{', '}}']`. A value that is a whole variable is left for
     * the sender to substitute.
     */
    tokenDelimiters?: readonly [string, string];
    /**
     * Supplies an image's intrinsic size when the markup doesn't carry it.
     * `<amp-img>` cannot be rendered without a width and a height.
     */
    getImageSize?: (src: string) => ImageSize | null | undefined;
    /** Extra passes for custom blocks. They run before the built-in transformers. */
    transformers?: readonly AmpTransformer[];
}

export interface ResolvedAmpOptions {
    readonly css: string;
    readonly delimiters: readonly [string, string];
    readonly getImageSize?: (src: string) => ImageSize | null | undefined;
}

export interface AmpContext {
    readonly doc: Document;
    readonly options: ResolvedAmpOptions;
    report(severity: AmpIssueSeverity, code: AmpIssueCode, message: string, el?: Element): void;
    /**
     * Marks `el` and everything inside it as finished AMP markup (e.g. a
     * generated form): the general clean-up pass leaves it as it is.
     * Validation still checks it.
     */
    finalize(el: Element): void;
    /** Whether `node` is, or is inside, an element passed to {@link finalize}. */
    isFinalized(node: Node): boolean;
}

export interface AmpCssStats {
    /** Bytes of `<style amp-custom>`. */
    readonly stylesheetBytes: number;
    /** Bytes of every `style` attribute. */
    readonly inlineBytes: number;
    readonly totalBytes: number;
    /** The AMP for Email limit on `totalBytes`. */
    readonly limit: number;
}

export interface AmpEmailResult {
    /** The complete AMP document, ready to send as the `text/x-amp-html` MIME part. */
    readonly html: string;
    /** True when validation found no errors. */
    readonly valid: boolean;
    readonly issues: readonly AmpIssue[];
    readonly css: AmpCssStats;
    /** AMP extensions the document loads, e.g. `['amp-accordion']`. */
    readonly extensions: readonly string[];
}
