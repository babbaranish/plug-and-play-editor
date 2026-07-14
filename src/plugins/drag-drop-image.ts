import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB, matches MediaPlugin's upload limit

function getDropRange(e: DragEvent): Range | null {
    // Chrome/Safari
    if (typeof (document as any).caretRangeFromPoint === 'function') {
        return (document as any).caretRangeFromPoint(e.clientX, e.clientY) as Range | null;
    }
    // Firefox standard API
    if (typeof (document as any).caretPositionFromPoint === 'function') {
        const pos = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
        if (pos) {
            const range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
            return range;
        }
    }
    return null;
}

function insertImageAt(editor: Editor, range: Range | null, dataUrl: string) {
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.borderRadius = '6px';
    img.style.margin = '0.5em 0';

    if (range && editor.editorArea.contains(range.startContainer)) {
        range.deleteContents();
        range.insertNode(img);
        range.setStartAfter(img);
        range.collapse(true);
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }
    } else {
        editor.editorArea.appendChild(img);
    }
}

export const DragDropImagePlugin: Plugin = {
    name: 'drag-drop-image',
    init(editor: Editor) {
        let dragDepth = 0;

        const hasFiles = (e: DragEvent) =>
            !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');

        const onDragEnter = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragDepth++;
            editor.editorArea.classList.add('play-editor-dragover');
        };

        const onDragOver = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            // Required so the browser fires 'drop' instead of navigating to the file
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        };

        const onDragLeave = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) editor.editorArea.classList.remove('play-editor-dragover');
        };

        const onDrop = (e: DragEvent) => {
            const files = e.dataTransfer?.files;
            if (!files || files.length === 0) return;

            const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
            if (imageFiles.length === 0) return;

            e.preventDefault();
            dragDepth = 0;
            editor.editorArea.classList.remove('play-editor-dragover');

            const dropRange = getDropRange(e);
            editor.editorArea.focus();

            const oversized = imageFiles.filter(f => f.size > MAX_FILE_SIZE);
            const validFiles = imageFiles.filter(f => f.size <= MAX_FILE_SIZE);
            if (oversized.length > 0) {
                alert(
                    oversized.length === 1
                        ? `"${oversized[0].name}" is too large. Maximum size is 10MB.`
                        : `${oversized.length} images are too large. Maximum size is 10MB.`
                );
            }

            // Insert sequentially so drop order is preserved and each image lands
            // right after the previous one instead of racing on the same range.
            let chain = Promise.resolve();
            validFiles.forEach(file => {
                chain = chain.then(
                    () =>
                        new Promise<void>(resolve => {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                                const dataUrl = event.target?.result as string;
                                if (dataUrl) insertImageAt(editor, dropRange, dataUrl);
                                resolve();
                            };
                            reader.onerror = () => resolve();
                            reader.readAsDataURL(file);
                        })
                );
            });
            chain.then(() => {
                editor.textArea.value = editor.editorArea.innerHTML;
            });
        };

        editor.editorArea.addEventListener('dragenter', onDragEnter);
        editor.editorArea.addEventListener('dragover', onDragOver);
        editor.editorArea.addEventListener('dragleave', onDragLeave);
        editor.editorArea.addEventListener('drop', onDrop);

        editor.onDestroy(() => {
            editor.editorArea.classList.remove('play-editor-dragover');
            editor.editorArea.removeEventListener('dragenter', onDragEnter);
            editor.editorArea.removeEventListener('dragover', onDragOver);
            editor.editorArea.removeEventListener('dragleave', onDragLeave);
            editor.editorArea.removeEventListener('drop', onDrop);
        });
    }
};
