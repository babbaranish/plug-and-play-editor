# Plug-and-Play Editor

A modern, extensible rich text editor component for the web. Use it with vanilla JavaScript/TypeScript or directly in React apps — zero config needed.

[![npm version](https://img.shields.io/npm/v/plug-and-play-editor.svg)](https://www.npmjs.com/package/plug-and-play-editor)
[![bundle size](https://img.shields.io/bundlephobia/minzip/plug-and-play-editor)](https://bundlephobia.com/package/plug-and-play-editor)

---

## ✨ Features

| Category | Features |
|----------|----------|
| **Formatting** | Bold, Italic, Underline, Strikethrough |
| **Lists** | Unordered, Ordered, Indent, Outdent |
| **Color** | Text color picker, Background highlight color |
| **Alignment** | Left, Center, Right, Justify |
| **Direction** | LTR / RTL support |
| **Links** | Insert link, Unlink |
| **Media** | Insert image (URL), Upload image (file picker), Paste image (clipboard), Insert video/embed |
| **Tables** | Insert table, Add rows, Add columns |
| **Code** | Inline code, Code blocks (dark theme), HTML source view toggle |
| **Mentions** | `@mention` dropdown with keyboard navigation, configurable user list |
| **Emoji** | Tabbed emoji picker (Smileys, Gestures, Hearts, Objects, Arrows) |
| **Structure** | Accordion, Page break, Horizontal rule, Table of Contents |
| **Date/Time** | Insert formatted date or time badges |
| **Editing** | Tab key inserts spaces (doesn't leave editor) |

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
  import { Editor, FormattingPlugin, ListsPlugin, EmojiPlugin } from 'plug-and-play-editor';

  const editor = new Editor('#editor', [
    FormattingPlugin,
    ListsPlugin,
    EmojiPlugin,
  ]);

  // Get content
  console.log(editor.getContent());

  // Set content
  editor.setContent('<p>New content</p>');
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

That's it — **all 16 plugins load automatically** in the React component.

---

## 📖 Detailed Usage

### Vanilla JS — Full Example

```ts
import {
  Editor,
  FormattingPlugin,
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
} from 'plug-and-play-editor';

const editor = new Editor('#my-textarea', [
  FormattingPlugin,
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
import { FormattingPlugin, ListsPlugin, EmojiPlugin } from 'plug-and-play-editor';

function LightEditor() {
  return (
    <PlayEditor
      plugins={[FormattingPlugin, ListsPlugin, EmojiPlugin]}
      onChange={(html) => console.log(html)}
    />
  );
}
```

---

## 🔌 Plugins Reference

### Built-in Plugins

| Plugin | Import Name | What It Does |
|--------|-------------|--------------|
| **Formatting** | `FormattingPlugin` | Bold, Italic, Underline, Strikethrough |
| **Lists** | `ListsPlugin` | Unordered/Ordered lists, Indent/Outdent |
| **Color** | `ColorPlugin` | Text color & background color pickers |
| **Alignment** | `AlignmentPlugin` | Left, Center, Right, Justify |
| **Directionality** | `DirectionalityPlugin` | LTR / RTL text direction |
| **Links** | `LinksPlugin` | Insert/remove hyperlinks |
| **Media** | `MediaPlugin` | Insert image (URL + file picker), video embed |
| **Tables** | `TablesPlugin` | Insert 3×3 table, add rows/columns |
| **Accordion** | `AccordionPlugin` | Collapsible accordion sections |
| **Page Break** | `PageBreakPlugin` | Horizontal rule & page break |
| **TOC** | `TocPlugin` | Auto-generated Table of Contents from headings |
| **Paste Image** | `PasteImagePlugin` | Cmd+V / Ctrl+V paste images from clipboard |
| **Mentions** | `MentionsPlugin` | `@mention` dropdown (uses default empty user list) |
| **Code Block** | `CodeBlockPlugin` | Inline code, fenced code blocks, HTML source toggle |
| **Date/Time** | `DateTimePlugin` | Insert current date or time as styled badge |
| **Emoji** | `EmojiPlugin` | Tabbed emoji picker popup |

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

// OR async user fetching
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
| `exec(command, value?)` | `void` | Execute a `document.execCommand` |
| `addToolbarButton(iconHtml, tooltip, onClick)` | `HTMLButtonElement` | Add a custom toolbar button |
| `addToolbarDivider()` | `void` | Add a visual divider to the toolbar |

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
    // Add a toolbar button
    editor.addToolbarButton(
      '<svg>...</svg>',   // icon HTML (SVG recommended)
      'My Action',         // tooltip
      () => {
        // Your logic here
        editor.exec('insertHTML', '<strong>Hello!</strong>');
      }
    );

    // Add a divider before your buttons
    editor.addToolbarDivider();

    // Access the contentEditable area
    editor.editorArea.addEventListener('keydown', (e) => {
      // Custom keyboard handling
    });
  }
};
```

Then use it:

```ts
import { Editor, FormattingPlugin } from 'plug-and-play-editor';
import { MyPlugin } from './my-plugin';

const editor = new Editor('#editor', [FormattingPlugin, MyPlugin]);
```

---

## 📁 Project Structure

```
plug-and-play-editor/
├── src/
│   ├── core/
│   │   ├── Editor.ts       # Core editor class
│   │   ├── Plugin.ts       # Plugin interface
│   │   └── icons.ts        # SVG icon library
│   ├── plugins/
│   │   ├── formatting.ts   # Bold, Italic, etc.
│   │   ├── lists.ts        # UL, OL, indent
│   │   ├── color.ts        # Color pickers
│   │   ├── alignment.ts    # Text alignment
│   │   ├── directionality.ts # LTR/RTL
│   │   ├── links.ts        # Hyperlinks
│   │   ├── media.ts        # Images & video
│   │   ├── tables.ts       # Table management
│   │   ├── accordion.ts    # Accordion blocks
│   │   ├── page-break.ts   # HR & page breaks
│   │   ├── toc.ts          # Table of Contents
│   │   ├── paste-image.ts  # Clipboard paste
│   │   ├── mentions.ts     # @mentions
│   │   ├── code-block.ts   # Code blocks
│   │   ├── datetime.ts     # Date/Time insert
│   │   └── emoji.ts        # Emoji picker
│   ├── styles/
│   │   └── core.css        # All styles
│   ├── index.ts            # Vanilla JS entry
│   └── react.tsx           # React component
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## 📄 License

MIT
