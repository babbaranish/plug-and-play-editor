import { describe, it, expect } from 'vitest';
import { toAmpEmail } from '../index';
import type { AmpPollConfig } from './types';
import { validateAmpPollConfig } from './pollValidator';
import { AmpPollConfigError, parseAmpPollChoices, parseAmpPollConfig, readAmpPollConfig, readStoredAmpPollConfig } from './pollConfig';
import { pollChoiceUrl, renderAmpPoll, renderAmpPollBlock } from './pollRenderer';

const poll: AmpPollConfig = {
    action: 'https://example.com/api/poll',
    question: 'Which day suits you?',
    options: ['Monday', 'Friday, after lunch', "Don't mind"],
};

function body(html: string): string {
    return html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
}

describe('validateAmpPollConfig', () => {
    it('accepts a minimal poll', () => {
        expect(validateAmpPollConfig(poll)).toEqual([]);
    });

    it('needs an https endpoint, a question and 2–6 unique choices', () => {
        expect(validateAmpPollConfig({}).map(i => i.path)).toEqual(['action', 'question', 'options']);
        expect(validateAmpPollConfig({})[0].message).toBe('The poll needs an endpoint (action): the https URL that receives the votes.');
        expect(validateAmpPollConfig({ ...poll, action: 'http://example.com/p' })[0].message).toContain('uses http');
        expect(validateAmpPollConfig({ ...poll, options: ['Only'] })[0].message).toBe('A poll needs 2 to 6 choices.');
        expect(validateAmpPollConfig({ ...poll, options: Array.from({ length: 7 }, (_, i) => `C${i}`) })[0].path).toBe('options');
        expect(validateAmpPollConfig({ ...poll, options: ['A', 'A', 'B|C', ''] }).map(i => `${i.path}: ${i.message}`)).toEqual([
            'options[1]: Choice "A" is listed twice.',
            'options[2]: Choice "B|C" can\'t contain "|".',
            'options[3]: A choice needs text.',
        ]);
    });

    it('checks callbacks, settings and design', () => {
        const issues = validateAmpPollConfig({ ...poll, onVote: () => {}, showResults: 'yes', submitText: '', style: { buttonColor: 'blue' } });
        expect(issues.map(i => i.path)).toEqual(['onVote', 'showResults', 'submitText', 'style.buttonColor']);
        expect(issues[0].message).toContain("runs in the recipient's email client");
        expect(() => parseAmpPollConfig({ ...poll, question: '' })).toThrow(AmpPollConfigError);
    });
});

describe('the stored poll block', () => {
    it('stores settings as attributes and shows the fallback text without a web poll', () => {
        const block = renderAmpPollBlock(poll, document);
        expect(block.getAttribute('data-question')).toBe('Which day suits you?');
        expect(block.getAttribute('data-options')).toBe("Monday | Friday, after lunch | Don't mind");
        expect(block.hasAttribute('data-show-results')).toBe(false);
        expect(block.textContent).toBe('This email has a poll you can answer in an email app that supports interactive email, such as Gmail.');
        expect(block.getAttribute('data-amp-poll-summary')).toBe('AMP poll · 3 choices · "Which day suits you?" → example.com/api/poll');
    });

    it('links each choice to the web poll in the HTML version', () => {
        const block = renderAmpPollBlock({ ...poll, fallbackUrl: 'https://example.com/poll?src=email' }, document);
        expect(block.querySelector('p')!.textContent).toBe('Which day suits you?');
        expect(Array.from(block.querySelectorAll('a')).map(a => [a.textContent, a.getAttribute('href')])).toEqual([
            ['Monday', 'https://example.com/poll?src=email&choice=Monday'],
            ['Friday, after lunch', 'https://example.com/poll?src=email&choice=Friday%2C+after+lunch'],
            ["Don't mind", "https://example.com/poll?src=email&choice=Don%27t+mind"],
        ]);
        // The default text says the poll needs AMP, which is no longer true, so it's left out.
        expect(block.textContent).not.toContain('This email has a poll');
        expect(renderAmpPollBlock({ ...poll, fallbackUrl: 'https://example.com/poll', fallbackText: 'Or vote here:' }, document).textContent)
            .toContain('Or vote here:');
    });

    it('reads back exactly what was written', () => {
        const full: AmpPollConfig = {
            ...poll, showResults: false, submitText: 'Send', successMessage: 'Thanks', errorMessage: 'Oops',
            submittingMessage: 'Sending', fallbackText: 'Vote below', fallbackUrl: 'https://example.com/poll', style: { buttonColor: '#d63736' },
        };
        expect(readStoredAmpPollConfig(renderAmpPollBlock(full, document))).toEqual(full);
    });

    it('splits choices on | so a choice can contain commas', () => {
        expect(parseAmpPollChoices('Yes, please | No, thanks |  ')).toEqual(['Yes, please', 'No, thanks']);
    });

    it('reports a hand-edited block with a misspelt setting', () => {
        const block = renderAmpPollBlock(poll, document);
        block.setAttribute('data-qestion', 'x');
        const read = readAmpPollConfig(block);
        expect('issues' in read && read.issues.map(i => i.path)).toEqual(['qestion']);
    });
});

