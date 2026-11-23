import type { Editor } from './Editor';

export type ModalFieldType =
    | 'text'
    | 'url'
    | 'textarea'
    | 'color'
    | 'number'
    | 'select'
    /** Value is `'true'` when checked, `''` when not. */
    | 'checkbox';

export interface ModalFieldToken {
    key: string;
    label: string;
    category?: string;
}

export interface ModalFieldHint {
    text: string;
    tone?: 'ok' | 'error';
}

export interface ModalField {
    name: string;
    label: string;
    type?: ModalFieldType;
    value?: string;
    placeholder?: string;
    options?: { value: string; label: string }[];
    min?: number;
    max?: number;
    step?: number;
    /** Renders a compact "{ }" picker beside a text/url field that inserts `${open}key${close}` at the cursor */
    tokens?: {
        list: ModalFieldToken[];
        open: string;
        close: string;
        pasteText?: (key: string, label: string) => string;
        wholeValue?: (key: string) => boolean;
    };
    hint?: (value: string) => ModalFieldHint | null;
}

/** A row of fields (rendered side-by-side) or a single field. */
export type ModalFieldRow = ModalField | ModalField[];

/** One item of a {@link ModalListField}: its sub-field values by name. */
export type ModalListItem = Record<string, string>;

/**
 * A list the user can grow and reorder: each item is a row of sub-fields,
 * with move up / move down / remove, and an add button below. Its items are
 * passed to `onSubmit` as `helpers.lists[name]`.
 */
export interface ModalListField {
    readonly kind: 'list';
    readonly name: string;
    readonly label: string;
    /** The sub-fields of every item. Their names are the keys of each {@link ModalListItem}. */
    readonly itemFields: readonly ModalField[];
    /** Starting items. */
    readonly items?: readonly ModalListItem[];
    /** Values of an item the add button creates. */
    readonly newItem?: () => ModalListItem;
    /** Text of the add button. Default `'Add'`. */
    readonly addLabel?: string;
    /** Names one item in button labels, e.g. `'field'` → "Remove field". Default `'item'`. */
    readonly itemLabel?: string;
    /** Items can't be removed below this. Default 0. */
    readonly minItems?: number;
    /** No more items can be added past this. */
    readonly maxItems?: number;
    /** Whether a sub-field shows for an item's current values (e.g. choices only for a dropdown). Default: always. */
    readonly isFieldVisible?: (item: ModalListItem, fieldName: string) => boolean;
    /**
     * Runs when a sub-field changes, with the item before and after. Returns
     * values to set on other sub-fields of that item, e.g. a name that
     * follows its label.
     */
    readonly onItemChange?: (item: ModalListItem, changed: string, previous: ModalListItem) => Partial<ModalListItem> | void;
    /** A message for an item, given every item (e.g. "name used twice"). Re-run on any change in the list. */
    readonly itemHint?: (item: ModalListItem, index: number, items: readonly ModalListItem[]) => ModalFieldHint | null;
}

export type ModalFormEntry = ModalFieldRow | ModalListField;

function isListField(entry: ModalFormEntry): entry is ModalListField {
    return !Array.isArray(entry) && (entry as ModalListField).kind === 'list';
}

export interface ModalButtonTheme {
    background?: string;
    color?: string;
    borderColor?: string;
    fontFamily?: string;
    fontSize?: string;
    fontWeight?: string;
}

export interface ModalTheme {
    submit?: ModalButtonTheme;
    cancel?: ModalButtonTheme;
}

export interface FormModalOptions {
    title: string;
    fields: ModalFormEntry[];
    submitLabel?: string;
    cancelLabel?: string;
    theme?: ModalTheme;
    /** A wider dialog, for forms with lists. */
    wide?: boolean;
    onSubmit: (
        values: Record<string, string>,
        helpers: {
            showError: (msg: string) => void;
            close: () => void;
            /** Items of each list field, by its name. */
            lists: Record<string, ModalListItem[]>;
        }
    ) => void;
}

export interface InfoModalOptions {
    title: string;
    message?: string;
    content?: string;
    closeLabel?: string;
    preformatted?: boolean;
    theme?: ModalTheme;
}

