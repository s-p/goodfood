// One-time icon rasterization: SVG → the PNG set PWAs need.
// Run with: npm run icons   (requires the `sharp` devDependency)
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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

// ---- native iOS app assets (skipped until `npx cap add ios` has run) ----
const iosAssets = path.join(root, "ios/App/App/Assets.xcassets");
if (existsSync(iosAssets)) {
  // App icon: full-bleed square (iOS applies its own corner mask), so strip
  // the artwork's rounded corners to avoid odd slivers under Apple's mask.
  const fullBleed = svg.toString().replace('rx="116"', 'rx="0"');
  await sharp(Buffer.from(fullBleed))
    .resize(1024, 1024)
    .flatten({ background: "#2e7d46" })
    .png()
    .toFile(path.join(iosAssets, "AppIcon.appiconset/AppIcon-512@2x.png"));

  // Launch screen: brand-green canvas with the plate artwork centered.
  // (One square image, aspect-filled by LaunchScreen.storyboard.)
  const art = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <circle cx="256" cy="256" r="148" fill="none" stroke="#ffffff" stroke-opacity="0.92" stroke-width="22"/>
    <circle cx="256" cy="256" r="104" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="8"/>
    <path d="M281 148 L195 272 h52 l-22 92 96 -132 h-54 z" fill="#ffffff"/>
  </svg>`;
  const artPng = await sharp(Buffer.from(art)).resize(720, 720).png().toBuffer();
  const splash = await sharp({
    create: { width: 2732, height: 2732, channels: 4, background: "#2e7d46" },
  })
    .composite([{ input: artPng, gravity: "center" }])
    .png()
    .toBuffer();
  for (const name of [
    "splash-2732x2732.png",
    "splash-2732x2732-1.png",
    "splash-2732x2732-2.png",
  ]) {
    await writeFile(path.join(iosAssets, "Splash.imageset", name), splash);
  }
  console.log("iOS app icon + splash written to ios/App/App/Assets.xcassets/");
}
