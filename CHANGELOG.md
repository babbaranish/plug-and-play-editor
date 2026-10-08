# Changelog

All notable changes to `plug-and-play-editor` are documented here. The
format follows [Keep a Changelog](https://keepachangelog.com/), and the
project adheres to [Semantic Versioning](https://semver.org/) while
pre-1.0 (minor versions may contain breaking changes).

## [0.11.0] - 2026-10-08

### Added

- **Buttons can link to a payment link, stored where it survives.** The
  button dialog now matches a variable by key or by label, like the link
  dialog, against `tokens` plus a new `acceptTokens` list, and stores a
  destination in `data-href-token` with an inert `href="#"`. The host decides
  which variables are destinations with `isDestinationToken(key)`, which
  defaults to "the key is in `acceptTokens`". Every other variable on a button
  stays in `href` as `{{key}}`, exactly as before, because senders that
  substitute variables in the HTML expect it there. `tokens` and
  `acceptTokens` take an array or a function and are read every time the
  dialog opens, so an array the host refills in place keeps working.
- **`openButtonDialog(editor, request)`** opens Insert Button prefilled with
  text, URL, a token (a key plus an optional label, shown even when the host
  lists do not contain it), colours, radius, padding, a range to insert at and
  an element to replace. It returns `false` when the editor has no button
  plugin. `ButtonDialogRequest` and `BUTTON_BLOCK_OPEN_COMMAND`
  (`'button-block:open'`) are exported.
- **A command registry on the editor.** `registerCommand(name, handler)`
  returns an unregister function; `hasCommand(name)` and
  `runCommand(name, ...args)` look commands up. Commands belong to one editor
  instance and are cleared on `destroy()`. Plugin objects are shared between
  editors, so this is where per editor actions live. `hasActiveContentSource()`
  says whether a source view currently holds the content.
- **Stored destinations are tidied.** The button and link plugins rewrite an
  anchor whose destination is a label (also with percent encoded braces or
  non breaking spaces) to the canonical key: a destination goes in
  `data-href-token`, any other variable stays raw in `href` as `{{key}}`, the
  form every renderer substitutes. An exact destination key is moved out of
  `href`. Exact keys that are not destinations, labels shared by two
  variables and anything unknown are left alone. This runs when the plugin
  starts, after each edit, when a source view closes (never while a source
  view or the preview is open), and through
  `BUTTON_BLOCK_CANONICALIZE_COMMAND` (`'button-block:canonicalize'`) and
  `LINKS_CANONICALIZE_COMMAND` (`'links:canonicalize'`), which return whether
  anything changed. A content change is reported only when it did. A change
  made when the plugin starts, inside the `Editor` constructor, is reported
  once more on the next frame (unless the editor was destroyed by then), so a
  listener attached after construction, such as `PlayEditor`'s `onChange`,
  hears it. `LinksPluginOptions.isDestinationToken` decides which exact keys
  the links plugin moves.
- **A selected chip becomes a button.** With exactly one token chip selected,
  Insert Button prefills the URL with that chip and replaces the chip with the
  button.
- **URL hints.** The Button URL and Link URL fields show a line under the field
  saying what the current value links to, or why it will not work. Available
  to any form as `ModalField.hint(value)`, returning a `ModalFieldHint`
  (`{ text, tone }`).
- **Pasting a chip into a URL field writes something that resolves.** A copied
  chip pastes as its visible text, which is its label. A URL field now
  receives `{{label}}` when the chip replaces the whole value and that label
  leads back to the chip's key, and `{{key}}` otherwise, so a chip pasted into
  the middle of an address never leaves a label in it; text fields receive
  `{{key}}`. The copied HTML decides: one editor chip (`.play-editor-token`)
  and no other text is taken over, whatever plain text came with it, while a
  chip inside a sentence is left to the browser. Plain text pastes are
  untouched. Available to any form as `ModalField.tokens.pasteText(key, label)`,
  which is consulted only when the chip replaces the whole value.
- Exported helpers: `tokenOnlyUrl`, `resolveTokenReference`,
  `normalizeTokenHref` (decodes `%7B` and `%7D` in any case, `%20`, `%2C`, `%3A`
  and non breaking spaces, for matching only) and `DELIMITER_MAP`.

### Changed

- **Insert Button refuses a label it cannot resolve.** Any single `{{...}}`
  used to be accepted and written into `href` as typed, so a chip's label went
  out as a link nothing could fill in. The refusal names the value and points
  at the `{ }` list. A value shaped like a key is still accepted as before.
- **A variable inside an address is written as its key.** Edit Link and Edit
  Button show `{{label}}`, and an address built around it, such as
  `{{Login Link}}?ref=mail` or `https://go.example/?to={{Login Link}}`, would
  otherwise keep the label in `href`, where nothing fills it in. Both dialogs
  now write each `{{X}}` inside an address as `{{K}}` when X is a key, a key in
  other case or a label that belongs to only one variable. A label that
  matches nothing, or more than one variable, is refused with a message that
  names it, and the URL hint flags it as you type. An unknown value shaped like
  a key is kept as typed, as before. With the `percent` delimiter, a `%`
  followed by two hex digits that matches no variable is read as a URL escape.
- **The link bubble and Edit Link show a variable's label.** A destination
  shows `{{label}}` in a token style when the label leads back to the key,
  otherwise `{{key}}`. A label that matches nothing is shown in red with
  "Not a known variable".
- **Edit Link keeps a destination it did not change.** Saving a link whose URL
  field still shows its original variable keeps that key, even when the host
  lists do not contain it, whether the key sits in `data-href-token` or alone
  in `href`, and stores it in `data-href-token` as the dialog does for any URL
  that is only a variable. This covers values shaped like a key (letters,
  digits, `_ . $ : -`); a stored label that matches nothing is still refused.
  It used to refuse, and the only way out was to clear the URL, which dropped
  the payment link.
- Picking a variable from the `{ }` list into a URL field that holds only
  `https://` (or another bare scheme) replaces it instead of producing
  `https://{{key}}`.
- **Closing a source view runs the `onInput` subscribers.** Source Code and
  Toggle HTML Source write their text back without an input event, so
  subscribers saw the new content only at the next keystroke. Releasing the
  active content source now runs them once on the next frame, which is what
  tidies a label typed into an href in either view as soon as it closes.
  No subscriber runs after `destroy()`: it drops the `onInput` and
  `onSelectionChange` subscribers, and an input frame still pending does
  nothing, so destroying an editor while a source view is open no longer calls
  them on the torn down editor.

### Fixed

- **Insert Button now places the block itself.** It used
  `execCommand('insertHTML')`, which leaves placement to the browser. It now
  inserts a DOM node: never inside a link, after the paragraph or heading the
  caret is in (before it when the caret is at its start or the paragraph is
  empty), and at the caret in table cells, list items and divs. When the button
  ends the content, a table cell, a list item, a div or a blockquote, an empty
  paragraph follows it so the caret has somewhere to go after it.
- **Edit Button lost token destinations.** It read only `href`, so a button
  with `data-href-token` showed `#` and could not be saved, and saving again
  dropped the token. It reads `data-href-token` first now, and an update keeps
  the token, target, rel and style fields; a zero radius or padding no longer
  turns into the default.
- **Edit Button did not report its change**, so `PlayEditor`'s `onChange` did
  not fire until the next keystroke. Insert and Edit both call
  `notifyContentChange()`.
- **`resolveTokenReference` counted one variable listed twice as two.** A
  variable in both `tokens` and `acceptTokens` made its own label ambiguous.
  Ambiguity is now judged on distinct keys.
- Insert Button no longer inserts into a source view or the preview; it says
  how to get back to the editing view. Clicking a button in the preview, or in
  a read only or disabled editor, no longer opens Edit Button.

## [0.10.5] - 2026-10-07

### Fixed

- **The toolbar's link button now edits the link the cursor is in.** With the
  caret (or a selection) inside an existing link, it opened an empty "Insert
  Link" dialog, and saving it nested a new `<a>` inside the old one. The old
  link kept its old URL, so the email still pointed there while the editor
  appeared to show the new one. It now opens "Edit Link" for that link, as
  double-click and Ctrl/⌘+K already did. A selection that runs past a link, or
  covers plain text, still inserts a new link.

- **Pasted text could change colour.** The paste cleaner dropped a colour, font
  or size when it matched the spot the caret was in, expecting the pasted text
  to inherit it there. It often doesn't: press Enter after black text and
  paste, and the paste replaces that empty black paragraph, so the text landed
  in the editor's default grey. The copied colour, font and size are now always
  kept; only the default-valued properties a browser stamps on every copied
  node (`orphans: 2`, `letter-spacing: normal`, …) are dropped.

## [0.10.4] - 2026-10-06

### Fixed

- **Pasted content now looks exactly like what was copied.** The paste
  cleaner kept only a short list of text styles, so every paste from another
  template, an email or a web page lost part of its layout: lists lost their
  indent, headings and paragraphs their spacing, buttons their padding,
  rounded corners and no-underline, icons their vertical alignment, and table
  cells their `align="center"`, `width` and `bgcolor`. A link whose colour
  matched the text around it lost that colour and turned the default link
  colour. The cleaner now keeps every inline style as written (so shorthands
  such as `text-decoration: none` stay in the form email clients understand),
  the presentational attributes email layouts use, layout `<div>`s, and the
  editor's own blocks and chips, and removes only what is dangerous or junk:
  scripts, event handlers, script URLs, positioning, Office `mso-*` styles and
  the browser's copy noise.
- **Pasting a token chip or button block no longer deletes what follows it.**
  Chrome's `insertHTML` drops a non-editable element and everything after it
  in its block. Pasted chips and button blocks are now inserted editable and
  made non-editable once they are in, so they paste whole and stay editable
  with their own tools.
- **A paste starting at the end of a line no longer adds a blank line** at the
  top of the first pasted block (Chrome's `Apple-interchange-newline` marker is
  dropped instead of becoming a real `<br>`).

### Security

- **Pasted `javascript:` links were kept.** The paste cleaner kept any `href`
  as-is. Link and image URLs are now read with the browser's URL parser —
  which also sees through `java&#9;script:` and leading control characters —
  and kept only for `http`, `https`, `mailto` and `tel` (plus inline images and
  `cid:` for `src`). Pasted iframes are rebuilt with the media plugin's
  sandboxing, and `url()` in pasted styles must point at http(s) or an inline
  image.

## [0.10.3] - 2026-09-24

### Fixed

- **Pasting from another template lost its font, size and colour.** The paste
  cleaner stripped every inline style except `text-align` and unwrapped
  `<font>` — which is exactly how this editor's own font, size and colour tools
  write formatting. Pasted content now keeps its typography (family, size,
  weight, style, colour, background, line height, alignment, underline) while
  still dropping Word/Docs junk. Styles that merely restate what the text would
  inherit where it lands are dropped, so the "interchange" styles browsers add
  when copying don't bake one editor's theme into every paste. A link's
  `data-href-token` and colour survive the paste too.
- **Ctrl+K / Cmd+K now opens the link dialog** — Edit when the caret is in a
  link, Insert otherwise (prefilled with the selected text).
- **Linking text no longer changes its colour.** The stylesheet paints links in
  the accent colour, which overrode the colour the text inherited (red text
  turned blue), and email clients do the same with their default blue. A new
  link now carries its text's colour inline, so it looks the same in the editor
  and in the sent email. Existing links are unchanged.
- **Ctrl+F / Cmd+F in the code view.** It blocked the browser's own find, then
  opened a panel that searched the hidden rich-text view. Find & Replace now
  searches the code itself in the code view — highlights, Find Next, Replace and
  Replace All all work there.
- **Find highlights could be saved into the content.** Matches were wrapped in
  real `<mark>` elements inside the document, so switching to the code view
  with the find panel open put them in the source, and from there in the saved
  HTML — as yellow highlights in the sent email. Highlights are now painted with
  the CSS Custom Highlight API and never touch the document.
- The find panel no longer floats over the top of the content, where it hid
  any match on the first lines. Pressing Enter right after typing a search
  finds the first match instead of doing nothing. Replace All treats `$&`, `$1`
  and `$$` in the replacement as plain text.

## [0.10.2] - 2026-09-24

### Security

- **A button block's URL could inject attributes into the generated
  anchor.** `ButtonBlockPlugin` escaped the URL with a content escaper that
  leaves `"` alone, so a URL such as `https://x.test/" onmouseover="alert(1)`
  closed the `href` it was interpolated into and the rest was parsed as real
  attributes on the `<a>`. Attribute values are now escaped for a
  double-quoted context (`&` and `"`); button text keeps its content escaping.
  Ordinary URLs, `&` in query strings and `{{variable}}` destinations are
  written through unchanged.

## [0.10.1] - 2026-09-04

### Fixed

- **Inserting a link over a selection re-pointed every other link in the
  document.** After wrapping the selection, the Insert Link dialog applied the
  new URL to *every* anchor in the editor rather than only the one it created
  — so adding an ordinary link to an email that already carried a payment link
  silently redirected the payment link too, and stripped its
  `data-href-token`. Only anchors the insert actually created or changed are
  touched now. Affected 0.8.0 through 0.10.0.
- **A link around an image, mention or variable chip was deleted on a
  document round trip.** A link is a mark, and these inline atoms carried no
  marks, so parsing an `<a>` wrapping an `<img>` or a token chip kept the
  image or chip and dropped the anchor entirely — a Pay Now image came back as
  a bare image, with nothing left to show a link had been there.
  `InlineImageNode`, `MentionNode` and `TokenNode` gain an optional `marks`
  field; it is absent when empty, so existing documents compare identically.
- **A button's URL could not be a variable.** The button dialog offers a
  variable picker on its URL field, then rejected every variable it offered as
  an invalid URL. A URL that is exactly one variable, such as
  `{{login_url}}`, is now accepted and kept in `href` for whatever renders the
  email to substitute. A URL merely containing one is still validated as an
  address.

## [0.10.0] - 2026-09-03

### Added

- **The link dialog can now point a link at a variable.** 0.9.0 taught the
  document model to carry a token-valued destination; this wires it to the
  editor. Entering a URL that is nothing but a variable — `{{payment_link}}` —
  stores it in `data-href-token` and leaves an inert `href="#"`, rather than
  writing the variable into the href where the browser percent-encodes it and
  nothing downstream can tell it from a real address. Editing such a link shows
  the variable again, so a round trip through the dialog preserves it, and
  re-pointing the link at a real address clears the stale token. A URL that
  merely *contains* a variable, such as `https://x.test/{{id}}`, is a real
  address and stays in `href` as before.
- **A pasted variable is matched by key or by label.** The label is the only
  form visible in the document, so it is what an author can select and copy;
  refusing it would be technically correct and useless. Matching ignores case,
  collapses whitespace and tolerates the non-breaking spaces a copy out of
  rendered HTML picks up. Two variables sharing a label are refused rather than
  guessed at, since picking one would silently send the link to the wrong place.
- `LinksPluginOptions.acceptTokens` — variables that are accepted when typed or
  pasted but not listed in the picker. What a picker *shows* and what a field
  *accepts* are different questions: a large or generated set makes a flat
  dropdown unreadable, while validating only what is listed refuses a legitimate
  paste.
- `LinksPluginOptions.tokens` also accepts a function, called each time the
  dialog opens. Use it when the list is not known at mount or depends on the
  document's current contents; an array is captured once, which yields an empty
  picker when the caller's data arrives asynchronously. Passing an array still
  works unchanged.

### Fixed

- CHANGELOG.md listed `[0.9.0]` twice — a merge stacked two entries written in
  parallel for the same release. Consolidated into one.

## [0.9.0] - 2026-09-03

### Added

- **A link's destination can be a token.** The `link` mark gains an optional
  `hrefToken`, serialized to `data-href-token` on the anchor and read back by
  the parser, so it survives a full DOM round trip.

  An `href` holds text, so until now the only way to point a link at a token
  was to type the token into the URL field — where it is percent-encoded,
  loses its identity, and cannot be told apart from an ordinary address by
  anything reading the document afterwards. Consumers that substitute tokens
  (merge fields, payment links, anything generated per recipient) can now
  carry the destination as data and resolve it at render time, leaving `href`
  free to hold an inert placeholder until they do.

  Existing links are unaffected: `hrefToken` is absent unless the attribute is
  present, and the serializer never writes the token into `href`.

## [0.8.0] - 2026-08-31

### Added

- **Edit links without opening the source view.** Hovering a link in the
  editor now shows a small bubble with its URL and Open / Edit / Remove
  actions; double-clicking a link opens the editor directly. The Edit
  dialog carries a `{ }` variable picker on both the Link Text and Link
  URL fields, so merge variables can be dropped into either without
  hand-editing HTML. The bubble lives outside `editorArea`, so it never
  appears in `getContent()`, and it stays out of the way of
  `ButtonBlockPlugin`, which has its own editor for the anchor it owns.
- `createLinksPlugin(options?)` and `LinksPluginOptions` — configures the
  variable list and delimiter style offered by the link dialog, mirroring
  `createButtonBlockPlugin`. `LinksPlugin` is still exported as a
  pre-configured singleton using `DEFAULT_EMAIL_TOKENS`, so existing
  usage is unchanged.
- The toolbar's Insert Link dialog gained a Link Text field, so a link
  can be created without selecting text first.

### Fixed

- **Link URLs may now contain merge variables.** URL validation used
  `new URL()` alone, which rejected `{{unsubscribe_url}}` — a URL that
  only becomes one at send time. Variables are now blanked out before
  validating, and whatever literal text remains must still be a safe
  http/https/mailto URL. A URL whose *scheme* comes from a variable is
  accepted only when the remainder is a path, query or fragment, so an
  empty expansion cannot leave a `javascript:` href behind.
- **Typing in the source view dropped characters and appeared to move
  the caret.** The syntax highlighter (added in 0.7.0) paints an overlay
  beneath a transparent `<textarea>`, so every visible glyph comes from
  the overlay while the caret comes from the textarea. Its tokenizer
  *reconstructed* text instead of slicing it, and silently lost or added
  characters: valueless attributes (`<td nowrap>`) and everything after
  them were dropped, an attribute name stayed invisible until you typed
  `=`, `<br/>` gained a space, and a `>` inside a quoted attribute value
  truncated the tag — rendering `data-x="a>` as `data-x=>`. The visible
  effects were vanishing keystrokes, blank gaps where characters should
  be, a caret that looked misplaced, backspace that appeared dead, and
  pasted markup that looked corrupted. `textarea.value` was always
  correct, so stored HTML was never affected — only what was drawn. The
  tokenizer now emits slices of the original source exclusively, making
  drift structurally impossible, and respects quoted attribute values
  when finding a tag's end.

## [0.7.2] - 2026-08-25

### Fixed

- **`SourceCodePlugin` no longer reformats your markup when the source
  view opens.** Entering the HTML source view pretty-printed
  `editorArea.innerHTML` automatically, so simply looking at the source
  rewrote indentation and line breaks whether you wanted it or not. The
  view now opens with the editor's HTML exactly as stored; the Format
  button in the source header is the only thing that re-indents it.
  Note that code folding keys off the 2-space indentation the formatter
  produces, so fold toggles appear in the gutter once the source has
  been formatted.

## [0.7.1] - 2026-07-21

### Fixed

- **`getContent()` / `onInput()` / `PlayEditor`'s `onChange` didn't see
  content from "alternate view" plugins.** While `SourceCodePlugin`'s
  raw-HTML view was open, typing never reached `onInput`/`onChange` at
  all (its content lives in a separate `<textarea>`, not `editorArea`),
  and `getContent()` returned stale/wrong HTML until the view was
  closed. `CodeBlockPlugin`'s "Toggle HTML Source" had the same class
  of bug more mildly — `getContent()` returned the HTML-escaped
  *display* text instead of real markup while that mode was on.

### Added

- `Editor.registerContentSource(getRawContent): () => void` — lets a
  plugin declare itself the current source of truth for content when
  it lives outside `editorArea` or in a transformed representation
  inside it. `getContent()` and the textarea sync use it when present.
- `Editor.notifyContentChange(): void` — tells the editor content
  changed without a native `editorArea` input event (e.g. typing in a
  plugin's own view). Fires the same rAF-coalesced `onInput`
  subscribers and dispatches a marked synthetic `input` event on
  `editorArea` so anything wired to that native event (like
  `PlayEditor`'s `onChange`) fires too. Both `SourceCodePlugin` and
  `CodeBlockPlugin`'s source toggle now use this.

## [0.7.0] - 2026-07-14

### Added

- **Drag & drop image insertion** (`DragDropImagePlugin`). Drag an image
  file from the OS onto the editor to insert it at the drop point
  (10 MB limit, same as the existing upload flow); dashed-outline
  visual feedback while dragging over. Included in the default React
  plugin set.
- **Source code view overhaul** (`SourceCodePlugin`). The raw-HTML
  toggle now has line numbers, real syntax highlighting (tags,
  attributes, values, text, comments each colored separately),
  auto-formatted 2-space indentation on entry, collapsible blocks
  (folding auto-expands the instant you click/focus so nothing can be
  silently lost), and an on-demand "Format code" button to re-indent
  without leaving source mode. Backed by two new internal modules,
  `source-code-format.ts` (pretty-printer) and
  `source-code-highlight.ts` (tokenizer).
- **Template variables in button blocks** (`ButtonBlockPlugin` /
  `createButtonBlockPlugin(options)`). A compact `{ }` picker next to
  the button's Text and URL fields inserts a `{{token}}` at the
  cursor. `PreviewPlugin` now also resolves tokens found inside
  element attributes (e.g. a button's `href`), not just visible text.
- `core/modal.ts`: `ModalField` gained an optional `tokens` config so
  any form-modal text/url field can offer the same variable picker.

### Fixed

- **Image resize "pixel drop-off"**. Dragging a resize handle past the
  container's width (images have `max-width:100%`) used to let the
  requested size and the actual rendered size silently diverge — the
  dimension label would show a value CSS was quietly clipping, and the
  image could render at a distorted aspect ratio. The resize handler
  now reads the real rendered box back after each frame and reports
  that, with rapid drags batched through `requestAnimationFrame`.

## [0.6.0] - 2026-04-19

Major architecture expansion - three new opt-in subsystems land alongside
the existing contentEditable DOM. Everything existing keeps working; you
only touch the new APIs when you want them.

### Added

- **Structured selection model** (`src/core/selection/`). Path-based
  `Point` / `Selection` types that are DOM-independent and survive
  reconciliation. New methods on `Editor`:
  - `editor.getSelection(): Selection`
  - `editor.setSelection(sel)`
  - `editor.resolvePoint(node, offset): Point | null`

  Plus public exports `readSelection`, `writeSelection`, `point`,
  `caret`, `range`, `comparePaths`, `comparePoints`, `isAncestor`,
  `commonAncestor`.

- **Document model** (`src/core/document/`). A discriminated-union
  Node ADT covering every block and inline kind the editor produces,
  schema validation, and a DOM <-> Doc bridge:
  - `parseDom(root) -> Doc`
  - `serializeToHtml(doc)`, `serializeToDom(doc)`
  - `render(target, doc)` - diffing reconciler; unchanged subtrees
    stay in the DOM, preserving selection/focus
  - `validate(doc)`, `assertValid(doc)`, `nodeEquals(a, b)`
  - Convenience constructors `doc()`, `paragraph()`, `heading()`,
    `blockquote()`, `list()`, `listItem()`, `text()`, `hr()`,
    `pageBreak()`, `hardBreak()` (also exported with `doc*` prefixes
    from the package root to avoid name collisions).

- **Transform system** (`src/core/transforms/`). Invertible edit
  primitives for structured editing:
  - 14-variant `Transform` ADT: Insert/Delete/Replace/SetAttr/AddMark/
    RemoveMark/Move/Split/Join/Wrap/Unwrap/ReplaceNode.
  - `apply(doc, transform) -> Doc` - pure, structural-sharing.
  - `invert(transform) -> Transform` satisfying
    `apply(apply(d, t), invert(t))` structurally equals `d`.
  - `TransformLog` - bounded ring buffer with an undo/redo cursor and
    subscribe support.
  - `startRecording(editorArea, log)` - MutationObserver bridge that
    captures every DOM mutation as a `replace-node` transform,
    rAF-coalesced, auto-pauses during undo/redo replay.
  - New `Editor` methods: `parseDoc()`, `serializeDoc()`, `renderDoc()`,
    `applyTransform()`, `undoTransform()`, `redoTransform()`, and the
    `editor.transforms: TransformLog` property.

- **`EditorOptions` constructor argument** (third param, all fields
  optional): `{ recordTransforms?: boolean, transformLogCapacity?: number }`.

- **Test suite** with `vitest` + `happy-dom`. 142 tests across four
  files cover path math, schema validation, parser/serializer
  round-trips, and transform apply + invert correctness.
  - `npm test` runs the suite.
  - `npm run test:watch` for interactive runs.

### Changed

- **Iframe embeds from `MediaPlugin` are now sandboxed.** Every
  iframe gets `sandbox="allow-scripts allow-same-origin allow-popups
  allow-presentation"`, `referrerpolicy="no-referrer"`, and
  `loading="lazy"`. Standard third-party embeds (YouTube, Vimeo,
  Spotify, etc.) work unchanged.
- **Image upload validates MIME type.** `file.type.startsWith('image/')`
  is enforced at upload time; the previous behaviour relied only on the
  `accept="image/*"` attribute (a UI hint, not a validator).
- **`isValidImageUrl` restricts `data:` URIs to `data:image/*`.**
  Previously any `data:` protocol was accepted.
- **Modals auto-close on `editor.destroy()`.** Previously an open
  modal could leak a `keydown` listener on `document` after the
  editor was torn down. A per-editor `WeakMap` registry tracks open
  modals and closes them in the destroy lifecycle.
- **`WordCountPlugin` and `BlockQuotePlugin`** migrated to
  `editor.getSelection()` / `editor.onSelectionChange()`. Behaviour
  unchanged; internal consistency improved.
- `Editor`'s selection-change dispatcher uses the structured
  selection API to gate "is the caret inside the editor" checks,
  eliminating a redundant `contains()` call per frame.

### Removed

- **`editor.exec(command, value?)` alias.** It was deprecated in 0.5.0
  and is removed in 0.6.0. Use `editor.execCommand(...)` instead -
  identical signature, non-deprecated name.

### Migration guide (0.4.x -> 0.6.0)

**If you wrote custom plugins that call `editor.exec(...)`:**

```ts
// Before
editor.exec('bold');
editor.exec('insertHTML', '<b>hi</b>');

// After
editor.execCommand('bold');
editor.execCommand('insertHTML', '<b>hi</b>');
```

That is the only source-level change required.

**If you embed third-party iframes via `MediaPlugin`:** Standard embeds
work. If your iframe needed to escape its sandbox (read parent cookies,
trigger top-level navigation, etc.), you'll need to either configure the
iframe differently before insertion or register your own media plugin.

**If you were accepting non-image file uploads through the editor's
file picker:** You'll now get an "Upload Failed" modal. Use a different
upload path or file a request for a configurable MIME whitelist.

**If you depended on `data:text/html,...` URIs in image-source fields:**
Those were never actually rendered as images anyway; switch to proper
`data:image/*` URIs.

**Bundle structure** (shipped in 0.5.0, still the case): the entry
files (`dist/index.mjs`, `dist/react.mjs`) are thin shells, with the
Editor core and plugin code split into separately-hashed chunks. If you
were importing from `'plug-and-play-editor'` through your bundler,
you're unaffected. If you were importing directly from
`'plug-and-play-editor/dist/index.mjs'` expecting one monolithic file,
the imports will not resolve.

### Notes

- No runtime dependencies (`lucide` was removed in 0.5.0). React
  remains an optional peer dependency.
- `"sideEffects"` in `package.json` limits side-effect files to CSS,
  so bundlers can tree-shake any unused plugin or helper exports.

---

## [0.5.1] - 2026-04-19

Documentation-only update after 0.5.0.

### Changed

- README gained new sections for the modal system (`openFormModal`,
  `openInfoModal`) with examples of the full `theme.submit` / `theme.cancel`
  shape, a "Bundle Size & Tree-Shaking" section, a "Performance" section
  describing the rAF-coalesced selection/input dispatchers, plus
  `onSelectionChange` / `onInput` entries in the API reference table.

---

## [0.5.0] - 2026-04-19

Modals, performance, and bundle restructuring.

### Added

- **Modal helpers** `openFormModal` / `openInfoModal` replacing
  `prompt` / `alert` popups across `LinksPlugin`, `MediaPlugin`, and
  `ButtonBlockPlugin`. Supports `text | url | textarea | color |
  number | select` field types, row grouping, inline validation errors,
  ESC/backdrop dismiss, and per-modal theming
  (`theme.submit` / `theme.cancel` - background, color, borderColor,
  fontFamily, fontSize, fontWeight).
- **Subscription APIs** `editor.onSelectionChange(fn)` and
  `editor.onInput(fn)`. Both are rAF-coalesced so multiple native
  events collapse into at most one callback per frame.
- **`plug-and-play-editor/react/defaults` subpath export** for consumers
  who want the full default plugin list via static import.

### Changed

- **Performance overhaul.** Single rAF-coalesced
  `document.selectionchange` listener services `Editor.updateActiveStates`
  plus every plugin subscriber, replacing three independent
  `selectionchange` handlers that each re-walked the DOM. Command
  buttons are cached at `addToolbarButton()` time, eliminating the
  per-selectionchange `querySelectorAll` on the toolbar. `WordCount`
  caches text stats; selection-only changes skip the text rescan.
- **Bundle size.** `"sideEffects"` added to `package.json` so bundlers
  can tree-shake. Consumers who `import { Editor, LinksPlugin }` from
  the vanilla entry now pull ~10 kB instead of ~85 kB.
- Entry files (`dist/index.mjs`, `dist/react.mjs`) are now thin shells
  with the Editor core and plugins in separately-hashed chunks.

### Deprecated

- **`editor.exec(command, value?)`**. Use `editor.execCommand(...)`
  instead. Removed in 0.6.0.

### Removed

- **`lucide` runtime dependency.** Never actually imported by the
  library; icons are hand-authored inline SVGs in `src/core/icons.ts`.
  Removes a transitive dependency from every consumer's install.

---

## [0.4.1] and earlier

See the git history for earlier changes.
