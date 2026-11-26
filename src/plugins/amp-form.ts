import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import type { ModalFormEntry, ModalListField, ModalListItem } from '../core/modal';
import type { AmpFormConfig, AmpFormConfigIssue, AmpFormField, AmpFormFieldType, AmpFormStyle } from '../amp/forms/types';
import { compactAmpFormStyle, normalizeAmpFormStyle, validateAmpFormStyle } from '../amp/forms/formStyle';
import { AmpFormConfigError } from '../amp/forms/formConfig';
import {
    caretBlock,
    designRows,
    inAlternateView,
    optional,
    placeBlock,
    readableStyleIssue,
    startingStyle,
    styleFromValues,
    withDefaultStyle
} from './amp-shared';
import { icons } from '../core/icons';
import { openFormModal } from '../core/modal';
import {
    AMP_FORM_CLASS,
    AMP_FORM_SUMMARY_ATTR,
    formatAmpFormChoices,
    parseAmpFormChoices,
    parseAmpFormConfig,
    readAmpFormConfig,
    readStoredAmpFormConfig
} from '../amp/forms/formConfig';
import { endpointIssue, validateAmpFormConfig } from '../amp/forms/formValidator';
import { endpointLabel, renderAmpFormBlock, summaryOf } from '../amp/forms/formRenderer';

/** Inserts a form block. Takes an {@link AmpFormConfig}; returns the block, or null. */
export const AMP_FORM_INSERT_COMMAND = 'amp-form:insert';
/** Changes a form block. Takes the block and a partial config; returns the new block, or null. */
export const AMP_FORM_UPDATE_COMMAND = 'amp-form:update';

/** The fields a form made from the toolbar starts with. */
const STARTER_FIELDS: AmpFormConfig['fields'] = [
    { name: 'email', type: 'email', label: 'Email address', placeholder: 'you@example.com', required: true },
];

function insertForm(editor: Editor, config: unknown, after: Element | null, defaultStyle?: AmpFormStyle): HTMLElement | null {
    // Throws AmpFormConfigError listing every problem.
    parseAmpFormConfig(config);
    if (inAlternateView(editor)) return null;

    // The plugin's default design is stored on the form, so it looks the same
    // wherever it is converted (the converter doesn't know the plugin's defaults).
    const block = renderAmpFormBlock(withDefaultStyle(config as AmpFormConfig, defaultStyle), document);
    placeBlock(editor, block, after);
    editor.notifyContentChange();
    return block;
}

/**
 * Applies `patch` over the config stored on `block`. Settings the patch
 * doesn't name (the endpoint included) are kept; a key set to `undefined`
 * is removed. The block is replaced, so its summary and fallback follow.
 */
function updateForm(editor: Editor, block: Element, patch: Partial<AmpFormConfig>): HTMLElement | null {
    if (!block.classList.contains(AMP_FORM_CLASS) || !editor.editorArea.contains(block)) return null;
    const next = { ...(readStoredAmpFormConfig(block) ?? {}), ...patch };
    // Throws AmpFormConfigError listing every problem; the block is left as it was.
    parseAmpFormConfig(next);
    if (inAlternateView(editor)) return null;
    const replacement = renderAmpFormBlock(JSON.parse(JSON.stringify(next)) as AmpFormConfig, document);
    block.replaceWith(replacement);
    editor.notifyContentChange();
    return replacement;
}

// ── Fields section of the dialog ──────────────────────────────────

const FIELD_TYPE_CHOICES: { value: AmpFormFieldType; label: string }[] = [
    { value: 'text', label: 'Text' },
    { value: 'email', label: 'Email' },
    { value: 'number', label: 'Number' },
    { value: 'textarea', label: 'Long text' },
    { value: 'select', label: 'Dropdown' },
];

/** A field name made from a label: "Full name" → "full_name". Starts with a letter, as names must. */
export function fieldNameFromLabel(label: string): string {
    const base = label
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
    if (!base) return '';
    return /^[a-z]/.test(base) ? base : `field_${base}`;
}

