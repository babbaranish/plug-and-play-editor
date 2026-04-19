import {
    Editor,
    FormattingPlugin,
    UndoRedoPlugin,
    ListsPlugin,
    ColorPlugin,
    LinksPlugin,
    MediaPlugin,
    DirectionalityPlugin,
    AlignmentPlugin,
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
    SourceCodePlugin,
    FontFamilyPlugin,
    BlockQuotePlugin,
    FindReplacePlugin,
    WordCountPlugin
} from './index';
import { openInfoModal } from './core/modal';

const editor = new Editor('#editor', [
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
    SourceCodePlugin,
    FontFamilyPlugin,
    BlockQuotePlugin,
    FindReplacePlugin,
    WordCountPlugin
]);

// Just for testing the public api
document.getElementById('get-content')?.addEventListener('click', () => {
    const content = editor.getContent();
    console.log(content);
    openInfoModal(editor, {
        title: 'Editor Content',
        content,
        preformatted: true,
        closeLabel: 'Close',
        theme: {
            submit: {
                background: '#10b981',
                color: '#ffffff',
                fontFamily: 'Georgia, serif',
                fontWeight: '600'
            }
        }
    });
});
