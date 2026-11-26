import { describe, it, expect } from 'vitest';
import { toAmpEmail } from '../index';
import type { AmpFeedbackConfig, AmpFeedbackQuestion } from './types';
import { validateAmpFeedbackConfig } from './feedbackValidator';
import { AmpFeedbackConfigError, parseAmpFeedbackConfig, readAmpFeedbackConfig, readStoredAmpFeedbackConfig } from './feedbackConfig';
import { renderAmpFeedback, renderAmpFeedbackBlock } from './feedbackRenderer';

const feedback: AmpFeedbackConfig = { action: 'https://example.com/api/feedback', questions: [{ question: 'How was your order?' }] };

const three: AmpFeedbackConfig = {
    action: 'https://example.com/api/feedback',
    questions: [
        { question: 'How was the delivery?', scale: 'emoji', name: 'delivery' },
        { question: 'How do you rate the product?' },
        { question: 'Would you recommend us?', scale: '1-10', lowLabel: 'Not likely', highLabel: 'Very likely', required: false },
    ],
};

const one = (q: Partial<AmpFeedbackQuestion>): AmpFeedbackConfig => ({ ...feedback, questions: [{ question: 'Q', ...q }] });

function body(html: string): string {
    return html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
}

describe('validateAmpFeedbackConfig', () => {
    it('accepts one or several rating questions', () => {
        expect(validateAmpFeedbackConfig(feedback)).toEqual([]);
        expect(validateAmpFeedbackConfig(three)).toEqual([]);
    });

    it('needs an https endpoint and at least one question', () => {
        const issues = validateAmpFeedbackConfig({});
        expect(issues.map(i => i.path)).toEqual(['action', 'questions']);
        expect(issues[0].message).toBe('The feedback block needs an endpoint (action): the https URL that receives the feedback.');
        expect(validateAmpFeedbackConfig({ ...feedback, action: 'http://example.com/f' })[0].message).toContain('uses http');
        expect(validateAmpFeedbackConfig({ ...feedback, action: 'https://example.com/{{id}}' })[0].message).toContain('unresolved variable');
        expect(validateAmpFeedbackConfig({ ...feedback, questions: Array.from({ length: 11 }, () => ({ question: 'Q' })) })[0].message)
            .toBe('A feedback block can have at most 10 rating questions.');
    });

    it('checks each question: text, rating style, labels, required', () => {
        const issues = validateAmpFeedbackConfig({
            ...feedback,
            questions: [{ question: '', scale: 'hearts', lowLabel: '', required: 'yes', colour: 'red' }],
        });
        expect(issues.map(i => i.path)).toEqual([
            'questions[0].colour', 'questions[0].question', 'questions[0].scale', 'questions[0].lowLabel', 'questions[0].required',
        ]);
        expect(issues[2].message).toBe('The rating must be one of stars, emoji, 1-5, 1-10, thumbs.');
    });

    it('checks field names: valid, unique (defaults included), and not "comment"', () => {
        const paths = (questions: unknown[]) => validateAmpFeedbackConfig({ ...feedback, questions }).map(i => `${i.path}: ${i.message}`);
        expect(paths([{ question: 'A', name: '1st' }])[0]).toContain('must start with a letter');
        expect(paths([{ question: 'A', name: 'comment' }])).toEqual(['questions[0].name: Field name "comment" is used by the comment box.']);
        // The second question's default name is rating2.
        expect(paths([{ question: 'A' }, { question: 'B' }, { question: 'C', name: 'rating2' }]))
            .toEqual(['questions[2].name: Field name "rating2" is used twice.']);
    });

    it('checks the block: callbacks, yes/no settings, comment rules, design', () => {
        const issues = validateAmpFeedbackConfig({ ...feedback, comment: 'yes', style: { fieldRadius: 99 }, onSubmit: () => {} });
        expect(issues.map(i => i.path)).toEqual(['onSubmit', 'comment', 'style.fieldRadius']);
        expect(issues[0].message).toContain("runs in the recipient's email client");
        expect(validateAmpFeedbackConfig({ ...feedback, comment: false, commentRequired: true })[0].path).toBe('commentRequired');
        expect(() => parseAmpFeedbackConfig(one({ scale: 'hearts' as never }))).toThrow(AmpFeedbackConfigError);
    });
});