function applyButtonTheme(btn: HTMLButtonElement, theme?: ModalButtonTheme) {
    if (!theme) return;
    if (theme.background) btn.style.background = theme.background;
    if (theme.color) btn.style.color = theme.color;
    if (theme.borderColor) btn.style.borderColor = theme.borderColor;
    if (theme.fontFamily) btn.style.fontFamily = theme.fontFamily;
    if (theme.fontSize) btn.style.fontSize = theme.fontSize;
    if (theme.fontWeight) btn.style.fontWeight = theme.fontWeight;
}

interface ModalHandle {
    close: () => void;
    root: HTMLDivElement;
}

function buildShell(editor: Editor, title: string): {
    backdrop: HTMLDivElement;
    dialog: HTMLDivElement;
    body: HTMLDivElement;
    footer: HTMLDivElement;
    errorBox: HTMLDivElement;
} {
    editor.container.style.position = editor.container.style.position || 'relative';

    const backdrop = document.createElement('div');
    backdrop.className = 'play-editor-modal-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'play-editor-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', title);

    const header = document.createElement('div');
    header.className = 'play-editor-modal-header';

    const heading = document.createElement('h3');
    heading.className = 'play-editor-modal-title';
    heading.textContent = title;

    const closeX = document.createElement('button');
    closeX.type = 'button';
    closeX.className = 'play-editor-modal-close';
    closeX.setAttribute('aria-label', 'Close');
    closeX.textContent = '\u00d7';

    header.appendChild(heading);
    header.appendChild(closeX);

    const body = document.createElement('div');
    body.className = 'play-editor-modal-body';

    const errorBox = document.createElement('div');
    errorBox.className = 'play-editor-modal-error';
    errorBox.setAttribute('role', 'alert');
    errorBox.style.display = 'none';

    const footer = document.createElement('div');
    footer.className = 'play-editor-modal-footer';

    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(errorBox);
    dialog.appendChild(footer);

    backdrop.appendChild(dialog);

    (dialog as HTMLDivElement & { __closeX?: HTMLButtonElement }).__closeX = closeX;

    return { backdrop, dialog, body, footer, errorBox };
}

/**
 * Per-editor registry of currently-open modals so `editor.destroy()` can
 * tear them down. Uses a WeakMap keyed on the editor so GC can reclaim
 * entries when an editor is dropped.
 */
const openModals: WeakMap<Editor, Set<() => void>> = new WeakMap();

function registerForDestroy(editor: Editor, close: () => void): void {
    let set = openModals.get(editor);
    if (!set) {
        set = new Set();
        openModals.set(editor, set);
        // First modal on this editor — hook into its destroy lifecycle.
        editor.onDestroy(() => {
            const live = openModals.get(editor);
            if (!live) return;
            // Snapshot so `close()` callbacks can mutate the set without
            // disrupting iteration.
            const snapshot = Array.from(live);
            live.clear();
            for (const fn of snapshot) fn();
            openModals.delete(editor);
        });
    }
    set.add(close);
}

function mountModal(
    editor: Editor,
    backdrop: HTMLDivElement,
    dialog: HTMLDivElement,
    onClose: () => void
): ModalHandle {
    let closed = false;

    const close = () => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey);
        backdrop.remove();
        openModals.get(editor)?.delete(close);
        onClose();
    };

    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
    };

    backdrop.addEventListener('mousedown', (e) => {
        if (e.target === backdrop) close();
    });

    const closeX = (dialog as HTMLDivElement & { __closeX?: HTMLButtonElement }).__closeX;
    if (closeX) {
        closeX.addEventListener('click', (e) => {
            e.preventDefault();
            close();
        });
    }

    document.addEventListener('keydown', onKey);

    editor.container.appendChild(backdrop);
    registerForDestroy(editor, close);

    return { close, root: backdrop };
}

