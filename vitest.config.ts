import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        globals: false,
        reporters: ['default'],
        coverage: {
            include: ['src/core/**/*.ts'],
            exclude: ['src/core/**/*.test.ts']
        }
    }
});
