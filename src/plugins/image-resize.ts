import type { Plugin } from '../core/Plugin';
import type { Editor } from '../core/Editor';

export const ImageResizePlugin: Plugin = {
    name: 'image-resize',
    init(editor: Editor) {
        let selectedImg: HTMLImageElement | null = null;
        let overlay: HTMLDivElement | null = null;
        let isDragging = false;

        function removeOverlay() {
            if (overlay) { overlay.remove(); overlay = null; }
            selectedImg = null;
        }

        function positionOverlay() {
            if (!overlay || !selectedImg) return;
            const img = selectedImg;
            const area = editor.editorArea;
            const areaRect = area.getBoundingClientRect();
            const imgRect = img.getBoundingClientRect();

            overlay.style.top = `${imgRect.top - areaRect.top + area.scrollTop}px`;
            overlay.style.left = `${imgRect.left - areaRect.left + area.scrollLeft}px`;
            overlay.style.width = `${imgRect.width}px`;
            overlay.style.height = `${imgRect.height}px`;
        }

        function showOverlay(img: HTMLImageElement) {
            removeOverlay();
            selectedImg = img;
            editor.editorArea.style.position = 'relative';

            overlay = document.createElement('div');
            overlay.className = 'play-editor-resize-overlay';

            // Dimension label
            const info = document.createElement('div');
            info.className = 'play-editor-resize-info';
            info.textContent = `${Math.round(img.offsetWidth)} × ${Math.round(img.offsetHeight)}`;
            overlay.appendChild(info);

            // Corner handles
            const corners = ['nw', 'ne', 'sw', 'se'] as const;
            corners.forEach(pos => {
                const handle = document.createElement('div');
                handle.className = `play-editor-resize-handle play-editor-resize-handle-${pos}`;

                handle.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    isDragging = true;

                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startW = img.offsetWidth;
                    const startH = img.offsetHeight;
                    const aspect = startW / startH;

                    const onMove = (ev: MouseEvent) => {
                        ev.preventDefault();
                        let dx = ev.clientX - startX;
                        let dy = ev.clientY - startY;

                        // For left-side handles, invert dx
                        if (pos === 'nw' || pos === 'sw') dx = -dx;
                        // For top handles, invert dy
                        if (pos === 'nw' || pos === 'ne') dy = -dy;

                        // Use the larger delta for proportional resize
                        const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
                        let newW = Math.max(20, startW + delta);
                        let newH = newW / aspect;

                        img.style.width = `${Math.round(newW)}px`;
                        img.style.height = `${Math.round(newH)}px`;

                        positionOverlay();
                        info.textContent = `${Math.round(newW)} × ${Math.round(newH)}`;
                    };

                    const onUp = () => {
                        isDragging = false;
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        editor.textArea.value = editor.editorArea.innerHTML;
                    };

                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                });

                overlay!.appendChild(handle);
            });

            editor.editorArea.appendChild(overlay);
            positionOverlay();
        }

        const clickHandler = (e: MouseEvent) => {
            if (isDragging) return;
            const target = e.target as HTMLElement;
            if (target.tagName === 'IMG' && editor.editorArea.contains(target)) {
                showOverlay(target as HTMLImageElement);
            } else if (!overlay?.contains(target)) {
                removeOverlay();
            }
        };

        const scrollHandler = () => { if (overlay) positionOverlay(); };

        editor.editorArea.addEventListener('click', clickHandler);
        editor.editorArea.addEventListener('scroll', scrollHandler);

        editor.onDestroy(() => {
            removeOverlay();
            editor.editorArea.removeEventListener('click', clickHandler);
            editor.editorArea.removeEventListener('scroll', scrollHandler);
        });
    }
};
