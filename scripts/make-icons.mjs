import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";

// Source of truth: generated raster MBS Staff mark in the official school colour language.
const source = readFileSync("public/brand/mbs-staff-icon.png");
mkdirSync("public/icons", { recursive: true });

await sharp(source).resize(512, 512).png().toFile("public/icons/icon-512.png");
await sharp(source).resize(192, 192).png().toFile("public/icons/icon-192.png");
await sharp(source).resize(512, 512).png().toFile("public/icons/maskable-512.png");
await sharp(source).resize(180, 180).png().toFile("public/icons/apple-touch-icon.png");
console.log("MBS Staff icons written to public/icons/");
