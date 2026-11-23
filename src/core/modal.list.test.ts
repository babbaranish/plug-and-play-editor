import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from './Editor';
import { openFormModal } from './modal';
import type { ModalListField, ModalListItem } from './modal';

const editors: Editor[] = [];

afterEach(() => {
    editors.splice(0).forEach((ed) => ed.destroy());
    document.body.innerHTML = '';
});

function mount(): Editor {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    const ed = new Editor(ta, []);
    editors.push(ed);
    return ed;
}

const people = (over: Partial<ModalListField> = {}): ModalListField => ({
    kind: 'list',
    name: 'people',
    label: 'People',
    itemLabel: 'person',
    addLabel: 'Add person',
    itemFields: [
        { name: 'first', label: 'First name' },
        { name: 'role', label: 'Role', type: 'select', options: [{ value: 'dev', label: 'Dev' }, { value: 'other', label: 'Other' }] },
        { name: 'detail', label: 'Detail' },
        { name: 'admin', label: 'Admin', type: 'checkbox' },
    ],
    ...over,
});

/** Opens a modal with `list`, returning helpers and what onSubmit received. */
function open(list: ModalListField) {
    const ed = mount();
    let received: { values: Record<string, string>; lists: Record<string, ModalListItem[]> } | null = null;
    openFormModal(ed, {
        title: 'T',
        fields: [{ name: 'title', label: 'Title', value: 'Team' }, list],
        onSubmit: (values, { lists, close }) => {
            received = { values, lists };
            close();
        },
    });
    const root = () => ed.container.querySelector('.play-editor-modal')!;
    const items = () => Array.from(root().querySelectorAll<HTMLElement>('.play-editor-modal-list-item'));
    const input = (i: number, name: string) => items()[i].querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    const set = (i: number, name: string, value: string) => {
        const el = input(i, name);
        const isBox = el.getAttribute('type') === 'checkbox';
        if (isBox) el.checked = value === 'true';
        else el.value = value;
        el.dispatchEvent(new Event(isBox || el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    };
    const button = (i: number, label: string) => items()[i].querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    const add = () => root().querySelector<HTMLButtonElement>('.play-editor-modal-list-add')!;
    const submit = () => {
        root().querySelector<HTMLButtonElement>('.play-editor-modal-submit')!.click();
        return received!;
    };
    return { ed, root, items, input, set, button, add, submit };
}

describe('list field', () => {
    it('renders the starting items and returns them on submit, beside the other values', () => {
        const m = open(people({ items: [{ first: 'Ada', role: 'dev', detail: '', admin: 'true' }, { first: 'Bob', role: 'other', detail: 'x', admin: '' }] }));
        expect(m.items().length).toBe(2);
        expect(m.input(0, 'admin').checked).toBe(true);
        expect(m.root().querySelector('.play-editor-modal-list legend')!.textContent).toBe('People');
        const r = m.submit();
        expect(r.values).toEqual({ title: 'Team' });
        expect(r.lists.people).toEqual([
            { first: 'Ada', role: 'dev', detail: '', admin: 'true' },
            { first: 'Bob', role: 'other', detail: 'x', admin: '' },
        ]);
    });

    it('adds items from newItem and focuses the first input', () => {
        const m = open(people({ newItem: () => ({ first: '', role: 'other', detail: '', admin: '' }) }));
        expect(m.add().textContent).toBe('+ Add person');
        m.add().click();
        expect(m.items().length).toBe(1);
        expect(m.input(0, 'role').value).toBe('other');
        expect(document.activeElement).toBe(m.input(0, 'first'));
    });

    it('moves and removes items', () => {
        const m = open(people({ items: [{ first: 'A' }, { first: 'B' }, { first: 'C' }] }));
        m.button(2, 'Move person up').click();
        expect(m.items().map((_, i) => m.input(i, 'first').value)).toEqual(['A', 'C', 'B']);
        m.button(0, 'Move person down').click();
        expect(m.items().map((_, i) => m.input(i, 'first').value)).toEqual(['C', 'A', 'B']);
        m.button(1, 'Remove person').click();
        expect(m.submit().lists.people.map(p => p.first)).toEqual(['C', 'B']);
    });

    it('disables moves past the ends and removal below minItems', () => {
        const m = open(people({ items: [{ first: 'A' }, { first: 'B' }], minItems: 1 }));
        expect(m.button(0, 'Move person up').disabled).toBe(true);
        expect(m.button(1, 'Move person down').disabled).toBe(true);
        m.button(1, 'Remove person').click();
        expect(m.button(0, 'Remove person').disabled).toBe(true);
        m.button(0, 'Remove person').click();
        expect(m.items().length).toBe(1);
    });

    it('starts with minItems items and stops adding at maxItems', () => {
        const m = open(people({ minItems: 1, maxItems: 2 }));
        expect(m.items().length).toBe(1);
        m.add().click();
        expect(m.add().disabled).toBe(true);
        m.add().click();
        expect(m.items().length).toBe(2);
    });

    it('shows a sub-field only when it applies', () => {
        const m = open(people({ items: [{ role: 'dev' }], isFieldVisible: (item, name) => name !== 'detail' || item.role === 'other' }));
        const detail = () => m.items()[0].querySelector<HTMLElement>('[data-field="detail"]')!;
        expect(detail().style.display).toBe('none');
        m.set(0, 'role', 'other');
        expect(detail().style.display).toBe('');
    });

    it('lets one sub-field update another', () => {
        const m = open(people({
            items: [{ first: '', detail: '' }],
            onItemChange: (item, changed) => (changed === 'first' ? { detail: item.first.toUpperCase() } : undefined),
        }));
        m.set(0, 'first', 'ada');
        expect(m.input(0, 'detail').value).toBe('ADA');
    });

    it('shows a hint per item, computed from every item', () => {
        const m = open(people({
            items: [{ first: 'A' }, { first: 'A' }],
            itemHint: (item, index, items) => (items.findIndex(i => i.first === item.first) !== index ? { text: 'Duplicate', tone: 'error' } : null),
        }));
        const hint = (i: number) => m.items()[i].querySelector<HTMLElement>('.play-editor-modal-hint')!;
        expect(hint(0).style.display).toBe('none');
        expect(hint(1).textContent).toBe('Duplicate');
        expect(hint(1).classList.contains('play-editor-modal-hint-error')).toBe(true);
        m.set(1, 'first', 'B');
        expect(hint(1).style.display).toBe('none');
    });

    it('labels each item for assistive tech', () => {
        const m = open(people({ items: [{}, {}] }));
        expect(m.items().map(i => i.getAttribute('aria-label'))).toEqual(['Person 1', 'Person 2']);
    });
});

describe('checkbox field and wide dialogs', () => {
    it('submits a checkbox as "true" or ""', () => {
        const ed = mount();
        let values: Record<string, string> = {};
        openFormModal(ed, {
            title: 'T',
            wide: true,
            fields: [{ name: 'a', label: 'A', type: 'checkbox', value: 'true' }, { name: 'b', label: 'B', type: 'checkbox' }],
            onSubmit: (v) => { values = v; },
        });
        const modal = ed.container.querySelector('.play-editor-modal')!;
        expect(modal.classList.contains('play-editor-modal-wide')).toBe(true);
        modal.querySelector<HTMLButtonElement>('.play-editor-modal-submit')!.click();
        expect(values).toEqual({ a: 'true', b: '' });
    });

    it('leaves existing dialogs as they were', () => {
        const ed = mount();
        let lists: Record<string, ModalListItem[]> | null = null;
        openFormModal(ed, { title: 'T', fields: [{ name: 'u', label: 'U', value: 'x' }], onSubmit: (_, h) => { lists = h.lists; } });
        const modal = ed.container.querySelector('.play-editor-modal')!;
        expect(modal.classList.contains('play-editor-modal-wide')).toBe(false);
        modal.querySelector<HTMLButtonElement>('.play-editor-modal-submit')!.click();
        expect(lists).toEqual({});
    });
});
