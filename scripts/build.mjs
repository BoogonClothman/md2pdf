// esbuild build script: bundles main / preload / renderer for Electron.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const common = { bundle: true, sourcemap: true, logLevel: 'info' };

/** @type {import('esbuild').BuildOptions[]} */
const targets = [
  {
    // Electron main process (Node environment)
    ...common,
    entryPoints: ['src/main/main.ts'],
    outdir: `${outdir}/main`,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['electron'],
  },
  {
    // Preload bridge
    ...common,
    entryPoints: ['src/preload/preload.ts'],
    outdir: `${outdir}/preload`,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['electron'],
  },
  {
    // Verification harness (run with `electron dist/verify.js`)
    ...common,
    entryPoints: ['src/main/verify.ts'],
    outdir: `${outdir}/main`,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['electron'],
  },
  {
    // Main window UI (browser environment)
    ...common,
    entryPoints: ['src/renderer/app.ts'],
    outdir: `${outdir}/renderer`,
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
    entryNames: 'app',
  },
  {
    // Hidden export page
    ...common,
    entryPoints: ['src/renderer/exportpage.ts'],
    outdir: `${outdir}/renderer`,
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
    entryNames: 'exportpage',
  },
];

if (watch) {
  const contexts = await Promise.all(targets.map((t) => import('esbuild').then((e) => e.context(t))));
  await Promise.all(contexts.map((c) => c.watch()));
  console.log('esbuild watching...');
} else {
  await Promise.all(targets.map(build));
  // Static assets
  cpSync('src/renderer/index.html', `${outdir}/renderer/index.html`);
  cpSync('src/renderer/export.html', `${outdir}/renderer/export.html`);
  cpSync('node_modules/katex/dist/katex.min.css', `${outdir}/renderer/katex.min.css`);
  cpSync('node_modules/katex/dist/fonts', `${outdir}/renderer/fonts`, { recursive: true });
  console.log('build complete ->', outdir);
}
