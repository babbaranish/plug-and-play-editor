import { describe, it, expect, afterEach, vi } from 'vitest';
import { Editor } from '../core/Editor';
import {
    createButtonBlockPlugin,
    openButtonDialog,
    BUTTON_BLOCK_OPEN_COMMAND
} from './button-block';
import type { ButtonBlockPluginOptions } from './button-block';
import type { Token } from './tokens';

const UUID = '3f2a9c1e-5b7d-4e2f-9a10-6c8d2e4f1a3b';
const FEE = `Fee:${UUID}:link-1:PaymentLink`;
const FEE_PAGE = `Fee:${UUID}:link-1:PaymentGatewayLink`;
const LABEL = 'Admission Fee, Link 1: Payment link';
const PAGE_LABEL = 'Admission Fee, Link 1: Payment page';
const MERGE: Token[] = [
    { key: 'login_url', label: 'Login Link', category: 'Links' },
    { key: 'first_name', label: 'First Name', category: 'Recipient' }
];
const FEES: Token[] = [
    { key: FEE, label: LABEL, category: 'Admission Fee' },
    { key: FEE_PAGE, label: PAGE_LABEL, category: 'Admission Fee' }
];
const isPaymentLink = (key: string) => /^Fee:[0-9a-f-]{36}:link-\d+:(PaymentLink|PaymentGatewayLink)$/.test(key);
const DEFAULT_OPTIONS: ButtonBlockPluginOptions = { tokens: [...MERGE, ...FEES], isDestinationToken: isPaymentLink };

let editor: Editor | null = null;

afterEach(() => {
    editor?.destroy();
    editor = null;
    document.body.innerHTML = '';
});

function mount(html: string, options: ButtonBlockPluginOptions = DEFAULT_OPTIONS): Editor {
    const ta = document.createElement('textarea');
    ta.value = html;
    document.body.appendChild(ta);
    editor = new Editor(ta, [createButtonBlockPlugin(options)]);
    return editor;
}

function select(startNode: Node, startOffset: number, endNode: Node = startNode, endOffset: number = startOffset): Range {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    return range;
}

const modal = (ed: Editor) => ed.container.querySelector('.play-editor-modal');
const title = (ed: Editor) => modal(ed)?.querySelector('.play-editor-modal-title')?.textContent;
const field = (ed: Editor, name: string) => modal(ed)?.querySelector<HTMLInputElement>(`input[name="${name}"]`) ?? null;
const hint = (ed: Editor) => modal(ed)?.querySelector<HTMLElement>('.play-editor-modal-hint') ?? null;
const errorText = (ed: Editor) => modal(ed)?.querySelector('.play-editor-modal-error')?.textContent ?? '';
const anchorOf = (ed: Editor) => ed.editorArea.querySelector<HTMLAnchorElement>('.play-editor-button-block a');
const blockOf = (ed: Editor) => ed.editorArea.querySelector<HTMLElement>('.play-editor-button-block');

function clickInsertButton(ed: Editor): void {
    ed.toolbar.querySelector<HTMLButtonElement>('button[title="Insert Button"]')!.click();
}

function submit(ed: Editor): void {
    modal(ed)!.querySelector<HTMLButtonElement>('.play-editor-modal-submit')!.click();
}

