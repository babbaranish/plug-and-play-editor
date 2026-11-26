import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import type { ModalFormEntry, ModalListField, ModalListItem } from '../core/modal';
import type { AmpFormStyle } from '../amp/forms/types';
import type { AmpQuizConfig, AmpQuizConfigIssue, AmpQuizQuestion } from '../amp/quiz/types';
import { icons } from '../core/icons';
import { openFormModal } from '../core/modal';
import { compactAmpFormStyle, normalizeAmpFormStyle, validateAmpFormStyle } from '../amp/forms/formStyle';
import { endpointIssue } from '../amp/forms/formValidator';
import { endpointLabel } from '../amp/forms/formRenderer';
import {
    AMP_QUIZ_CLASS,
    AMP_QUIZ_SUMMARY_ATTR,
    AmpQuizConfigError,
    formatAmpQuizChoices,
    parseAmpQuizChoices,
    parseAmpQuizConfig,
    readAmpQuizConfig,
    readStoredAmpQuizConfig
} from '../amp/quiz/quizConfig';
import { MAX_QUESTIONS, validateAmpQuizConfig } from '../amp/quiz/quizValidator';
import { quizSummaryOf, renderAmpQuizBlock } from '../amp/quiz/quizRenderer';
import {
    caretBlock,
    designRows,
    inAlternateView,
    optional,
    placeBlock,
    readableStyleIssue,
    startingStyle,
    styleFromValues,
    withDefaultStyle
} from './amp-shared';

/** Inserts a quiz block. Takes an {@link AmpQuizConfig}; returns the block, or null. */
export const AMP_QUIZ_INSERT_COMMAND = 'amp-quiz:insert';
/** Changes a quiz block. Takes the block and a partial config; returns the new block, or null. */
export const AMP_QUIZ_UPDATE_COMMAND = 'amp-quiz:update';