// Dropdown choices use the same "Basic, Pro plan = pro" syntax as the stored data-options.
const parseChoices = parseAmpFormChoices;
const formatChoices = formatAmpFormChoices;

function itemFromField(field: Partial<AmpFormField>): ModalListItem {
    return {
        label: field.label ?? '',
        name: field.name ?? '',
        type: field.type ?? 'text',
        placeholder: field.placeholder ?? '',
        options: formatChoices(field.options),
        required: field.required ? 'true' : '',
    };
}

function fieldFromItem(item: ModalListItem): AmpFormField {
    const type = item.type as AmpFormFieldType;
    const field: { -readonly [K in keyof AmpFormField]?: AmpFormField[K] } = { name: item.name.trim(), type };
    if (item.label.trim()) field.label = item.label.trim();
    if (item.placeholder.trim()) field.placeholder = item.placeholder.trim();
    if (item.required === 'true') field.required = true;
    if (type === 'select') field.options = parseChoices(item.options);
    return field as AmpFormField;
}

/**
 * Dialog wording for an issue: "fields[1].name: …" → "Field 2: …", and a
 * design setting by its label ("Button corners (px) must be …").
 */
function readableIssue(issue: AmpFormConfigIssue): string {
    const m = /^fields\[(\d+)\]/.exec(issue.path);
    if (m) return `Field ${Number(m[1]) + 1}: ${issue.message}`;
    return readableStyleIssue(issue) ?? issue.message;
}

function fieldsList(fields: readonly Partial<AmpFormField>[]): ModalListField {
    return {
        kind: 'list',
        name: 'fields',
        label: 'Fields',
        itemLabel: 'field',
        addLabel: 'Add field',
        minItems: 1,
        maxItems: 20,
        items: fields.map(itemFromField),
        newItem: () => itemFromField({ type: 'text' }),
        itemFields: [
            { name: 'label', label: 'Label', placeholder: 'Full name' },
            { name: 'name', label: 'Field name', placeholder: 'full_name' },
            { name: 'type', label: 'Type', type: 'select', options: FIELD_TYPE_CHOICES },
            { name: 'placeholder', label: 'Placeholder', placeholder: 'Optional' },
            { name: 'options', label: 'Choices (comma-separated)', placeholder: 'Basic, Pro, Enterprise' },
            { name: 'required', label: 'Required', type: 'checkbox' },
        ],
        isFieldVisible: (item, name) => name !== 'options' || item.type === 'select',
        // The name follows the label until it's edited by hand.
        onItemChange: (item, changed, previous) => {
            if (changed !== 'label') return;
            if (previous.name === '' || previous.name === fieldNameFromLabel(previous.label)) {
                return { name: fieldNameFromLabel(item.label) };
            }
        },
        itemHint: (_item, index, items) => {
            const issue = validateAmpFormConfig({ action: 'https://example.com/', fields: items.map(fieldFromItem) })
                .find(i => i.path.startsWith(`fields[${index}]`));
            return issue ? { text: issue.message, tone: 'error' } : null;
        },
    };
}

/**
 * The Insert / Edit AMP form dialog: the endpoint (required, checked as you
 * type), the fields (add, remove, reorder, each checked as you type), button
 * text, messages, the HTML-version fallback, and the design.
 */
