import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * O build roda uma vez por entrypoint (variável ENTRY), porque content script
 * e service worker MV3 precisam ser bundles únicos (IIFE), sem imports ES.
 */
const entry = process.env.ENTRY ?? 'popup';

const scriptEntries: Record<string, string> = {
  background: 'src/background/index.ts',
  content: 'src/content/maps.ts',
};

// copia o manifest.json para dist/ (só no passe do popup, que é o último)
const emitManifest: Plugin = {
  name: 'emit-manifest',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'manifest.json',
      source: readFileSync(resolve(import.meta.dirname, 'manifest.json'), 'utf-8'),
    });
  },
};

const scriptBuild = (file: string) => ({
  outDir: 'dist',
  emptyOutDir: false,
  lib: {
    entry: resolve(import.meta.dirname, file),
    formats: ['iife' as const],
    name: `leadmapper_${entry}`,
    fileName: () => `${entry}.js`,
  },
});

const test = { root: import.meta.dirname, include: ['tests/**/*.test.ts'] };

export default defineConfig(
  entry === 'popup'
    ? {
        root: resolve(import.meta.dirname, 'src/popup'),
        base: './',
        plugins: [emitManifest],
        build: {
          outDir: resolve(import.meta.dirname, 'dist'),
          emptyOutDir: false,
          rollupOptions: { input: resolve(import.meta.dirname, 'src/popup/popup.html') },
        },
        test,
      }
    : {
        build: scriptBuild(scriptEntries[entry]),
        test,
      },
);
