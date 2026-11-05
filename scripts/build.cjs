const { build } = require('esbuild');
const { execFileSync } = require('node:child_process');
const { copyFileSync } = require('node:fs');
(async () => {
  for (const [format, outfile] of [['esm', 'dist/index.js'], ['cjs', 'dist/index.cjs']]) {
    await build({ entryPoints: ['src/index.tsx'], bundle: true, external: ['react', 'react-dom'], format, outfile, target: 'es2020', minify: true, sourcemap: true, banner: { js: '"use client";' } });
  }
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--declaration', '--emitDeclarationOnly', '--outDir', 'dist'], { stdio: 'inherit' });
  copyFileSync('dist/index.d.ts', 'dist/index.d.cts');
})().catch(error => { console.error(error); process.exitCode = 1; });
