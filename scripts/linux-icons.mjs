// Набор значков для Linux (build/icons/NNxNN.png) из build/icon.png. Нужен ImageMagick (convert или magick).
// Запуск: npm run icons:linux — после смены логотипа в build/icon.png.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'build', 'icon.png');
const out = join(root, 'build', 'icons');
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

mkdirSync(out, { recursive: true });
const tool = ['magick', 'convert'].find((t) => spawnSync(t, ['-version']).status === 0);
if (!tool) {
  console.error('Не найден ImageMagick (magick или convert)');
  process.exit(1);
}
for (const n of SIZES) {
  const file = join(out, `${n}x${n}.png`);
  const r = spawnSync(tool, [src, '-filter', 'Lanczos', '-resize', `${n}x${n}`, '-strip', file], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log('→', file);
}
