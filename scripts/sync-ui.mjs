import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'ui', 'dist');
const uiDir = path.join(rootDir, 'ui');

if (fs.existsSync(distDir)) {
  const files = fs.readdirSync(distDir);
  for (const f of files) {
    const src = path.join(distDir, f);
    const dest = path.join(uiDir, f);
    if (f === 'assets') {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      const assets = fs.readdirSync(src);
      for (const a of assets) {
        fs.copyFileSync(path.join(src, a), path.join(dest, a));
      }
    } else if (f === 'index.html') {
      fs.copyFileSync(src, dest);
    }
  }
  process.stdout.write('✓ UI 构建产物已双向同构同步至 ui/ 根目录\n');
}