/** The question a quiz made from the toolbar starts with. */
const STARTER_QUESTIONS: AmpQuizQuestion[] = [
    { question: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter'], answer: 'Mars' },
];

const COLUMN_CHOICES = [
    { value: '1', label: '1 (a list)' },
    { value: '2', label: '2 (a grid)' },
    // { value: '3', label: '3 (a grid, for short choices)' },
];

/** In the quiz dialog, the form design settings say what they style in a quiz. */
const QUIZ_DESIGN_LABELS = {
    buttonColor: 'Submit button color',
    buttonTextColor: 'Submit button text',
    buttonRadius: 'Submit button corners (px)',
    buttonAlign: 'Submit button position',
    buttonFullWidth: 'Full-width submit button',
    fieldBorderColor: 'Choice border',
    fieldBackground: 'Choice background',
    fieldRadius: 'Choice corners (px)',
    labelColor: 'Question color',
    labelBold: 'Bold questions',
    successColor: 'Right answer color',
    errorColor: 'Wrong answer color',
    fieldSpacing: 'Space between questions (px)',
} as const;

function insertQuiz(editor: Editor, config: unknown, after: Element | null, defaultStyle?: AmpFormStyle): HTMLElement | null {
    // Throws AmpQuizConfigError listing every problem.
    parseAmpQuizConfig(config);
    if (inAlternateView(editor)) return null;
    const block = renderAmpQuizBlock(withDefaultStyle(config as AmpQuizConfig, defaultStyle), document);
    placeBlock(editor, block, after);
    editor.notifyContentChange();
    return block;
}

/**
 * Applies `patch` over the settings stored on `block`. Settings the patch
 * doesn't name are kept; a key set to `undefined` is removed. The block is
 * replaced, so its summary and fallback follow.
 */
function updateQuiz(editor: Editor, block: Element, patch: Partial<AmpQuizConfig>): HTMLElement | null {
    if (!block.classList.contains(AMP_QUIZ_CLASS) || !editor.editorArea.contains(block)) return null;
    // Through JSON, so keys set to undefined are dropped.
    const next = JSON.parse(JSON.stringify({ ...readStoredAmpQuizConfig(block), ...patch })) as unknown;
    // Throws AmpQuizConfigError listing every problem; the block is left as it was.
    parseAmpQuizConfig(next);
    if (inAlternateView(editor)) return null;
    const replacement = renderAmpQuizBlock(next as AmpQuizConfig, document);
    block.replaceWith(replacement);
    editor.notifyContentChange();
    return replacement;
}

// ── Questions section of the dialog ───────────────────────────────

function itemFromQuestion(q: Partial<AmpQuizQuestion>): ModalListItem {
    return {
        question: q.question ?? '',
        options: Array.isArray(q.options) ? formatAmpQuizChoices(q.options) : '',
        answer: q.answer ?? '',
        explanation: q.explanation ?? '',
    };
}

function questionFromItem(item: ModalListItem): AmpQuizQuestion {
    const q: { -readonly [K in keyof AmpQuizQuestion]?: AmpQuizQuestion[K] } = {
        question: item.question.trim(),
        options: parseAmpQuizChoices(item.options),
        answer: item.answer.trim(),
    };
    if (item.explanation.trim()) q.explanation = item.explanation.trim();
    return q as AmpQuizQuestion;
}

/** Dialog wording for an issue: "questions[1].answer: …" → "Question 2: …", and design settings by their label. */
function readableIssue(issue: AmpQuizConfigIssue): string {
    const m = /^questions\[(\d+)\]/.exec(issue.path);
    if (m) return `Question ${Number(m[1]) + 1}: ${issue.message}`;
    return readableStyleIssue(issue, QUIZ_DESIGN_LABELS) ?? issue.message;
}

function questionsList(questions: readonly Partial<AmpQuizQuestion>[]): ModalListField {
    return {
        kind: 'list',
        name: 'questions',
        label: 'Questions',
        itemLabel: 'question',
        addLabel: 'Add question',
        minItems: 1,
        maxItems: MAX_QUESTIONS,
        items: questions.map(itemFromQuestion),
        newItem: () => itemFromQuestion({}),
        itemFields: [
            { name: 'question', label: 'Question', placeholder: 'Which planet is known as the Red Planet?' },
            { name: 'options', label: 'Choices (separate with |)', placeholder: 'Venus | Mars | Jupiter' },
            { name: 'answer', label: 'Correct answer', placeholder: 'One of the choices' },
            { name: 'explanation', label: 'Explanation (optional)', placeholder: 'Shown after answering' },
        ],
        itemHint: (item) => {
            const issue = validateAmpQuizConfig({ questions: [questionFromItem(item)] })[0];
            return issue ? { text: issue.message, tone: 'error' } : null;
        },
    };
}

/**
 * The Insert / Edit AMP quiz dialog: the questions (add, remove, reorder,
 * each checked as you type), feedback wording, an optional endpoint that
 * records the answers, the HTML-version fallback, and the design.
 */
function openQuizDialog(editor: Editor, block: Element | null, insertAfter: Element | null, defaultStyle?: AmpFormStyle): void {
    const stored = block ? readStoredAmpQuizConfig(block) : {};
    const text = (key: string) => (typeof stored[key] === 'string' ? stored[key] as string : '');
    const questions = Array.isArray(stored.questions) && stored.questions.length
        ? stored.questions as Partial<AmpQuizQuestion>[]
        : STARTER_QUESTIONS;
    const style = block ? startingStyle(stored.style) : normalizeAmpFormStyle(defaultStyle);

    const rows: ModalFormEntry[] = [
        questionsList(questions),
        {
            name: 'columns',
            label: 'Choices per row',
            type: 'select',
            options: COLUMN_CHOICES,
            value: COLUMN_CHOICES.some(c => c.value === String(stored.columns)) ? String(stored.columns) : '1',
        },
        [
            { name: 'correctMessage', label: 'When right', value: text('correctMessage'), placeholder: 'Correct!' },
            { name: 'wrongMessage', label: 'When wrong', value: text('wrongMessage'), placeholder: 'Not quite. (the answer follows)' },
            { name: 'scoreText', label: 'Before the score', value: text('scoreText'), placeholder: 'Your score:' },
        ],
        {
            name: 'action',
            label: 'Record answers at (optional https endpoint)',
            type: 'url',
            value: text('action'),
            placeholder: 'https://example.com/api/quiz',
            hint: (value) => {
                if (!value.trim()) return { text: 'Not recorded: answers are checked in the email only.' };
                const problem = endpointIssue(value);
                return problem
                    ? { text: problem.replace('The form needs', 'The quiz needs'), tone: 'error' }
                    : { text: `Posts the answers and score to ${endpointLabel(value.trim())}`, tone: 'ok' };
            },
        },
        [
            { name: 'submitText', label: 'Submit button text', value: text('submitText'), placeholder: 'Submit answers' },
            { name: 'successMessage', label: 'After sending', value: text('successMessage'), placeholder: 'Thanks! Your answers were sent.' },
            { name: 'errorMessage', label: 'If sending fails', value: text('errorMessage'), placeholder: 'Something went wrong. Please try again.' },
        ],
        { name: 'fallbackText', label: 'Shown where AMP quizzes are not supported', type: 'textarea', value: text('fallbackText'), placeholder: 'This email has a quiz you can take in an email app that supports interactive email, such as Gmail.' },
        [
            { name: 'fallbackUrl', label: 'Web version of the quiz (optional)', type: 'url', value: text('fallbackUrl'), placeholder: 'https://example.com/quiz' },
            { name: 'fallbackLinkText', label: 'Its link text', value: text('fallbackLinkText'), placeholder: 'Take the quiz' },
        ],
        ...designRows(style, QUIZ_DESIGN_LABELS),
    ];

    openFormModal(editor, {
        title: block ? 'Edit AMP quiz' : 'Insert AMP quiz',
        fields: rows,
        wide: true,
        submitLabel: block ? 'Save' : 'Insert',
        onSubmit: (values, { showError, close, lists }) => {
            const patch: { -readonly [K in keyof AmpQuizConfig]?: AmpQuizConfig[K] } = {
                questions: (lists.questions ?? []).map(questionFromItem),
                // One per row is the default, so it isn't stored.
                columns: values.columns === '2' || values.columns === '3' ? Number(values.columns) as 2 | 3 : undefined,
                correctMessage: optional(values.correctMessage),
                wrongMessage: optional(values.wrongMessage),
                scoreText: optional(values.scoreText),
                action: optional(values.action),
                submitText: optional(values.submitText),
                successMessage: optional(values.successMessage),
                errorMessage: optional(values.errorMessage),
                fallbackText: optional(values.fallbackText),
                fallbackUrl: optional(values.fallbackUrl),
                fallbackLinkText: optional(values.fallbackLinkText),
            };
            const enteredStyle = styleFromValues(values);
            const next = block ? { ...stored, ...patch } : patch;
            const issues = [
                ...validateAmpFormStyle(enteredStyle),
                ...validateAmpQuizConfig(JSON.parse(JSON.stringify({ ...next, style: undefined }))),
            ];
            if (issues.length) {
                showError(issues.map(readableIssue).join(' '));
                return;
            }
            // Only what differs from the default look is stored.
            patch.style = compactAmpFormStyle(enteredStyle as AmpFormStyle);
            if (block) updateQuiz(editor, block, patch);
            else insertQuiz(editor, JSON.parse(JSON.stringify(patch)), insertAfter);
            close();
        },
    });
}

export interface AmpQuizPluginOptions {
    /**
     * The design new quizzes start with, e.g. your brand colours. The same
     * settings as forms. Each quiz stores its design, so changing this later
     * doesn't restyle existing quizzes.
     */
    defaultStyle?: AmpFormStyle;
}

/**
 * Lets an editor hold AMP email quizzes. A quiz is a non-editable block
 * storing its questions, answers and design: the HTML version of the email
 * shows its fallback text (and link), and `toAmpEmail` turns it into an
 * interactive quiz that checks answers in the email and shows the score.
 * Click a quiz to edit it; the toolbar button adds one.
 *
 * The correct answers are in the AMP email's markup (that is how it checks
 * them without a server), so a determined recipient can read them.
 *
 * Throws an `AmpQuizConfigError` when `defaultStyle` is invalid.
 */
export function createAmpQuizPlugin(options: AmpQuizPluginOptions = {}): Plugin {
    if (options.defaultStyle !== undefined) {
        const issues = validateAmpFormStyle(options.defaultStyle, 'defaultStyle');
        if (issues.length) throw new AmpQuizConfigError(issues);
    }
    const defaultStyle = options.defaultStyle ? compactAmpFormStyle(options.defaultStyle) : undefined;
    return {
        name: 'amp-quiz',
        init(editor: Editor) {
            initAmpQuizzes(editor, defaultStyle);
        }
    };
}

/** Quizzes with the default design. */
export const AmpQuizPlugin: Plugin = createAmpQuizPlugin();

function initAmpQuizzes(editor: Editor, defaultStyle: AmpFormStyle | undefined): void {
    editor.addToolbarButton(icons.quiz, 'Insert AMP Quiz', () => {
        if (inAlternateView(editor)) return;
        openQuizDialog(editor, null, caretBlock(editor), defaultStyle);
    });

    const onClick = (e: MouseEvent) => {
        const block = (e.target as Element | null)?.closest?.(`.${AMP_QUIZ_CLASS}`);
        if (!block || !editor.editorArea.contains(block)) return;
        e.preventDefault();
        if (inAlternateView(editor) || editor.editorArea.contentEditable === 'false') return;
        openQuizDialog(editor, block, null);
    };
    editor.editorArea.addEventListener('click', onClick);

    const unregisterInsert = editor.registerCommand(AMP_QUIZ_INSERT_COMMAND, (config: unknown) => insertQuiz(editor, config, caretBlock(editor), defaultStyle));
    const unregisterUpdate = editor.registerCommand(AMP_QUIZ_UPDATE_COMMAND, (block: Element, patch: Partial<AmpQuizConfig>) => updateQuiz(editor, block, patch));
    // A quiz edited by hand (source view, paste) keeps its summary current.
    const refreshSummaries = () => {
        if (inAlternateView(editor)) return;
        let changed = false;
        editor.editorArea.querySelectorAll(`.${AMP_QUIZ_CLASS}`).forEach((block) => {
            const read = readAmpQuizConfig(block);
            if ('issues' in read) return;
            const summary = quizSummaryOf(read.config);
            if (block.getAttribute(AMP_QUIZ_SUMMARY_ATTR) !== summary) {
                block.setAttribute(AMP_QUIZ_SUMMARY_ATTR, summary);
                changed = true;
            }
        });
        if (changed) editor.notifyContentChange();
    };
    const unsubscribeInput = editor.onInput(refreshSummaries);
    refreshSummaries();

    editor.onDestroy(() => {
        editor.editorArea.removeEventListener('click', onClick);
        unregisterInsert();
        unregisterUpdate();
        unsubscribeInput();
    });
}

/**
 * Adds an AMP quiz to `editor` from a config. The editor needs `AmpQuizPlugin`.
 *
 * Returns the inserted block, or `null` when the editor has no
 * `AmpQuizPlugin` or its source view or preview is open. Throws an
 * `AmpQuizConfigError` listing every problem when the config is invalid.
 */
export function addAmpQuiz(editor: Editor, config: AmpQuizConfig): HTMLElement | null {
    if (!editor.hasCommand(AMP_QUIZ_INSERT_COMMAND)) return null;
    return editor.runCommand<HTMLElement | null>(AMP_QUIZ_INSERT_COMMAND, config) ?? null;
}

/**
 * Changes a quiz already in `editor`: `patch` is applied over its stored
 * settings, so anything not named is kept. Returns the replacement block, or
 * `null` when the editor has no `AmpQuizPlugin`, the block isn't one of its
 * quizzes, or its source view or preview is open. Throws an
 * `AmpQuizConfigError` when the result would be invalid, leaving the quiz
 * unchanged.
 */
export function updateAmpQuiz(editor: Editor, block: Element, patch: Partial<AmpQuizConfig>): HTMLElement | null {
    if (!editor.hasCommand(AMP_QUIZ_UPDATE_COMMAND)) return null;
    return editor.runCommand<HTMLElement | null>(AMP_QUIZ_UPDATE_COMMAND, block, patch) ?? null;
}
