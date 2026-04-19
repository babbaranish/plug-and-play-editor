export { Editor } from './core/Editor';
export type { Plugin } from './core/Plugin';
export { FormattingPlugin, UndoRedoPlugin } from './plugins/formatting';
export { ListsPlugin } from './plugins/lists';
export { ColorPlugin } from './plugins/color';
export { LinksPlugin } from './plugins/links';
export { MediaPlugin } from './plugins/media';
export { DirectionalityPlugin } from './plugins/directionality';
export { AlignmentPlugin } from './plugins/alignment';
export { TablesPlugin } from './plugins/tables';
export { AccordionPlugin } from './plugins/accordion';
export { PageBreakPlugin } from './plugins/page-break';
export { TocPlugin } from './plugins/toc';
export { PasteImagePlugin } from './plugins/paste-image';
export { MentionsPlugin, createMentionsPlugin } from './plugins/mentions';
export type { MentionsPluginOptions } from './plugins/mentions';
export { CodeBlockPlugin } from './plugins/code-block';
export { DateTimePlugin } from './plugins/datetime';
export { EmojiPlugin } from './plugins/emoji';
export { TokensPlugin, createTokensPlugin, DEFAULT_EMAIL_TOKENS } from './plugins/tokens';
export type { Token, TokensPluginOptions } from './plugins/tokens';
export { PasteCleanupPlugin } from './plugins/paste-cleanup';
export { FontSizePlugin } from './plugins/font-size';
export { SpacingPlugin } from './plugins/spacing';
export { ButtonBlockPlugin } from './plugins/button-block';
export { ImageResizePlugin } from './plugins/image-resize';
export { PreviewPlugin, createPreviewPlugin } from './plugins/preview';
export type { PreviewPluginOptions } from './plugins/preview';
export { SourceCodePlugin } from './plugins/source-code';
export { FontFamilyPlugin } from './plugins/font-family';
export { BlockQuotePlugin } from './plugins/block-quote';
export { FindReplacePlugin } from './plugins/find-replace';
export { WordCountPlugin } from './plugins/word-count';
export { openFormModal, openInfoModal } from './core/modal';

// Document model (Phase 2)
export {
    EMPTY_DOC,
    text as docText,
    paragraph as docParagraph,
    heading as docHeading,
    blockquote as docBlockquote,
    list as docList,
    listItem as docListItem,
    doc as docRoot,
    hr as docHr,
    pageBreak as docPageBreak,
    hardBreak as docHardBreak,
    hasChildren,
    BLOCK_TYPES,
    INLINE_TYPES,
    CONTAINER_TYPES,
    CONTENT_MODELS,
    validate as validateDoc,
    assertValid as assertValidDoc,
    nodeEquals,
    isBlock,
    isInline,
    isContainer,
    parseDom,
    serializeToDom,
    serializeToHtml,
    render as renderDocToDom
} from './core/document';
export type {
    Doc,
    Node as DocNode,
    NodeType as DocNodeType,
    BlockNode,
    InlineNode,
    ParagraphNode,
    HeadingNode,
    BlockquoteNode,
    ListNode,
    ListItemNode,
    CodeBlockNode,
    HorizontalRuleNode,
    ImageBlockNode,
    EmbedNode,
    PageBreakNode,
    TableNode,
    TableRowNode,
    TableCellNode,
    AccordionNode,
    AccordionSectionNode,
    TextNode as DocTextNode,
    InlineImageNode,
    HardBreakNode,
    MentionNode,
    TokenNode,
    Mark,
    MarkType,
    SchemaError,
    ContentModel,
    RenderResult
} from './core/document';

// Transform system (Phase 3)
export {
    TransformLog,
    apply as applyTransform,
    invert as invertTransform,
    startRecording as startTransformRecording
} from './core/transforms';
export type {
    Transform,
    TransformKind,
    TransformLogEntry,
    TransformLogOptions,
    ObserverHandle,
    StartObserverOptions,
    InsertInlineTransform,
    InsertBlockTransform,
    DeleteTextTransform,
    RemoveBlockTransform,
    ReplaceTextTransform,
    SetAttributeTransform,
    AddMarkTransform,
    RemoveMarkTransform,
    MoveBlockTransform,
    SplitTransform,
    JoinTransform,
    WrapTransform,
    UnwrapTransform,
    ReplaceNodeTransform
} from './core/transforms';

export type { EditorOptions } from './core/Editor';
export {
    NONE as NONE_SELECTION,
    point,
    caret,
    range,
    comparePaths,
    comparePoints,
    isAncestor,
    commonAncestor,
    readSelection,
    writeSelection,
    domToPoint,
    pointToDom
} from './core/selection';
export type {
    Point,
    Selection,
    CaretSelection,
    RangeSelection,
    EmptySelection,
    Path
} from './core/selection';
export type {
    ModalField,
    ModalFieldRow,
    ModalFieldType,
    FormModalOptions,
    InfoModalOptions,
    ModalTheme,
    ModalButtonTheme
} from './core/modal';
import './styles/core.css';
