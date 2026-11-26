import type { AmpContext, AmpEmailResult, AmpIssue, AmpTransformer, ResolvedAmpOptions, ToAmpEmailOptions } from './types';
import { parseHtml, snippetOf } from './utils/parseHtml';
import { collectCss } from './utils/collectCss';
import { findExtensions, serializeHtml } from './utils/serializeHtml';
import { validateAmp } from './validation/validateAmp';
import { validateCss } from './validation/validateCss';
import { transformForms } from './transformers/transformForms';
import { transformQuizzes } from './transformers/transformQuizzes';
import { transformFeedback } from './transformers/transformFeedback';
import { transformPolls } from './transformers/transformPolls';
import { transformButtons } from './transformers/transformButtons';
import { transformEmbeds } from './transformers/transformEmbeds';
import { transformImages } from './transformers/transformImages';
import { transformAccordions } from './transformers/transformAccordions';
import { transformLinks } from './transformers/transformLinks';
import { transformElements } from './transformers/transformElements';

/**
 * Built-in passes, in order. Forms, quizzes, feedback blocks and polls run
 * first and mark their output final. Embeds run before images (a YouTube thumbnail is an <img>),
 * and the general element pass runs last, once the block passes have read
 * the editor's classes and attributes.
 */
export const BUILT_IN_TRANSFORMERS: readonly AmpTransformer[] = [
    transformForms,
    transformQuizzes,
    transformFeedback,
    transformPolls,
    transformButtons,
    transformEmbeds,
    transformImages,
    transformAccordions,
    transformLinks,
    transformElements,
];

/** Temporary marker for markup a transformer finished; never in the output. */
const FINAL_ATTR = 'data-pe-amp-final';

function clearFinalMarks(root: DocumentFragment): void {
    root.querySelectorAll(`[${FINAL_ATTR}]`).forEach(el => el.removeAttribute(FINAL_ATTR));
}

/**
 * Converts the editor's HTML (`editor.getContent()`, or stored HTML) into an
 * AMP for Email document, to send as the `text/x-amp-html` part next to the
 * HTML part. Does not need an editor instance.
 *
 * Variables are left in place for the sender to substitute. To check the
 * result with real values, substitute them first.
 */
export function toAmpEmail(html: string, options: ToAmpEmailOptions = {}): AmpEmailResult {
    const doc = options.document ?? document;
    const resolved: ResolvedAmpOptions = {
        css: options.css ?? '',
        delimiters: options.tokenDelimiters ?? ['{{', '}}'],
        getImageSize: options.getImageSize,
    };

    const issues: AmpIssue[] = [];
    const ctx: AmpContext = {
        doc,
        options: resolved,
        report(severity, code, message, el) {
            issues.push(el ? { severity, code, message, snippet: snippetOf(el) } : { severity, code, message });
        },
        // Finished markup is marked with an attribute and found with closest(),
        // which follows the tree itself. Object identity and contains() are not
        // reliable across DOMs: happy-dom's contains() is wrong for a <form>
        // moved into a template's content.
        finalize(el) {
            el.setAttribute(FINAL_ATTR, '');
        },
        isFinalized(node) {
            const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
            return el?.closest(`[${FINAL_ATTR}]`) != null;
        },
    };

    const root = parseHtml(html, doc);
    // Only a transformer may mark markup final; content can't claim it.
    clearFinalMarks(root);
    for (const transform of [...(options.transformers ?? []), ...BUILT_IN_TRANSFORMERS]) {
        transform(root, ctx);
    }
    clearFinalMarks(root);

    const css = collectCss(root, resolved.css);
    validateAmp(root, ctx);
    validateCss(root, resolved.css, css, ctx);

    const extensions = findExtensions(root);
    return {
        html: serializeHtml(root, resolved.css, extensions),
        valid: !issues.some(i => i.severity === 'error'),
        issues,
        css,
        extensions,
    };
}