describe('the stored feedback block', () => {
    it('stores block settings as attributes and one empty element per question', () => {
        const block = renderAmpFeedbackBlock({ ...three, fallbackUrl: 'https://example.com/f' }, document);
        expect(block.getAttribute('data-action')).toBe('https://example.com/api/feedback');
        expect(block.hasAttribute('data-comment')).toBe(false);
        expect(Array.from(block.querySelectorAll('[data-amp-rating]')).map(q => q.outerHTML)).toEqual([
            '<div data-amp-rating="How was the delivery?" data-scale="emoji" data-name="delivery"></div>',
            '<div data-amp-rating="How do you rate the product?"></div>',
            '<div data-amp-rating="Would you recommend us?" data-scale="1-10" data-low-label="Not likely" data-high-label="Very likely" data-required="false"></div>',
        ]);
        expect(block.textContent).toBe('This email lets you rate us right here in an email app that supports interactive email, such as Gmail.Give feedback');
        expect(block.getAttribute('data-amp-feedback-summary')).toBe('AMP feedback · 3 ratings · "How was the delivery?" → example.com/api/feedback');
        expect(renderAmpFeedbackBlock(one({ scale: 'emoji' }), document).getAttribute('data-amp-feedback-summary'))
            .toBe('AMP feedback · \u{1F642} Emoji (1–5) · "Q" → example.com/api/feedback');
    });

    it('reads back exactly what was written', () => {
        const full: AmpFeedbackConfig = {
            ...three,
            commentRequired: true, commentLabel: 'Why?', commentPlaceholder: 'Tell us', submitText: 'Send',
            successMessage: 'Thanks', errorMessage: 'Oops', submittingMessage: 'Sending', fallbackText: 'Rate us',
            fallbackUrl: 'https://example.com/f', fallbackLinkText: 'Rate', style: { buttonColor: '#d63736' },
        };
        expect(readStoredAmpFeedbackConfig(renderAmpFeedbackBlock(full, document))).toEqual(full);
        expect(readStoredAmpFeedbackConfig(renderAmpFeedbackBlock({ ...feedback, comment: false }, document)).comment).toBe(false);
    });

    it('still reads a block saved in the first, single-question format', () => {
        const holder = document.createElement('div');
        holder.innerHTML = '<div class="play-editor-amp-feedback" data-action="https://example.com/f" data-question="How was it?" data-scale="1-10" data-low-label="Bad"><p>fallback</p></div>';
        const read = readAmpFeedbackConfig(holder.firstElementChild!);
        expect('config' in read && read.config.questions).toEqual([
            // Its rating keeps the field name it was posted as.
            { question: 'How was it?', scale: '1-10', lowLabel: 'Bad', highLabel: '', name: 'rating', required: true },
        ]);
    });

    it('reports a hand-edited block with a misspelt setting', () => {
        const block = renderAmpFeedbackBlock(feedback, document);
        block.querySelector('[data-amp-rating]')!.setAttribute('data-scael', '1-5');
        const read = readAmpFeedbackConfig(block);
        expect('issues' in read && read.issues.map(i => i.path)).toEqual(['questions[0].scael']);
    });
});

