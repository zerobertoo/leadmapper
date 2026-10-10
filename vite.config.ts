import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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

// páginas com HTML (popup e painel lateral): um passe de build por página
const pageEntries: Record<string, string> = {
  popup: 'src/popup/popup.html',
  sidepanel: 'src/sidepanel/sidepanel.html',
};

// copia o manifest.json para dist/ com a versão do package.json (fonte única), no passe do popup
const emitManifest: Plugin = {
  name: 'emit-manifest',
  generateBundle() {
    const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, 'manifest.json'), 'utf-8'));
    const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf-8'));
    manifest.version = pkg.version;
    this.emitFile({ type: 'asset', fileName: 'manifest.json', source: `${JSON.stringify(manifest, null, 2)}
` });
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

const pageHtml = pageEntries[entry];

export default defineConfig(
  pageHtml
    ? {
        root: resolve(import.meta.dirname, dirname(pageHtml)),
        base: './',
        plugins: entry === 'popup' ? [emitManifest] : [],
        build: {
          outDir: resolve(import.meta.dirname, 'dist'),
          emptyOutDir: false,
          rollupOptions: { input: resolve(import.meta.dirname, pageHtml) },
        },
        test,
      }
    : {
        build: scriptBuild(scriptEntries[entry]),
        test,
      },
);
