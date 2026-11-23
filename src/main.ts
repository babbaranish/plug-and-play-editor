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
    DragDropImagePlugin,
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
    createSidePreviewPlugin,
    SourceCodePlugin,
    FontFamilyPlugin,
    BlockQuotePlugin,
    FindReplacePlugin,
    WordCountPlugin,
    AmpFormPlugin,
    addAmpForm,
    AmpFormConfigError
} from './index';
import { toAmpEmail } from './amp';
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
    DragDropImagePlugin,
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
    createSidePreviewPlugin({ ampConverter: (html) => toAmpEmail(html) }),
    SourceCodePlugin,
    FontFamilyPlugin,
    BlockQuotePlugin,
    FindReplacePlugin,
    WordCountPlugin,
    AmpFormPlugin
]);

// The AMP form JavaScript API.
document.getElementById('add-amp-form')?.addEventListener('click', () => {
    try {
        addAmpForm(editor, {
            action: 'https://example.com/api/subscribe',
            method: 'POST',
            fields: [
                { name: 'email', type: 'email', label: 'Email Address', placeholder: 'Enter your email', required: true },
                { name: 'name', type: 'text', label: 'Full Name', placeholder: 'Enter your name', required: true },
                { name: 'plan', type: 'select', label: 'Plan', placeholder: 'Choose a plan', options: ['Basic', 'Pro'] },
            ],
            submitText: 'Subscribe',
            successMessage: 'Successfully subscribed!',
            errorMessage: 'Something went wrong!',
            fallbackUrl: 'https://example.com/subscribe',
            style: { buttonColor: '#d63736', buttonRadius: 20, fieldRadius: 8, maxWidth: 480, fontFamily: 'Georgia' },
        });
    } catch (err) {
        if (err instanceof AmpFormConfigError) console.error(err.issues);
        else throw err;
    }
});

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