describe('renderAmpFeedback', () => {
    const render = (config: AmpFeedbackConfig = feedback, preview = false) =>
        renderAmpFeedback(parseAmpFeedbackConfig(config), document, 2, { preview });

    it('is one form for every question, posting each rating under its name, locked once sent', () => {
        const form = render(three);
        expect(form.getAttribute('action-xhr')).toBe('https://example.com/api/feedback');
        expect(form.getAttribute('on')).toBe('submit-success:AMP.setState({feedback2sent: true})');
        expect(form.hasAttribute('target')).toBe(false);
        expect(Array.from(form.querySelectorAll('[name]')).map(e => `${e.tagName.toLowerCase()}:${e.getAttribute('name')}`))
            .toEqual(['textarea:comment', 'input:delivery', 'input:rating2', 'input:rating3']);
        const selectors = Array.from(form.querySelectorAll('amp-selector'));
        expect(selectors.map(s => s.getAttribute('on'))).toEqual([1, 2, 3].map(n => `select:AMP.setState({feedback2q${n}: event.targetOption})`));
        expect(selectors.every(s => s.getAttribute('data-amp-bind-disabled') === 'feedback2sent == true')).toBe(true);
        expect(form.querySelector('input[name="delivery"]')!.getAttribute('data-amp-bind-value')).toBe("feedback2q1 == null ? '' : feedback2q1");
        expect(form.querySelectorAll('button')).toHaveLength(1);
        expect(form.querySelector('button')!.parentElement!.getAttribute('data-amp-bind-hidden')).toBe('feedback2sent == true');
        expect(form.querySelector('[submit-success]')!.textContent).toBe('Thanks for your feedback!');
    });

    it('enables the button once every required question is rated', () => {
        const button = render(three).querySelector('button')!;
        expect(button.hasAttribute('disabled')).toBe(true);
        // The third question is optional.
        expect(button.getAttribute('data-amp-bind-disabled')).toBe('!(feedback2q1 != null && feedback2q2 != null)');
        const allOptional = render({ ...feedback, questions: [{ question: 'Q', required: false }] }).querySelector('button')!;
        expect(allOptional.hasAttribute('disabled')).toBe(false);
        expect(allOptional.hasAttribute('data-amp-bind-disabled')).toBe(false);
    });

    it('gives each question its own rating style', () => {
        const selectors = Array.from(render(three).querySelectorAll('amp-selector'));
        expect(selectors.map(s => s.querySelectorAll('[option]').length)).toEqual([5, 5, 10]);
        expect(selectors[1].textContent).toBe('☆☆☆☆☆');
        expect(selectors[2].getAttribute('style')).toContain('repeat(10, minmax(0, 1fr))');
    });

    it('fills each question\'s stars from its own state', () => {
        const stars = Array.from(render().querySelectorAll('[option]'));
        expect(stars[2].getAttribute('data-amp-bind-text')).toBe("['3', '4', '5'].includes(feedback2q1) ? '★' : '☆'");
        expect(stars[4].getAttribute('data-amp-bind-text')).toBe("['5'].includes(feedback2q1) ? '★' : '☆'");
    });

    it('has the choices of each scale', () => {
        const values = (scale: AmpFeedbackQuestion['scale']) =>
            Array.from(render(one({ scale })).querySelectorAll('[option]')).map(o => `${o.getAttribute('option')}${o.textContent}`);
        expect(values('emoji')).toEqual(['1\u{1F620}', '2\u{1F641}', '3\u{1F610}', '4\u{1F642}', '5\u{1F60D}']);
        expect(values('1-5')).toEqual(['11', '22', '33', '44', '55']);
        expect(values('1-10')).toEqual(Array.from({ length: 10 }, (_, n) => `${n + 1}${n + 1}`));
        expect(values('thumbs')).toEqual(['1\u{1F44D}', '0\u{1F44E}']);
    });

    it('has no 0-10 scale', () => {
        expect(validateAmpFeedbackConfig(one({ scale: 'nps' as never }))[0].message).toBe('The rating must be one of stars, emoji, 1-5, 1-10, thumbs.');
    });

    it('lays numbers out as one row of equal boxes, five of them not full width', () => {
        const style = (scale: AmpFeedbackQuestion['scale']) => render(one({ scale })).querySelector('amp-selector')!.getAttribute('style');
        expect(style('1-5')).toBe('display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; max-width: 320px');
        expect(style('1-10')).toBe('display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 4px');
        // The end labels line up with the five boxes.
        const ends = (scale: AmpFeedbackQuestion['scale']) =>
            render(one({ scale, lowLabel: 'Poor', highLabel: 'Great' })).querySelector('amp-selector')!.nextElementSibling!.getAttribute('style');
        expect(ends('1-5')).toContain('max-width: 320px');
        expect(ends('1-10')).not.toContain('max-width');
        expect(renderAmpFeedbackBlock(one({ scale: '1-10' }), document).getAttribute('data-amp-feedback-summary'))
            .toBe('AMP feedback · 1–10 numbers · "Q" → example.com/api/feedback');
    });

    it('shows end labels, except on thumbs', () => {
        expect(render(one({ lowLabel: 'Bad', highLabel: 'Great' })).textContent).toContain('BadGreat');
        expect(render(one({ scale: 'thumbs', lowLabel: 'Bad', highLabel: 'Great' })).textContent).not.toContain('Bad');
    });

    it('leaves the comment out, or requires it', () => {
        expect(render({ ...feedback, comment: false }).querySelector('textarea')).toBeNull();
        expect(render({ ...feedback, commentRequired: true }).querySelector('textarea')!.hasAttribute('required')).toBe(true);
    });

    it('keeps user text out of binding expressions and markup', () => {
        const form = render({ ...feedback, questions: [{ question: `It's "great" <b>`, name: 'x.y-z' }], commentLabel: '</label><script>' });
        for (const node of [form, ...Array.from(form.querySelectorAll('*'))]) {
            for (const attr of Array.from(node.attributes)) {
                if (attr.name.startsWith('data-amp-bind-') || attr.name === 'on') expect(attr.value).not.toMatch(/great|script|x\.y/);
            }
        }
        expect(form.querySelector('script, b')).toBeNull();
        expect(form.querySelector('p')!.textContent).toBe(`It's "great" <b>`);
    });

    it('adds preview markers only when asked', () => {
        expect(render().outerHTML).not.toContain('data-pe-');
        expect(Array.from(render(three, true).querySelectorAll('[data-pe-scale]')).map(q => q.getAttribute('data-pe-scale'))).toEqual(['emoji', 'stars', '1-10']);
    });
});

