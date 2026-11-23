import type { AmpTransformer } from '../types';

const YOUTUBE_ID = /(?:youtube(?:-nocookie)?\.com\/(?:embed|shorts)\/|youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([\w-]{11})/;

/**
 * AMP email has no iframes or video. A YouTube embed becomes its thumbnail
 * linked to the video; any other embed becomes a link to its address.
 * The thumbnail is an <img> with its size, which transformImages converts.
 */
export const transformEmbeds: AmpTransformer = (root, ctx) => {
    const { doc } = ctx;
    for (const iframe of Array.from(root.querySelectorAll('iframe'))) {
        const wrapper = iframe.parentElement?.classList.contains('play-editor-media-wrapper') ? iframe.parentElement : null;
        const target = wrapper ?? iframe;
        const src = (iframe.getAttribute('src') ?? '').trim();

        let url: URL | null = null;
        try {
            url = new URL(src);
        } catch {
            url = null;
        }
        if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
            ctx.report('warning', 'element-removed', 'Embedded frame without a web address removed.', iframe);
            target.remove();
            continue;
        }

        const p = doc.createElement('p');
        const a = doc.createElement('a');
        a.setAttribute('target', '_blank');
        const youtube = YOUTUBE_ID.exec(src)?.[1];
        if (youtube) {
            a.setAttribute('href', `https://www.youtube.com/watch?v=${youtube}`);
            const img = doc.createElement('img');
            img.setAttribute('src', `https://i.ytimg.com/vi/${youtube}/hqdefault.jpg`);
            img.setAttribute('alt', 'Watch the video');
            img.setAttribute('width', '480');
            img.setAttribute('height', '360');
            a.appendChild(img);
            ctx.report('warning', 'embed-replaced', 'YouTube video replaced with its thumbnail, linked to the video.', iframe);
        } else {
            a.setAttribute('href', url.href);
            a.textContent = 'Watch the video';
            ctx.report('warning', 'embed-replaced', `Embedded frame replaced with a link to ${url.href}.`, iframe);
        }
        p.appendChild(a);
        target.replaceWith(p);
    }
};
