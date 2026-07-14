/**
 * Public entry for the structured document model. Consumers should
 * import from this file rather than individual modules.
 */

export type {
    // Root + discriminated unions
    Doc,
    Node,
    NodeType,
    BlockNode,
    InlineNode,
    // Block nodes
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
    // Inline nodes
    TextNode,
    InlineImageNode,
    HardBreakNode,
    MentionNode,
    TokenNode,
    // Marks
    Mark,
    MarkType
} from './types';

export {
    EMPTY_DOC,
    text,
    paragraph,
    heading,
    blockquote,
    list,
    listItem,
    doc,
    hr,
    pageBreak,
    hardBreak,
    hasChildren
} from './types';

export {
    BLOCK_TYPES,
    INLINE_TYPES,
    CONTAINER_TYPES,
    CONTENT_MODELS,
    validate,
    assertValid,
    nodeEquals,
    isBlock,
    isInline,
    isContainer
} from './schema';
export type { SchemaError, ContentModel } from './schema';

export { parseDom } from './parser';
export { serializeToDom, serializeToHtml } from './serializer';
export { render } from './renderer';
export type { RenderResult } from './renderer';
