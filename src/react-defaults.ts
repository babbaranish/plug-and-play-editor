import type { Plugin } from './core/Plugin';
import { FormattingPlugin, UndoRedoPlugin } from './plugins/formatting';
import { ListsPlugin } from './plugins/lists';
import { ColorPlugin } from './plugins/color';
import { LinksPlugin } from './plugins/links';
import { MediaPlugin } from './plugins/media';
import { DirectionalityPlugin } from './plugins/directionality';
import { AlignmentPlugin } from './plugins/alignment';
import { TablesPlugin } from './plugins/tables';
import { AccordionPlugin } from './plugins/accordion';
import { PageBreakPlugin } from './plugins/page-break';
import { TocPlugin } from './plugins/toc';
import { PasteImagePlugin } from './plugins/paste-image';
import { MentionsPlugin } from './plugins/mentions';
import { CodeBlockPlugin } from './plugins/code-block';
import { DateTimePlugin } from './plugins/datetime';
import { EmojiPlugin } from './plugins/emoji';
import { TokensPlugin } from './plugins/tokens';
import { PasteCleanupPlugin } from './plugins/paste-cleanup';
import { FontSizePlugin } from './plugins/font-size';
import { SpacingPlugin } from './plugins/spacing';
import { ButtonBlockPlugin } from './plugins/button-block';
import { ImageResizePlugin } from './plugins/image-resize';
import { PreviewPlugin } from './plugins/preview';
import { SourceCodePlugin } from './plugins/source-code';
import { FontFamilyPlugin } from './plugins/font-family';
import { BlockQuotePlugin } from './plugins/block-quote';
import { FindReplacePlugin } from './plugins/find-replace';
import { WordCountPlugin } from './plugins/word-count';

/** Every built-in plugin in its recommended registration order. */
export const ALL_PLUGINS: Plugin[] = [
    FormattingPlugin,
    UndoRedoPlugin,
    ListsPlugin,
    ColorPlugin,
    DirectionalityPlugin,
    AlignmentPlugin,
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
    PasteCleanupPlugin,
    FontSizePlugin,
    SpacingPlugin,
    ButtonBlockPlugin,
    ImageResizePlugin,
    PreviewPlugin,
    SourceCodePlugin,
    FontFamilyPlugin,
    BlockQuotePlugin,
    FindReplacePlugin,
    WordCountPlugin
];
