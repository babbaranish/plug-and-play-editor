/**
 * Ranges are [start, endExclusive) offsets into the source and cover the whole
 * tag, from `<` through `>`.
 */
export interface TagMatch {
    open: [number, number];
    close: [number, number];
}

interface ScannedTag {
    name: string;
    isClose: boolean;
    selfClosing: boolean;
    start: number;
    end: number;
}

const VOID_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** Elements whose contents are raw text: a `</div>` inside them is not markup. */
const RAW_TEXT_END: Record<string, RegExp> = {
    script: /<\/script[\s/>]/gi,
    style: /<\/style[\s/>]/gi,
    textarea: /<\/textarea[\s/>]/gi,
    title: /<\/title[\s/>]/gi,
};

const TAG_NAME_Y = /[a-zA-Z][a-zA-Z0-9:._-]*/y;

function isWhitespace(ch: string): boolean {
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';
}

/**
 * Index just past the `>` that closes a tag whose attributes start at `from`,
 * or null when the tag never closes. A quote only opens a value right after
 * `=`, so `title=don't>` is not mistaken for a quoted value. An unclosed quote
 * or a missing `>` means the tag runs to the end of the source, as in the
 * browser's tokenizer.
 */
function scanTagEnd(src: string, from: number): { end: number; selfClosing: boolean } | null {
    let afterEq = false;
    for (let i = from; i < src.length; i++) {
        const ch = src[i];
        if (ch === '>') {
            return { end: i + 1, selfClosing: i - 1 >= from && src[i - 1] === '/' };
        }
        if ((ch === '"' || ch === "'") && afterEq) {
            const close = src.indexOf(ch, i + 1);
            if (close === -1) return null;
            i = close;
            afterEq = false;
            continue;
        }
        if (ch === '=') afterEq = true;
        else if (!isWhitespace(ch)) afterEq = false;
    }
    return null;
}

/**
 * One left-to-right pass that lists every tag in document order. Comments and
 * doctype/processing instructions are skipped, and so is the raw-text body of
 * script, style, textarea and title. Each index is visited once, so the pass is linear in the source
 * length.
 */
function scanTags(src: string): ScannedTag[] {
    const tags: ScannedTag[] = [];
    let i = 0;

    while (i < src.length) {
        const lt = src.indexOf('<', i);
        if (lt === -1) break;

        if (src.startsWith('<!--', lt)) {
            const close = src.indexOf('-->', lt + 4);
            if (close === -1) break;
            i = close + 3;
            continue;
        }

        const next = src[lt + 1];
        if (next === '!' || next === '?') {
            const close = src.indexOf('>', lt + 2);
            if (close === -1) break;
            i = close + 1;
            continue;
        }

        const isClose = next === '/';
        const nameStart = lt + (isClose ? 2 : 1);
        TAG_NAME_Y.lastIndex = nameStart;
        const nameMatch = TAG_NAME_Y.exec(src);
        if (!nameMatch) {
            i = lt + 1;
            continue;
        }

        const rawName = nameMatch[0];
        const tagEnd = scanTagEnd(src, nameStart + rawName.length);
        if (!tagEnd) break;

        const tag: ScannedTag = {
            name: rawName.toLowerCase(),
            isClose,
            selfClosing: tagEnd.selfClosing,
            start: lt,
            end: tagEnd.end,
        };
        tags.push(tag);
        i = tag.end;

        const rawEnd = RAW_TEXT_END[tag.name];
        if (!isClose && !tag.selfClosing && rawEnd) {
            rawEnd.lastIndex = i;
            const m = rawEnd.exec(src);
            i = m ? m.index : src.length;
        }
    }

    return tags;
}

/**
 * Pairs opening and closing tags with a stack. A closer pops back to the most
 * recent opener of the same name, and openers it skips over stay unpaired.
 * Closers with no open partner are ignored. A per-name open count lets an
 * unmatched closer exit in O(1), so deep or broken nesting stays linear.
 */
function pairTags(tags: ScannedTag[]): Map<number, number> {
    const pairs = new Map<number, number>();
    const stack: number[] = [];
    const openCount = new Map<string, number>();

    tags.forEach((tag, idx) => {
        if (VOID_TAGS.has(tag.name) || tag.selfClosing) return;

        if (!tag.isClose) {
            stack.push(idx);
            openCount.set(tag.name, (openCount.get(tag.name) ?? 0) + 1);
            return;
        }

        if (!openCount.get(tag.name)) return;
        for (;;) {
            const openIdx = stack.pop()!;
            const opener = tags[openIdx];
            openCount.set(opener.name, openCount.get(opener.name)! - 1);
            if (opener.name === tag.name) {
                pairs.set(openIdx, idx);
                pairs.set(idx, openIdx);
                break;
            }
        }
    });

    return pairs;
}

/**
 * Finds the opening and closing tag that pair with the tag under the caret.
 *
 * A caret counts as inside a tag from its `<` up to and including the position
 * just after its `>`. Where two tags touch (`<b>|<i>`), the tag starting at the
 * caret wins. Returns null when the caret is not in a tag, the tag is void or
 * self-closing, the tag has no partner, or the source is out of tags.
 */
export function findMatchingTag(src: string, caret: number): TagMatch | null {
    // A tag holding the caret needs a `<` at or before it and a `>` at or after
    // caret - 1. Checking both first skips the full scan for plain text.
    if (src.lastIndexOf('<', caret) === -1) return null;
    if (src.indexOf('>', Math.max(0, caret - 1)) === -1) return null;

    const tags = scanTags(src);

    let hit = tags.findIndex(t => t.start <= caret && caret < t.end);
    if (hit === -1) hit = tags.findIndex(t => t.end === caret);
    if (hit === -1) return null;

    const partner = pairTags(tags).get(hit);
    if (partner === undefined) return null;

    const a = tags[hit];
    const b = tags[partner];
    const [open, close] = a.isClose ? [b, a] : [a, b];
    return { open: [open.start, open.end], close: [close.start, close.end] };
}
