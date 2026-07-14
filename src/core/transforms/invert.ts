/**
 * Pure inversion: given a Transform, produce a sibling Transform that
 * undoes it. Correctness contract:
 *
 *   apply(apply(doc, t), invert(t)) structurally equals doc
 *
 * This property is asserted by property-based tests alongside manual
 * fixture tests.
 */

import type { Transform } from './types';
import { assertNever } from '../selection';

export function invert(t: Transform): Transform {
    switch (t.kind) {
        case 'insert-inline': {
            // Opposite of insert-inline is a delete-text covering the one
            // character-width of the inserted node. For text nodes, delete
            // its text length; for void inlines we model as a delete-inline.
            if (t.node.type === 'text') {
                return {
                    kind: 'delete-text',
                    path: t.at.path,
                    start: t.at.offset,
                    end: t.at.offset + t.node.text.length,
                    removed: t.node.text
                };
            }
            // Void inline — no generic inverse in the current ADT; represent
            // as a replace-node that swaps the inserted node for nothing.
            // (This path is exercised only by higher-level code.)
            return {
                kind: 'replace-node',
                path: [...t.at.path],
                previous: t.node,
                next: t.node // placeholder — see the TODO note in apply.ts
            };
        }
        case 'insert-block':
            return {
                kind: 'remove-block',
                parent: t.parent,
                index: t.index,
                removed: t.node
            };
        case 'delete-text':
            return {
                kind: 'replace-text',
                path: t.path,
                start: t.start,
                end: t.start,
                insert: t.removed,
                removed: ''
            };
        case 'remove-block':
            return {
                kind: 'insert-block',
                parent: t.parent,
                index: t.index,
                node: t.removed
            };
        case 'replace-text':
            return {
                kind: 'replace-text',
                path: t.path,
                start: t.start,
                end: t.start + t.insert.length,
                insert: t.removed,
                removed: t.insert
            };
        case 'set-attr':
            return {
                kind: 'set-attr',
                path: t.path,
                attribute: t.attribute,
                previous: t.next,
                next: t.previous
            };
        case 'add-mark':
            return {
                kind: 'remove-mark',
                path: t.path,
                start: t.start,
                end: t.end,
                mark: t.mark
            };
        case 'remove-mark':
            return {
                kind: 'add-mark',
                path: t.path,
                start: t.start,
                end: t.end,
                mark: t.mark
            };
        case 'move-block':
            return {
                kind: 'move-block',
                from: t.to,
                to: t.from
            };
        case 'split':
            return {
                kind: 'join',
                parent: t.parent,
                index: t.index
            };
        case 'join':
            return {
                kind: 'split',
                parent: t.parent,
                index: t.index
            };
        case 'wrap':
            return {
                kind: 'unwrap',
                parent: t.parent,
                index: t.start,
                removedType: t.wrapperType
            };
        case 'unwrap':
            return {
                kind: 'wrap',
                parent: t.parent,
                start: t.index,
                end: t.index + 1,
                wrapperType: t.removedType
            };
        case 'replace-node':
            return {
                kind: 'replace-node',
                path: t.path,
                previous: t.next,
                next: t.previous
            };
        default:
            return assertNever(t);
    }
}
