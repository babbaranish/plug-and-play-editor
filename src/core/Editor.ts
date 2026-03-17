import type { Plugin } from './Plugin';

export class Editor {
    public container: HTMLElement;
    public textArea: HTMLTextAreaElement;
    public editorArea: HTMLDivElement;
    public toolbar: HTMLDivElement;
    private plugins: Map<string, Plugin> = new Map();
    private cleanupFns: (() => void)[] = [];

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

        // Sync content back to textarea on input
        const onInput = () => {
            this.textArea.value = this.editorArea.innerHTML;
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

        // Update active button states on selection change
        const onSelectionChange = () => {
            this.updateActiveStates();
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
        // Only update if our editor is focused
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        if (!this.editorArea.contains(sel.anchorNode)) return;

        this.toolbar.querySelectorAll<HTMLButtonElement>('.play-editor-btn[data-command]').forEach(btn => {
            const command = btn.dataset.command!;
            try {
                const active = document.queryCommandState(command);
                btn.classList.toggle('play-editor-btn-active', active);
            } catch {
                // queryCommandState can throw for unsupported commands
            }
        });
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

    public addToolbarButton(iconHtml: string, tooltip: string, onClick: () => void, command?: string) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'play-editor-btn';
        btn.title = tooltip;
        btn.setAttribute('aria-label', tooltip);
        btn.innerHTML = iconHtml;
        if (command) {
            btn.dataset.command = command;
        }
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            onClick();
        });
        this.toolbar.appendChild(btn);
        return btn;
    }

    public addToolbarDivider() {
        const divider = document.createElement('div');
        divider.className = 'play-editor-divider';
        divider.setAttribute('role', 'separator');
        this.toolbar.appendChild(divider);
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
