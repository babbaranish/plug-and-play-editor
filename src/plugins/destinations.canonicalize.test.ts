import { describe, it, expect, afterEach, vi } from 'vitest';
import { Editor } from '../core/Editor';
import type { Plugin } from '../core/Plugin';
import { createButtonBlockPlugin, BUTTON_BLOCK_CANONICALIZE_COMMAND } from './button-block';
import type { ButtonBlockPluginOptions } from './button-block';
import { createLinksPlugin, LINKS_CANONICALIZE_COMMAND } from './links';
import type { LinksPluginOptions } from './links';
import { SourceCodePlugin } from './source-code';
import { CodeBlockPlugin } from './code-block';
import type { Token } from './tokens';

const UUID = '3f2a9c1e-5b7d-4e2f-9a10-6c8d2e4f1a3b';
const FEE = `Fee:${UUID}:link-1:PaymentLink`;
const LABEL = 'Admission Fee, Link 1: Payment link';
const MERGE: Token[] = [
    { key: 'login_url', label: 'Login Link' },
    { key: 'token:dynamic_offer_pdf_hros', label: 'Offer letter PDF' }
];
const FEES: Token[] = [{ key: FEE, label: LABEL }];
const isPaymentLink = (key: string) => /^Fee:[0-9a-f-]{36}:link-\d+:(PaymentLink|PaymentGatewayLink)$/.test(key);
const ENCODED = '%7B%7BAdmission%20Fee,%20Link%201:%20Payment%20link%7D%7D';
const AMBIGUOUS: Token[] = [
    { key: `Fee:${UUID}:link-1:PaymentLink`, label: 'Fee, Link 1: Payment link' },
    { key: 'Fee:0b9e1a2c-1111-4222-8333-444455556666:link-1:PaymentLink', label: 'Fee, Link 1: Payment link' }
];

let editor: Editor | null = null;

afterEach(() => {
    editor?.destroy();
    editor = null;
    document.body.innerHTML = '';
});

function mountWith(html: string, plugins: Plugin[]): Editor {
    const ta = document.createElement('textarea');
    ta.value = html;
    document.body.appendChild(ta);
    editor = new Editor(ta, plugins);
    return editor;
}

const buttons = (options: ButtonBlockPluginOptions = { tokens: [...MERGE, ...FEES], isDestinationToken: isPaymentLink }) =>
    createButtonBlockPlugin(options);
const links = (options: LinksPluginOptions = { tokens: MERGE, acceptTokens: FEES, isDestinationToken: isPaymentLink }) =>
    createLinksPlugin(options);

const block = (href: string, extra = '') =>
    `<div contenteditable="false" class="play-editor-button-block"><a id="btn" href="${href}"${extra} style="color:#fff;background-color:#d63736;">Pay</a></div>`;

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const anchor = (ed: Editor, id: string) => ed.editorArea.querySelector<HTMLAnchorElement>(`#${id}`)!;
const modal = (ed: Editor) => ed.container.querySelector('.play-editor-modal');
const field = (ed: Editor, name: string) => modal(ed)?.querySelector<HTMLInputElement>(`input[name="${name}"]`) ?? null;
const hint = (ed: Editor) => modal(ed)?.querySelector<HTMLElement>('.play-editor-modal-hint') ?? null;
const errorText = (ed: Editor) => modal(ed)?.querySelector('.play-editor-modal-error')?.textContent ?? '';
const submit = (ed: Editor) => modal(ed)!.querySelector<HTMLButtonElement>('.play-editor-modal-submit')!.click();

