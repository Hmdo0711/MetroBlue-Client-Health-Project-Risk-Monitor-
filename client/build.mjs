// Bundles the React app into client/dist with esbuild. `--watch` rebuilds on change.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

fs.mkdirSync(dist, { recursive: true });
const copyStatic = () => {
  fs.copyFileSync(path.join(root, 'index.html'), path.join(dist, 'index.html'));
  fs.copyFileSync(path.join(root, 'src', 'styles.css'), path.join(dist, 'styles.css'));
};

const options = {
  entryPoints: [path.join(root, 'src', 'main.jsx')],
  bundle: true,
  outfile: path.join(dist, 'app.js'),
  format: 'esm',
  jsx: 'automatic',
  target: ['es2022'],
  sourcemap: watch,
  minify: !watch,
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  logLevel: 'info',
  plugins: [{ name: 'copy-static', setup: (b) => b.onEnd(copyStatic) }],
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching client sources…');
} else {
  await esbuild.build(options);
}
