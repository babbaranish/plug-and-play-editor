# Plug-and-Play Editor

A modern, extensible rich text editor component for the web. Use it with vanilla JavaScript/TypeScript or directly in React apps — zero config needed.

[![npm version](https://img.shields.io/npm/v/plug-and-play-editor.svg)](https://www.npmjs.com/package/plug-and-play-editor)
[![bundle size](https://img.shields.io/bundlephobia/minzip/plug-and-play-editor)](https://bundlephobia.com/package/plug-and-play-editor)

---

## ✨ Features

| Category | Features |
|----------|----------|
| **Formatting** | Bold, Italic, Underline, Strikethrough, Headings (H1–H6) |
| **Undo / Redo** | Toolbar buttons + keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Y) |
| **Lists** | Unordered, Ordered, Indent, Outdent |
| **Color** | Text color picker, Background highlight color |
| **Alignment** | Left, Center, Right, Justify |
| **Direction** | LTR / RTL support |
| **Links** | Insert link (with URL validation), Unlink |
| **Media** | Insert image (URL), Upload image (file picker, 10 MB limit), Paste image (clipboard), Insert video/embed (sanitized iframes) |
| **Tables** | Insert table, Add/Delete rows, Add/Delete columns |
| **Code** | Inline code, Code blocks (dark theme), HTML source view toggle |
| **Mentions** | `@mention` dropdown with keyboard navigation, configurable user list, debounced async search |
| **Emoji** | Tabbed emoji picker (Smileys, Gestures, Hearts, Objects, Arrows) |
| **Structure** | Accordion, Page break, Horizontal rule, Table of Contents |
| **Date/Time** | Insert formatted date or time badges |
| **Template Variables** | Insertable `{{token}}` placeholders for email templates, searchable picker, grouped by category, configurable delimiters |
| **Editing** | Tab key inserts spaces (doesn't leave editor) |
| **Keyboard Shortcuts** | Ctrl/Cmd+B (Bold), Ctrl/Cmd+I (Italic), Ctrl/Cmd+U (Underline), Ctrl/Cmd+Z (Undo), Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y (Redo) |
| **Accessibility** | ARIA roles & labels on toolbar, buttons, dropdowns; focus-visible outlines |
| **Print** | Print-ready styles (toolbar hidden, clean layout) |
| **Responsive** | Mobile-friendly emoji picker and toolbar |

---

## 📦 Installation

```bash
npm install plug-and-play-editor
```

---

## 🚀 Quick Start

### Vanilla JavaScript / TypeScript

```html
<!-- index.html -->
<textarea id="editor">
  <p>Hello, world!</p>
</textarea>

<script type="module">
  import { Editor, FormattingPlugin, UndoRedoPlugin, ListsPlugin, EmojiPlugin } from 'plug-and-play-editor';

  const editor = new Editor('#editor', [
    FormattingPlugin,
    UndoRedoPlugin,
    ListsPlugin,
    EmojiPlugin,
  ]);

  // Get content
  console.log(editor.getContent());

  // Set content
  editor.setContent('<p>New content</p>');

  // Clean up when done
  editor.destroy();
</script>
```

### React

```bash
npm install plug-and-play-editor react react-dom
```

```tsx
import { PlayEditor } from 'plug-and-play-editor/react';

function App() {
  return (
    <PlayEditor
      defaultValue="<p>Start editing...</p>"
      onChange={(html) => console.log(html)}
      minHeight={400}
    />
  );
}
```

That's it — **all 18 plugins load automatically** in the React component (including the Tokens plugin with default email template variables).

---

## 📖 Detailed Usage

### Vanilla JS — Full Example

```ts
import {
  Editor,
  FormattingPlugin,
  UndoRedoPlugin,
  ListsPlugin,
  ColorPlugin,
  AlignmentPlugin,
  DirectionalityPlugin,
  LinksPlugin,
  MediaPlugin,
  TablesPlugin,
  AccordionPlugin,
  PageBreakPlugin,
  TocPlugin,
  PasteImagePlugin,
  MentionsPlugin,
  CodeBlockPlugin,
  DateTimePlugin,
  EmojiPlugin,
  TokensPlugin,
} from 'plug-and-play-editor';

const editor = new Editor('#my-textarea', [
  FormattingPlugin,
  UndoRedoPlugin,
  ListsPlugin,
  ColorPlugin,
  AlignmentPlugin,
  DirectionalityPlugin,
  LinksPlugin,
  MediaPlugin,
  TablesPlugin,
  AccordionPlugin,
  PageBreakPlugin,
  TocPlugin,
  PasteImagePlugin,
  MentionsPlugin,
  CodeBlockPlugin,
  DateTimePlugin,
  EmojiPlugin,
  TokensPlugin,
]);
```

### React — With Ref Control

```tsx
import { useRef } from 'react';
import { PlayEditor } from 'plug-and-play-editor/react';
import type { PlayEditorRef } from 'plug-and-play-editor/react';

function App() {
  const editorRef = useRef<PlayEditorRef>(null);

  const handleSave = () => {
    const html = editorRef.current?.getContent();
    // Send html to your API
    fetch('/api/save', {
      method: 'POST',
      body: JSON.stringify({ content: html }),
    });
  };

  return (
    <>
      <PlayEditor
        ref={editorRef}
        defaultValue="<p>Edit me</p>"
        onChange={(html) => console.log('Changed:', html)}
        minHeight={300}
      />
      <button onClick={handleSave}>Save</button>
    </>
  );
}
```

### React — Custom Plugin Selection

By default, all plugins load. Pass a `plugins` prop to use only what you need:

```tsx
import { PlayEditor } from 'plug-and-play-editor/react';
import { FormattingPlugin, UndoRedoPlugin, ListsPlugin, EmojiPlugin } from 'plug-and-play-editor';

function LightEditor() {
  return (
    <PlayEditor
      plugins={[FormattingPlugin, UndoRedoPlugin, ListsPlugin, EmojiPlugin]}
      onChange={(html) => console.log(html)}
    />
  );
}
```

### React — Disabled / Read-Only

```tsx
// Disabled — no interaction at all
<PlayEditor defaultValue="<p>Locked content</p>" disabled />

// Read-only — content visible but not editable
<PlayEditor defaultValue="<p>View-only content</p>" readOnly />
```

---

## 🔌 Plugins Reference

### Built-in Plugins

| Plugin | Import Name | What It Does |
|--------|-------------|--------------|
| **Formatting** | `FormattingPlugin` | Bold, Italic, Underline, Strikethrough, Headings (H1–H6) dropdown |
| **Undo / Redo** | `UndoRedoPlugin` | Undo and Redo toolbar buttons |
| **Lists** | `ListsPlugin` | Unordered/Ordered lists, Indent/Outdent |
| **Color** | `ColorPlugin` | Text color & background color pickers |
| **Alignment** | `AlignmentPlugin` | Left, Center, Right, Justify |
| **Directionality** | `DirectionalityPlugin` | LTR / RTL text direction |
| **Links** | `LinksPlugin` | Insert/remove hyperlinks (URL validated, `javascript:` blocked) |
| **Media** | `MediaPlugin` | Insert image (URL + file picker, 10 MB max), sanitized video embed |
| **Tables** | `TablesPlugin` | Insert 3x3 table, add/delete rows, add/delete columns |
| **Accordion** | `AccordionPlugin` | Collapsible accordion sections |
| **Page Break** | `PageBreakPlugin` | Horizontal rule & page break |
| **TOC** | `TocPlugin` | Auto-generated Table of Contents from headings |
| **Paste Image** | `PasteImagePlugin` | Cmd+V / Ctrl+V paste images from clipboard |
| **Mentions** | `MentionsPlugin` | `@mention` dropdown (uses default empty user list) |
| **Code Block** | `CodeBlockPlugin` | Inline code, fenced code blocks, HTML source toggle |
| **Date/Time** | `DateTimePlugin` | Insert current date or time as styled badge |
| **Emoji** | `EmojiPlugin` | Tabbed emoji picker popup |
| **Tokens** | `TokensPlugin` | Template variable picker with default email tokens (`{{first_name}}`, etc.) |

### Configurable Plugins

#### Mentions — Custom User List

```ts
import { createMentionsPlugin } from 'plug-and-play-editor';

// Static user list
const mentions = createMentionsPlugin({
  users: [
    { id: '1', name: 'Alice Johnson', avatar: 'https://...' },
    { id: '2', name: 'Bob Smith' },
  ],
  trigger: '@', // default
});

// OR async user fetching (automatically debounced at 200 ms)
const asyncMentions = createMentionsPlugin({
  users: async (query) => {
    const res = await fetch(`/api/users?search=${query}`);
    return res.json(); // must return { id, name, avatar? }[]
  },
});

// Use in vanilla JS
const editor = new Editor('#editor', [FormattingPlugin, mentions]);

// Use in React
<PlayEditor plugins={[FormattingPlugin, asyncMentions]} />
```

#### Tokens — Custom Variables for Email Templates

```ts
import { createTokensPlugin } from 'plug-and-play-editor';

// Custom token list with categories
const tokens = createTokensPlugin({
  tokens: [
    { key: 'first_name', label: 'First Name', category: 'Recipient' },
    { key: 'last_name', label: 'Last Name', category: 'Recipient' },
    { key: 'order_id', label: 'Order ID', category: 'Order' },
    { key: 'total', label: 'Order Total', category: 'Order' },
  ],
});

// With a different delimiter style
const percentTokens = createTokensPlugin({
  tokens: [{ key: 'name', label: 'Name' }],
  delimiter: 'percent',   // renders %name% instead of {{name}}
  // Also supports: 'single-curly' → {name}
});

// Use in vanilla JS
const editor = new Editor('#editor', [FormattingPlugin, tokens]);

// Use in React
<PlayEditor plugins={[FormattingPlugin, tokens]} />
```

The default `TokensPlugin` export includes common email template variables:

| Variable | Description |
|----------|-------------|
| `{{first_name}}` | Recipient's first name |
| `{{last_name}}` | Recipient's last name |
| `{{full_name}}` | Recipient's full name |
| `{{email}}` | Recipient's email address |
| `{{company}}` | Company name |
| `{{unsubscribe_url}}` | Unsubscribe link |
| `{{preferences_url}}` | Email preferences link |
| `{{current_year}}` | Current year |
| `{{current_date}}` | Current date |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + B` | Bold |
| `Ctrl/Cmd + I` | Italic |
| `Ctrl/Cmd + U` | Underline |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + Y` | Redo |
| `Tab` | Insert tab space |

---

## 🎨 Styling

The editor ships with its own CSS that loads automatically. You can customize it by overriding CSS custom properties:

```css
/* Override design tokens */
:root {
  --pe-bg: #ffffff;
  --pe-text: #1e293b;
  --pe-text-muted: #64748b;
  --pe-font: 'Inter', system-ui, sans-serif;
  --pe-border: #e2e8f0;
  --pe-radius: 10px;
  --pe-accent: #3b82f6;
  --pe-toolbar-bg: #f8fafc;
  --pe-btn-hover: rgba(0, 0, 0, 0.06);
  --pe-focus: rgba(59, 130, 246, 0.45);
}
```

### Dark Mode Example

```css
.dark .play-editor-container {
  --pe-bg: #1e293b;
  --pe-text: #e2e8f0;
  --pe-text-muted: #94a3b8;
  --pe-border: #334155;
  --pe-toolbar-bg: #0f172a;
  --pe-btn-hover: rgba(255, 255, 255, 0.08);
}
```

---

## 📐 API Reference

### `Editor` Class

```ts
const editor = new Editor(selector: string | HTMLTextAreaElement, plugins: Plugin[]);
```

| Method | Returns | Description |
|--------|---------|-------------|
| `getContent()` | `string` | Get the current HTML content |
| `setContent(html)` | `void` | Set the editor HTML content |
| `exec(command, value?)` | `void` | Run a `document.execCommand` |
| `addToolbarButton(iconHtml, tooltip, onClick, command?)` | `HTMLButtonElement` | Add a custom toolbar button. Pass `command` to enable active state tracking. |
| `addToolbarDivider()` | `void` | Add a visual divider to the toolbar |
| `onDestroy(fn)` | `void` | Register a cleanup function called on `destroy()` |
| `destroy()` | `void` | Tear down the editor, clean up plugins and event listeners, restore the textarea |

| Property | Type | Description |
|----------|------|-------------|
| `editorArea` | `HTMLDivElement` | The contentEditable div |
| `toolbar` | `HTMLDivElement` | The toolbar container |
| `textArea` | `HTMLTextAreaElement` | The backing textarea |
| `container` | `HTMLElement` | The root wrapper element |

### `PlayEditor` React Component

```tsx
<PlayEditor
  defaultValue?: string          // Initial HTML
  onChange?: (html: string) => void  // Change callback
  plugins?: Plugin[]             // Custom plugins (all by default)
  className?: string             // Wrapper CSS class
  minHeight?: number             // Min editor height in px
  disabled?: boolean             // Disable editor entirely
  readOnly?: boolean             // Read-only mode (visible but not editable)
  ref?: React.Ref<PlayEditorRef> // Imperative handle
/>
```

### `PlayEditorRef` (via `useRef`)

| Method / Property | Type | Description |
|-------------------|------|-------------|
| `getContent()` | `string` | Get current HTML |
| `setContent(html)` | `void` | Set HTML programmatically |
| `editor` | `Editor \| null` | Access underlying Editor instance |

---

## 🧩 Writing Custom Plugins

Create your own plugin by implementing the `Plugin` interface:

```ts
import type { Plugin } from 'plug-and-play-editor';
import type { Editor } from 'plug-and-play-editor';

export const MyPlugin: Plugin = {
  name: 'my-plugin',
  init(editor: Editor) {
    // Add a toolbar button with active state tracking
    editor.addToolbarButton(
      '<svg>...</svg>',   // icon HTML (SVG recommended)
      'My Action',         // tooltip (also used as aria-label)
      () => {
        editor.exec('insertHTML', '<strong>Hello!</strong>');
      },
      'bold'               // optional: command name for active state tracking
    );

    // Add a divider before your buttons
    editor.addToolbarDivider();

    // Access the contentEditable area
    const handler = (e: KeyboardEvent) => {
      // Custom keyboard handling
    };
    editor.editorArea.addEventListener('keydown', handler);

    // Register cleanup for when the editor is destroyed
    editor.onDestroy(() => {
      editor.editorArea.removeEventListener('keydown', handler);
    });
  },
  // Optional: called when editor.destroy() is invoked
  destroy() {
    // Clean up any external resources
  }
};
```

Then use it:

```ts
import { Editor, FormattingPlugin } from 'plug-and-play-editor';
import { MyPlugin } from './my-plugin';

const editor = new Editor('#editor', [FormattingPlugin, MyPlugin]);

// Later, clean up
editor.destroy();
```

---

## 🔒 Security

The editor includes built-in protections against common web vulnerabilities:

- **XSS prevention** — User input in links, media embeds, TOC headings, and mentions is sanitized/escaped before insertion
- **URL validation** — Only `http:`, `https:`, and `mailto:` URLs are allowed for links; `javascript:` URLs are blocked
- **Iframe sanitization** — Video/media embeds are parsed and rebuilt with only safe attributes; only `http:`/`https:` iframe sources are permitted
- **File size limits** — Image uploads are capped at 10 MB
- **Safe link defaults** — All inserted links get `target="_blank"` and `rel="noopener noreferrer"`

---

## 📁 Project Structure

```
plug-and-play-editor/
├── src/
│   ├── core/
│   │   ├── Editor.ts       # Core editor class (lifecycle, shortcuts, active states)
│   │   ├── Plugin.ts       # Plugin interface (init + optional destroy)
│   │   └── icons.ts        # SVG icon library
│   ├── plugins/
│   │   ├── formatting.ts   # Bold, Italic, Headings, Undo/Redo
│   │   ├── lists.ts        # UL, OL, indent
│   │   ├── color.ts        # Color pickers
│   │   ├── alignment.ts    # Text alignment
│   │   ├── directionality.ts # LTR/RTL
│   │   ├── links.ts        # Hyperlinks (with URL validation)
│   │   ├── media.ts        # Images & video (with sanitization)
│   │   ├── tables.ts       # Table management (add/delete rows & cols)
│   │   ├── accordion.ts    # Accordion blocks
│   │   ├── page-break.ts   # HR & page breaks
│   │   ├── toc.ts          # Table of Contents (XSS-safe)
│   │   ├── paste-image.ts  # Clipboard paste
│   │   ├── mentions.ts     # @mentions (debounced, ARIA, XSS-safe)
│   │   ├── code-block.ts   # Code blocks
│   │   ├── datetime.ts     # Date/Time insert
│   │   ├── emoji.ts        # Emoji picker (ARIA, scoped cleanup)
│   │   └── tokens.ts       # Template variable tokens (configurable, searchable)
│   ├── styles/
│   │   └── core.css        # All styles (responsive, print, a11y)
│   ├── index.ts            # Vanilla JS entry
│   └── react.tsx           # React component (with disabled/readOnly)
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## 📄 License

MIT
