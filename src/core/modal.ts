import type { Editor } from './Editor';

export type ModalFieldType =
    | 'text'
    | 'url'
    | 'textarea'
    | 'color'
    | 'number'
    | 'select';

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
}

/** A row of fields (rendered side-by-side) or a single field. */
export type ModalFieldRow = ModalField | ModalField[];

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
    fields: ModalFieldRow[];
    submitLabel?: string;
    cancelLabel?: string;
    theme?: ModalTheme;
    onSubmit: (
        values: Record<string, string>,
        helpers: { showError: (msg: string) => void; close: () => void }
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

    return { close, root: backdrop };
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
    if (field.type === 'textarea') {
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

    label.appendChild(input);

    return { wrapper: label, input };
}

export function openFormModal(editor: Editor, options: FormModalOptions): ModalHandle {
    const { backdrop, dialog, body, footer, errorBox } = buildShell(editor, options.title);

    const form = document.createElement('form');
    form.className = 'play-editor-modal-form';
    form.addEventListener('submit', (e) => e.preventDefault());

    const inputs: Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> = {};
    let autofocusAssigned = false;

    options.fields.forEach((row) => {
        if (Array.isArray(row)) {
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
            values[name] = el.value;
        });
        showError('');
        options.onSubmit(values, { showError, close: handle.close });
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
