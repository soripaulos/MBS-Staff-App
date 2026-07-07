import sharp from "sharp";
import { mkdirSync } from "node:fs";

const svg = (size, radius, pad) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1f814f"/>
      <stop offset="1" stop-color="#0b4229"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
  <text x="50%" y="54%" font-family="Arial, Helvetica, sans-serif" font-weight="800"
        font-size="${size * 0.34}" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">MB</text>
  <text x="50%" y="${size * 0.8}" font-family="Arial, Helvetica, sans-serif" font-weight="600"
        font-size="${size * 0.1}" fill="#e0b64a" text-anchor="middle">STAFF</text>
</svg>`;

mkdirSync("public/icons", { recursive: true });

await sharp(Buffer.from(svg(512, 96))).png().toFile("public/icons/icon-512.png");
await sharp(Buffer.from(svg(192, 36))).png().toFile("public/icons/icon-192.png");
// maskable: full-bleed, no rounding (the platform applies the mask)
await sharp(Buffer.from(svg(512, 0))).png().toFile("public/icons/maskable-512.png");
await sharp(Buffer.from(svg(180, 34))).png().toFile("public/icons/apple-touch-icon.png");
console.log("icons written to public/icons/");
