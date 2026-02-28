import type { Plugin } from './Plugin';

export class Editor {
    public container: HTMLElement;
    public textArea: HTMLTextAreaElement;
    public editorArea: HTMLDivElement;
    public toolbar: HTMLDivElement;
    private plugins: Map<string, Plugin> = new Map();

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

        this.editorArea = document.createElement('div');
        this.editorArea.className = 'play-editor-content';
        this.editorArea.contentEditable = 'true';
        this.editorArea.innerHTML = this.textArea.value;

        this.init(plugins);
    }

    private init(plugins: Plugin[]) {
        this.textArea.style.display = 'none';
        this.textArea.parentNode?.insertBefore(this.container, this.textArea);
        this.container.appendChild(this.toolbar);
        this.container.appendChild(this.editorArea);

        // Sync content back to textarea on input
        this.editorArea.addEventListener('input', () => {
            this.textArea.value = this.editorArea.innerHTML;
        });

        // Trap Tab key to insert spaces instead of moving focus
        this.editorArea.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                document.execCommand('insertHTML', false, '&emsp;');
                this.textArea.value = this.editorArea.innerHTML;
            }
        });

        // Initialize plugins
        plugins.forEach(p => {
            this.plugins.set(p.name, p);
            p.init(this);
        });
    }

    public exec(command: string, value: string | undefined = undefined) {
        this.editorArea.focus();
        document.execCommand(command, false, value);
        // sync content manually after exec command since input event doesn't always fire
        this.textArea.value = this.editorArea.innerHTML;
    }

    public addToolbarButton(iconHtml: string, tooltip: string, onClick: () => void) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'play-editor-btn';
        btn.title = tooltip;
        btn.innerHTML = iconHtml;
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
        this.toolbar.appendChild(divider);
    }

    public getContent(): string {
        return this.editorArea.innerHTML;
    }

    public setContent(html: string) {
        this.editorArea.innerHTML = html;
        this.textArea.value = html;
    }
}
