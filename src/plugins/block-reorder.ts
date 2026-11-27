import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

/** Moves the top-level block holding the caret up one place. Returns whether it moved. */
export const BLOCK_MOVE_UP_COMMAND = 'block-reorder:up';
/** Moves the top-level block holding the caret down one place. Returns whether it moved. */
export const BLOCK_MOVE_DOWN_COMMAND = 'block-reorder:down';

/** Within this distance (px) of the editor's top or bottom edge, a drag scrolls it. */
const EDGE_SCROLL_ZONE = 40;
const EDGE_SCROLL_STEP = 12;

/** Where a block goes: before or after one of the editor's top-level blocks; `ref: null` is the end. */
export interface BlockDropPoint {
    readonly ref: Element | null;
    readonly side: 'before' | 'after';
}

/**
 * Where a block dropped at `clientY` goes, and where the drop line is
 * drawn: between the two top-level blocks around that height, judged by
 * each block's middle; after the last block below them. `moving` (the
 * block being dragged) is left out of the reckoning.
 */
export function dropPointAt(editor: Editor, clientY: number, moving?: Element): { point: BlockDropPoint; lineY: number } {
    const blocks = Array.from(editor.editorArea.children).filter(b => b !== moving);
    let previousBottom: number | null = null;
    for (const block of blocks) {
        const rect = block.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
            const lineY = previousBottom === null ? rect.top : (previousBottom + rect.top) / 2;
            return { point: { ref: block, side: 'before' }, lineY };
        }
        previousBottom = rect.bottom;
    }
    const last = blocks[blocks.length - 1];
    if (last) return { point: { ref: last, side: 'after' }, lineY: last.getBoundingClientRect().bottom };
    return { point: { ref: null, side: 'after' }, lineY: editor.editorArea.getBoundingClientRect().top };
}

/** Whether dropping `block` at `point` would leave it where it is. */
export function staysPut(block: Element, point: BlockDropPoint): boolean {
    if (point.ref === block) return true;
    if (point.side === 'before') return point.ref === block.nextElementSibling;
    return point.ref === block.previousElementSibling;
}

/** The editor's top-level block at viewport height `clientY`, if any. */
function blockAtY(editor: Editor, clientY: number): HTMLElement | null {
    for (const child of Array.from(editor.editorArea.children)) {
        const rect = child.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) return child as HTMLElement;
    }
    return null;
}

/** The editor's top-level block holding `node`, if any. */
function topLevelBlockOf(editor: Editor, node: Node | null): HTMLElement | null {
    let n: Node | null = node;
    while (n && n.parentNode !== editor.editorArea) n = n.parentNode;
    return n instanceof HTMLElement ? n : null;
}

function inAlternateView(editor: Editor): boolean {
    return editor.hasActiveContentSource() || editor.container.classList.contains('play-editor-preview-mode');
}

/**
 * Moves `block` to `point`. A non-editable block (a button, an AMP form…)
 * left last gets a paragraph after it, so there is somewhere to keep typing.
 */
function moveBlock(editor: Editor, block: HTMLElement, point: BlockDropPoint): void {
    const ref = point.ref && point.ref.parentNode === editor.editorArea ? point.ref : null;
    if (ref && point.side === 'before') ref.before(block);
    else if (ref) ref.after(block);
    else editor.editorArea.appendChild(block);
    if (!block.nextElementSibling && block.getAttribute('contenteditable') === 'false') {
        const p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        block.after(p);
    }
    editor.notifyContentChange();
}

/**
 * Rearranges any block in the email by dragging. Hovering a block (a
 * paragraph, heading, list, table, image, button, AMP form…) shows a grip in
 * the left margin; drag it and a line shows where the block will land.
 * Escape cancels a drag. Alt+Shift+↑ / ↓ moves the block holding the caret,
 * for keyboards. The grip, line and highlight sit outside the content, so
 * nothing is added to the email.
 */
