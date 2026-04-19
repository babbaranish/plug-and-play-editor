/**
 * MutationObserver bridge: observes the editor's contentEditable DOM and
 * emits coarse-grained Transforms that describe what changed.
 *
 * This is how Phase 3 shadows the existing `document.execCommand`-based
 * editing without replacing it. Every user edit becomes a Transform in
 * the log; the browser still performs the edit, but the editor now has
 * a structured history it can reason about (and, in a future phase,
 * rebase against collaborative edits).
 *
 * The recorder uses ReplaceNode as its coarse transform — after each
 * batch of mutations it parses the changed subtree (or the whole
 * editorArea for simplicity in this pass) into a Doc and records a
 * `replace-node` from previous to next. Finer-grained recorders (exact
 * insert-text, remove-block, etc.) are a later refinement — coarse
 * recording is correct, just less information-dense.
 */

import { parseDom, type Doc } from '../document';
import type { TransformLog } from './log';

export interface ObserverHandle {
    stop(): void;
}

export interface StartObserverOptions {
    /** Called with the new Doc snapshot whenever a transform is recorded. */
    readonly onSnapshot?: (snapshot: Doc) => void;
    /** Pause recording while `true`. Used while applying undo/redo. */
    readonly isPaused?: () => boolean;
}

export function startRecording(
    editorArea: HTMLElement,
    log: TransformLog,
    options: StartObserverOptions = {}
): ObserverHandle {
    let previous: Doc = parseDom(editorArea);
    let pending = false;

    const flush = () => {
        pending = false;
        if (options.isPaused?.()) return;
        const next = parseDom(editorArea);
        if (structurallyEqual(previous, next)) return;
        log.push({
            kind: 'replace-node',
            path: [],
            previous,
            next
        });
        previous = next;
        options.onSnapshot?.(next);
    };

    const observer = new MutationObserver(() => {
        if (pending) return;
        pending = true;
        // Coalesce into one transform per frame; mirrors the editor's
        // rAF-coalesced selection/input dispatchers.
        requestAnimationFrame(flush);
    });

    observer.observe(editorArea, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeOldValue: false,
        characterDataOldValue: false
    });

    return {
        stop() {
            observer.disconnect();
            if (pending) flush();
        }
    };
}

function structurallyEqual(a: Doc, b: Doc): boolean {
    if (a === b) return true;
    // Fast-path: compare serialised JSON. The parser produces canonical output
    // (merged adjacent text runs, sorted marks) so string equality is a reliable
    // signal of structural equality here.
    return JSON.stringify(a) === JSON.stringify(b);
}