describe('button canonicalize', () => {
    it('moves a percent encoded label to its key on mount', () => {
        const ed = mountWith(block(ENCODED), [buttons()]);
        expect(anchor(ed, 'btn').getAttribute('data-href-token')).toBe(FEE);
        expect(anchor(ed, 'btn').getAttribute('href')).toBe('#');
    });

    it('matches a label carrying non breaking spaces', () => {
        const ed = mountWith(block('{{Admission&nbsp;Fee, Link 1:&nbsp;Payment link}}'), [buttons()]);
        expect(anchor(ed, 'btn').getAttribute('data-href-token')).toBe(FEE);
    });

    it('leaves an ambiguous label alone', () => {
        const ed = mountWith(block('{{Fee, Link 1: Payment link}}'), [buttons({ tokens: AMBIGUOUS, isDestinationToken: isPaymentLink })]);
        expect(anchor(ed, 'btn').getAttribute('href')).toBe('{{Fee, Link 1: Payment link}}');
        expect(anchor(ed, 'btn').hasAttribute('data-href-token')).toBe(false);
    });

    it('leaves an exact key that is not a destination raw in href', () => {
        const ed = mountWith(block('{{login_url}}'), [buttons()]);
        expect(anchor(ed, 'btn').getAttribute('href')).toBe('{{login_url}}');
        expect(anchor(ed, 'btn').hasAttribute('data-href-token')).toBe(false);
    });

    it('moves an exact destination key out of href', () => {
        const ed = mountWith(block(`{{${FEE}}}`), [buttons()]);
        expect(anchor(ed, 'btn').getAttribute('data-href-token')).toBe(FEE);
        expect(anchor(ed, 'btn').getAttribute('href')).toBe('#');
    });

    it('rewrites a label stored in data-href-token to its key', () => {
        const ed = mountWith(block('#', ` data-href-token="${LABEL}"`), [buttons()]);
        expect(anchor(ed, 'btn').getAttribute('data-href-token')).toBe(FEE);
    });

    it('writes a non destination label as its key, raw in href', () => {
        const ed = mountWith(block('{{Login Link}}'), [buttons()]);
        expect(anchor(ed, 'btn').getAttribute('href')).toBe('{{login_url}}');
        expect(anchor(ed, 'btn').hasAttribute('data-href-token')).toBe(false);
    });

    it('leaves a label nothing resolves alone', () => {
        const ed = mountWith(block('{{Hostel Fee, Link 1: Payment link}}'), [buttons()]);
        expect(anchor(ed, 'btn').getAttribute('href')).toBe('{{Hostel Fee, Link 1: Payment link}}');
    });

    it('runs through the command once the list arrives, and only reports a real change', () => {
        let current: Token[] = [];
        const ed = mountWith(block(`{{${LABEL}}}`), [buttons({ tokens: () => current, isDestinationToken: isPaymentLink })]);
        expect(anchor(ed, 'btn').getAttribute('href')).toBe(`{{${LABEL}}}`);
        const onInput = vi.fn();
        ed.editorArea.addEventListener('input', onInput);
        current = FEES;
        expect(ed.runCommand(BUTTON_BLOCK_CANONICALIZE_COMMAND)).toBe(true);
        expect(anchor(ed, 'btn').getAttribute('data-href-token')).toBe(FEE);
        expect(onInput).toHaveBeenCalledTimes(1);
        expect(ed.runCommand(BUTTON_BLOCK_CANONICALIZE_COMMAND)).toBe(false);
        expect(onInput).toHaveBeenCalledTimes(1);
    });

    it('runs after an edit', async () => {
        const ed = mountWith('<p>Intro</p>', [buttons()]);
        ed.editorArea.insertAdjacentHTML('beforeend', block(`{{${LABEL}}}`));
        ed.editorArea.dispatchEvent(new Event('input', { bubbles: true }));
        await frame();
        await frame();
        expect(anchor(ed, 'btn').getAttribute('data-href-token')).toBe(FEE);
    });

    it('stays out of the preview and of a source view', async () => {
        const ed = mountWith('<p>Intro</p>', [buttons()]);
        ed.container.classList.add('play-editor-preview-mode');
        ed.editorArea.insertAdjacentHTML('beforeend', block(`{{${LABEL}}}`));
        ed.editorArea.dispatchEvent(new Event('input', { bubbles: true }));
        await frame();
        await frame();
        expect(anchor(ed, 'btn').hasAttribute('data-href-token')).toBe(false);
        expect(ed.runCommand(BUTTON_BLOCK_CANONICALIZE_COMMAND)).toBe(false);

        ed.container.classList.remove('play-editor-preview-mode');
        const off = ed.registerContentSource(() => ed.editorArea.innerHTML);
        expect(ed.runCommand(BUTTON_BLOCK_CANONICALIZE_COMMAND)).toBe(false);
        off();
        expect(ed.runCommand(BUTTON_BLOCK_CANONICALIZE_COMMAND)).toBe(true);
    });

    it('leaves plain links to the links plugin', () => {
        const ed = mountWith(`<p><a id="plain" href="{{${LABEL}}}">Pay</a></p>`, [buttons()]);
        expect(anchor(ed, 'plain').getAttribute('href')).toBe(`{{${LABEL}}}`);
    });
});

