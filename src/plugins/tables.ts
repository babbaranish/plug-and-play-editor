import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';
import { icons } from '../core/icons';

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

            let node: Node | null = selection.anchorNode;
            while (node && node !== editor.editorArea && node.nodeName !== 'TR') {
                node = node.parentNode;
            }

            if (node && node.nodeName === 'TR') {
                const tr = node as HTMLTableRowElement;
                const cols = tr.children.length;
                const newTr = document.createElement('tr');
                for (let i = 0; i < cols; i++) {
                    const td = document.createElement('td');
                    td.innerHTML = '<br>';
                    newTr.appendChild(td);
                }
                tr.parentNode?.insertBefore(newTr, tr.nextSibling);
                editor.textArea.value = editor.editorArea.innerHTML;
            }
        });

        editor.addToolbarButton(icons.tableColAdd, 'Add Col Right', () => {
            const selection = window.getSelection();
            if (!selection || !selection.rangeCount) return;

            let node: Node | null = selection.anchorNode;
            while (node && node !== editor.editorArea && node.nodeName !== 'TD' && node.nodeName !== 'TH') {
                node = node.parentNode;
            }

            if (node && (node.nodeName === 'TD' || node.nodeName === 'TH')) {
                const cell = node as HTMLTableCellElement;
                const index = Array.from(cell.parentNode!.children).indexOf(cell);
                const table = cell.closest('table');

                if (table) {
                    const rows = table.querySelectorAll('tr');
                    rows.forEach(row => {
                        const newCell = document.createElement(node!.nodeName);
                        newCell.innerHTML = '<br>';
                        const target = row.children[index];
                        row.insertBefore(newCell, target.nextSibling);
                    });
                    editor.textArea.value = editor.editorArea.innerHTML;
                }
            }
        });
    }
};