describe('renderAmpPoll', () => {
    const render = (config: Partial<AmpPollConfig> = {}, preview = false) =>
        renderAmpPoll(parseAmpPollConfig({ ...poll, ...config }), document, 2, { preview });

    it('is a form posting "choice", keeping the endpoint\'s answer once voted', () => {
        const form = render();
        expect(form.getAttribute('action-xhr')).toBe('https://example.com/api/poll');
        expect(form.getAttribute('on')).toBe('submit-success:AMP.setState({poll2sent: true, poll2r: event.response})');
        expect(form.hasAttribute('target')).toBe(false);
        expect(Array.from(form.querySelectorAll('[name]')).map(e => e.getAttribute('name'))).toEqual(['choice']);
        expect(form.querySelector('input')!.getAttribute('data-amp-bind-value')).toBe("poll2 == null ? '' : poll2");
        const selector = form.querySelector('amp-selector')!;
        expect(selector.getAttribute('on')).toBe('select:AMP.setState({poll2: event.targetOption})');
        expect(selector.getAttribute('data-amp-bind-disabled')).toBe('poll2sent == true');
        // Each choice's value is its text.
        expect(Array.from(selector.querySelectorAll('[option]')).map(o => o.getAttribute('option'))).toEqual(poll.options);
        const button = form.querySelector('button')!;
        expect(button.hasAttribute('disabled')).toBe(true);
        expect(button.getAttribute('data-amp-bind-disabled')).toBe('poll2 == null');
        expect(button.parentElement!.getAttribute('data-amp-bind-hidden')).toBe('poll2sent == true');
        expect(form.querySelector('[submit-success]')!.textContent).toBe('Thanks for voting!');
    });

    it('shows each choice\'s percentage and a ten-step bar from the results', () => {
        const second = render().querySelectorAll('[option]')[1];
        const percent = second.querySelector('[data-amp-bind-text]')!;
        expect(percent.getAttribute('data-amp-bind-text')).toBe("poll2r && poll2r.results ? poll2r.results[1] + '%' : ''");
        expect(percent.textContent).toBe('');
        const bar = second.querySelector('div[hidden]')!;
        expect(bar.getAttribute('data-amp-bind-hidden')).toBe('!(poll2r && poll2r.results)');
        const segments = Array.from(bar.children);
        expect(segments).toHaveLength(10);
        expect(segments.every(seg => seg.hasAttribute('hidden'))).toBe(true);
        expect(segments[0].getAttribute('data-amp-bind-hidden')).toBe('!(poll2r && poll2r.results && poll2r.results[1] >= 5)');
        expect(segments[9].getAttribute('data-amp-bind-hidden')).toBe('!(poll2r && poll2r.results && poll2r.results[1] >= 95)');
    });

    it('leaves results out when they are off', () => {
        const form = render({ showResults: false });
        expect(form.getAttribute('on')).toBe('submit-success:AMP.setState({poll2sent: true})');
        expect(form.querySelector('[data-amp-bind-text], div[hidden]')).toBeNull();
    });

    it('keeps user text out of binding expressions and markup', () => {
        const form = render({ question: `It's "odd" <b>`, options: [`A' + x + '`, '</div><script>'] });
        for (const node of [form, ...Array.from(form.querySelectorAll('*'))]) {
            for (const attr of Array.from(node.attributes)) {
                if (attr.name.startsWith('data-amp-bind-') || attr.name === 'on') expect(attr.value).not.toMatch(/odd|x \+|script/);
            }
        }
        expect(form.querySelector('script, b')).toBeNull();
        expect(form.querySelector('[option]')!.getAttribute('option')).toBe(`A' + x + '`);
    });

    it('adds preview markers only when asked', () => {
        expect(render().outerHTML).not.toContain('data-pe-');
        expect(render({}, true).hasAttribute('data-pe-poll')).toBe(true);
    });
});

describe('pollChoiceUrl', () => {
    it('adds or replaces the choice parameter', () => {
        expect(pollChoiceUrl('https://example.com/poll', 'A & B')).toBe('https://example.com/poll?choice=A+%26+B');
        expect(pollChoiceUrl('https://example.com/poll?choice=old#top', 'New')).toBe('https://example.com/poll?choice=New#top');
    });
});

describe('toAmpEmail with polls', () => {
    it('converts a poll into valid AMP', () => {
        const result = toAmpEmail(`<p>Hi</p>${renderAmpPollBlock({ ...poll, fallbackUrl: 'https://example.com/poll' }, document).outerHTML}`);
        expect(result.issues.filter(i => i.severity === 'error')).toEqual([]);
        expect(result.extensions).toEqual(['amp-bind', 'amp-form', 'amp-selector']);
        expect(body(result.html)).not.toContain('play-editor');
        // The HTML version's links are replaced by the AMP poll.
        expect(body(result.html)).not.toContain('choice=Monday');
    });

    it('keeps each poll\'s state separate', () => {
        const block = renderAmpPollBlock(poll, document).outerHTML;
        const result = toAmpEmail(block + block);
        expect(result.html).toContain('poll1r');
        expect(result.html).toContain('poll2r');
    });

    it('reports an invalid poll and keeps its fallback', () => {
        const block = renderAmpPollBlock(poll, document);
        block.setAttribute('data-options', 'Only one');
        const result = toAmpEmail(block.outerHTML);
        expect(result.valid).toBe(false);
        expect(result.issues.find(i => i.code === 'poll-invalid')!.message).toBe('Poll 1: options: A poll needs 2 to 6 choices.');
        expect(body(result.html)).toContain('This email has a poll');
    });
});
