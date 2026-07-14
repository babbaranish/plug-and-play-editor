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

                    let rafId: number | null = null;
                    let pendingEvent: MouseEvent | null = null;

                    const applyResize = (ev: MouseEvent) => {
                        let dx = ev.clientX - startX;
                        let dy = ev.clientY - startY;

                        // For left-side handles, invert dx
                        if (pos === 'nw' || pos === 'sw') dx = -dx;
                        // For top handles, invert dy
                        if (pos === 'nw' || pos === 'ne') dy = -dy;

                        // Use the larger delta for proportional resize
                        const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
                        const requestedW = Math.max(20, startW + delta);

                        img.style.width = `${Math.round(requestedW)}px`;
                        img.style.height = `${Math.round(requestedW / aspect)}px`;

                        // img.style.maxWidth is set to 100% by MediaPlugin/PasteImagePlugin,
                        // so a width beyond the containing block gets silently clamped by
                        // CSS at render time. Rather than pre-computing the available space
                        // (fragile — clientWidth doesn't account for the container's own
                        // padding/box-sizing), read back what actually got rendered and
                        // re-derive height from *that*, so the image never distorts and the
                        // label never reports pixels that got clipped right back down.
                        const renderedW = Math.round(img.getBoundingClientRect().width);
                        const renderedH = Math.round(renderedW / aspect);
                        if (renderedW !== Math.round(requestedW)) {
                            img.style.height = `${renderedH}px`;
                        }

                        positionOverlay();
                        info.textContent = `${renderedW} × ${renderedH}`;
                    };

                    const onMove = (ev: MouseEvent) => {
                        ev.preventDefault();
                        pendingEvent = ev;
                        // Batch rapid mousemove bursts (fast/"quick" drags) into one
                        // layout pass per frame instead of one per event.
                        if (rafId === null) {
                            rafId = requestAnimationFrame(() => {
                                rafId = null;
                                if (pendingEvent) applyResize(pendingEvent);
                            });
                        }
                    };

                    const onUp = () => {
                        isDragging = false;
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        if (rafId !== null) {
                            cancelAnimationFrame(rafId);
                            rafId = null;
                            // Make sure the final pointer position is reflected even
                            // if a frame was still pending when the button was released.
                            if (pendingEvent) applyResize(pendingEvent);
                        }
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
