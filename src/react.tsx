import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { Plugin } from './core/Plugin';
import { Editor } from './core/Editor';
import { ALL_PLUGINS } from './react-defaults';
import './styles/core.css';

// Default plugin list is loaded synchronously so the toolbar renders on the
// first paint. Consumers who want to select a custom subset can pass
// `plugins={[...]}`; the same ALL_PLUGINS constant is also re-exported from
// `plug-and-play-editor/react/defaults` for convenience.
export { ALL_PLUGINS };

export interface PlayEditorProps {
    /** Initial HTML content */
    defaultValue?: string;
    /** Called whenever the editor content changes */
    onChange?: (html: string) => void;
    /** Custom plugins array. If not provided, all built-in plugins are loaded lazily. */
    plugins?: Plugin[];
    /** Additional CSS class for the container wrapper */
    className?: string;
    /** Minimum height of the editor content area in px */
    minHeight?: number;
    /** Disable the editor (non-editable, toolbar disabled) */
    disabled?: boolean;
    /** Make the editor read-only (content visible but not editable) */
    readOnly?: boolean;
}

export interface PlayEditorRef {
    /** Get the current HTML content */
    getContent: () => string;
    /** Set the HTML content programmatically */
    setContent: (html: string) => void;
    /** Access the underlying Editor instance */
    editor: Editor | null;
}

export const PlayEditor = forwardRef<PlayEditorRef, PlayEditorProps>(
    ({ defaultValue = '', onChange, plugins, className, minHeight, disabled, readOnly }, ref) => {
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const editorRef = useRef<Editor | null>(null);

        useImperativeHandle(ref, () => ({
            getContent: () => editorRef.current?.getContent() ?? '',
            setContent: (html: string) => editorRef.current?.setContent(html),
            editor: editorRef.current,
        }));

        useEffect(() => {
            if (!textareaRef.current || editorRef.current) return;
            const editor = new Editor(textareaRef.current, plugins ?? ALL_PLUGINS);
            editorRef.current = editor;

            if (minHeight) {
                editor.editorArea.style.minHeight = `${minHeight}px`;
            }

            let inputHandler: (() => void) | null = null;
            if (onChange) {
                inputHandler = () => onChange(editor.getContent());
                editor.editorArea.addEventListener('input', inputHandler);
            }

            return () => {
                if (inputHandler) editor.editorArea.removeEventListener('input', inputHandler);
                editor.destroy();
                editorRef.current = null;
            };
        }, []);

        useEffect(() => {
            const editor = editorRef.current;
            if (!editor) return;

            if (disabled) {
                editor.editorArea.contentEditable = 'false';
                editor.toolbar.querySelectorAll<HTMLButtonElement>('button, select, input').forEach(el => {
                    el.disabled = true;
                });
                editor.container.classList.add('play-editor-disabled');
            } else {
                editor.editorArea.contentEditable = readOnly ? 'false' : 'true';
                editor.toolbar.querySelectorAll<HTMLButtonElement>('button, select, input').forEach(el => {
                    el.disabled = !!readOnly;
                });
                editor.container.classList.toggle('play-editor-disabled', !!readOnly);
            }
        }, [disabled, readOnly]);

        return (
            <div className={className}>
                <textarea
                    ref={textareaRef}
                    defaultValue={defaultValue}
                    style={{ display: 'none' }}
                />
            </div>
        );
    }
);

PlayEditor.displayName = 'PlayEditor';
