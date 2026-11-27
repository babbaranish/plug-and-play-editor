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
    BlockReorderPlugin,
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
    AmpFormConfigError,
    AmpQuizPlugin,
    addAmpQuiz,
    AmpQuizConfigError,
    AmpFeedbackPlugin,
    addAmpFeedback,
    AmpFeedbackConfigError,
    AmpPollPlugin,
    addAmpPoll,
    AmpPollConfigError
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
    BlockReorderPlugin,
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
    AmpFormPlugin,
    AmpQuizPlugin,
    AmpFeedbackPlugin,
    AmpPollPlugin
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

// The AMP quiz JavaScript API.
document.getElementById('add-amp-quiz')?.addEventListener('click', () => {
    try {
        addAmpQuiz(editor, {
            questions: [
                { question: 'What is the capital of France?', options: ['London', 'Paris', 'Berlin'], answer: 'Paris' },
                {
                    question: 'Which planet is known as the Red Planet?',
                    options: ['Venus', 'Mars', 'Jupiter'],
                    answer: 'Mars',
                    explanation: 'Iron oxide dust on its surface makes Mars look red.',
                },
            ],
            correctMessage: 'Correct!',
            wrongMessage: 'Not quite.',
            fallbackUrl: 'https://example.com/quiz',
            style: { buttonColor: '#d63736', fieldRadius: 8, maxWidth: 480 },
        });
    } catch (err) {
        if (err instanceof AmpQuizConfigError) console.error(err.issues);
        else throw err;
    }
});

// The AMP feedback JavaScript API.
document.getElementById('add-amp-feedback')?.addEventListener('click', () => {
    try {
        addAmpFeedback(editor, {
            action: 'https://example.com/api/feedback',
            // Several ratings, one send button. Posted as delivery, product, recommend.
            questions: [
                { question: 'How was the delivery?', scale: 'emoji', name: 'delivery' },
                { question: 'How do you rate the product?', scale: 'stars', name: 'product' },
                { question: 'How likely are you to recommend us to a friend?', scale: '1-10', lowLabel: 'Not likely', highLabel: 'Very likely', name: 'recommend' },
            ],
            commentLabel: 'Anything we could do better?',
            fallbackUrl: 'https://example.com/feedback',
        });
    } catch (err) {
        if (err instanceof AmpFeedbackConfigError) console.error(err.issues);
        else throw err;
    }
});

// The AMP poll JavaScript API.
document.getElementById('add-amp-poll')?.addEventListener('click', () => {
    try {
        addAmpPoll(editor, {
            // Answers {"results": [..]} (one percentage per choice) to show the results.
            action: 'https://example.com/api/poll',
            question: 'Which day suits you for the webinar?',
            options: ['Monday', 'Wednesday', 'Friday'],
            // Recipients without AMP vote by link: https://example.com/poll?choice=Monday
            fallbackUrl: 'https://example.com/poll',
        });
    } catch (err) {
        if (err instanceof AmpPollConfigError) console.error(err.issues);
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
