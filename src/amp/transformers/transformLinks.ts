import type { AmpTransformer } from '../types';
import { isPlaceholder } from '../validation/validateAmp';
import { unwrap } from '../utils/parseHtml';

/**
 * Moves a destination kept in `data-href-token` (behind an inert `#` href, or
 * alongside a `{{key}}` href) into the href as a variable, which the sender
 * substitutes. A real URL already in the href wins.
 */
export function resolveHrefToken(a: Element, [open, close]: readonly [string, string]): void {
    const token = a.getAttribute('data-href-token')?.trim();
    a.removeAttribute('data-href-token');
    if (!token) return;
    const href = (a.getAttribute('href') ?? '').trim();
    if (href === '' || href === '#' || isPlaceholder(href, [open, close])) {
        a.setAttribute('href', `${open}${token}${close}`);
    }
}

function protocolOf(value: string): string | null {
    try {
        return new URL(value).protocol;
    } catch {
        return null;
    }
}

/**
 * Makes every link one AMP email accepts: absolute http(s), mailto, tel, or a
 * whole variable. In-page, relative and script links are unwrapped to their
 * text. A link with no destination at all (`#`) is left for validation to
 * report, since dropping it would hide a missing URL.
 */
export const transformLinks: AmpTransformer = (root, ctx) => {
    const { delimiters } = ctx.options;
    for (const a of Array.from(root.querySelectorAll('a'))) {
        resolveHrefToken(a, delimiters);

        const raw = a.getAttribute('href');
        if (raw === null) continue;
        const href = raw.trim();
        if (href === '' || href === '#' || isPlaceholder(href, delimiters)) {
            a.setAttribute('target', '_blank');
            continue;
        }

        if (href.startsWith('#')) {
            ctx.report('warning', 'link-in-page-removed', `In-page link to "${href}" removed; AMP email has no in-page links. Its text is kept.`, a);
            unwrap(a);
            continue;
        }

        const protocol = protocolOf(href);
        if (protocol === null) {
            ctx.report('warning', 'link-relative-removed', `Relative link "${href}" removed; AMP email needs absolute URLs. Its text is kept.`, a);
            unwrap(a);
            continue;
        }
        if (!['http:', 'https:', 'mailto:', 'tel:'].includes(protocol)) {
            ctx.report('warning', 'link-unsafe-removed', `Link using "${protocol}" removed. Its text is kept.`, a);
            unwrap(a);
            continue;
        }

        // AMP email allows only target="_blank".
        a.setAttribute('target', '_blank');
    }
};