function openFormDialog(editor: Editor, block: Element | null, insertAfter: Element | null, defaultStyle?: AmpFormStyle): void {
    const stored = block ? readStoredAmpFormConfig(block) ?? {} : {};
    const text = (key: string) => (typeof stored[key] === 'string' ? stored[key] as string : '');
    const fields = Array.isArray(stored.fields) ? stored.fields as Partial<AmpFormField>[] : STARTER_FIELDS;
    // A new form starts from the plugin's default design.
    const style = block ? startingStyle(stored.style) : normalizeAmpFormStyle(defaultStyle);

    const rows: ModalFormEntry[] = [
        {
            name: 'action',
            label: 'Endpoint URL (receives the submissions)',
            type: 'url',
            value: text('action'),
            placeholder: 'https://example.com/api/subscribe',
            hint: (value) => {
                if (!value.trim()) return null;
                const problem = endpointIssue(value);
                return problem ? { text: problem, tone: 'error' } : { text: `Posts to ${endpointLabel(value.trim())}`, tone: 'ok' };
            },
        },
        fieldsList(fields),
        { name: 'submitText', label: 'Button text', value: text('submitText'), placeholder: 'Submit' },
        [
            { name: 'successMessage', label: 'After sending', value: text('successMessage'), placeholder: 'Thanks! Your response was sent.' },
            { name: 'errorMessage', label: 'If sending fails', value: text('errorMessage'), placeholder: 'Something went wrong. Please try again.' },
        ],
        { name: 'fallbackText', label: 'Shown where AMP forms are not supported', type: 'textarea', value: text('fallbackText'), placeholder: 'This email has a form you can fill in using an email app that supports interactive email, such as Gmail.' },
        { name: 'fallbackUrl', label: 'Web version of the form (optional)', type: 'url', value: text('fallbackUrl'), placeholder: 'https://example.com/subscribe' },
        ...designRows(style),
    ];

    openFormModal(editor, {
        title: block ? 'Edit AMP form' : 'Insert AMP form',
        fields: rows,
        wide: true,
        submitLabel: block ? 'Save' : 'Insert',
        onSubmit: (values, { showError, close, lists }) => {
            const patch: { -readonly [K in keyof AmpFormConfig]?: AmpFormConfig[K] } = {
                action: values.action.trim(),
                fields: (lists.fields ?? []).map(fieldFromItem),
                submitText: optional(values.submitText),
                successMessage: optional(values.successMessage),
                errorMessage: optional(values.errorMessage),
                fallbackText: optional(values.fallbackText),
                fallbackUrl: optional(values.fallbackUrl),
            };
            const enteredStyle = styleFromValues(values);
            const styleIssues = validateAmpFormStyle(enteredStyle);
            const next = block ? { ...stored, ...patch } : patch;
            const issues = [...styleIssues, ...validateAmpFormConfig(JSON.parse(JSON.stringify({ ...next, style: undefined })))];
            if (issues.length) {
                showError(issues.map(readableIssue).join(' '));
                return;
            }
            // Only what differs from the default look is stored.
            patch.style = compactAmpFormStyle(enteredStyle as AmpFormStyle);
            if (block) updateForm(editor, block, patch);
            else insertForm(editor, { ...patch } as AmpFormConfig, insertAfter);
            close();
        },
    });
}

export interface AmpFormPluginOptions {
    /**
     * The design new forms start with, e.g. your brand colours:
     * `{ buttonColor: '#d63736', fontFamily: 'Georgia' }`. A form made from
     * the toolbar starts with it in the dialog; `addAmpForm` puts it under the
     * config's own `style`. Each form stores its design, so changing this
     * later doesn't restyle existing forms.
     */
    defaultStyle?: AmpFormStyle;
}

/**
 * Lets an editor hold AMP email forms. A form is a non-editable block storing
 * its own config, endpoint and design included: the HTML version of the email
 * shows its fallback text (and link), and `toAmpEmail` turns it into a working
 * AMP form posting to that endpoint. Click a form to edit it; the toolbar
 * button adds one.
 *
 * Throws an `AmpFormConfigError` when `defaultStyle` is invalid.
 */
export function createAmpFormPlugin(options: AmpFormPluginOptions = {}): Plugin {
    if (options.defaultStyle !== undefined) {
        const issues = validateAmpFormStyle(options.defaultStyle, 'defaultStyle');
        if (issues.length) throw new AmpFormConfigError(issues);
    }
    const defaultStyle = options.defaultStyle ? compactAmpFormStyle(options.defaultStyle) : undefined;
    return {
        name: 'amp-form',
        init(editor: Editor) {
            initAmpForms(editor, defaultStyle);
        }
    };
}

