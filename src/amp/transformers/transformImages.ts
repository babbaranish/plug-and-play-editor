import type { AmpTransformer, ImageSize } from '../types';
import { parseStyle, stringifyStyle } from '../utils/collectCss';

/** Sizing properties `<amp-img>`'s layout takes over. */
const SIZING = new Set(['width', 'height', 'max-width', 'max-height', 'min-width', 'min-height', 'aspect-ratio']);

function pixels(value: string | null | undefined): number | null {
    if (!value) return null;
    const m = /^\s*(\d+(?:\.\d+)?)\s*(px)?\s*$/i.exec(value);
    if (!m) return null;
    const n = Math.round(Number(m[1]));
    return n > 0 ? n : null;
}

/**
 * The size the image is shown at: the width/height attributes, else a pixel
 * width/height in its style (where the resize handles put it), else what
 * `getImageSize` reports. When only a width is known and the intrinsic size
 * is available, the height follows the aspect ratio.
 */
function sizeOf(img: Element, lookup: ((src: string) => ImageSize | null | undefined) | undefined): ImageSize | null {
    const style = new Map(parseStyle(img.getAttribute('style') ?? '').map(d => [d.property, d.value]));
    const width = pixels(img.getAttribute('width')) ?? pixels(style.get('width'));
    const height = pixels(img.getAttribute('height')) ?? pixels(style.get('height'));
    if (width && height) return { width, height };

    const src = img.getAttribute('src');
    const intrinsic = src && lookup ? lookup(src) : null;
    if (!intrinsic || !(intrinsic.width > 0) || !(intrinsic.height > 0)) return null;
    if (width) return { width, height: Math.round(width * intrinsic.height / intrinsic.width) };
    if (height) return { width: Math.round(height * intrinsic.width / intrinsic.height), height };
    return { width: Math.round(intrinsic.width), height: Math.round(intrinsic.height) };
}

/**
 * `<img>` becomes `<amp-img layout="intrinsic">`: shown at its size, scaled
 * down to fit narrow screens, never stretched past it. An image whose size
 * can't be found keeps no width/height and is reported by validation.
 */
export const transformImages: AmpTransformer = (root, ctx) => {
    for (const img of Array.from(root.querySelectorAll('img'))) {
        const amp = ctx.doc.createElement('amp-img');
        const src = img.getAttribute('src');
        if (src !== null) amp.setAttribute('src', src.trim());
        amp.setAttribute('alt', img.getAttribute('alt') ?? '');

        const size = sizeOf(img, ctx.options.getImageSize);
        if (size) {
            amp.setAttribute('width', String(size.width));
            amp.setAttribute('height', String(size.height));
            amp.setAttribute('layout', 'intrinsic');
        }

        // Keep look (margin, border, radius, ...); the layout owns the size.
        const kept = parseStyle(img.getAttribute('style') ?? '').filter(d => !SIZING.has(d.property));
        if (kept.length) amp.setAttribute('style', stringifyStyle(kept));
        for (const name of ['class', 'id', 'title']) {
            const v = img.getAttribute(name);
            if (v) amp.setAttribute(name, v);
        }

        img.replaceWith(amp);
    }
};