const BARE_URL_VALUE = /^\s*(?:#|[a-z][a-z0-9+.-]*:(?:\/\/)?)?\s*$/i;

function replacedSpan(input: HTMLInputElement): [number, number] {
    const value = input.value;
    if (input.type === 'url' && BARE_URL_VALUE.test(value)) return [0, value.length];
    return [input.selectionStart ?? value.length, input.selectionEnd ?? value.length];
}

function replacesWholeValue(input: HTMLInputElement): boolean {
    const [start, end] = replacedSpan(input);
    return !(input.value.slice(0, start) + input.value.slice(end)).trim();
}

function wantsWholeValue(tokens: NonNullable<ModalField['tokens']>, key: string): boolean {
    try {
        return Boolean(tokens.wholeValue?.(key));
    } catch {
        return false;
    }
}

function insertTextIntoInput(input: HTMLInputElement, text: string, wholeValue = false) {
    const value = input.value;
    const [start, end] = wholeValue ? [0, value.length] : replacedSpan(input);
    input.value = value.slice(0, start) + text + value.slice(end);
    input.focus();
    const newPos = start + text.length;
    input.setSelectionRange(newPos, newPos);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertTokenIntoInput(input: HTMLInputElement, key: string, open: string, close: string, wholeValue = false) {
    insertTextIntoInput(input, `${open}${key}${close}`, wholeValue);
}

function squashText(value: string): string {
    return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

const PASTED_CHIP = '.play-editor-token[data-token], .play-editor-token[data-key]';

function pastedChip(e: ClipboardEvent): { key: string; text: string; alone: boolean } | null {
    const html = e.clipboardData?.getData('text/html');
    if (!html) return null;
    const holder = document.createElement('template');
    holder.innerHTML = html;
    const chips = Array.from(holder.content.querySelectorAll<HTMLElement>(PASTED_CHIP))
        .filter(el => !el.parentElement?.closest(PASTED_CHIP));
    if (chips.length !== 1) return null;
    const chip = chips[0];
    const key = (chip.getAttribute('data-token') || chip.getAttribute('data-key') || '').trim();
    const text = squashText(chip.textContent ?? '');
    chip.remove();
    if (!key) return null;
    return { key, text, alone: !(holder.content.textContent ?? '').replace(/[\s\u00a0\u200b]/g, '') };
}

function chipLabel(text: string, open: string, close: string): string {
    if (text.length > open.length + close.length && text.startsWith(open) && text.endsWith(close)) {
        return text.slice(open.length, text.length - close.length).trim();
    }
    return text;
}

function attachChipPaste(input: HTMLInputElement, tokens: NonNullable<ModalField['tokens']>) {
    input.addEventListener('paste', (e) => {
        const chip = pastedChip(e as ClipboardEvent);
        if (!chip) return;
        const whole = wantsWholeValue(tokens, chip.key);
        if (!chip.alone && !whole) return;
        e.preventDefault();
        const fallback = `${tokens.open}${chip.key}${tokens.close}`;
        let text = fallback;
        if (tokens.pasteText && (whole || replacesWholeValue(input))) {
            try {
                text = tokens.pasteText(chip.key, chipLabel(chip.text, tokens.open, tokens.close)) || fallback;
            } catch {
                text = fallback;
            }
        }
        insertTextIntoInput(input, text, whole);
    });
}

let hintCount = 0;

function attachHint(
    label: HTMLLabelElement,
    input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    hintFor: (value: string) => ModalFieldHint | null
) {
    const hint = document.createElement('span');
    hint.className = 'play-editor-modal-hint';
    hint.id = `play-editor-modal-hint-${++hintCount}`;
    hint.setAttribute('aria-live', 'polite');
    input.setAttribute('aria-describedby', hint.id);

    const update = () => {
        let result: ModalFieldHint | null = null;
        try {
            result = hintFor(input.value);
        } catch {
            result = null;
        }
        hint.textContent = result?.text ?? '';
        hint.className = result?.tone
            ? `play-editor-modal-hint play-editor-modal-hint-${result.tone}`
            : 'play-editor-modal-hint';
        hint.style.display = result?.text ? '' : 'none';
    };

    input.addEventListener('input', update);
    input.addEventListener('change', update);
    update();
    label.appendChild(hint);
}

function buildTokenSelect(input: HTMLInputElement, tokens: NonNullable<ModalField['tokens']>): HTMLSelectElement {
    const { list, open, close } = tokens;
    const select = document.createElement('select');
    select.className = 'play-editor-modal-token-select';
    select.title = 'Insert variable';
    select.setAttribute('aria-label', 'Insert variable');

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '{ }';
    select.appendChild(placeholder);

    const grouped = new Map<string, ModalFieldToken[]>();
    list.forEach(t => {
        const cat = t.category || '';
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)!.push(t);
    });

    grouped.forEach((groupTokens, category) => {
        let container: HTMLSelectElement | HTMLOptGroupElement = select;
        if (category) {
            container = document.createElement('optgroup');
            container.label = category;
            select.appendChild(container);
        }
        groupTokens.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.key;
            opt.textContent = t.label;
            container.appendChild(opt);
        });
    });

    select.addEventListener('change', () => {
        if (!select.value) return;
        insertTokenIntoInput(input, select.value, open, close, wantsWholeValue(tokens, select.value));
        select.value = '';
    });

    return select;
}

