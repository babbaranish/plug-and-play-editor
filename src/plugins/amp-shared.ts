/**
 * What the AMP form and quiz plugins share: where a block goes, when edits
 * are off, and the design settings section of their dialogs.
 */
import type { Editor } from '../core/Editor';
import type { ModalField, ModalFormEntry } from '../core/modal';
import type { AmpFormStyle, NormalizedAmpFormStyle } from '../amp/forms/types';
import {
    AMP_FORM_STYLE_SETTINGS,
    compactAmpFormStyle,
    normalizeAmpFormStyle,
    validateAmpFormStyle,
    type AmpFormStyleSetting
} from '../amp/forms/formStyle';

/** The editor's top-level block that holds `node`, if any. */
export function topLevelBlock(editor: Editor, node: Node | null): Element | null {
    let n: Node | null = node;
    while (n && n.parentNode !== editor.editorArea) n = n.parentNode;
    return n && n.nodeType === Node.ELEMENT_NODE ? (n as Element) : null;
}

/** The top-level block holding the caret, when the caret is in the editor. */
export function caretBlock(editor: Editor): Element | null {
    const sel = window.getSelection();
    return sel && sel.rangeCount > 0 && editor.editorArea.contains(sel.anchorNode) ? topLevelBlock(editor, sel.anchorNode) : null;
}

/** Whether the source view or preview is open, when blocks aren't inserted or changed. */
export function inAlternateView(editor: Editor): boolean {
    return editor.hasActiveContentSource() || editor.container.classList.contains('play-editor-preview-mode');
}

/**
 * Puts `block` after `after` (so a paragraph is never split), else at the
 * end, with a paragraph after it when it is last, to keep typing in.
 */
export function placeBlock(editor: Editor, block: HTMLElement, after: Element | null): void {
    if (after && after.parentNode === editor.editorArea) after.after(block);
    else editor.editorArea.appendChild(block);
    if (!block.nextElementSibling) {
        const p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        block.after(p);
    }
}

/** An optional text setting: empty means "use the default", so the key is dropped. */
export function optional(value: string | undefined): string | undefined {
    const v = value?.trim();
    return v ? v : undefined;
}

/**
 * `config` with a plugin's default design under its own `style`: the block
 * stores the result, so it looks the same wherever it is converted. Only
 * settings that differ from the default look are kept. Both must be valid.
 */
export function withDefaultStyle<T extends { readonly style?: AmpFormStyle }>(config: T, defaultStyle: AmpFormStyle | undefined): T {
    if (!defaultStyle && !config.style) return config;
    const style = compactAmpFormStyle({ ...defaultStyle, ...config.style });
    const rest: Record<string, unknown> = { ...config };
    delete rest.style;
    return (style ? { ...rest, style } : rest) as unknown as T;
}

// ── Design section of a dialog ────────────────────────────────────

const STYLE_FIELD_PREFIX = 'style.';

/** The dialog rows of design settings, three to a row, in the settings' order. */
const DESIGN_ROWS: readonly (readonly AmpFormStyleSetting['key'][])[] = [
    ['buttonColor', 'buttonTextColor', 'buttonRadius'],
    ['buttonAlign', 'buttonFullWidth'],
    ['fieldBorderColor', 'fieldBackground', 'fieldRadius'],
    ['labelColor', 'labelBold', 'fieldTextSize'],
    ['successColor', 'errorColor', 'fieldSpacing'],
    ['fontFamily', 'maxWidth'],
];

const SETTING = new Map(AMP_FORM_STYLE_SETTINGS.map(s => [s.key, s]));

/** The valid settings of a stored style (a hand-edited one may have bad values); the rest default. */
export function startingStyle(raw: unknown): NormalizedAmpFormStyle {
    if (typeof raw !== 'object' || raw === null) return normalizeAmpFormStyle(undefined);
    const valid: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (validateAmpFormStyle({ [key]: value }).length === 0) valid[key] = value;
    }
    return normalizeAmpFormStyle(valid as AmpFormStyle);
}

function designField(setting: AmpFormStyleSetting, current: NormalizedAmpFormStyle, labels: Partial<Record<string, string>>): ModalField {
    const name = `${STYLE_FIELD_PREFIX}${setting.key}`;
    const label = labels[setting.key] ?? setting.label;
    const value = current[setting.key];
    switch (setting.kind) {
        case 'color': return { name, label, type: 'color', value: String(value) };
        case 'number': return { name, label, type: 'number', min: setting.min, max: setting.max, step: 1, value: String(value) };
        case 'boolean': return { name, label, type: 'checkbox', value: value ? 'true' : '' };
        case 'choice': return { name, label, type: 'select', options: [...setting.choices], value: String(value) };
    }
}

/** The design rows of a dialog. `labels` renames settings for a block (a quiz's "fields" are its choices). */
export function designRows(current: NormalizedAmpFormStyle, labels: Partial<Record<AmpFormStyleSetting['key'], string>> = {}): ModalFormEntry[] {
    return DESIGN_ROWS.map(row => row.map(key => designField(SETTING.get(key)!, current, labels)));
}

/** The design settings as entered, typed. Not yet validated. */
export function styleFromValues(values: Record<string, string>): Record<string, unknown> {
    const style: Record<string, unknown> = {};
    for (const setting of AMP_FORM_STYLE_SETTINGS) {
        const raw = values[`${STYLE_FIELD_PREFIX}${setting.key}`];
        if (raw === undefined) continue;
        if (setting.kind === 'number') {
            const n = Number(raw);
            style[setting.key] = raw.trim() !== '' && Number.isFinite(n) ? n : raw;
        } else if (setting.kind === 'boolean') {
            style[setting.key] = raw === 'true';
        } else {
            style[setting.key] = raw;
        }
    }
    return style;
}

/** A design issue in dialog wording: the setting by its label ("Button corners (px) must be …"), or null for another issue. */
export function readableStyleIssue(issue: { path: string; message: string }, labels: Partial<Record<string, string>> = {}): string | null {
    const key = /^style\.(\w+)$/.exec(issue.path)?.[1];
    const setting = key ? SETTING.get(key as AmpFormStyleSetting['key']) : undefined;
    return setting ? issue.message.replace(setting.key, labels[setting.key] ?? setting.label) : null;
}
