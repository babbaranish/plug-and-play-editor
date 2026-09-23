import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';
import { openFormModal } from '../core/modal';
import type { Token } from './tokens';
import { DEFAULT_EMAIL_TOKENS, DELIMITER_MAP } from './tokens';
import { tokenOnlyUrl } from './links';

export interface ButtonBlockPluginOptions {
    /** Variables offered by the "insert variable" picker on the Text/URL fields */
    tokens?: Token[];
    /** Delimiter style — must match how those tokens get replaced elsewhere (default "double-curly") */
    delimiter?: 'double-curly' | 'single-curly' | 'percent';
}

function isValidUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:';
    } catch { return false; }
}

/**
 * A button URL is acceptable if it is a real address OR exactly one variable.
 *
 * The URL field offers a variable picker, and every variable it offered was
 * then rejected by isValidUrl with "Only http, https, and mailto links are
 * allowed" — the picker and the validator disagreed, so a payment link could
 * not be put on a button at all, which is the most natural way to build a
 * Pay Now button in an offer letter.
 *
 * A variable stays in `href` as `{{...}}` rather than moving to
 * `data-href-token`: whatever renders the email substitutes it there, and that
 * is true of ordinary variables like {{login_url}} as much as of a payment
 * link. Only ONE variable and nothing else, matching the link plugin's rule —
 * `https://x.test/{{id}}` is a real address and is validated as one.
 */
function isAcceptableButtonUrl(url: string, open: string, close: string): boolean {
    return isValidUrl(url) || tokenOnlyUrl(url, open, close) !== null;
}

/**
 * Escape for use as element CONTENT.
 *
 * textContent -> innerHTML handles `&`, `<` and `>`, which is all content needs.
 */
