import type { Plugin } from './Plugin';

export class Editor {
    public container: HTMLElement;
    public textArea: HTMLTextAreaElement;
    public editorArea: HTMLDivElement;
    public toolbar: HTMLDivElement;
    private plugins: Map<string, Plugin> = new Map();
    private cleanupFns: (() => void)[] = [];
    private commandButtons: { btn: HTMLButtonElement; command: string }[] = [];
    private selectionSubs: (() => void)[] = [];
    private inputSubs: (() => void)[] = [];
    private selectionFramePending = false;
    private inputFramePending = false;

    constructor(selector: string | HTMLTextAreaElement, plugins: Plugin[] = []) {
        const el =
            typeof selector === 'string'
                ? (document.querySelector(selector) as HTMLTextAreaElement)
                : selector;

        if (!el || el.tagName !== 'TEXTAREA') {
            throw new Error(
                'Editor must be initialized on a <textarea> element.'
            );
        }

        this.textArea = el;
        this.container = document.createElement('div');
        this.container.className = 'play-editor-container';

        this.toolbar = document.createElement('div');
        this.toolbar.className = 'play-editor-toolbar';
        this.toolbar.setAttribute('role', 'toolbar');
        this.toolbar.setAttribute('aria-label', 'Editor toolbar');

        this.editorArea = document.createElement('div');
        this.editorArea.className = 'play-editor-content';
        this.editorArea.contentEditable = 'true';
        this.editorArea.setAttribute('role', 'textbox');
        this.editorArea.setAttribute('aria-multiline', 'true');
        this.editorArea.setAttribute('aria-label', 'Editor content');
        this.editorArea.innerHTML = this.textArea.value;

        this.init(plugins);
    }