function renderField(
    field: ModalField,
    autofocus: boolean
): { wrapper: HTMLLabelElement; input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement } {
    const label = document.createElement('label');
    label.className = 'play-editor-modal-label';
    if (field.type === 'color') label.classList.add('play-editor-modal-label-color');

    const labelText = document.createElement('span');
    labelText.className = 'play-editor-modal-label-text';
    labelText.textContent = field.label;
    label.appendChild(labelText);

    let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (field.type === 'checkbox') {
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.className = 'play-editor-modal-checkbox';
        box.name = field.name;
        box.checked = field.value === 'true';
        if (autofocus) box.setAttribute('data-autofocus', 'true');
        label.classList.add('play-editor-modal-label-checkbox');
        label.insertBefore(box, labelText);
        return { wrapper: label, input: box };
    } else if (field.type === 'textarea') {
        const ta = document.createElement('textarea');
        ta.rows = 4;
        input = ta;
    } else if (field.type === 'select') {
        const sel = document.createElement('select');
        (field.options || []).forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            sel.appendChild(o);
        });
        input = sel;
    } else {
        const i = document.createElement('input');
        i.type = field.type === 'color' ? 'color'
              : field.type === 'number' ? 'number'
              : field.type === 'url' ? 'url'
              : 'text';
        if (field.type === 'number') {
            if (field.min !== undefined) i.min = String(field.min);
            if (field.max !== undefined) i.max = String(field.max);
            if (field.step !== undefined) i.step = String(field.step);
        }
        input = i;
    }

    input.className = field.type === 'color'
        ? 'play-editor-modal-input play-editor-modal-input-color'
        : 'play-editor-modal-input';
    input.name = field.name;
    if ('placeholder' in input && field.placeholder) {
        (input as HTMLInputElement | HTMLTextAreaElement).placeholder = field.placeholder;
    }
    if (field.value !== undefined) input.value = field.value;
    if (autofocus) input.setAttribute('data-autofocus', 'true');

    if (field.tokens && field.tokens.list.length > 0 && input instanceof HTMLInputElement) {
        const row = document.createElement('div');
        row.className = 'play-editor-modal-field-row';
        row.appendChild(input);
        row.appendChild(buildTokenSelect(input, field.tokens));
        label.appendChild(row);
    } else {
        label.appendChild(input);
    }

    if (field.tokens && input instanceof HTMLInputElement) attachChipPaste(input, field.tokens);
    if (field.hint) attachHint(label, input, field.hint);

    return { wrapper: label, input };
}

type ModalInput = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function fieldValue(el: ModalInput): string {
    return el instanceof HTMLInputElement && el.type === 'checkbox' ? (el.checked ? 'true' : '') : el.value;
}

function setFieldValue(el: ModalInput, value: string): void {
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = value === 'true';
    else el.value = value;
}

function listButton(text: string, label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'play-editor-modal-list-btn';
    b.textContent = text;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', (e) => {
        e.preventDefault();
        onClick();
    });
    return b;
}

interface ListRow {
    el: HTMLDivElement;
    inputs: Map<string, ModalInput>;
    wrappers: Map<string, HTMLLabelElement>;
    hint: HTMLSpanElement;
    up: HTMLButtonElement;
    down: HTMLButtonElement;
    remove: HTMLButtonElement;
}