describe('links canonicalize', () => {
    it('fixes a hand styled payment link whose href holds the label', () => {
        const ed = mountWith(
            `<p style="text-align:center;"><a id="cta" href="{{${LABEL}}}" style="display:inline-block;background:#d63736;color:#fff;" ` +
            'target="_blank" rel="noopener noreferrer"><b>Click Here</b></a></p>',
            [links()]
        );
        const a = anchor(ed, 'cta');
        expect(a.getAttribute('data-href-token')).toBe(FEE);
        expect(a.getAttribute('href')).toBe('#');
        expect(a.getAttribute('target')).toBe('_blank');
        expect(a.getAttribute('rel')).toBe('noopener noreferrer');
        expect(a.getAttribute('style')).toContain('background');
        expect(a.querySelector('b')!.textContent).toBe('Click Here');
    });

    it('matches percent encoded braces in either case', () => {
        const ed = mountWith(
            `<p><a id="upper" href="${ENCODED}">Pay</a> <a id="lower" href="${ENCODED.toLowerCase().replace('admission', 'Admission')}">Pay</a></p>`,
            [links()]
        );
        expect(anchor(ed, 'upper').getAttribute('data-href-token')).toBe(FEE);
        expect(anchor(ed, 'lower').getAttribute('data-href-token')).toBe(FEE);
    });

    it('matches a label carrying non breaking spaces', () => {
        const ed = mountWith('<p><a id="a" href="{{Admission&nbsp;Fee, Link&nbsp;1: Payment link}}">Pay</a></p>', [links()]);
        expect(anchor(ed, 'a').getAttribute('data-href-token')).toBe(FEE);
    });

    it('leaves an ambiguous label alone', () => {
        const ed = mountWith('<p><a id="a" href="{{Fee, Link 1: Payment link}}">Pay</a></p>', [links({ tokens: [], acceptTokens: AMBIGUOUS })]);
        expect(anchor(ed, 'a').getAttribute('href')).toBe('{{Fee, Link 1: Payment link}}');
        expect(anchor(ed, 'a').hasAttribute('data-href-token')).toBe(false);
    });

    it('leaves exact keys that are not destinations raw in href', () => {
        const ed = mountWith(
            '<p><a id="pdf" href="{{token:dynamic_offer_pdf_hros}}" target="_blank">letter</a> <a id="login" href="{{login_url}}">log in</a></p>',
            [links()]
        );
        expect(anchor(ed, 'pdf').getAttribute('href')).toBe('{{token:dynamic_offer_pdf_hros}}');
        expect(anchor(ed, 'pdf').hasAttribute('data-href-token')).toBe(false);
        expect(anchor(ed, 'pdf').hasAttribute('rel')).toBe(false);
        expect(anchor(ed, 'login').getAttribute('href')).toBe('{{login_url}}');
    });

    it('moves an exact destination key into data-href-token', () => {
        const ed = mountWith(`<p><a id="a" href="{{${FEE}}}">Pay</a></p>`, [links()]);
        expect(anchor(ed, 'a').getAttribute('data-href-token')).toBe(FEE);
        expect(anchor(ed, 'a').getAttribute('href')).toBe('#');
    });

    it('treats acceptTokens as the destinations when isDestinationToken is not given', () => {
        const ed = mountWith(
            `<p><a id="fee" href="{{${FEE}}}">Pay</a> <a id="login" href="{{login_url}}">log in</a></p>`,
            [links({ tokens: MERGE, acceptTokens: FEES })]
        );
        expect(anchor(ed, 'fee').getAttribute('data-href-token')).toBe(FEE);
        expect(anchor(ed, 'login').getAttribute('href')).toBe('{{login_url}}');
    });

    it('stores a resolved label the way the link dialog does', () => {
        const ed = mountWith('<p><a id="a" href="{{Login Link}}">log in</a></p>', [links()]);
        expect(anchor(ed, 'a').getAttribute('data-href-token')).toBe('login_url');
        expect(anchor(ed, 'a').getAttribute('href')).toBe('#');
    });

    it('leaves anchors inside button blocks to the button plugin', () => {
        const ed = mountWith(block(`{{${LABEL}}}`), [links()]);
        expect(anchor(ed, 'btn').getAttribute('href')).toBe(`{{${LABEL}}}`);
    });

    it('reports through the command only when it changed something', () => {
        let accept: Token[] = [];
        const ed = mountWith(`<p><a id="a" href="{{${LABEL}}}">Pay</a></p>`, [links({ tokens: MERGE, acceptTokens: () => accept, isDestinationToken: isPaymentLink })]);
        expect(ed.runCommand(LINKS_CANONICALIZE_COMMAND)).toBe(false);
        const onInput = vi.fn();
        ed.editorArea.addEventListener('input', onInput);
        accept = FEES;
        expect(ed.runCommand(LINKS_CANONICALIZE_COMMAND)).toBe(true);
        expect(anchor(ed, 'a').getAttribute('data-href-token')).toBe(FEE);
        expect(onInput).toHaveBeenCalledTimes(1);
        expect(ed.runCommand(LINKS_CANONICALIZE_COMMAND)).toBe(false);
    });

    it('both plugins together fix a button and a plain link in one document', () => {
        const ed = mountWith(
            `${block(ENCODED)}<p><a id="plain" href="{{${LABEL}}}">Pay</a></p>`,
            [links(), buttons()]
        );
        expect(anchor(ed, 'btn').getAttribute('data-href-token')).toBe(FEE);
        expect(anchor(ed, 'plain').getAttribute('data-href-token')).toBe(FEE);
    });
});