describe('toAmpEmail with feedback', () => {
    it('converts a feedback block with several questions into valid AMP', () => {
        const result = toAmpEmail(`<p>Hi</p>${renderAmpFeedbackBlock(three, document).outerHTML}`);
        expect(result.issues.filter(i => i.severity === 'error')).toEqual([]);
        expect(result.extensions).toEqual(['amp-bind', 'amp-form', 'amp-selector']);
        expect(body(result.html)).not.toContain('play-editor');
        expect(body(result.html)).not.toContain('data-amp-rating');
    });

    it('keeps each block\'s state separate', () => {
        const block = renderAmpFeedbackBlock(feedback, document).outerHTML;
        const result = toAmpEmail(block + block);
        expect(result.html).toContain('feedback1q1');
        expect(result.html).toContain('feedback2q1');
    });

    it('reports an invalid block and keeps its fallback', () => {
        const block = renderAmpFeedbackBlock(feedback, document);
        block.setAttribute('data-action', 'http://example.com/f');
        const result = toAmpEmail(block.outerHTML);
        expect(result.valid).toBe(false);
        expect(result.issues.find(i => i.code === 'feedback-invalid')!.message).toContain('Feedback 1: action:');
        expect(body(result.html)).toContain('This email lets you rate us');
    });

    it('does not let hand-written content use the submit-success action', () => {
        const result = toAmpEmail('<div on="submit-success:AMP.setState({x: 1})">A</div>');
        expect(body(result.html).trim()).toBe('<div>A</div>');
    });
});
