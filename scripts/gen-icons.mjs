// One-time icon rasterization: SVG → the PNG set PWAs need.
// Run with: npm run icons   (requires the `sharp` devDependency)
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const svg = await readFile(path.join(root, "public/icons/icon.svg"));
const out = (name) => path.join(root, "public/icons", name);

await sharp(svg).resize(192, 192).png().toFile(out("icon-192.png"));
await sharp(svg).resize(512, 512).png().toFile(out("icon-512.png"));
// Maskable: platforms crop up to ~20% per edge, so shrink the artwork onto a
// full-bleed background.
const inner = await sharp(svg).resize(400, 400).png().toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#2e7d46" },
})
  .composite([{ input: inner, top: 56, left: 56 }])
  .png()
  .toFile(out("icon-maskable-512.png"));
// iOS home-screen icon (no alpha, square — iOS rounds it itself).
await sharp(svg)
  .resize(180, 180)
  .flatten({ background: "#2e7d46" })
  .png()
  .toFile(out("apple-touch-icon.png"));

console.log("icons written to public/icons/");
