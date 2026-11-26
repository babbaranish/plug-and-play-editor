import type { AmpTransformer } from '../types';
import { AMP_QUIZ_CLASS, readAmpQuizConfig } from '../quiz/quizConfig';
import { renderAmpQuiz } from '../quiz/quizRenderer';

/**
 * Replaces each quiz block with its AMP quiz, generated from the settings
 * the block stores. The result is final: later passes leave it alone. A
 * block whose settings are invalid keeps its fallback content and each
 * problem is reported as an error.
 */
export const transformQuizzes: AmpTransformer = (root, ctx) => {
    let index = 0;
    for (const block of Array.from(root.querySelectorAll(`.${AMP_QUIZ_CLASS}`))) {
        index++;
        const read = readAmpQuizConfig(block);
        if ('issues' in read) {
            for (const issue of read.issues) {
                ctx.report('error', 'quiz-invalid', `Quiz ${index}: ${issue.path ? `${issue.path}: ` : ''}${issue.message}`, block);
            }
            continue;
        }
        const quiz = renderAmpQuiz(read.config, ctx.doc, index);
        block.replaceWith(quiz);
        ctx.finalize(quiz);
    }
};
