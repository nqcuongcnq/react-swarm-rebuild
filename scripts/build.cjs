const { build } = require('esbuild');
const { execFileSync } = require('node:child_process');
const { readdirSync, readFileSync, writeFileSync } = require('node:fs');
(async () => {
  for (const [format, outfile] of [['esm', 'dist/index.js'], ['cjs', 'dist/index.cjs']]) {
    await build({ entryPoints: ['src/index.tsx'], bundle: true, external: ['react', 'react-dom'], format, outfile, target: 'es2020', minify: true, sourcemap: true, banner: { js: '"use client";' } });
  }
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--declaration', '--emitDeclarationOnly', '--outDir', 'dist'], { stdio: 'inherit' });
  // Node16/NodeNext consumers need explicit extensions and separate CJS types.
  for (const name of readdirSync('dist').filter(name => name.endsWith('.d.ts'))) {
    const declaration = readFileSync('dist/' + name, 'utf8');
    const references = /(from\s+['"])(\.\.?\/[^'"]+)(['"])/g;
    writeFileSync('dist/' + name, declaration.replace(references, '$1$2.js$3'));
    writeFileSync('dist/' + name.replace(/\.d\.ts$/, '.d.cts'), declaration.replace(references, '$1$2.cjs$3'));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