/** Forms with the default design. */
export const AmpFormPlugin: Plugin = createAmpFormPlugin();

function initAmpForms(editor: Editor, defaultStyle: AmpFormStyle | undefined): void {
    editor.addToolbarButton(icons.formInput, 'Insert AMP Form', () => {
        if (inAlternateView(editor)) return;
        openFormDialog(editor, null, caretBlock(editor), defaultStyle);
    });

    const onClick = (e: MouseEvent) => {
        const block = (e.target as Element | null)?.closest?.(`.${AMP_FORM_CLASS}`);
        if (!block || !editor.editorArea.contains(block)) return;
        e.preventDefault();
        if (inAlternateView(editor) || editor.editorArea.contentEditable === 'false') return;
        openFormDialog(editor, block, null);
    };
    editor.editorArea.addEventListener('click', onClick);

    const unregisterInsert = editor.registerCommand(AMP_FORM_INSERT_COMMAND, (config: unknown) => insertForm(editor, config, caretBlock(editor), defaultStyle));
    const unregisterUpdate = editor.registerCommand(AMP_FORM_UPDATE_COMMAND, (block: Element, patch: Partial<AmpFormConfig>) => updateForm(editor, block, patch));
    // A form edited by hand (source view, paste) keeps its summary current.
    const refreshSummaries = () => {
        if (inAlternateView(editor)) return;
        let changed = false;
        editor.editorArea.querySelectorAll(`.${AMP_FORM_CLASS}`).forEach((block) => {
            const read = readAmpFormConfig(block);
            if ('issues' in read) return;
            const summary = summaryOf(read.config);
            if (block.getAttribute(AMP_FORM_SUMMARY_ATTR) !== summary) {
                block.setAttribute(AMP_FORM_SUMMARY_ATTR, summary);
                changed = true;
            }
        });
        // Only when something changed, so this settles after one pass.
        if (changed) editor.notifyContentChange();
    };
    const unsubscribeInput = editor.onInput(refreshSummaries);
    refreshSummaries();

    editor.onDestroy(() => {
        editor.editorArea.removeEventListener('click', onClick);
        unregisterInsert();
        unregisterUpdate();
        unsubscribeInput();
    });
}

/**
 * Adds an AMP form to `editor` from a config. Each form keeps its own
 * endpoint (`config.action`). The editor needs `AmpFormPlugin`.
 *
 * Returns the inserted block, or `null` when the editor has no
 * `AmpFormPlugin` or its source view or preview is open. Throws an
 * `AmpFormConfigError` listing every problem when the config is invalid.
 *
 * Submissions go from the recipient's email client straight to
 * `config.action`; there is no client-side submit callback.
 */
export function addAmpForm(editor: Editor, config: AmpFormConfig): HTMLElement | null {
    if (!editor.hasCommand(AMP_FORM_INSERT_COMMAND)) return null;
    return editor.runCommand<HTMLElement | null>(AMP_FORM_INSERT_COMMAND, config) ?? null;
}

/**
 * Changes a form already in `editor`: `patch` is applied over its stored
 * config, so anything not named (its endpoint included) is kept. Returns the
 * replacement block, or `null` when the editor has no `AmpFormPlugin`, the
 * block isn't one of its forms, or its source view or preview is open.
 * Throws an `AmpFormConfigError` when the result would be invalid, leaving
 * the form unchanged.
 */
export function updateAmpForm(editor: Editor, block: Element, patch: Partial<AmpFormConfig>): HTMLElement | null {
    if (!editor.hasCommand(AMP_FORM_UPDATE_COMMAND)) return null;
    return editor.runCommand<HTMLElement | null>(AMP_FORM_UPDATE_COMMAND, block, patch) ?? null;
}