describe('closing a source view', () => {
    const toolbarButton = (ed: Editor, title: string) =>
        ed.container.querySelector<HTMLButtonElement>(`button.play-editor-btn[title="${title}"]`)!;

    it('tidies both kinds of anchor once the content source is released', async () => {
        const ed = mountWith('<p>Intro</p>', [links(), buttons()]);
        const off = ed.registerContentSource(() => ed.editorArea.innerHTML);
        ed.editorArea.insertAdjacentHTML('beforeend', `${block(`{{${LABEL}}}`)}<p><a id="plain" href="{{${LABEL}}}">Pay</a></p>`);
        ed.editorArea.dispatchEvent(new Event('input', { bubbles: true }));
        await frame();
        await frame();
        expect(anchor(ed, 'btn').hasAttribute('data-href-token')).toBe(false);
        expect(anchor(ed, 'plain').hasAttribute('data-href-token')).toBe(false);

        off();
        await frame();
        await frame();
        expect(anchor(ed, 'btn').getAttribute('data-href-token')).toBe(FEE);
        expect(anchor(ed, 'btn').getAttribute('href')).toBe('#');
        expect(anchor(ed, 'plain').getAttribute('data-href-token')).toBe(FEE);
        expect(anchor(ed, 'plain').getAttribute('href')).toBe('#');
        expect(ed.textArea.value).toContain(`data-href-token="${FEE}"`);
    });

    it('fixes a label typed into the Source Code view as the view closes, and reports it', async () => {
        const ed = mountWith('<p><a id="a" href="https://x.test/old" target="_blank">Pay</a></p>', [links(), SourceCodePlugin]);
        const reported: string[] = [];
        ed.editorArea.addEventListener('input', () => reported.push(ed.getContent()));

        toolbarButton(ed, 'Source Code').click();
        const source = ed.container.querySelector<HTMLTextAreaElement>('.play-editor-source-textarea')!;
        source.value = source.value.replace('https://x.test/old', `{{${LABEL}}}`);
        source.dispatchEvent(new Event('input', { bubbles: true }));
        await frame();
        await frame();
        expect(source.value).toContain(`href="{{${LABEL}}}"`);
        expect(source.value).not.toContain('data-href-token');

        toolbarButton(ed, 'Source Code').click();
        await frame();
        await frame();
        expect(anchor(ed, 'a').getAttribute('data-href-token')).toBe(FEE);
        expect(anchor(ed, 'a').getAttribute('href')).toBe('#');
        expect(ed.textArea.value).toContain(`data-href-token="${FEE}"`);
        expect(reported[reported.length - 1]).toContain(`data-href-token="${FEE}"`);
    });

    it('fixes a label typed into Toggle HTML Source as the view closes', async () => {
        const ed = mountWith(`${block('https://x.test/old')}<p>tail</p>`, [buttons(), CodeBlockPlugin]);
        toolbarButton(ed, 'Toggle HTML Source').click();
        ed.editorArea.innerText = ed.editorArea.innerText.replace('https://x.test/old', `{{${LABEL}}}`);
        ed.editorArea.dispatchEvent(new Event('input', { bubbles: true }));
        await frame();
        await frame();
        expect(ed.editorArea.querySelector('a')).toBeNull();

        toolbarButton(ed, 'Toggle HTML Source').click();
        await frame();
        await frame();
        expect(anchor(ed, 'btn').getAttribute('data-href-token')).toBe(FEE);
        expect(anchor(ed, 'btn').getAttribute('href')).toBe('#');
        expect(ed.textArea.value).toContain(`data-href-token="${FEE}"`);
    });

    it('reports nothing when closing a view leaves nothing to tidy', async () => {
        const ed = mountWith(`<p><a id="a" href="#" data-href-token="${FEE}">Pay</a></p>`, [links(), SourceCodePlugin]);
        const onInput = vi.fn();
        ed.editorArea.addEventListener('input', onInput);
        toolbarButton(ed, 'Source Code').click();
        toolbarButton(ed, 'Source Code').click();
        await frame();
        await frame();
        expect(onInput).not.toHaveBeenCalled();
        expect(anchor(ed, 'a').getAttribute('data-href-token')).toBe(FEE);
    });
});

