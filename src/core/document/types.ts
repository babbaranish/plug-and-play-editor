/**
 * Structured document model — a typed tree of Nodes that mirrors the
 * semantics of the editor's content, independent of any particular DOM
 * representation.
 *
 * A `Doc` is the root; it holds an ordered list of block-level children.
 * Inline content — text runs with marks, links, inline images — lives
 * inside block nodes.
 *
 * Design notes:
 *  - The tree is immutable. Every "mutation" (via transforms.ts) produces
 *    a new Node. Shared unchanged subtrees keep structural-sharing costs
 *    down, the same way persistent data structures work.
 *  - Nodes are plain data, serialisable to JSON without loss. There are
 *    no DOM references, no class instances, no cycles.
 *  - Identity is value-based; two Nodes compare equal iff all their
 *    fields compare equal. A `nodeEquals` helper lives in schema.ts.
 *  - The Node union is closed (discriminated on `type`). New node kinds
 *    are added by extending the union and updating the schema + parser +
 *    serializer + renderer together.
 */

/** Inline text formatting annotations. */
export type Mark =
    | { readonly type: 'bold' }
    | { readonly type: 'italic' }
    | { readonly type: 'underline' }
    | { readonly type: 'strike' }
    | { readonly type: 'code' }
    | { readonly type: 'link'; readonly href: string; readonly target?: string; readonly rel?: string }
    | { readonly type: 'color'; readonly value: string }
    | { readonly type: 'background'; readonly value: string }
    | { readonly type: 'font-size'; readonly value: string }
    | { readonly type: 'font-family'; readonly value: string };

export type MarkType = Mark['type'];

/** A run of text with zero or more marks applied. */
export interface TextNode {
    readonly type: 'text';
    readonly text: string;
    readonly marks: readonly Mark[];
}

/** Inline elements that aren't runs of text. */
export interface InlineImageNode {
    readonly type: 'inline-image';
    readonly src: string;
    readonly alt?: string;
}

export interface HardBreakNode {
    readonly type: 'break';
}

export interface MentionNode {
    readonly type: 'mention';
    readonly userId: string;
    readonly name: string;
}

export interface TokenNode {
    readonly type: 'token';
    readonly key: string;
    readonly label: string;
}

export type InlineNode = TextNode | InlineImageNode | HardBreakNode | MentionNode | TokenNode;

/** Block-level nodes that contain inline children. */
export interface ParagraphNode {
    readonly type: 'paragraph';
    readonly align?: 'left' | 'center' | 'right' | 'justify';
    readonly children: readonly InlineNode[];
}

export interface HeadingNode {
    readonly type: 'heading';
    readonly level: 1 | 2 | 3 | 4 | 5 | 6;
    readonly children: readonly InlineNode[];
}

export interface BlockquoteNode {
    readonly type: 'blockquote';
    readonly children: readonly BlockNode[];
}

export interface ListItemNode {
    readonly type: 'list-item';
    readonly children: readonly BlockNode[];
}

export interface ListNode {
    readonly type: 'list';
    readonly ordered: boolean;
    readonly children: readonly ListItemNode[];
}

export interface CodeBlockNode {
    readonly type: 'code-block';
    readonly language?: string;
    readonly children: readonly TextNode[];
}

export interface HorizontalRuleNode {
    readonly type: 'hr';
}

export interface TableCellNode {
    readonly type: 'table-cell';
    readonly header: boolean;
    readonly children: readonly BlockNode[];
}

export interface TableRowNode {
    readonly type: 'table-row';
    readonly children: readonly TableCellNode[];
}

export interface TableNode {
    readonly type: 'table';
    readonly children: readonly TableRowNode[];
}

export interface ImageBlockNode {
    readonly type: 'image';
    readonly src: string;
    readonly alt?: string;
    readonly width?: number;
    readonly height?: number;
}

export interface EmbedNode {
    readonly type: 'embed';
    readonly src: string;
    readonly width?: number;
    readonly height?: number;
}

export interface PageBreakNode {
    readonly type: 'page-break';
}

export interface AccordionSectionNode {
    readonly type: 'accordion-section';
    readonly summary: readonly InlineNode[];
    readonly children: readonly BlockNode[];
}

export interface AccordionNode {
    readonly type: 'accordion';
    readonly children: readonly AccordionSectionNode[];
}

/**
 * Everything a block can be. Composition rules live in schema.ts.
 */
export type BlockNode =
    | ParagraphNode
    | HeadingNode
    | BlockquoteNode
    | ListNode
    | CodeBlockNode
    | HorizontalRuleNode
    | TableNode
    | ImageBlockNode
    | EmbedNode
    | PageBreakNode
    | AccordionNode;

export type Node = InlineNode | BlockNode | ListItemNode | TableRowNode | TableCellNode | AccordionSectionNode | Doc;

export type NodeType = Node['type'];

/** The root. Holds an ordered sequence of blocks. */
export interface Doc {
    readonly type: 'doc';
    readonly children: readonly BlockNode[];
}

// ─── Constructors (trusted-input helpers for tests / transforms) ─────

export const EMPTY_DOC: Doc = Object.freeze({ type: 'doc', children: Object.freeze([]) });

export function text(value: string, marks: readonly Mark[] = []): TextNode {
    return { type: 'text', text: value, marks: Object.freeze([...marks]) };
}

export function paragraph(children: readonly InlineNode[] = []): ParagraphNode {
    return { type: 'paragraph', children: Object.freeze([...children]) };
}

export function heading(level: HeadingNode['level'], children: readonly InlineNode[] = []): HeadingNode {
    return { type: 'heading', level, children: Object.freeze([...children]) };
}

export function blockquote(children: readonly BlockNode[] = []): BlockquoteNode {
    return { type: 'blockquote', children: Object.freeze([...children]) };
}

export function list(ordered: boolean, children: readonly ListItemNode[] = []): ListNode {
    return { type: 'list', ordered, children: Object.freeze([...children]) };
}

export function listItem(children: readonly BlockNode[] = []): ListItemNode {
    return { type: 'list-item', children: Object.freeze([...children]) };
}

export function doc(children: readonly BlockNode[] = []): Doc {
    return { type: 'doc', children: Object.freeze([...children]) };
}

export function hr(): HorizontalRuleNode {
    return { type: 'hr' };
}

export function pageBreak(): PageBreakNode {
    return { type: 'page-break' };
}

export function hardBreak(): HardBreakNode {
    return { type: 'break' };
}

/**
 * Type predicate: is `node` a node that has a `children` array? Used by
 * traversal helpers.
 */
export function hasChildren(
    node: Node
): node is Exclude<Node, TextNode | InlineImageNode | HardBreakNode | MentionNode | TokenNode | HorizontalRuleNode | PageBreakNode | ImageBlockNode | EmbedNode> {
    switch (node.type) {
        case 'text':
        case 'inline-image':
        case 'break':
        case 'mention':
        case 'token':
        case 'hr':
        case 'page-break':
        case 'image':
        case 'embed':
            return false;
        default:
            return true;
    }
}
