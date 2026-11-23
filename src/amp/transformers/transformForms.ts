import type { AmpTransformer } from '../types';
import { AMP_FORM_CLASS, readAmpFormConfig } from '../forms/formConfig';
import { renderAmpForm } from '../forms/formRenderer';

/**
 * Replaces each form block with its AMP form, generated from the config the
 * block stores. The generated form is final: later passes leave it alone. A
 * block whose config is unreadable or invalid keeps its fallback content and
 * each problem is reported as an error.
 */
export const transformForms: AmpTransformer = (root, ctx) => {
    let index = 0;
    for (const block of Array.from(root.querySelectorAll(`.${AMP_FORM_CLASS}`))) {
        index++;
        const read = readAmpFormConfig(block);
        if ('issues' in read) {
            for (const issue of read.issues) {
                ctx.report('error', 'form-invalid', `Form ${index}: ${issue.path ? `${issue.path}: ` : ''}${issue.message}`, block);
            }
            continue;
        }
        const form = renderAmpForm(read.config, ctx.doc, index);
        block.replaceWith(form);
        ctx.finalize(form);
    }
};
