import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        // Paste tests build sandboxed iframes; nothing should go to the network for them.
        environmentOptions: { happyDOM: { settings: { disableIframePageLoading: true } } },
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        globals: false,
        reporters: ['default'],
        coverage: {
            include: ['src/core/**/*.ts'],
            exclude: ['src/core/**/*.test.ts']
        }
    }
});
