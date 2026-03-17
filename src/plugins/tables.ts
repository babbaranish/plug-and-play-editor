import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

function findAncestor(node: Node | null, editorArea: HTMLElement, tagName: string): HTMLElement | null {
    while (node && node !== editorArea) {
        if (node.nodeName === tagName) return node as HTMLElement;
        node = node.parentNode;
    }
    return null;
}

function findCell(node: Node | null, editorArea: HTMLElement): HTMLTableCellElement | null {
    while (node && node !== editorArea) {
        if (node.nodeName === 'TD' || node.nodeName === 'TH') return node as HTMLTableCellElement;
        node = node.parentNode;
    }
    return null;
}

export const TablesPlugin: Plugin = {
    name: 'tables',
    init(editor: Editor) {
        editor.addToolbarDivider();

        editor.addToolbarButton(icons.table, 'Insert 3x3 Table', () => {
            const rows = 3;
            const cols = 3;

            let html = '<table class="play-editor-table"><tbody>';
            for (let r = 0; r < rows; r++) {
                html += '<tr>';
                for (let c = 0; c < cols; c++) {
                    html += '<td><br></td>';
                }
                html += '</tr>';
            }
            html += '</tbody></table><p><br></p>';

            editor.exec('insertHTML', html);
        });

        editor.addToolbarButton(icons.tableRowAdd, 'Add Row Below', () => {
            const selection = window.getSelection();
            if (!selection || !selection.rangeCount) return;

            const tr = findAncestor(selection.anchorNode, editor.editorArea, 'TR');
            if (!tr) return;

            const cols = tr.children.length;
            const newTr = document.createElement('tr');
            for (let i = 0; i < cols; i++) {
                const td = document.createElement('td');
                td.innerHTML = '<br>';
                newTr.appendChild(td);
            }
            tr.parentNode?.insertBefore(newTr, tr.nextSibling);
            editor.textArea.value = editor.editorArea.innerHTML;
        });

        editor.addToolbarButton(icons.tableColAdd, 'Add Column Right', () => {
            const selection = window.getSelection();
            if (!selection || !selection.rangeCount) return;

            const cell = findCell(selection.anchorNode, editor.editorArea);
            if (!cell) return;

            const index = Array.from(cell.parentNode!.children).indexOf(cell);
            const table = cell.closest('table');
            if (!table) return;

            table.querySelectorAll('tr').forEach(row => {
                const newCell = document.createElement(row.children[index]?.nodeName === 'TH' ? 'th' : 'td');
                newCell.innerHTML = '<br>';
                const target = row.children[index];
                if (target) {
                    row.insertBefore(newCell, target.nextSibling);
                } else {
                    row.appendChild(newCell);
                }
            });
            editor.textArea.value = editor.editorArea.innerHTML;
        });

        editor.addToolbarButton(icons.tableRowDelete, 'Delete Row', () => {
            const selection = window.getSelection();
            if (!selection || !selection.rangeCount) return;

            const tr = findAncestor(selection.anchorNode, editor.editorArea, 'TR');
            if (!tr) return;

            const tbody = tr.parentNode;
            if (!tbody) return;

            // If this is the last row, remove the entire table
            if (tbody.children.length <= 1) {
                const table = tr.closest('table');
                table?.remove();
            } else {
                tr.remove();
            }
            editor.textArea.value = editor.editorArea.innerHTML;
        });

        editor.addToolbarButton(icons.tableColDelete, 'Delete Column', () => {
            const selection = window.getSelection();
            if (!selection || !selection.rangeCount) return;

            const cell = findCell(selection.anchorNode, editor.editorArea);
            if (!cell) return;

            const index = Array.from(cell.parentNode!.children).indexOf(cell);
            const table = cell.closest('table');
            if (!table) return;

            const rows = table.querySelectorAll('tr');
            // If this is the last column, remove the entire table
            if (rows[0] && rows[0].children.length <= 1) {
                table.remove();
            } else {
                rows.forEach(row => {
                    row.children[index]?.remove();
                });
            }
            editor.textArea.value = editor.editorArea.innerHTML;
        });
    }
};
