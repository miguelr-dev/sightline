// Regenerate the approved Open line logo for web, PWA, press, and Expo.
// Uses the SVG renderer already shipped with Next.js; no new dependency needed.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const nextRequire = createRequire(require.resolve('next/package.json'));
const sharp = nextRequire('sharp');
const { path: mark } = JSON.parse(await readFile(path.join(root, 'lib/brand.json'), 'utf8'));
const typeSvg = await readFile(path.join(root, 'public/brand/wordmark-type.svg'), 'utf8');
const typeWidth = Number(typeSvg.match(/viewBox="0 0 ([\d.]+)/)[1]);
const typePaths = typeSvg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const svg = (body, box = '0 0 1024 1024') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${body}</svg>`;
const symbol = (color) => `<path d="${mark}" fill="${color}"/>`;
const icon = (bg = '#000000', fg = '#ffffff', rounded = false) => svg(`<rect width="1024" height="1024" rx="${rounded ? 224 : 0}" fill="${bg}"/><g transform="translate(192 192) scale(6.4)">${symbol(fg)}</g>`);
const foreground = (fg) => svg(`<g transform="translate(192 192) scale(6.4)">${symbol(fg)}</g>`);
async function text(file, value) { await writeFile(path.join(root, file), value + '\n'); }
async function png(file, source, size) { await sharp(Buffer.from(source)).resize(size, size).png().toFile(path.join(root, file)); }
await mkdir(path.join(root, 'public/brand'), { recursive: true });
for (const [name, color] of [['black', '#000000'], ['white', '#ffffff']]) {
  await text(`public/brand/mark-${name}.svg`, svg(symbol(color), '0 0 100 100'));
  const lockup = svg(`<g transform="translate(0 3)">${symbol(color)}</g><g transform="translate(122 10)" fill="${color}">${typePaths}</g>`, `0 0 ${122 + typeWidth} 100`);
  await text(`public/brand/logo-${name}.svg`, lockup);
  await png(`mobile/assets/mark-${name}.png`, svg(symbol(color), '0 0 100 100'), 300);
}
await text('public/brand/app-icon.svg', icon());
await png('public/brand/app-icon-1024.png', icon(), 1024);
await text('public/icons/icon.svg', icon('#000000', '#ffffff', true));
for (const [name, size] of [['icon-192', 192], ['icon-512', 512], ['icon-maskable-512', 512], ['apple-touch-icon', 180]]) {
  await png(`public/icons/${name}.png`, icon(), size);
}
await png('mobile/assets/icon.png', icon(), 1024);
await png('mobile/assets/favicon.png', icon('#000000', '#ffffff', true), 48);
await png('mobile/assets/android-icon-foreground.png', foreground('#ffffff'), 1024);
await png('mobile/assets/android-icon-monochrome.png', foreground('#ffffff'), 1024);
await png('mobile/assets/android-icon-background.png', svg('<rect width="1024" height="1024" fill="#000000"/>'), 1024);
await png('mobile/assets/splash-icon.png', foreground('#000000'), 1024);
// A new vector-based social card, with outlined brand lettering.
const social = svg(`<rect width="1200" height="630" fill="#ffffff"/><rect x="72" y="72" width="144" height="144" rx="32" fill="#000000"/><g transform="translate(99 99) scale(.9)">${symbol('#ffffff')}</g><g transform="translate(252 106) scale(1.45)" fill="#000000">${typePaths}</g><text x="72" y="362" font-family="Arial,Helvetica,sans-serif" font-size="70" font-weight="700" letter-spacing="-2" fill="#000000">Point your camera.</text><text x="72" y="443" font-family="Arial,Helvetica,sans-serif" font-size="70" font-weight="700" letter-spacing="-2" fill="#000000">Hear the world.</text><text x="75" y="537" font-family="Arial,Helvetica,sans-serif" font-size="25" fill="#55555a">Read. Describe. Translate.</text>`, '0 0 1200 630');
await sharp(Buffer.from(social)).resize(1200, 630).png().toFile(path.join(root, 'app/opengraph-image.png'));
await text('app/opengraph-image.alt.txt', 'SightLine Open line logo. Point your camera. Hear the world. Read, describe, translate.');
console.log('Generated Open line assets for website, social previews, PWA, and Expo.');