    private init(plugins: Plugin[]) {
        this.textArea.style.display = 'none';
        this.textArea.parentNode?.insertBefore(this.container, this.textArea);
        this.container.appendChild(this.toolbar);
        this.container.appendChild(this.editorArea);

        // Sync content back to textarea on input + dispatch rAF-coalesced subscribers
        const onInput = () => {
            this.textArea.value = this.editorArea.innerHTML;
            if (this.inputSubs.length && !this.inputFramePending) {
                this.inputFramePending = true;
                requestAnimationFrame(() => {
                    this.inputFramePending = false;
                    for (const fn of this.inputSubs) fn();
                });
            }
        };
        this.editorArea.addEventListener('input', onInput);
        this.cleanupFns.push(() => this.editorArea.removeEventListener('input', onInput));

        // Trap Tab key to insert spaces instead of moving focus
        const onKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                document.execCommand('insertHTML', false, '&emsp;');
                this.textArea.value = this.editorArea.innerHTML;
            }
        };
        this.editorArea.addEventListener('keydown', onKeydown);
        this.cleanupFns.push(() => this.editorArea.removeEventListener('keydown', onKeydown));

        // Keyboard shortcuts
        const onShortcut = (e: KeyboardEvent) => {
            const mod = e.ctrlKey || e.metaKey;
            if (!mod) return;

            switch (e.key.toLowerCase()) {
                case 'b':
                    e.preventDefault();
                    document.execCommand('bold', false);
                    this.syncContent();
                    break;
                case 'i':
                    e.preventDefault();
                    document.execCommand('italic', false);
                    this.syncContent();
                    break;
                case 'u':
                    e.preventDefault();
                    document.execCommand('underline', false);
                    this.syncContent();
                    break;
                case 'z':
                    e.preventDefault();
                    if (e.shiftKey) {
                        document.execCommand('redo', false);
                    } else {
                        document.execCommand('undo', false);
                    }
                    this.syncContent();
                    break;
                case 'y':
                    e.preventDefault();
                    document.execCommand('redo', false);
                    this.syncContent();
                    break;
            }
        };
        this.editorArea.addEventListener('keydown', onShortcut);
        this.cleanupFns.push(() => this.editorArea.removeEventListener('keydown', onShortcut));

        // Single rAF-coalesced selectionchange dispatcher shared across editor + plugins
        const onSelectionChange = () => {
            if (this.selectionFramePending) return;
            this.selectionFramePending = true;
            requestAnimationFrame(() => {
                this.selectionFramePending = false;
                const sel = window.getSelection();
                const inEditor = !!(sel && sel.rangeCount > 0 && this.editorArea.contains(sel.anchorNode));
                if (!inEditor) return;
                this.updateActiveStates();
                for (const fn of this.selectionSubs) fn();
            });
        };
        document.addEventListener('selectionchange', onSelectionChange);
        this.cleanupFns.push(() => document.removeEventListener('selectionchange', onSelectionChange));

        // Initialize plugins
        plugins.forEach(p => {
            this.plugins.set(p.name, p);
            p.init(this);
        });
    }

    private syncContent() {
        this.textArea.value = this.editorArea.innerHTML;
    }

    private updateActiveStates() {
        // Selection is already verified to be inside the editor by the dispatcher.
        // Iterate the cached command-button list instead of re-querying the DOM.
        for (let i = 0; i < this.commandButtons.length; i++) {
            const { btn, command } = this.commandButtons[i];
            try {
                const active = document.queryCommandState(command);
                btn.classList.toggle('play-editor-btn-active', active);
            } catch {
                // queryCommandState can throw for unsupported commands
            }
        }
    }

    public execCommand(command: string, value: string | undefined = undefined) {
        this.editorArea.focus();
        document.execCommand(command, false, value);
        this.syncContent();
    }

    /** @deprecated Use execCommand instead. Kept for backwards compatibility. */
    public exec(command: string, value: string | undefined = undefined) {
        this.execCommand(command, value);
    }

    public addToolbarButton(iconHtml: string, tooltip: string, onClick: () => void, command?: string, target?: HTMLElement) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'play-editor-btn';
        btn.title = tooltip;
        btn.setAttribute('aria-label', tooltip);
        // iconHtml is a trusted SVG string from icons.ts, not user input
        btn.innerHTML = iconHtml;
        if (command) {
            btn.dataset.command = command;
            this.commandButtons.push({ btn, command });
        }
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            onClick();
        });
        // If inside a group dropdown, add label text after the icon
        if (target && target.classList.contains('play-editor-group-dropdown')) {
            const label = document.createElement('span');
            label.textContent = tooltip;
            btn.appendChild(label);
        }
        (target || this.toolbar).appendChild(btn);
        return btn;
    }

    public addToolbarDivider() {
        const divider = document.createElement('div');
        divider.className = 'play-editor-divider';
        divider.setAttribute('role', 'separator');
        this.toolbar.appendChild(divider);
    }

    /**
     * Add a collapsible toolbar group that shows a dropdown of buttons on click.
     * Returns the dropdown container — plugins append buttons to it.
     * iconHtml is a trusted SVG string from icons.ts, not user input.
     */
    public addToolbarGroup(iconHtml: string, tooltip: string): HTMLDivElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'play-editor-toolbar-group';

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'play-editor-btn play-editor-group-trigger';
        trigger.title = tooltip;
        trigger.setAttribute('aria-label', tooltip);
        trigger.setAttribute('aria-haspopup', 'true');
        trigger.setAttribute('aria-expanded', 'false');
        // iconHtml comes from our icons.ts module (hardcoded SVGs), not user input
        const iconContainer = document.createElement('span');
        iconContainer.innerHTML = iconHtml;
        trigger.appendChild(iconContainer);
        const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        chevron.setAttribute('class', 'play-editor-group-chevron');
        chevron.setAttribute('width', '8');
        chevron.setAttribute('height', '8');
        chevron.setAttribute('viewBox', '0 0 24 24');
        chevron.setAttribute('fill', 'none');
        chevron.setAttribute('stroke', 'currentColor');
        chevron.setAttribute('stroke-width', '2.5');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M6 9l6 6 6-6');
        chevron.appendChild(path);
        trigger.appendChild(chevron);

        const dropdown = document.createElement('div');
        dropdown.className = 'play-editor-group-dropdown';
        dropdown.setAttribute('role', 'group');
        dropdown.setAttribute('aria-label', tooltip);

        let isOpen = false;

        const close = () => {
            isOpen = false;
            dropdown.style.display = 'none';
            trigger.setAttribute('aria-expanded', 'false');
            trigger.classList.remove('play-editor-btn-active');
        };

        const toggle = () => {
            if (isOpen) {
                close();
            } else {
                isOpen = true;
                dropdown.style.display = 'flex';
                trigger.setAttribute('aria-expanded', 'true');
                trigger.classList.add('play-editor-btn-active');

                // Position below the trigger
                const triggerRect = trigger.getBoundingClientRect();
                const containerRect = this.container.getBoundingClientRect();
                const toolbarRect = this.toolbar.getBoundingClientRect();
                let leftPos = triggerRect.left - containerRect.left;
                // Clamp to container width
                const ddWidth = dropdown.offsetWidth || 200;
                if (leftPos + ddWidth > containerRect.width) {
                    leftPos = containerRect.width - ddWidth - 8;
                }
                if (leftPos < 0) leftPos = 0;
                dropdown.style.top = `${toolbarRect.bottom - containerRect.top}px`;
                dropdown.style.left = `${leftPos}px`;
            }
        };

        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle();
        });

        // Close on outside click
        const docHandler = (e: MouseEvent) => {
            if (isOpen && !wrapper.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
                close();
            }
        };
        document.addEventListener('mousedown', docHandler);
        this.cleanupFns.push(() => document.removeEventListener('mousedown', docHandler));

        // Close when a button inside the dropdown is clicked
        dropdown.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.play-editor-btn')) {
                setTimeout(close, 50);
            }
        });

        wrapper.appendChild(trigger);
        this.container.style.position = 'relative';
        this.container.appendChild(dropdown);
        this.toolbar.appendChild(wrapper);

        return dropdown;
    }

    public getContent(): string {
        return this.editorArea.innerHTML;
    }

    public setContent(html: string) {
        this.editorArea.innerHTML = html;
        this.textArea.value = html;
    }

    /** Register a cleanup function to be called on destroy */
    public onDestroy(fn: () => void) {
        this.cleanupFns.push(fn);
    }

    /**
     * Subscribe to selection changes inside the editor.
     * Handler is invoked rAF-coalesced and only when the selection is inside the editor.
     * Returns an unsubscribe function.
     */
    public onSelectionChange(fn: () => void): () => void {
        this.selectionSubs.push(fn);
        return () => {
            const i = this.selectionSubs.indexOf(fn);
            if (i !== -1) this.selectionSubs.splice(i, 1);
        };
    }

    /**
     * Subscribe to editor content input events.
     * Handler is invoked rAF-coalesced after the textarea sync.
     * Returns an unsubscribe function.
     */
    public onInput(fn: () => void): () => void {
        this.inputSubs.push(fn);
        return () => {
            const i = this.inputSubs.indexOf(fn);
            if (i !== -1) this.inputSubs.splice(i, 1);
        };
    }

    /** Tear down the editor, remove DOM elements, and clean up all plugins */
    public destroy() {
        // Destroy plugins
        this.plugins.forEach(p => p.destroy?.());
        this.plugins.clear();

        // Run all cleanup functions (remove event listeners, etc.)
        this.cleanupFns.forEach(fn => fn());
        this.cleanupFns = [];

        // Restore textarea
        this.textArea.style.display = '';
        this.container.parentNode?.insertBefore(this.textArea, this.container);
        this.container.remove();
    }
}
