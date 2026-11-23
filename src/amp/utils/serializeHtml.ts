interface AmpExtension {
    readonly name: string;
    readonly version: string;
    /** What in the content needs it. */
    readonly selector: string;
}

/** AMP extensions the converter can emit. `amp-img` is built in and needs none. */
export const AMP_EXTENSIONS: readonly AmpExtension[] = [
    { name: 'amp-accordion', version: '0.1', selector: 'amp-accordion' },
    { name: 'amp-form', version: '0.1', selector: 'form' },
];

/** The extensions `root` uses, in a stable order. */
export function findExtensions(root: ParentNode): string[] {
    return AMP_EXTENSIONS.filter(ext => root.querySelector(ext.selector) !== null).map(ext => ext.name).sort();
}

function bodyHtml(root: DocumentFragment): string {
    const wrapper = root.ownerDocument.createElement('div');
    wrapper.appendChild(root.cloneNode(true));
    return wrapper.innerHTML;
}

/**
 * Wraps the converted content in the AMP for Email document skeleton.
 *
 * Built as a string because `⚡4email` is not a name the DOM lets
 * setAttribute create.
 */
export function serializeHtml(root: DocumentFragment, stylesheet: string, extensions: readonly string[]): string {
    const scripts = extensions
        .map(name => AMP_EXTENSIONS.find(ext => ext.name === name))
        .filter((ext): ext is AmpExtension => ext !== undefined)
        .map(ext => `<script async custom-element="${ext.name}" src="https://cdn.ampproject.org/v0/${ext.name}-${ext.version}.js"></script>`)
        .join('\n');
    // The stylesheet must not be able to close its own <style> element.
    const css = stylesheet.replace(/<\/style/gi, '<\\/style');
    return [
        '<!doctype html>',
        '<html ⚡4email data-css-strict>',
        '<head>',
        '<meta charset="utf-8">',
        '<script async src="https://cdn.ampproject.org/v0.js"></script>',
        scripts,
        '<style amp4email-boilerplate>body{visibility:hidden}</style>',
        css ? `<style amp-custom>${css}</style>` : '',
        '</head>',
        '<body>',
        bodyHtml(root),
        '</body>',
        '</html>',
    ].filter(Boolean).join('\n');
}
