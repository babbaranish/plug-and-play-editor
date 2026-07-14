function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const TAG_OR_COMMENT_RE = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>/g;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'=<>`]+)?|(\s+)/g;

function highlightTag(tagText: string): string {
    const closeSlash = tagText.startsWith('</');
    const selfClose = /\/>$/.test(tagText);
    const inner = tagText.slice(closeSlash ? 2 : 1, tagText.length - (selfClose ? 2 : 1));

    const nameMatch = inner.match(/^[a-zA-Z][a-zA-Z0-9:-]*/);
    const tagName = nameMatch ? nameMatch[0] : '';
    const rest = inner.slice(tagName.length);

    let attrHtml = '';
    ATTR_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ATTR_RE.exec(rest))) {
        if (m[4] !== undefined) {
            attrHtml += m[4];
            continue;
        }
        const [, attrName, eq, attrValue] = m;
        attrHtml += `<span class="pe-tok-attr-name">${escapeHtml(attrName)}</span>`;
        if (eq !== undefined) attrHtml += escapeHtml(eq);
        if (attrValue !== undefined) {
            attrHtml += `<span class="pe-tok-attr-value">${escapeHtml(attrValue)}</span>`;
        }
    }

    let html = `<span class="pe-tok-bracket">&lt;${closeSlash ? '/' : ''}</span>`;
    html += `<span class="pe-tok-tag">${escapeHtml(tagName)}</span>`;
    html += attrHtml;
    html += `<span class="pe-tok-bracket">${selfClose ? ' /&gt;' : '&gt;'}</span>`;
    return html;
}

/** Tokenizes an HTML source string into color-coded spans (tags/attrs/text/comments). */
export function highlightHtml(text: string): string {
    let result = '';
    let lastIndex = 0;
    TAG_OR_COMMENT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = TAG_OR_COMMENT_RE.exec(text))) {
        if (match.index > lastIndex) {
            result += `<span class="pe-tok-text">${escapeHtml(text.slice(lastIndex, match.index))}</span>`;
        }
        const token = match[0];
        result += token.startsWith('<!--')
            ? `<span class="pe-tok-comment">${escapeHtml(token)}</span>`
            : highlightTag(token);
        lastIndex = TAG_OR_COMMENT_RE.lastIndex;
    }

    if (lastIndex < text.length) {
        result += `<span class="pe-tok-text">${escapeHtml(text.slice(lastIndex))}</span>`;
    }

    return result;
}
