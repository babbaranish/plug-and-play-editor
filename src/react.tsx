import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { Plugin } from './core/Plugin';
import { Editor } from './core/Editor';
import { FormattingPlugin, UndoRedoPlugin } from './plugins/formatting';
import { ListsPlugin } from './plugins/lists';
import { ColorPlugin } from './plugins/color';
import { LinksPlugin } from './plugins/links';
import { MediaPlugin } from './plugins/media';
import { DirectionalityPlugin } from './plugins/directionality';
import { AlignmentPlugin } from './plugins/alignment';
import { TablesPlugin } from './plugins/tables';
import { AccordionPlugin } from './plugins/accordion';
import { PageBreakPlugin } from './plugins/page-break';
import { TocPlugin } from './plugins/toc';
import { PasteImagePlugin } from './plugins/paste-image';
import { MentionsPlugin } from './plugins/mentions';
import { CodeBlockPlugin } from './plugins/code-block';
import { DateTimePlugin } from './plugins/datetime';
import { EmojiPlugin } from './plugins/emoji';
import { TokensPlugin } from './plugins/tokens';
import { PasteCleanupPlugin } from './plugins/paste-cleanup';
import { FontSizePlugin } from './plugins/font-size';
import { SpacingPlugin } from './plugins/spacing';
import { ButtonBlockPlugin } from './plugins/button-block';
import { ImageResizePlugin } from './plugins/image-resize';
import { PreviewPlugin } from './plugins/preview';
import './styles/core.css';

/** All built-in plugins in their recommended order */
const ALL_PLUGINS: Plugin[] = [
    FormattingPlugin,
    UndoRedoPlugin,
    ListsPlugin,
    ColorPlugin,
    DirectionalityPlugin,
    AlignmentPlugin,
    LinksPlugin,
    MediaPlugin,
    TablesPlugin,
    AccordionPlugin,
    PageBreakPlugin,
    TocPlugin,
    PasteImagePlugin,
    MentionsPlugin,
    CodeBlockPlugin,
    DateTimePlugin,
    EmojiPlugin,
    TokensPlugin,
    PasteCleanupPlugin,
    FontSizePlugin,
    SpacingPlugin,
    ButtonBlockPlugin,
    ImageResizePlugin,
    PreviewPlugin,
];

export interface PlayEditorProps {
    /** Initial HTML content */
    defaultValue?: string;
    /** Called whenever the editor content changes */
    onChange?: (html: string) => void;
    /** Custom plugins array. If not provided, all built-in plugins are loaded. */
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

            const editor = new Editor(
                textareaRef.current,
                plugins ?? ALL_PLUGINS
            );

            editorRef.current = editor;

            if (minHeight) {
                editor.editorArea.style.minHeight = `${minHeight}px`;
            }

            if (onChange) {
                editor.editorArea.addEventListener('input', () => {
                    onChange(editor.getContent());
                });
            }

            // Cleanup on unmount
            return () => {
                editor.destroy();
                editorRef.current = null;
            };
        }, []);

        // Handle disabled/readOnly changes
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
