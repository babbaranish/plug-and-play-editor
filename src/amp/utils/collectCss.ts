import type { AmpCssStats } from '../types';

/** AMP for Email's limit on CSS: `<style amp-custom>` plus every inline `style` attribute, in bytes. */
export const AMP_CSS_LIMIT = 75_000;

export interface Declaration {
    property: string;
    value: string;
    important: boolean;
}

const encoder = new TextEncoder();

export function byteLength(text: string): number {
    return encoder.encode(text).length;
}

/**
 * Splits a `style` attribute into declarations. Semicolons inside quotes or
 * parentheses (e.g. a `url(data:...;base64,...)`) don't end a declaration.
 */
export function parseStyle(style: string): Declaration[] {
    const parts: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let start = 0;
    for (let i = 0; i < style.length; i++) {
        const ch = style[i];
        if (quote) {
            if (ch === quote && style[i - 1] !== '\\') quote = null;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === '(') {
            depth++;
        } else if (ch === ')') {
            depth = Math.max(0, depth - 1);
        } else if (ch === ';' && depth === 0) {
            parts.push(style.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(style.slice(start));

    const out: Declaration[] = [];
    for (const part of parts) {
        const colon = part.indexOf(':');
        if (colon === -1) continue;
        const property = part.slice(0, colon).trim().toLowerCase();
        let value = part.slice(colon + 1).trim();
        if (!property || !value) continue;
        const important = /!\s*important\s*$/i.test(value);
        if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
        out.push({ property, value, important });
    }
    return out;
}

export function stringifyStyle(declarations: readonly Declaration[]): string {
    return declarations
        .map(d => `${d.property}: ${d.value}${d.important ? ' !important' : ''}`)
        .join('; ');
}

/** Measures the document's CSS against the AMP for Email limit. */
export function collectCss(root: ParentNode, stylesheet: string): AmpCssStats {
    let inlineBytes = 0;
    root.querySelectorAll('[style]').forEach(el => {
        inlineBytes += byteLength(el.getAttribute('style') ?? '');
    });
    const stylesheetBytes = byteLength(stylesheet);
    return { stylesheetBytes, inlineBytes, totalBytes: stylesheetBytes + inlineBytes, limit: AMP_CSS_LIMIT };
}
