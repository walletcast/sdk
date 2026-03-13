// Build the self-contained connector HTML page.
//
// 1. Bundle src/connector/main.ts with esbuild (IIFE, minified, all deps inlined)
// 2. Read connector/template.html
// 3. Replace CONNECTOR_JS placeholder with the bundled JS
// 4. Write dist/connector.html
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

async function main() {
  // 1. Bundle connector JS
  const result = await build({
    entryPoints: [resolve(root, 'src/connector/main.ts')],
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    write: false,
  });

  const js = result.outputFiles[0].text;

  // 2. Read template
  const template = readFileSync(resolve(root, 'connector/template.html'), 'utf-8');

  // 3. Inline JS
  const html = template.replace('/* CONNECTOR_JS */', js);

  // 4. Write output
  mkdirSync(resolve(root, 'dist'), { recursive: true });
  const outPath = resolve(root, 'dist/connector.html');
  writeFileSync(outPath, html);

  const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`✓ Built connector.html (${sizeKB} KB)`);

  // Copy static files to dist/
  for (const file of ['AGENTS.md', 'SKILL.md']) {
    const src = resolve(root, 'connector', file);
    const dst = resolve(root, 'dist', file);
    try {
      copyFileSync(src, dst);
      console.log(`  Copied ${file}`);
    } catch {
      console.warn(`  Warning: ${file} not found in connector/`);
    }
  }
}

main().catch((err) => {
  console.error('Connector build failed:', err);
  process.exit(1);
});