describe('link bubble', () => {
    const hover = (ed: Editor, id: string) => {
        anchor(ed, id).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        const bubble = ed.container.querySelector('.play-editor-link-bubble')!;
        return {
            url: bubble.querySelector<HTMLElement>('.play-editor-link-bubble-url')!,
            note: bubble.querySelector<HTMLElement>('.play-editor-link-bubble-note')!
        };
    };

    it('shows the label of a data-href-token link in a token style', () => {
        const ed = mountWith(`<p><a id="a" href="#" data-href-token="${FEE}">Pay</a></p>`, [links()]);
        const { url, note } = hover(ed, 'a');
        expect(url.textContent).toBe(`{{${LABEL}}}`);
        expect(url.title).toBe(`{{${FEE}}}`);
        expect(url.classList.contains('play-editor-link-bubble-url-token')).toBe(true);
        expect(note.style.display).toBe('none');
    });

    it('shows the key when no label is known', () => {
        const ed = mountWith(`<p><a id="a" href="#" data-href-token="${FEE}">Pay</a></p>`, [links({ tokens: [] })]);
        expect(hover(ed, 'a').url.textContent).toBe(`{{${FEE}}}`);
    });

    it('marks a label that resolves to nothing and says so plainly', () => {
        const ed = mountWith('<p><a id="a" href="{{Hostel Fee, Link 1: Payment link}}">Pay</a></p>', [links()]);
        const { url, note } = hover(ed, 'a');
        expect(url.textContent).toBe('{{Hostel Fee, Link 1: Payment link}}');
        expect(url.classList.contains('play-editor-link-bubble-url-error')).toBe(true);
        expect(note.textContent).toBe('Not a known variable');
        expect(note.style.display).toBe('');
    });

    it('does not flag an unlisted variable that has the shape of a key', () => {
        const ed = mountWith('<p><a id="a" href="{{magic_link}}">Open</a></p>', [links()]);
        const { url, note } = hover(ed, 'a');
        expect(url.textContent).toBe('{{magic_link}}');
        expect(url.classList.contains('play-editor-link-bubble-url-error')).toBe(false);
        expect(note.style.display).toBe('none');
    });

    it('still shows an ordinary address as it is', () => {
        const ed = mountWith('<p><a id="a" href="https://x.test/page">Read</a></p>', [links()]);
        const { url } = hover(ed, 'a');
        expect(url.textContent).toBe('https://x.test/page');
        expect(url.classList.contains('play-editor-link-bubble-url-token')).toBe(false);
    });
});

