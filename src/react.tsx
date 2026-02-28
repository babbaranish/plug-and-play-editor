import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { Plugin } from './core/Plugin';
import { Editor } from './core/Editor';
import { FormattingPlugin } from './plugins/formatting';
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
import './styles/core.css';

/** All built-in plugins in their recommended order */
const ALL_PLUGINS: Plugin[] = [
    FormattingPlugin,
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
    ({ defaultValue = '', onChange, plugins, className, minHeight }, ref) => {
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
        }, []);

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