function setValue(ed: Editor, name: string, value: string): void {
    const input = field(ed, name)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertWithUrl(ed: Editor, url: string): void {
    clickInsertButton(ed);
    setValue(ed, 'url', url);
    submit(ed);
}

function paste(input: HTMLInputElement, html: string, plain: string): ClipboardEvent {
    const data = new DataTransfer();
    if (html) data.setData('text/html', html);
    data.setData('text/plain', plain);
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    return event;
}

const chipHtml = (key: string, label: string) =>
    `<span class="play-editor-token" contenteditable="false" data-token="${key}" data-key="${key}">{{${label}}}</span>`;

const existingBlock = (anchorAttrs: string, text = 'Pay now') =>
    `<div contenteditable="false" class="play-editor-button-block" style="margin:1em 0;text-align:center;">` +
    `<a ${anchorAttrs} style="display:inline-block;padding:12px 24px;color:#ffffff;background-color:#d63736;` +
    `border-radius:4px;text-decoration:none;">${text}</a></div>`;

describe('Button URL field', () => {
    it('stores a payment link label as its key in data-href-token', () => {
        const ed = mount('<p id="p">Pay below</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 9);
        insertWithUrl(ed, `{{${LABEL}}}`);
        expect(errorText(ed)).toBe('');
        const a = anchorOf(ed)!;
        expect(a.getAttribute('data-href-token')).toBe(FEE);
        expect(a.getAttribute('href')).toBe('#');
    });

    it('stores a payment link key typed in full the same way', () => {
        const ed = mount('<p id="p">Pay below</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 9);
        insertWithUrl(ed, `{{${FEE_PAGE}}}`);
        expect(anchorOf(ed)!.getAttribute('data-href-token')).toBe(FEE_PAGE);
        expect(anchorOf(ed)!.getAttribute('href')).toBe('#');
    });

    it('keeps a variable that is not a destination raw in href', () => {
        const ed = mount('<p id="p">Log in</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 6);
        insertWithUrl(ed, '{{login_url}}');
        const a = anchorOf(ed)!;
        expect(a.getAttribute('href')).toBe('{{login_url}}');
        expect(a.hasAttribute('data-href-token')).toBe(false);
    });

    it('writes the key, not the label, for a non destination variable picked by label', () => {
        const ed = mount('<p id="p">Log in</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 6);
        insertWithUrl(ed, '{{Login Link}}');
        expect(anchorOf(ed)!.getAttribute('href')).toBe('{{login_url}}');
        expect(anchorOf(ed)!.hasAttribute('data-href-token')).toBe(false);
    });

    it('refuses an unknown label, names it and says how to fix it', () => {
        const ed = mount('<p id="p">Pay below</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 9);
        insertWithUrl(ed, '{{Hostel Fee, Link 1: Payment link}}');
        expect(errorText(ed)).toContain('"Hostel Fee, Link 1: Payment link"');
        expect(errorText(ed)).toContain('{ } list');
        expect(blockOf(ed)).toBeNull();
    });

    it('accepts an unknown key shaped variable as before', () => {
        const ed = mount('<p id="p">Open</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 4);
        insertWithUrl(ed, '{{magic_link}}');
        expect(errorText(ed)).toBe('');
        expect(anchorOf(ed)!.getAttribute('href')).toBe('{{magic_link}}');
        expect(anchorOf(ed)!.hasAttribute('data-href-token')).toBe(false);
    });

    it('stores an unlisted key in data-href-token when the host calls it a destination', () => {
        const other = `Fee:${UUID}:link-2:PaymentLink`;
        const ed = mount('<p id="p">Pay</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        insertWithUrl(ed, `{{${other}}}`);
        expect(anchorOf(ed)!.getAttribute('data-href-token')).toBe(other);
    });

    it('refuses a label shared by two different variables', () => {
        const ed = mount('<p id="p">Pay</p>', {
            tokens: [
                { key: `Fee:${UUID}:link-1:PaymentLink`, label: 'Fee, Link 1: Payment link' },
                { key: 'Fee:0b9e1a2c-1111-4222-8333-444455556666:link-1:PaymentLink', label: 'Fee, Link 1: Payment link' }
            ],
            isDestinationToken: isPaymentLink
        });
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        insertWithUrl(ed, '{{Fee, Link 1: Payment link}}');
        expect(errorText(ed)).toContain('matches more than one variable');
        expect(blockOf(ed)).toBeNull();
    });

    it('does not treat the same variable listed twice as ambiguous', () => {
        const ed = mount('<p id="p">Pay</p>', { tokens: [...MERGE, ...FEES], acceptTokens: FEES, isDestinationToken: isPaymentLink });
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        insertWithUrl(ed, `{{${LABEL}}}`);
        expect(anchorOf(ed)!.getAttribute('data-href-token')).toBe(FEE);
    });

    it('treats acceptTokens as the destinations when isDestinationToken is not given', () => {
        const ed = mount('<p id="p">Pay</p>', { tokens: MERGE, acceptTokens: FEES });
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        insertWithUrl(ed, `{{${LABEL}}}`);
        expect(anchorOf(ed)!.getAttribute('data-href-token')).toBe(FEE);
    });

    it('reads a plain array the host refills in place on every open', () => {
        const list: Token[] = [];
        const ed = mount('<p id="p">Pay</p>', { tokens: list, isDestinationToken: isPaymentLink });
        list.splice(0, list.length, ...MERGE, ...FEES);
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        clickInsertButton(ed);
        const options = Array.from(modal(ed)!.querySelectorAll('input[name="url"] + select option')).map((o) => o.getAttribute('value'));
        expect(options).toContain(FEE);
        setValue(ed, 'url', `{{${LABEL}}}`);
        submit(ed);
        expect(anchorOf(ed)!.getAttribute('data-href-token')).toBe(FEE);
    });

    it('reads a token function on every open', () => {
        let current: Token[] = [];
        const ed = mount('<p id="p">Pay</p>', { tokens: () => current, isDestinationToken: isPaymentLink });
        current = FEES;
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        insertWithUrl(ed, `{{${PAGE_LABEL}}}`);
        expect(anchorOf(ed)!.getAttribute('data-href-token')).toBe(FEE_PAGE);
    });

    it('keeps an ordinary address in href', () => {
        const ed = mount('<p id="p">Pay</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        insertWithUrl(ed, 'https://pay.test/a?x=1&y=2');
        expect(anchorOf(ed)!.getAttribute('href')).toBe('https://pay.test/a?x=1&y=2');
        expect(anchorOf(ed)!.hasAttribute('data-href-token')).toBe(false);
    });

    it('still refuses something that is neither an address nor one variable', () => {
        const ed = mount('<p id="p">Pay</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        insertWithUrl(ed, 'pay here');
        expect(errorText(ed)).toContain('Enter a link starting with http, https or mailto');
        expect(blockOf(ed)).toBeNull();
    });

    it('writes every variable inside an address that resolves as its key', () => {
        const ed = mount('<p id="p">Pay</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        insertWithUrl(ed, 'https://pay.test/?to={{Login Link}}&n={{FIRST_NAME}}&k={{magic_link}}');
        expect(errorText(ed)).toBe('');
        expect(anchorOf(ed)!.getAttribute('href')).toBe('https://pay.test/?to={{login_url}}&n={{first_name}}&k={{magic_link}}');
        expect(anchorOf(ed)!.hasAttribute('data-href-token')).toBe(false);
    });

    it('refuses a label inside an address that resolves to nothing, and names it', () => {
        const ed = mount('<p id="p">Pay</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        insertWithUrl(ed, 'https://pay.test/?to={{Hostel Fee, Link 1: Payment link}}');
        expect(errorText(ed)).toBe('"Hostel Fee, Link 1: Payment link" is not one of the variables available here. Pick it from the { } list beside the Button URL field.');
        expect(blockOf(ed)).toBeNull();
    });

    it('refuses a shared label inside an address', () => {
        const ed = mount('<p id="p">Pay</p>', {
            tokens: [
                { key: `Fee:${UUID}:link-1:PaymentLink`, label: 'Fee, Link 1: Payment link' },
                { key: 'Fee:0b9e1a2c-1111-4222-8333-444455556666:link-1:PaymentLink', label: 'Fee, Link 1: Payment link' }
            ],
            isDestinationToken: isPaymentLink
        });
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        insertWithUrl(ed, 'https://pay.test/?to={{Fee, Link 1: Payment link}}');
        expect(errorText(ed)).toContain('"Fee, Link 1: Payment link" matches more than one variable');
        expect(blockOf(ed)).toBeNull();
    });
});

describe('Edit Button', () => {
    it('shows the label of a data-href-token button and keeps the token on Update', () => {
        const ed = mount(`<p>Intro</p>${existingBlock(`href="#" data-href-token="${FEE}" target="_blank" rel="noopener noreferrer"`)}<p>End</p>`);
        const onInput = vi.fn();
        ed.editorArea.addEventListener('input', onInput);
        anchorOf(ed)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(title(ed)).toBe('Edit Button');
        expect(field(ed, 'url')!.value).toBe(`{{${LABEL}}}`);
        expect(hint(ed)!.textContent).toBe(`Links to ${LABEL}`);
        submit(ed);
        const a = anchorOf(ed)!;
        expect(a.getAttribute('data-href-token')).toBe(FEE);
        expect(a.getAttribute('href')).toBe('#');
        expect(a.textContent).toBe('Pay now');
        expect(onInput).toHaveBeenCalled();
    });

    it('keeps the token when only the colour changes', () => {
        const ed = mount(existingBlock(`href="#" data-href-token="${FEE}"`));
        anchorOf(ed)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        setValue(ed, 'bgColor', '#000000');
        submit(ed);
        const a = anchorOf(ed)!;
        expect(a.getAttribute('data-href-token')).toBe(FEE);
        expect(a.getAttribute('href')).toBe('#');
        expect(a.getAttribute('style')).toContain('background-color:#000000');
        expect(ed.editorArea.querySelectorAll('.play-editor-button-block')).toHaveLength(1);
    });

    it('keeps a token the host does not list when the field is left alone', () => {
        const ed = mount(existingBlock(`href="#" data-href-token="${FEE}"`), { tokens: MERGE, isDestinationToken: isPaymentLink });
        anchorOf(ed)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(field(ed, 'url')!.value).toBe(`{{${FEE}}}`);
        submit(ed);
        expect(errorText(ed)).toBe('');
        expect(anchorOf(ed)!.getAttribute('data-href-token')).toBe(FEE);
    });

    it('round trips a raw variable that is not a destination', () => {
        const ed = mount(existingBlock('href="{{login_url}}"'));
        anchorOf(ed)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(field(ed, 'url')!.value).toBe('{{Login Link}}');
        submit(ed);
        expect(anchorOf(ed)!.getAttribute('href')).toBe('{{login_url}}');
        expect(anchorOf(ed)!.hasAttribute('data-href-token')).toBe(false);
    });

    it('keeps the anchor target and rel, and a zero radius', () => {
        const ed = mount(
            '<div contenteditable="false" class="play-editor-button-block"><a href="https://pay.test" target="_self" rel="nofollow" ' +
            'style="padding:10px 20px;color:#ffffff;background-color:#111111;border-radius:0px;">Go</a></div>'
        );
        anchorOf(ed)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(field(ed, 'borderRadius')!.value).toBe('0');
        submit(ed);
        const a = anchorOf(ed)!;
        expect(a.getAttribute('target')).toBe('_self');
        expect(a.getAttribute('rel')).toBe('nofollow');
        expect(a.getAttribute('style')).toContain('border-radius:0px');
    });

    it('does not open while the editor is read only or in the preview', () => {
        const ed = mount(existingBlock('href="https://pay.test"'));
        ed.editorArea.contentEditable = 'false';
        anchorOf(ed)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(modal(ed)).toBeNull();
        ed.editorArea.contentEditable = 'true';
        ed.container.classList.add('play-editor-preview-mode');
        anchorOf(ed)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(modal(ed)).toBeNull();
    });

    it('shows a stored label it cannot resolve and refuses to save it', () => {
        const ed = mount(existingBlock('href="#" data-href-token="Hostel Fee, Link 1: Payment link"'));
        anchorOf(ed)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(field(ed, 'url')!.value).toBe('{{Hostel Fee, Link 1: Payment link}}');
        expect(hint(ed)!.className).toContain('play-editor-modal-hint-error');
        submit(ed);
        expect(errorText(ed)).toContain('"Hostel Fee, Link 1: Payment link"');
    });

    it('writes the key when the label it shows becomes part of an address', () => {
        const ed = mount(existingBlock('href="{{login_url}}"'));
        anchorOf(ed)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(field(ed, 'url')!.value).toBe('{{Login Link}}');
        setValue(ed, 'url', `https://go.example/?to=${field(ed, 'url')!.value}`);
        submit(ed);
        expect(errorText(ed)).toBe('');
        expect(anchorOf(ed)!.getAttribute('href')).toBe('https://go.example/?to={{login_url}}');
        expect(anchorOf(ed)!.hasAttribute('data-href-token')).toBe(false);
    });

    it('writes the key of a label the lists do not contain when it becomes part of an address', () => {
        const ed = mount('<p id="p">Pay</p>', { tokens: [], isDestinationToken: isPaymentLink });
        openButtonDialog(ed, { token: { key: FEE, label: 'Tuition, Link 1: Payment link' } });
        setValue(ed, 'url', `https://go.example/?to=${field(ed, 'url')!.value}`);
        expect(hint(ed)!.style.display).toBe('none');
        submit(ed);
        expect(errorText(ed)).toBe('');
        expect(anchorOf(ed)!.getAttribute('href')).toBe(`https://go.example/?to={{${FEE}}}`);
        expect(anchorOf(ed)!.hasAttribute('data-href-token')).toBe(false);
    });
});

describe('Inserting a button', () => {
    it('goes inside a nested table cell at the caret', () => {
        const ed = mount(
            '<table><tbody><tr><td><table><tbody><tr><td id="cell">Pay below</td></tr></tbody></table></td></tr></tbody></table><p>Regards</p>'
        );
        const cell = ed.editorArea.querySelector('#cell')!;
        select(cell.firstChild!, 9);
        insertWithUrl(ed, `{{${LABEL}}}`);
        const block = blockOf(ed)!;
        expect(block.parentElement).toBe(cell);
        expect(block.previousSibling!.textContent).toBe('Pay below');
        expect(block.querySelector('a')!.getAttribute('data-href-token')).toBe(FEE);
    });

    it('goes after the paragraph the caret is in, never inside it', () => {
        const ed = mount('<p id="intro">Complete your payment:</p><p id="after">Regards</p>');
        const intro = ed.editorArea.querySelector('#intro')!;
        select(intro.firstChild!, 10);
        insertWithUrl(ed, 'https://pay.test');
        const block = blockOf(ed)!;
        expect(intro.contains(block)).toBe(false);
        expect(intro.nextElementSibling).toBe(block);
        expect(block.nextElementSibling).toBe(ed.editorArea.querySelector('#after'));
    });

    it('goes after a heading the caret is in', () => {
        const ed = mount('<h2 id="h">Fees</h2><p>Body</p>');
        select(ed.editorArea.querySelector('#h')!.firstChild!, 4);
        insertWithUrl(ed, 'https://pay.test');
        expect(ed.editorArea.querySelector('#h')!.nextElementSibling).toBe(blockOf(ed));
    });

    it('never nests the button inside a link the caret is in', () => {
        const ed = mount('<p id="p"><a id="link" href="https://x.test">Pay here</a> now</p><p>End</p>');
        select(ed.editorArea.querySelector('#link')!.firstChild!, 3);
        insertWithUrl(ed, 'https://pay.test');
        const block = blockOf(ed)!;
        expect(block.closest('a')).toBeNull();
        expect(ed.editorArea.querySelector('#link')!.contains(block)).toBe(false);
        expect(ed.editorArea.querySelector('#p')!.nextElementSibling).toBe(block);
    });

    it('steps out of a link in a table cell to just after it', () => {
        const ed = mount('<table><tbody><tr><td id="cell"><a id="link" href="https://x.test">Pay</a></td></tr></tbody></table>');
        select(ed.editorArea.querySelector('#link')!.firstChild!, 1);
        insertWithUrl(ed, 'https://pay.test');
        const block = blockOf(ed)!;
        expect(block.parentElement).toBe(ed.editorArea.querySelector('#cell'));
        expect(ed.editorArea.querySelector('#link')!.nextSibling).toBe(block);
    });

    it('goes just after the link even with the caret at its very start', () => {
        const ed = mount('<table><tbody><tr><td id="cell">See <a id="link" href="https://x.test">Pay</a></td></tr></tbody></table>');
        select(ed.editorArea.querySelector('#link')!.firstChild!, 0);
        insertWithUrl(ed, 'https://pay.test');
        expect(ed.editorArea.querySelector('#link')!.nextSibling).toBe(blockOf(ed));
    });

    it('never nests a button inside another button block', () => {
        const ed = mount(`<table><tbody><tr><td id="cell">${existingBlock('href="https://old.test"', 'Old')}</td></tr></tbody></table>`);
        const old = blockOf(ed)!;
        const range = document.createRange();
        range.setStart(old.querySelector('a')!.firstChild!, 1);
        range.collapse(true);
        openButtonDialog(ed, { url: 'https://new.test', text: 'New', range });
        submit(ed);
        const blocks = ed.editorArea.querySelectorAll('.play-editor-button-block');
        expect(blocks).toHaveLength(2);
        expect(old.querySelector('.play-editor-button-block')).toBeNull();
        expect(old.nextSibling).toBe(blocks[1]);
    });

    it('steps out of inline formatting in a table cell', () => {
        const ed = mount('<table><tbody><tr><td id="cell"><span id="s">Pay below</span></td></tr></tbody></table>');
        select(ed.editorArea.querySelector('#s')!.firstChild!, 9);
        insertWithUrl(ed, 'https://pay.test');
        expect(ed.editorArea.querySelector('#s')!.nextSibling).toBe(blockOf(ed));
    });

    it('takes the place of an empty paragraph, which stays after it for the caret', () => {
        const ed = mount('<p>Intro</p><p id="empty"><br></p>');
        const empty = ed.editorArea.querySelector('#empty')!;
        select(empty, 0);
        insertWithUrl(ed, 'https://pay.test');
        expect(empty.previousElementSibling).toBe(blockOf(ed));
        expect(window.getSelection()!.anchorNode).toBe(empty);
    });

    it('adds a paragraph after a button that ends the content and puts the caret there', () => {
        const ed = mount('<p id="only">Hello</p>');
        select(ed.editorArea.querySelector('#only')!.firstChild!, 5);
        insertWithUrl(ed, 'https://pay.test');
        const block = blockOf(ed)!;
        const tail = block.nextElementSibling as HTMLElement;
        expect(tail.tagName).toBe('P');
        expect(tail.innerHTML).toBe('<br>');
        expect(ed.editorArea.lastElementChild).toBe(tail);
        expect(window.getSelection()!.anchorNode).toBe(tail);
    });

    it('does not add a paragraph when the button is not the last thing', () => {
        const ed = mount('<p id="one">One</p><p id="two">Two</p>');
        select(ed.editorArea.querySelector('#one')!.firstChild!, 3);
        insertWithUrl(ed, 'https://pay.test');
        expect(ed.editorArea.querySelectorAll('p')).toHaveLength(2);
    });

    it('adds a paragraph after a button that ends a table cell and puts the caret there', () => {
        const ed = mount('<table><tbody><tr><td id="cell">Pay below\n    </td></tr></tbody></table><p>Regards</p>');
        const cell = ed.editorArea.querySelector('#cell')!;
        select(cell.firstChild!, 9);
        insertWithUrl(ed, 'https://pay.test');
        const block = blockOf(ed)!;
        const tail = block.nextElementSibling as HTMLElement;
        expect(block.parentElement).toBe(cell);
        expect(tail.tagName).toBe('P');
        expect(tail.innerHTML).toBe('<br>');
        expect(tail.parentElement).toBe(cell);
        expect(window.getSelection()!.anchorNode).toBe(tail);
    });

    it('does not add a paragraph when the table cell has more after the button', () => {
        const ed = mount('<table><tbody><tr><td id="cell">Pay below then thanks</td></tr></tbody></table>');
        const cell = ed.editorArea.querySelector('#cell')!;
        select(cell.firstChild!, 9);
        insertWithUrl(ed, 'https://pay.test');
        expect(blockOf(ed)!.parentElement).toBe(cell);
        expect(cell.querySelectorAll('p')).toHaveLength(0);
    });

    it('appends at the end when the selection is outside the editor', () => {
        const ed = mount('<p>Hello</p>');
        const outside = document.createElement('div');
        outside.textContent = 'elsewhere';
        document.body.appendChild(outside);
        select(outside.firstChild!, 2);
        insertWithUrl(ed, 'https://pay.test');
        const block = blockOf(ed)!;
        expect(block.parentElement).toBe(ed.editorArea);
        expect(block.previousElementSibling!.textContent).toBe('Hello');
        expect(outside.querySelector('.play-editor-button-block')).toBeNull();
    });

    it('reports the change', () => {
        const ed = mount('<p id="p">Pay</p>');
        const onInput = vi.fn();
        ed.editorArea.addEventListener('input', onInput);
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        insertWithUrl(ed, 'https://pay.test');
        expect(onInput).toHaveBeenCalled();
        expect(ed.textArea.value).toContain('play-editor-button-block');
    });
});

describe('Turning a selected chip into a button', () => {
    it('prefills the URL with the chip and replaces the chip', () => {
        const ed = mount(`<p id="p">Pay here: ${chipHtml(FEE, LABEL)}&nbsp;</p><p>Regards</p>`);
        const chip = ed.editorArea.querySelector('.play-editor-token')!;
        const range = document.createRange();
        range.selectNode(chip);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
        clickInsertButton(ed);
        expect(field(ed, 'url')!.value).toBe(`{{${LABEL}}}`);
        submit(ed);
        expect(ed.editorArea.querySelector('.play-editor-token')).toBeNull();
        const block = blockOf(ed)!;
        expect(ed.editorArea.querySelector('#p')!.nextElementSibling).toBe(block);
        expect(block.querySelector('a')!.getAttribute('data-href-token')).toBe(FEE);
    });

    it('works when the selection sits inside the chip text', () => {
        const ed = mount(`<table><tbody><tr><td id="cell">${chipHtml(FEE, LABEL)}</td></tr></tbody></table>`);
        const text = ed.editorArea.querySelector('.play-editor-token')!.firstChild!;
        select(text, 0, text, text.textContent!.length);
        clickInsertButton(ed);
        submit(ed);
        const cell = ed.editorArea.querySelector('#cell')!;
        expect(cell.querySelector('.play-editor-token')).toBeNull();
        expect(cell.querySelector('.play-editor-button-block a')!.getAttribute('data-href-token')).toBe(FEE);
    });

    it('keeps the key of a chip the host does not list', () => {
        const ed = mount(`<p id="p">${chipHtml(FEE, LABEL)}</p>`, { tokens: MERGE, isDestinationToken: isPaymentLink });
        const range = document.createRange();
        range.selectNode(ed.editorArea.querySelector('.play-editor-token')!);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
        clickInsertButton(ed);
        expect(field(ed, 'url')!.value).toBe(`{{${LABEL}}}`);
        submit(ed);
        expect(anchorOf(ed)!.getAttribute('data-href-token')).toBe(FEE);
    });

    it('drops a link left empty around the chip and never nests the button in it', () => {
        const ed = mount(`<p id="p">Pay <a id="wrap" href="#" data-href-token="${FEE}">${chipHtml(FEE, LABEL)}</a> today</p>`);
        const range = document.createRange();
        range.selectNode(ed.editorArea.querySelector('.play-editor-token')!);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
        clickInsertButton(ed);
        submit(ed);
        expect(ed.editorArea.querySelector('#wrap')).toBeNull();
        expect(blockOf(ed)!.closest('a')).toBeNull();
        expect(ed.editorArea.querySelectorAll('[data-href-token]')).toHaveLength(1);
    });

    it('leaves the chip alone when the selection also covers other text', () => {
        const ed = mount(`<p id="p">Pay here: ${chipHtml(FEE, LABEL)}</p>`);
        const p = ed.editorArea.querySelector('#p')!;
        select(p, 0, p, p.childNodes.length);
        clickInsertButton(ed);
        expect(field(ed, 'url')!.value).toBe('https://');
    });
});

describe('openButtonDialog', () => {
    it('opens Insert Button prefilled with a token and inserts at the given range', () => {
        const ed = mount('<table><tbody><tr><td id="cell">Pay below</td></tr></tbody></table><p>Regards</p>');
        const cell = ed.editorArea.querySelector('#cell')!;
        const range = document.createRange();
        range.setStart(cell.firstChild!, 9);
        range.collapse(true);
        window.getSelection()!.removeAllRanges();
        expect(openButtonDialog(ed, { token: { key: FEE, label: LABEL }, text: 'Pay Now', url: 'https://ignored.test', range })).toBe(true);
        expect(title(ed)).toBe('Insert Button');
        expect(field(ed, 'text')!.value).toBe('Pay Now');
        expect(field(ed, 'url')!.value).toBe(`{{${LABEL}}}`);
        expect(hint(ed)!.textContent).toBe(`Links to ${LABEL}`);
        submit(ed);
        const a = cell.querySelector<HTMLAnchorElement>('.play-editor-button-block a')!;
        expect(a.getAttribute('data-href-token')).toBe(FEE);
        expect(a.getAttribute('href')).toBe('#');
        expect(a.textContent).toBe('Pay Now');
    });

    it('accepts and shows a label the host lists do not contain', () => {
        const ed = mount('<p id="p">Pay</p>', { tokens: [], isDestinationToken: isPaymentLink });
        openButtonDialog(ed, { token: { key: FEE, label: 'Tuition, Link 1: Payment link' } });
        expect(field(ed, 'url')!.value).toBe('{{Tuition, Link 1: Payment link}}');
        submit(ed);
        expect(anchorOf(ed)!.getAttribute('data-href-token')).toBe(FEE);
    });

    it('applies the style fields of the request', () => {
        const ed = mount('<p id="p">Pay</p>');
        openButtonDialog(ed, { url: 'https://pay.test', bgColor: '#d63736', textColor: '#fff', borderRadius: 6, paddingV: 8, paddingH: 16 });
        expect(field(ed, 'bgColor')!.value).toBe('#d63736');
        expect(field(ed, 'textColor')!.value).toBe('#ffffff');
        expect(field(ed, 'borderRadius')!.value).toBe('6');
        expect(field(ed, 'paddingV')!.value).toBe('8');
        expect(field(ed, 'paddingH')!.value).toBe('16');
    });

    it('replaces the given element', () => {
        const ed = mount(`<p>Pay here:</p><p id="line">${chipHtml(FEE, LABEL)}</p>`);
        const chip = ed.editorArea.querySelector('.play-editor-token')!;
        openButtonDialog(ed, { token: { key: FEE, label: LABEL }, replace: chip });
        submit(ed);
        expect(ed.editorArea.querySelector('.play-editor-token')).toBeNull();
        expect(ed.editorArea.querySelector('#line')!.previousElementSibling).toBe(blockOf(ed));
    });

    it('returns false when the button plugin is absent', () => {
        const ta = document.createElement('textarea');
        document.body.appendChild(ta);
        editor = new Editor(ta, []);
        expect(openButtonDialog(editor, { url: 'https://pay.test' })).toBe(false);
    });

    it('explains instead of inserting while a source view is active', () => {
        const ed = mount('<p>Pay</p>');
        ed.registerContentSource(() => '<p>Pay</p>');
        expect(ed.runCommand(BUTTON_BLOCK_OPEN_COMMAND, { url: 'https://pay.test' })).toBe(false);
        expect(title(ed)).toBe('Switch back to the editing view');
        expect(field(ed, 'url')).toBeNull();
    });
});

describe('Button URL hint', () => {
    it('says what the value resolves to, and nothing for an address', () => {
        const ed = mount('<p id="p">Pay</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        clickInsertButton(ed);
        expect(hint(ed)!.style.display).toBe('none');

        setValue(ed, 'url', `{{${LABEL}}}`);
        expect(hint(ed)!.textContent).toBe(`Links to ${LABEL}`);
        expect(hint(ed)!.className).toContain('play-editor-modal-hint-ok');

        setValue(ed, 'url', '{{Hostel Fee, Link 1: Payment link}}');
        expect(hint(ed)!.textContent).toBe('Not a known variable. Pick one from the { } list beside this field.');
        expect(hint(ed)!.className).toContain('play-editor-modal-hint-error');

        setValue(ed, 'url', '{{magic_link}}');
        expect(hint(ed)!.textContent).toBe('Not in the variable list. It will be used exactly as typed.');
        expect(hint(ed)!.className).toBe('play-editor-modal-hint');

        setValue(ed, 'url', 'https://pay.test');
        expect(hint(ed)!.style.display).toBe('none');
    });

    it('flags a label inside an address that resolves to nothing', () => {
        const ed = mount('<p id="p">Pay</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        clickInsertButton(ed);
        setValue(ed, 'url', 'https://pay.test/?to={{Hostel Fee}}');
        expect(hint(ed)!.textContent).toBe('"Hostel Fee" is not a known variable. Pick one from the { } list beside this field.');
        expect(hint(ed)!.className).toContain('play-editor-modal-hint-error');
        expect(hint(ed)!.style.display).toBe('');

        setValue(ed, 'url', 'https://pay.test/?to={{Login Link}}');
        expect(hint(ed)!.style.display).toBe('none');
    });

    it('updates after a pick from the { } list, which replaces a bare https://', () => {
        const ed = mount('<p id="p">Pay</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        clickInsertButton(ed);
        const picker = field(ed, 'url')!.parentElement!.querySelector<HTMLSelectElement>('select')!;
        picker.value = FEE;
        picker.dispatchEvent(new Event('change', { bubbles: true }));
        expect(field(ed, 'url')!.value).toBe(`{{${FEE}}}`);
        expect(hint(ed)!.textContent).toBe(`Links to ${LABEL}`);
    });
});

describe('Pasting a chip into the button dialog', () => {
    it('writes the label into the URL field when it resolves to the chip', () => {
        const ed = mount('<p id="p">Pay</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        clickInsertButton(ed);
        const url = field(ed, 'url')!;
        const event = paste(url, `<meta charset="utf-8">${chipHtml(FEE, LABEL)}`, `{{${LABEL}}}`);
        expect(event.defaultPrevented).toBe(true);
        expect(url.value).toBe(`{{${LABEL}}}`);
        expect(hint(ed)!.textContent).toBe(`Links to ${LABEL}`);
    });

    it('takes the chip whatever plain text came with it, such as its label without braces or its key', () => {
        const ed = mount('<p id="p">Pay</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        clickInsertButton(ed);
        const url = field(ed, 'url')!;
        expect(paste(url, chipHtml(FEE, LABEL), LABEL).defaultPrevented).toBe(true);
        expect(url.value).toBe(`{{${LABEL}}}`);
        expect(hint(ed)!.textContent).toBe(`Links to ${LABEL}`);

        url.select();
        expect(paste(url, chipHtml(FEE, LABEL), FEE).defaultPrevented).toBe(true);
        expect(url.value).toBe(`{{${LABEL}}}`);
    });

    it('treats blank wrappers around a single chip as nothing else', () => {
        const ed = mount('<p id="p">Pay</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        clickInsertButton(ed);
        const url = field(ed, 'url')!;
        const html = `<meta charset="utf-8"><span style="color:#1e293b"></span>&nbsp;${chipHtml(FEE, LABEL)}\u200b<span style="color:#1e293b"> </span>`;
        expect(paste(url, html, `{{${LABEL}}}`).defaultPrevented).toBe(true);
        expect(url.value).toBe(`{{${LABEL}}}`);
    });

    it('writes the key when the label is shared by another variable', () => {
        const other = 'Fee:0b9e1a2c-1111-4222-8333-444455556666:link-1:PaymentLink';
        const ed = mount('<p id="p">Pay</p>', {
            tokens: [{ key: FEE, label: 'Fee, Link 1: Payment link' }, { key: other, label: 'Fee, Link 1: Payment link' }],
            isDestinationToken: isPaymentLink
        });
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        clickInsertButton(ed);
        const url = field(ed, 'url')!;
        paste(url, chipHtml(FEE, 'Fee, Link 1: Payment link'), '{{Fee, Link 1: Payment link}}');
        expect(url.value).toBe(`{{${FEE}}}`);
    });

    it('writes the key when the chip lands inside an address', () => {
        const ed = mount('<p id="p">Pay</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        clickInsertButton(ed);
        const url = field(ed, 'url')!;
        url.value = 'https://pay.test/?to=';
        url.setSelectionRange(url.value.length, url.value.length);
        expect(paste(url, chipHtml('login_url', 'Login Link'), '{{Login Link}}').defaultPrevented).toBe(true);
        expect(url.value).toBe('https://pay.test/?to={{login_url}}');

        url.setSelectionRange(0, 0);
        paste(url, chipHtml(FEE, LABEL), `{{${LABEL}}}`);
        expect(url.value).toBe(`{{${FEE}}}https://pay.test/?to={{login_url}}`);
    });

    it('writes the label when the chip replaces the whole address', () => {
        const ed = mount('<p id="p">Pay</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        clickInsertButton(ed);
        const url = field(ed, 'url')!;
        url.value = 'https://pay.test/old';
        url.setSelectionRange(0, url.value.length);
        paste(url, chipHtml(FEE, LABEL), `{{${LABEL}}}`);
        expect(url.value).toBe(`{{${LABEL}}}`);
    });

    it('writes the key into the text field, where a label would never be filled in', () => {
        const ed = mount('<p id="p">Pay</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        clickInsertButton(ed);
        const text = field(ed, 'text')!;
        text.value = '';
        text.setSelectionRange(0, 0);
        paste(text, chipHtml('first_name', 'First Name'), '{{First Name}}');
        expect(text.value).toBe('{{first_name}}');
    });

    it('leaves plain text and mixed pastes to the browser', () => {
        const ed = mount('<p id="p">Pay</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        clickInsertButton(ed);
        const url = field(ed, 'url')!;
        expect(paste(url, '', '{{Admission Fee, Link 1: Payment link}}').defaultPrevented).toBe(false);
        expect(paste(url, `Pay ${chipHtml(FEE, LABEL)} now`, `Pay {{${LABEL}}} now`).defaultPrevented).toBe(false);
        expect(paste(url, `Pay ${chipHtml(FEE, LABEL)} now`, '').defaultPrevented).toBe(false);
        expect(paste(url, `Pay ${chipHtml(FEE, LABEL)} now`, `{{${LABEL}}}`).defaultPrevented).toBe(false);
        expect(paste(url, chipHtml(FEE, LABEL) + chipHtml(FEE_PAGE, PAGE_LABEL), 'two chips').defaultPrevented).toBe(false);
        expect(url.value).toBe('https://');
    });

    it('leaves a lone data-key element that is not an editor chip to the browser', () => {
        const ed = mount('<p id="p">Pay</p>');
        select(ed.editorArea.querySelector('#p')!.firstChild!, 3);
        clickInsertButton(ed);
        const url = field(ed, 'url')!;
        expect(paste(url, '<span data-key="a1b2">Pay here</span>', 'Pay here').defaultPrevented).toBe(false);
        expect(paste(url, '<span data-token="first_name">Ada</span>', 'Ada').defaultPrevented).toBe(false);
        expect(url.value).toBe('https://');
    });
});