export const BlockReorderPlugin: Plugin = {
    name: 'block-reorder',
    init(editor: Editor) {
        const area = editor.editorArea;
        editor.container.classList.add('play-editor-has-block-handle');

        const handle = document.createElement('div');
        handle.className = 'play-editor-block-handle';
        handle.title = 'Drag to move';
        // Mouse and touch only; keyboards use Alt+Shift+↑ / ↓.
        handle.setAttribute('aria-hidden', 'true');
        // icons.grip is trusted SVG, like the toolbar's icons.
        handle.innerHTML = icons.grip;
        handle.hidden = true;

        const line = document.createElement('div');
        line.className = 'play-editor-drop-indicator';
        line.hidden = true;

        const ghost = document.createElement('div');
        ghost.className = 'play-editor-block-ghost';
        ghost.hidden = true;

        editor.container.append(handle, line, ghost);

        let hovered: HTMLElement | null = null;
        let drag: { block: HTMLElement; pointerId: number } | null = null;

        const placeOver = (el: HTMLElement, rect: DOMRect) => {
            const host = editor.container.getBoundingClientRect();
            el.style.top = `${rect.top - host.top}px`;
            el.style.left = `${rect.left - host.left}px`;
            el.style.width = `${rect.width}px`;
            el.style.height = `${rect.height}px`;
        };

        const hideHandle = () => {
            handle.hidden = true;
            hovered = null;
        };

        const showHandleFor = (block: HTMLElement) => {
            const rect = block.getBoundingClientRect();
            const box = area.getBoundingClientRect();
            if (rect.top < box.top || rect.top > box.bottom - 10) {
                hideHandle();
                return;
            }
            const host = editor.container.getBoundingClientRect();
            hovered = block;
            // In the content's left padding, level with the block's first line.
            handle.style.top = `${rect.top - host.top + 2}px`;
            handle.style.left = `${box.left - host.left + 3}px`;
            handle.hidden = false;
        };

        const showLine = (lineY: number) => {
            const host = editor.container.getBoundingClientRect();
            const box = area.getBoundingClientRect();
            if (lineY < box.top || lineY > box.bottom) {
                line.hidden = true;
                return;
            }
            line.style.top = `${lineY - host.top - 1}px`;
            line.style.left = `${box.left - host.left + 12}px`;
            line.style.width = `${Math.max(0, box.width - 24)}px`;
            line.hidden = false;
        };

        // ── Hover: which block the grip belongs to ──
        const onAreaMove = (e: PointerEvent) => {
            if (drag || inAlternateView(editor) || area.contentEditable === 'false') return;
            const block = blockAtY(editor, e.clientY);
            if (block) showHandleFor(block);
            else hideHandle();
        };
        const onAreaLeave = (e: PointerEvent) => {
            if (drag || e.relatedTarget === handle || handle.contains(e.relatedTarget as Node | null)) return;
            hideHandle();
        };
        const onHandleLeave = (e: PointerEvent) => {
            if (drag || area.contains(e.relatedTarget as Node | null)) return;
            hideHandle();
        };
        const onScroll = () => { if (!drag) hideHandle(); };
        area.addEventListener('pointermove', onAreaMove);
        area.addEventListener('pointerleave', onAreaLeave);
        area.addEventListener('scroll', onScroll);
        handle.addEventListener('pointerleave', onHandleLeave);

        // ── Dragging ──
        const endDrag = () => {
            drag = null;
            line.hidden = true;
            ghost.hidden = true;
            editor.container.classList.remove('play-editor-block-moving');
            document.removeEventListener('pointermove', onDragMove);
            document.removeEventListener('pointerup', onDragUp);
            document.removeEventListener('pointercancel', onDragCancel);
            document.removeEventListener('keydown', onDragKey, true);
        };

        const onHandleDown = (e: PointerEvent) => {
            if (e.button !== 0 || !hovered || !area.contains(hovered) || inAlternateView(editor)) return;
            // Keeps focus and selection where they are.
            e.preventDefault();
            drag = { block: hovered, pointerId: e.pointerId };
            handle.hidden = true;
            placeOver(ghost, hovered.getBoundingClientRect());
            ghost.hidden = false;
            editor.container.classList.add('play-editor-block-moving');
            document.addEventListener('pointermove', onDragMove);
            document.addEventListener('pointerup', onDragUp);
            document.addEventListener('pointercancel', onDragCancel);
            document.addEventListener('keydown', onDragKey, true);
        };

        const onDragMove = (e: PointerEvent) => {
            if (!drag || e.pointerId !== drag.pointerId) return;
            e.preventDefault();
            const box = area.getBoundingClientRect();
            if (e.clientY < box.top + EDGE_SCROLL_ZONE) area.scrollTop -= EDGE_SCROLL_STEP;
            else if (e.clientY > box.bottom - EDGE_SCROLL_ZONE) area.scrollTop += EDGE_SCROLL_STEP;
            placeOver(ghost, drag.block.getBoundingClientRect());
            const { point, lineY } = dropPointAt(editor, e.clientY, drag.block);
            if (staysPut(drag.block, point)) line.hidden = true;
            else showLine(lineY);
        };

        const onDragUp = (e: PointerEvent) => {
            if (!drag || e.pointerId !== drag.pointerId) return;
            const { block } = drag;
            const { point } = dropPointAt(editor, e.clientY, block);
            endDrag();
            if (area.contains(block) && !staysPut(block, point)) moveBlock(editor, block, point);
        };

        const onDragCancel = () => endDrag();
        const onDragKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            endDrag();
        };
        handle.addEventListener('pointerdown', onHandleDown);

        // ── Keyboard: Alt+Shift+↑ / ↓ ──
        /**
         * Moves the caret's block by moving its neighbour across it, so the
         * block itself (and the caret in it) stays in the document.
         */
        const moveCaretBlock = (direction: 'up' | 'down'): boolean => {
            if (inAlternateView(editor)) return false;
            const sel = window.getSelection();
            const block = sel && sel.rangeCount > 0 && area.contains(sel.anchorNode) ? topLevelBlockOf(editor, sel.anchorNode) : null;
            if (!block) return false;
            const neighbour = direction === 'up' ? block.previousElementSibling : block.nextElementSibling;
            if (!neighbour) return false;
            if (direction === 'up') block.after(neighbour);
            else block.before(neighbour);
            block.scrollIntoView?.({ block: 'nearest' });
            hideHandle();
            editor.notifyContentChange();
            return true;
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) {
                // Typing: the grip would sit over the text.
                if (!drag) hideHandle();
                return;
            }
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            if (moveCaretBlock(e.key === 'ArrowUp' ? 'up' : 'down')) e.preventDefault();
        };
        area.addEventListener('keydown', onKeyDown);

        const unregisterUp = editor.registerCommand(BLOCK_MOVE_UP_COMMAND, () => moveCaretBlock('up'));
        const unregisterDown = editor.registerCommand(BLOCK_MOVE_DOWN_COMMAND, () => moveCaretBlock('down'));

        editor.onDestroy(() => {
            endDrag();
            area.removeEventListener('pointermove', onAreaMove);
            area.removeEventListener('pointerleave', onAreaLeave);
            area.removeEventListener('scroll', onScroll);
            area.removeEventListener('keydown', onKeyDown);
            unregisterUp();
            unregisterDown();
            handle.remove();
            line.remove();
            ghost.remove();
            editor.container.classList.remove('play-editor-has-block-handle');
        });
    }
};
