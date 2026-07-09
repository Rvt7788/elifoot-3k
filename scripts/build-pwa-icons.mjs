// Gera os ícones do PWA a partir de favicon.png (logo do jogo), incluindo a
// variante "maskable" com respiro (safe zone) para Android adaptive icons.
import sharp from "sharp";
import path from "node:path";
import { mkdirSync } from "node:fs";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "favicon.png");
const outDir = path.join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

const sizes = [192, 512];

for (const size of sizes) {
  await sharp(src)
    .resize(size, size, { fit: "cover" })
    .png()
    .toFile(path.join(outDir, `icon-${size}.png`));
}

// Maskable: logo centralizada ocupando ~70% do canvas, fundo sólido escuro
// (combina com o tema do jogo) para não cortar em formatos de ícone circulares.
for (const size of sizes) {
  const inner = Math.round(size * 0.7);
  const logo = await sharp(src).resize(inner, inner, { fit: "cover" }).png().toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 10, g: 14, b: 20, alpha: 1 },
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(outDir, `maskable-${size}.png`));
}

// Favicon simples pra aba do navegador
await sharp(src).resize(32, 32, { fit: "cover" }).png().toFile(path.join(root, "public", "favicon.png"));

console.log("OK: ícones do PWA gerados em public/icons/");