function renderList(list: ModalListField): { element: HTMLFieldSetElement; values: () => ModalListItem[] } {
    const noun = list.itemLabel ?? 'item';
    const min = list.minItems ?? 0;

    const wrap = document.createElement('fieldset');
    wrap.className = 'play-editor-modal-list';
    wrap.setAttribute('data-list', list.name);
    const legend = document.createElement('legend');
    legend.className = 'play-editor-modal-label-text';
    legend.textContent = list.label;
    const itemsEl = document.createElement('div');
    itemsEl.className = 'play-editor-modal-list-items';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'play-editor-modal-list-add';
    addBtn.textContent = `+ ${list.addLabel ?? 'Add'}`;
    wrap.append(legend, itemsEl, addBtn);

    const rows: ListRow[] = [];
    const read = (row: ListRow): ModalListItem =>
        Object.fromEntries(Array.from(row.inputs, ([name, el]) => [name, fieldValue(el)]));

    const refresh = () => {
        const all = rows.map(read);
        rows.forEach((row, i) => {
            const item = all[i];
            row.wrappers.forEach((wrapper, name) => {
                let visible = true;
                try {
                    visible = list.isFieldVisible ? list.isFieldVisible(item, name) : true;
                } catch { /* show it */ }
                wrapper.style.display = visible ? '' : 'none';
            });
            let hint: ModalFieldHint | null = null;
            try {
                hint = list.itemHint?.(item, i, all) ?? null;
            } catch {
                hint = null;
            }
            row.hint.textContent = hint?.text ?? '';
            row.hint.className = hint?.tone ? `play-editor-modal-hint play-editor-modal-hint-${hint.tone}` : 'play-editor-modal-hint';
            row.hint.style.display = hint?.text ? '' : 'none';
            row.up.disabled = i === 0;
            row.down.disabled = i === rows.length - 1;
            row.remove.disabled = rows.length <= min;
            row.el.setAttribute('aria-label', `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${i + 1}`);
        });
        addBtn.disabled = list.maxItems !== undefined && rows.length >= list.maxItems;
    };

    const move = (row: ListRow, by: -1 | 1) => {
        const i = rows.indexOf(row);
        const j = i + by;
        if (i < 0 || j < 0 || j >= rows.length) return;
        rows.splice(i, 1);
        rows.splice(j, 0, row);
        itemsEl.insertBefore(row.el, rows[j + 1]?.el ?? null);
        refresh();
        (by < 0 ? row.up : row.down).focus();
    };

    const addRow = (values: ModalListItem, focus = false) => {
        const el = document.createElement('div');
        el.className = 'play-editor-modal-list-item';
        el.setAttribute('role', 'group');
        const fieldsEl = document.createElement('div');
        fieldsEl.className = 'play-editor-modal-list-fields';
        const inputs = new Map<string, ModalInput>();
        const wrappers = new Map<string, HTMLLabelElement>();
        for (const field of list.itemFields) {
            const { wrapper, input } = renderField({ ...field, value: values[field.name] ?? field.value }, false);
            wrapper.setAttribute('data-field', field.name);
            inputs.set(field.name, input);
            wrappers.set(field.name, wrapper);
            fieldsEl.appendChild(wrapper);
        }
        const hint = document.createElement('span');
        hint.className = 'play-editor-modal-hint';
        hint.setAttribute('aria-live', 'polite');

        const row: ListRow = {
            el, inputs, wrappers, hint,
            up: listButton('↑', `Move ${noun} up`, () => move(row, -1)),
            down: listButton('↓', `Move ${noun} down`, () => move(row, 1)),
            remove: listButton('×', `Remove ${noun}`, () => {
                const i = rows.indexOf(row);
                if (i < 0 || rows.length <= min) return;
                rows.splice(i, 1);
                el.remove();
                refresh();
                addBtn.focus();
            }),
        };
        const controls = document.createElement('div');
        controls.className = 'play-editor-modal-list-controls';
        controls.append(row.up, row.down, row.remove);
        el.append(fieldsEl, controls, hint);

        let previous = read(row);
        const onChange = (e: Event) => {
            const changed = Array.from(inputs).find(([, input]) => input === e.target)?.[0];
            if (!changed) return;
            let updates: Partial<ModalListItem> | void;
            try {
                updates = list.onItemChange?.(read(row), changed, previous);
            } catch {
                updates = undefined;
            }
            if (updates) {
                for (const [name, value] of Object.entries(updates)) {
                    const input = inputs.get(name);
                    if (input && value !== undefined) setFieldValue(input, value);
                }
            }
            previous = read(row);
            refresh();
        };
        fieldsEl.addEventListener('input', onChange);
        fieldsEl.addEventListener('change', onChange);

        itemsEl.appendChild(el);
        rows.push(row);
        if (focus) inputs.values().next().value?.focus();
    };

    (list.items ?? []).forEach(item => addRow(item));
    while (rows.length < min) addRow(list.newItem?.() ?? {});
    addBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (list.maxItems !== undefined && rows.length >= list.maxItems) return;
        addRow(list.newItem?.() ?? {}, true);
        refresh();
    });
    refresh();

    return { element: wrap, values: () => rows.map(read) };
}