describe('Edit Link', () => {
    const openEdit = (ed: Editor, id: string) =>
        anchor(ed, id).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

    it('shows the label of a data-href-token link and keeps the key on Save', () => {
        const ed = mountWith(`<p><a id="a" href="#" data-href-token="${FEE}">Pay</a></p>`, [links()]);
        openEdit(ed, 'a');
        expect(field(ed, 'url')!.value).toBe(`{{${LABEL}}}`);
        expect(hint(ed)!.textContent).toBe(`Links to ${LABEL}`);
        submit(ed);
        expect(errorText(ed)).toBe('');
        expect(anchor(ed, 'a').getAttribute('data-href-token')).toBe(FEE);
    });

    it('keeps a destination the lists do not know when the URL is left alone', () => {
        const ed = mountWith(`<p><a id="a" href="#" data-href-token="${FEE}">Pay</a></p>`, [links({ tokens: [] })]);
        openEdit(ed, 'a');
        expect(field(ed, 'url')!.value).toBe(`{{${FEE}}}`);
        field(ed, 'text')!.value = 'Pay now';
        submit(ed);
        expect(errorText(ed)).toBe('');
        expect(anchor(ed, 'a').getAttribute('data-href-token')).toBe(FEE);
        expect(anchor(ed, 'a').textContent).toBe('Pay now');
    });

    it('warns in the hint about a variable it will refuse', () => {
        const ed = mountWith('<p><a id="a" href="https://x.test">Pay</a></p>', [links()]);
        openEdit(ed, 'a');
        const url = field(ed, 'url')!;
        url.value = '{{Hostel Fee, Link 1: Payment link}}';
        url.dispatchEvent(new Event('input', { bubbles: true }));
        expect(hint(ed)!.textContent).toBe('Not a known variable. Pick one from the { } list beside this field.');
        expect(hint(ed)!.className).toContain('play-editor-modal-hint-error');
    });

    it('turns a pasted chip into its label', () => {
        const ed = mountWith('<p><a id="a" href="https://x.test">Pay</a></p>', [links()]);
        openEdit(ed, 'a');
        const url = field(ed, 'url')!;
        url.select();
        const data = new DataTransfer();
        data.setData('text/html', `<span class="play-editor-token" data-token="${FEE}" data-key="${FEE}">{{${LABEL}}}</span>`);
        data.setData('text/plain', `{{${LABEL}}}`);
        url.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
        expect(url.value).toBe(`{{${LABEL}}}`);
        submit(ed);
        expect(anchor(ed, 'a').getAttribute('data-href-token')).toBe(FEE);
    });
});
