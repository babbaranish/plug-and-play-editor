import type { AmpTransformer } from '../types';
import { AMP_FEEDBACK_CLASS, readAmpFeedbackConfig } from '../feedback/feedbackConfig';
import { renderAmpFeedback } from '../feedback/feedbackRenderer';

/**
 * Replaces each feedback block with its AMP form, generated from the
 * settings the block stores. The result is final: later passes leave it
 * alone. A block whose settings are invalid keeps its fallback content and
 * each problem is reported as an error.
 */
export const transformFeedback: AmpTransformer = (root, ctx) => {
    let index = 0;
    for (const block of Array.from(root.querySelectorAll(`.${AMP_FEEDBACK_CLASS}`))) {
        index++;
        const read = readAmpFeedbackConfig(block);
        if ('issues' in read) {
            for (const issue of read.issues) {
                ctx.report('error', 'feedback-invalid', `Feedback ${index}: ${issue.path ? `${issue.path}: ` : ''}${issue.message}`, block);
            }
            continue;
        }
        const form = renderAmpFeedback(read.config, ctx.doc, index);
        block.replaceWith(form);
        ctx.finalize(form);
    }
};
