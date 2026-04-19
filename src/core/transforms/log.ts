/**
 * Transform log: a bounded ring buffer of (Transform, inverse-Transform)
 * pairs plus an undo/redo cursor. The log is the editor's canonical
 * history of edits — independent of the browser's native undo stack.
 *
 * Higher layers (OT, collaborative editing) consume this log.
 */

import type { Transform } from './types';
import { invert } from './invert';

export interface TransformLogEntry {
    readonly transform: Transform;
    readonly inverse: Transform;
    readonly timestamp: number;
    readonly label?: string;
}

export interface TransformLogOptions {
    /** Maximum number of entries retained. Default: 256. */
    readonly capacity?: number;
}

/**
 * Observable log of transforms with an integrated undo/redo cursor.
 *
 * Invariants:
 *   - `entries[0..cursor]` are committed (applied).
 *   - `entries[cursor..]` are redo-able.
 *   - Pushing a new transform when `cursor < entries.length` truncates
 *     the redo tail.
 *   - The list is bounded to `capacity`; the oldest entry is evicted
 *     when the cap is hit.
 */
export class TransformLog {
    private readonly entries: TransformLogEntry[] = [];
    private cursor = 0;
    private readonly capacity: number;
    private readonly listeners: Set<(entry: TransformLogEntry | null) => void> = new Set();

    constructor(options: TransformLogOptions = {}) {
        this.capacity = options.capacity ?? 256;
    }

    /** Append a transform to the log, truncating any redo tail. */
    push(transform: Transform, label?: string): TransformLogEntry {
        if (this.cursor < this.entries.length) {
            this.entries.length = this.cursor;
        }
        const entry: TransformLogEntry = {
            transform,
            inverse: invert(transform),
            timestamp: Date.now(),
            label
        };
        this.entries.push(entry);
        if (this.entries.length > this.capacity) {
            this.entries.splice(0, this.entries.length - this.capacity);
        }
        this.cursor = this.entries.length;
        this.notify(entry);
        return entry;
    }

    /** Step cursor backward. Returns the inverse to apply, or null. */
    stepUndo(): TransformLogEntry | null {
        if (this.cursor === 0) return null;
        const entry = this.entries[this.cursor - 1];
        this.cursor -= 1;
        this.notify(entry);
        return entry;
    }

    /** Step cursor forward. Returns the entry to re-apply, or null. */
    stepRedo(): TransformLogEntry | null {
        if (this.cursor >= this.entries.length) return null;
        const entry = this.entries[this.cursor];
        this.cursor += 1;
        this.notify(entry);
        return entry;
    }

    canUndo(): boolean { return this.cursor > 0; }
    canRedo(): boolean { return this.cursor < this.entries.length; }

    /** Current history, oldest first. Copy; callers must not mutate. */
    history(): readonly TransformLogEntry[] {
        return this.entries.slice();
    }

    /** Position of the cursor — entries before `cursor()` are applied. */
    position(): number {
        return this.cursor;
    }

    /** Subscribe to log events. Called on push/undo/redo with the entry that moved. */
    subscribe(fn: (entry: TransformLogEntry | null) => void): () => void {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    }

    /** Clear the log. */
    clear(): void {
        this.entries.length = 0;
        this.cursor = 0;
        this.notify(null);
    }

    private notify(entry: TransformLogEntry | null): void {
        for (const fn of this.listeners) fn(entry);
    }
}
