import type { AmpTransformer } from '../types';
import { resolveHrefToken } from './transformLinks';

/**
 * Button blocks (`div.play-editor-button-block > a[style]`). Their styling is
 * inline already, so the work is the destination: a payment link kept in
 * `data-href-token` behind `href="#"` becomes `href="{{key}}"` for the sender
 * to substitute. A button with no destination keeps `#` and is reported by
 * validation. The editor's class and contenteditable are removed later by
 * transformElements.
 */
export const transformButtons: AmpTransformer = (root, ctx) => {
    root.querySelectorAll('.play-editor-button-block').forEach(block => {
        block.querySelectorAll('a').forEach(a => {
            resolveHrefToken(a, ctx.options.delimiters);
            a.setAttribute('target', '_blank');
        });
    });
};
