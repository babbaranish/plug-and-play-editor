import type { AmpContext, AmpCssStats } from '../types';
import { parseStyle } from '../utils/collectCss';

/** Values that can run code or pull in behaviour, in any CSS. */
export const UNSAFE_CSS = /expression\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding/i;

/** Checks the stylesheet and every inline style against AMP for Email's CSS rules. */
export function validateCss(root: ParentNode, stylesheet: string, stats: AmpCssStats, ctx: AmpContext): void {
    if (stats.totalBytes > stats.limit) {
        ctx.report('error', 'css-too-large',
            `CSS is ${stats.totalBytes.toLocaleString('en-US')} bytes (styles ${stats.stylesheetBytes.toLocaleString('en-US')}, inline ${stats.inlineBytes.toLocaleString('en-US')}); AMP email allows ${stats.limit.toLocaleString('en-US')}.`);
    }

    if (/!\s*important/i.test(stylesheet)) {
        ctx.report('error', 'css-important', 'The stylesheet uses !important, which AMP email does not allow.');
    }
    if (UNSAFE_CSS.test(stylesheet) || /@import/i.test(stylesheet)) {
        ctx.report('error', 'css-unsafe', 'The stylesheet uses @import, expression(), behaviour bindings or script URLs.');
    }

    root.querySelectorAll('[style]').forEach(el => {
        const style = el.getAttribute('style') ?? '';
        if (parseStyle(style).some(d => d.important)) {
            ctx.report('error', 'css-important', 'An inline style uses !important, which AMP email does not allow.', el);
        }
        if (UNSAFE_CSS.test(style)) {
            ctx.report('error', 'css-unsafe', 'An inline style uses expression(), behaviour bindings or script URLs.', el);
        }
    });
}