export function openFormModal(editor: Editor, options: FormModalOptions): ModalHandle {
    const { backdrop, dialog, body, footer, errorBox } = buildShell(editor, options.title);
    if (options.wide) dialog.classList.add('play-editor-modal-wide');

    const form = document.createElement('form');
    form.className = 'play-editor-modal-form';
    form.addEventListener('submit', (e) => e.preventDefault());

    const inputs: Record<string, ModalInput> = {};
    const lists: Record<string, () => ModalListItem[]> = {};
    let autofocusAssigned = false;

    options.fields.forEach((row) => {
        if (isListField(row)) {
            const { element, values } = renderList(row);
            lists[row.name] = values;
            form.appendChild(element);
        } else if (Array.isArray(row)) {
            const rowEl = document.createElement('div');
            rowEl.className = 'play-editor-modal-row';
            row.forEach((field) => {
                const { wrapper, input } = renderField(field, !autofocusAssigned);
                autofocusAssigned = true;
                inputs[field.name] = input;
                rowEl.appendChild(wrapper);
            });
            form.appendChild(rowEl);
        } else {
            const { wrapper, input } = renderField(row, !autofocusAssigned);
            autofocusAssigned = true;
            inputs[row.name] = input;
            form.appendChild(wrapper);
        }
    });

    body.appendChild(form);

    const showError = (msg: string) => {
        errorBox.textContent = msg;
        errorBox.style.display = msg ? 'block' : 'none';
    };

    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'play-editor-modal-submit';
    submitBtn.textContent = options.submitLabel || 'Submit';
    applyButtonTheme(submitBtn, options.theme?.submit);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'play-editor-modal-cancel';
    cancelBtn.textContent = options.cancelLabel || 'Cancel';
    applyButtonTheme(cancelBtn, options.theme?.cancel);

    footer.appendChild(cancelBtn);
    footer.appendChild(submitBtn);

    const handle = mountModal(editor, backdrop, dialog, () => {});

    const submit = () => {
        const values: Record<string, string> = {};
        Object.entries(inputs).forEach(([name, el]) => {
            values[name] = fieldValue(el);
        });
        const listValues: Record<string, ModalListItem[]> = {};
        Object.entries(lists).forEach(([name, read]) => {
            listValues[name] = read();
        });
        showError('');
        options.onSubmit(values, { showError, close: handle.close, lists: listValues });
    };

    submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        submit();
    });
    cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handle.close();
    });

    form.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const target = e.target as HTMLElement;
            if (target.tagName === 'TEXTAREA' && !e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            submit();
        }
    });

    setTimeout(() => {
        const first = dialog.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-autofocus]');
        first?.focus();
        if (first instanceof HTMLInputElement && first.type !== 'color') first.select();
    }, 0);

    return handle;
}

export function openInfoModal(editor: Editor, options: InfoModalOptions): ModalHandle {
    const { backdrop, dialog, body, footer } = buildShell(editor, options.title);

    if (options.message) {
        const p = document.createElement('p');
        p.className = 'play-editor-modal-message';
        p.textContent = options.message;
        body.appendChild(p);
    }

    if (options.content !== undefined) {
        const contentEl = options.preformatted
            ? document.createElement('pre')
            : document.createElement('div');
        contentEl.className = 'play-editor-modal-content';
        contentEl.textContent = options.content;
        body.appendChild(contentEl);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'play-editor-modal-submit';
    closeBtn.textContent = options.closeLabel || 'Close';
    applyButtonTheme(closeBtn, options.theme?.submit);
    footer.appendChild(closeBtn);

    const handle = mountModal(editor, backdrop, dialog, () => {});
    closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handle.close();
    });
    setTimeout(() => closeBtn.focus(), 0);
    return handle;
}