function escapeText(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Escape for use inside a double-quoted ATTRIBUTE value.
 *
 * The content escaper is not enough here, because it leaves `"` alone: a url of
 * `https://x.test" onmouseover="alert(1)` came back unchanged, closed the href
 * it was interpolated into, and `onmouseover` was parsed as a real attribute on
 * the anchor. Verified in a browser, not reasoned about.
 *
 * Same two replacements as escapeAttrValue in source-code-format.ts, which had
 * this right; keep the two in step.
 */
function escapeAttr(str: string): string {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

interface ButtonConfig {
    text: string;
    url: string;
    bgColor: string;
    textColor: string;
    borderRadius: number;
    paddingV: number;
    paddingH: number;
}

const DEFAULT_CONFIG: ButtonConfig = {
    text: 'Click Here',
    url: 'https://',
    bgColor: '#3b82f6',
    textColor: '#ffffff',
    borderRadius: 4,
    paddingV: 12,
    paddingH: 24
};

export function generateButtonHtmlForTest(cfg: ButtonConfig): string {
    return generateButtonHtml(cfg);
}

function generateButtonHtml(cfg: ButtonConfig): string {
    const safeText = escapeText(cfg.text);
    const safeUrl = escapeAttr(cfg.url);
    return `<div contenteditable="false" class="play-editor-button-block" style="margin:1em 0;text-align:center;">` +
        `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" ` +
        `style="display:inline-block;padding:${cfg.paddingV}px ${cfg.paddingH}px;` +
        `color:${cfg.textColor};background-color:${cfg.bgColor};` +
        `border-radius:${cfg.borderRadius}px;text-decoration:none;` +
        `font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">` +
        `${safeText}</a></div>`;
}

function rgbToHex(input: string): string {
    if (!input) return '';
    if (input.startsWith('#')) return input;
    const m = input.match(/\d+/g);
    if (!m || m.length < 3) return input;
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return '#' + toHex(parseInt(m[0])) + toHex(parseInt(m[1])) + toHex(parseInt(m[2]));
}

function parseButtonBlock(el: HTMLElement): ButtonConfig {
    const a = el.querySelector('a');
    if (!a) return { ...DEFAULT_CONFIG };
    const s = a.style;
    return {
        text: a.textContent || DEFAULT_CONFIG.text,
        url: a.getAttribute('href') || DEFAULT_CONFIG.url,
        bgColor: rgbToHex(s.backgroundColor) || DEFAULT_CONFIG.bgColor,
        textColor: rgbToHex(s.color) || DEFAULT_CONFIG.textColor,
        borderRadius: parseInt(s.borderRadius) || DEFAULT_CONFIG.borderRadius,
        paddingV: parseInt(s.paddingTop || s.padding) || DEFAULT_CONFIG.paddingV,
        paddingH: parseInt(s.paddingLeft || s.padding) || DEFAULT_CONFIG.paddingH
    };
}

function openButtonModal(
    editor: Editor,
    config: ButtonConfig,
    editingEl: HTMLElement | null,
    savedRange: Range | null,
    tokens: Token[],
    tokenOpen: string,
    tokenClose: string
) {
    const tokenPicker = { list: tokens, open: tokenOpen, close: tokenClose };

    openFormModal(editor, {
        title: editingEl ? 'Edit Button' : 'Insert Button',
        submitLabel: editingEl ? 'Update Button' : 'Insert Button',
        fields: [
            { name: 'text', label: 'Button Text', type: 'text', value: config.text, placeholder: 'Click Here', tokens: tokenPicker },
            { name: 'url', label: 'Button URL', type: 'url', value: config.url, placeholder: 'https://example.com', tokens: tokenPicker },
            [
                { name: 'bgColor', label: 'Background', type: 'color', value: config.bgColor },
                { name: 'textColor', label: 'Text Color', type: 'color', value: config.textColor }
            ],
            [
                { name: 'borderRadius', label: 'Radius', type: 'number', value: String(config.borderRadius), min: 0, max: 50 },
                { name: 'paddingV', label: 'Padding V', type: 'number', value: String(config.paddingV), min: 0, max: 80 },
                { name: 'paddingH', label: 'Padding H', type: 'number', value: String(config.paddingH), min: 0, max: 80 }
            ]
        ],
        onSubmit: (values, { showError, close }) => {
            const text = values.text.trim() || DEFAULT_CONFIG.text;
            const url = values.url.trim();
            if (!isAcceptableButtonUrl(url, tokenOpen, tokenClose)) {
                showError(`Enter a link starting with http, https or mailto, or a single variable such as ${tokenOpen}login_url${tokenClose}.`);
                return;
            }

            const cfg: ButtonConfig = {
                text,
                url,
                bgColor: values.bgColor || DEFAULT_CONFIG.bgColor,
                textColor: values.textColor || DEFAULT_CONFIG.textColor,
                borderRadius: parseInt(values.borderRadius) || DEFAULT_CONFIG.borderRadius,
                paddingV: parseInt(values.paddingV) || DEFAULT_CONFIG.paddingV,
                paddingH: parseInt(values.paddingH) || DEFAULT_CONFIG.paddingH
            };

            const html = generateButtonHtml(cfg);

            if (editingEl) {
                editingEl.outerHTML = html;
            } else {
                if (savedRange) {
                    const s = window.getSelection();
                    s?.removeAllRanges();
                    s?.addRange(savedRange);
                }
                editor.editorArea.focus();
                document.execCommand('insertHTML', false, html + '<p><br></p>');
            }
            editor.textArea.value = editor.editorArea.innerHTML;
            close();
        }
    });
}

export function createButtonBlockPlugin(options?: ButtonBlockPluginOptions): Plugin {
    const tokens = options?.tokens ?? DEFAULT_EMAIL_TOKENS;
    const [tokenOpen, tokenClose] = DELIMITER_MAP[options?.delimiter || 'double-curly'];

    return {
        name: 'button-block',
        init(editor: Editor) {
            editor.addToolbarDivider();

            editor.addToolbarButton(icons.buttonBlock, 'Insert Button', () => {
                const sel = window.getSelection();
                const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
                openButtonModal(editor, { ...DEFAULT_CONFIG }, null, savedRange, tokens, tokenOpen, tokenClose);
            });

            const editHandler = (e: MouseEvent) => {
                const target = e.target as HTMLElement;
                const block = target.closest('.play-editor-button-block') as HTMLElement | null;
                if (!block) return;
                e.preventDefault();
                openButtonModal(editor, parseButtonBlock(block), block, null, tokens, tokenOpen, tokenClose);
            };
            editor.editorArea.addEventListener('click', editHandler);

            editor.onDestroy(() => {
                editor.editorArea.removeEventListener('click', editHandler);
            });
        }
    };
}

/** Pre-configured button block plugin with the default email token set */
export const ButtonBlockPlugin = createButtonBlockPlugin();
