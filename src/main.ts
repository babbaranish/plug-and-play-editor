import {
    Editor,
    FormattingPlugin,
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
    EmojiPlugin
} from './index';

const editor = new Editor('#editor', [
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
    EmojiPlugin
]);

// Just for testing the public api
document.getElementById('get-content')?.addEventListener('click', () => {
    console.log(editor.getContent());
    alert(editor.getContent());
});
