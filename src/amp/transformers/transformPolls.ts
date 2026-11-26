import type { AmpTransformer } from '../types';
import { AMP_POLL_CLASS, readAmpPollConfig } from '../poll/pollConfig';
import { renderAmpPoll } from '../poll/pollRenderer';

/**
 * Replaces each poll block with its AMP form, generated from the settings
 * the block stores. The result is final: later passes leave it alone. A
 * block whose settings are invalid keeps its fallback content and each
 * problem is reported as an error.
 */
export const transformPolls: AmpTransformer = (root, ctx) => {
    let index = 0;
    for (const block of Array.from(root.querySelectorAll(`.${AMP_POLL_CLASS}`))) {
        index++;
        const read = readAmpPollConfig(block);
        if ('issues' in read) {
            for (const issue of read.issues) {
                ctx.report('error', 'poll-invalid', `Poll ${index}: ${issue.path ? `${issue.path}: ` : ''}${issue.message}`, block);
            }
            continue;
        }
        const form = renderAmpPoll(read.config, ctx.doc, index);
        block.replaceWith(form);
        ctx.finalize(form);
    }
};
