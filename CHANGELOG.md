# Changelog

All notable changes to `plug-and-play-editor` are documented here. The
format follows [Keep a Changelog](https://keepachangelog.com/), and the
project adheres to [Semantic Versioning](https://semver.org/) while
pre-1.0 (minor versions may contain breaking changes).

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
