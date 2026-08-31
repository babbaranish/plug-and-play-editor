function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Builds the highlighted markup by emitting *slices of the original source*
 * and never anything else.
 *
 * The overlay this feeds is painted underneath a transparent <textarea>: the
 * user sees the overlay's glyphs but the caret of the textarea. So the overlay
 * must be a character-exact rendering of the source — a tokenizer that
 * reconstructs text (rather than slicing it) can silently drop or add
 * characters, which shows up as vanishing keystrokes and a caret that appears
 * to sit in the wrong column. Because `cut()` is the only way to produce
 * output and it always advances from `pos` to `end`, every character between
 * them reaches the overlay exactly once, whatever the tokenizer decides.
 */
class SliceEmitter {
    private readonly src: string;
    private out = '';
    private pos = 0;

    constructor(src: string) {
        this.src = src;
    }

    /** Emit `src[pos, end)` wrapped in `cls` (unwrapped when `cls` is null). */
    cut(end: number, cls: string | null): void {
        if (end <= this.pos) return;
        const chunk = escapeHtml(this.src.slice(this.pos, end));
        this.out += cls ? `<span class="${cls}">${chunk}</span>` : chunk;
        this.pos = end;
    }

    get result(): string {
        return this.out;
    }
}

/**
 * Index just past the `>` that closes the tag opening at `start`, or null when
 * `start` isn't a tag opening or the tag is never closed. Quoted attribute
 * values are skipped, so a `>` inside `title="a > b"` doesn't end the tag.
 */
function findTagEnd(text: string, start: number): number | null {
    let i = start + 1;
    if (text[i] === '/') i++;
    if (!/[a-zA-Z]/.test(text[i] ?? '')) return null;

    while (i < text.length) {
        const ch = text[i];
        if (ch === '"' || ch === "'") {
            const close = text.indexOf(ch, i + 1);
            if (close === -1) return null;
            i = close + 1;
            continue;
        }
        if (ch === '>') return i + 1;
        i++;
    }
    return null;
}

// Sticky matchers, run against the attribute region of a single tag.
const WS_Y = /\s+/y;
const ATTR_NAME_Y = /[^\s"'=<>/]+/y;
const EQ_Y = /\s*=\s*/y;
const ATTR_VALUE_Y = /"[^"]*"?|'[^']*'?|[^\s"'=<>`]+/y;

function matchAt(re: RegExp, s: string, at: number): string | null {
    re.lastIndex = at;
    const m = re.exec(s);
    return m ? m[0] : null;
}

/** Emits the tag spanning `[start, end)`, colouring bracket/name/attrs. */
function emitTag(em: SliceEmitter, text: string, start: number, end: number): void {
    const nameStart = start + (text[start + 1] === '/' ? 2 : 1);
    em.cut(nameStart, 'pe-tok-bracket');

    const name = matchAt(/[a-zA-Z][a-zA-Z0-9:._-]*/y, text, nameStart) ?? '';
    const attrStart = nameStart + name.length;
    em.cut(attrStart, 'pe-tok-tag');

    // `/>` closes the tag; a lone `>` doesn't. Guard against `<a/>` where the
    // slash would otherwise be read as part of an empty name.
    const closeStart = text[end - 2] === '/' && end - 2 >= attrStart ? end - 2 : end - 1;

    const region = text.slice(attrStart, closeStart);
    let at = 0;
    while (at < region.length) {
        const ws = matchAt(WS_Y, region, at);
        if (ws) {
            at += ws.length;
            em.cut(attrStart + at, null);
            continue;
        }

        const attrName = matchAt(ATTR_NAME_Y, region, at);
        if (attrName) {
            at += attrName.length;
            em.cut(attrStart + at, 'pe-tok-attr-name');

            const eq = matchAt(EQ_Y, region, at);
            if (eq) {
                at += eq.length;
                em.cut(attrStart + at, null);

                const value = matchAt(ATTR_VALUE_Y, region, at);
                if (value) {
                    at += value.length;
                    em.cut(attrStart + at, 'pe-tok-attr-value');
                }
            }
            continue;
        }

        // Nothing recognised (stray `=`, `"`, …). Emit it uncoloured and keep
        // moving — the loop must always make progress.
        at++;
        em.cut(attrStart + at, null);
    }

    em.cut(closeStart, null);
    em.cut(end, 'pe-tok-bracket');
}

/** Tokenizes an HTML source string into color-coded spans (tags/attrs/text/comments). */
export function highlightHtml(text: string): string {
    const em = new SliceEmitter(text);

    let i = 0;
    while (i < text.length) {
        const lt = text.indexOf('<', i);
        if (lt === -1) break;

        if (text.startsWith('<!--', lt)) {
            const close = text.indexOf('-->', lt + 4);
            const stop = close === -1 ? text.length : close + 3;
            em.cut(lt, 'pe-tok-text');
            em.cut(stop, 'pe-tok-comment');
            i = stop;
            continue;
        }

        const tagEnd = findTagEnd(text, lt);
        if (tagEnd === null) {
            i = lt + 1;
            continue;
        }

        em.cut(lt, 'pe-tok-text');
        emitTag(em, text, lt, tagEnd);
        i = tagEnd;
    }

    em.cut(text.length, 'pe-tok-text');
    return em.result;
}
