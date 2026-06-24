/**
 * Rasterise the Katastasi brand SVGs into the PNG icon + OG card, using the cross-product image pipeline
 * (@dloizides/og-image-generator — the C3 "image seam"). SVG is the design source; this emits the sized
 * PNGs sites need (favicon variants, apple-touch-icon, Open Graph card).
 *
 * Run:  npm i -D sharp @dloizides/og-image-generator   then   node site/gen-brand.mjs
 */
import sharp from 'sharp';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SharpRasterizer, generateOgImages, nodeFileSystem } from '@dloizides/og-image-generator';

const here = dirname(fileURLToPath(import.meta.url));
const p = (rel) => resolve(here, rel);

await generateOgImages(
  [
    { src: p('og-card.svg'), dst: p('og-card.png'), width: 1200, height: 630, fit: 'cover' },
    { src: p('katastasi.svg'), dst: p('apple-touch-icon.png'), width: 180, height: 180, fit: 'contain' },
    { src: p('katastasi.svg'), dst: p('android-chrome-512x512.png'), width: 512, height: 512, fit: 'contain' },
    { src: p('katastasi.svg'), dst: p('android-chrome-192x192.png'), width: 192, height: 192, fit: 'contain' },
    { src: p('katastasi.svg'), dst: p('favicon-32x32.png'), width: 32, height: 32, fit: 'contain' },
  ],
  { rasterizer: new SharpRasterizer(sharp), fs: nodeFileSystem, logger: console },
);
console.log('Brand assets generated from the SVG sources.');
