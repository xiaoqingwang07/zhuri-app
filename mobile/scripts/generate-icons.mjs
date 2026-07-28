/**
 * 逐日图标生成器 — D3「破晓」方案
 * 太阳半沉在地平线下,正在升起;深暖色底 + 边缘微光(深色壁纸下保住轮廓)。
 *
 * 产出:
 *   icon.png                    iOS 浅色模式 / 通用(1024, 满幅方形,系统自己切圆角)
 *   icon-dark.png               iOS 深色模式(透明底,系统垫深色)
 *   icon-tinted.png             iOS 着色模式(灰度,系统上色)
 *   android-icon-foreground.png Android 自适应前景(安全区内)
 *   android-icon-background.png Android 自适应背景
 *   android-icon-monochrome.png Android 单色(白色剪影)
 *   splash-icon.png             启动屏太阳(透明底)
 *   favicon.png                 Web favicon
 *
 * 用法: node scripts/generate-icons.mjs
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "images");
mkdirSync(OUT, { recursive: true });

const S = 1024; // 画布尺寸
const HORIZON = 630; // 地平线 y
const SUN_R = 215;

/** 公共渐变定义 */
const DEFS = `
  <linearGradient id="bg" x1="20%" y1="0%" x2="80%" y2="100%">
    <stop offset="0%" stop-color="#3A2A1F"/>
    <stop offset="52%" stop-color="#2A1F18"/>
    <stop offset="100%" stop-color="#1E1712"/>
  </linearGradient>
  <radialGradient id="amb" cx="50%" cy="60%" r="65%">
    <stop offset="0%" stop-color="#FF9550" stop-opacity="0.38"/>
    <stop offset="52%" stop-color="#EE6A2E" stop-opacity="0.13"/>
    <stop offset="100%" stop-color="#EE6A2E" stop-opacity="0.02"/>
  </radialGradient>
  <radialGradient id="core" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#FFD9A2" stop-opacity="0.95"/>
    <stop offset="38%" stop-color="#FFA059" stop-opacity="0.55"/>
    <stop offset="72%" stop-color="#FF7C36" stop-opacity="0.16"/>
    <stop offset="100%" stop-color="#FF7C36" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="sun" x1="35%" y1="0%" x2="65%" y2="100%">
    <stop offset="0%" stop-color="#FFF3DC"/>
    <stop offset="42%" stop-color="#FFC076"/>
    <stop offset="100%" stop-color="#FF7E33"/>
  </linearGradient>
  <linearGradient id="rim" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="#FFF6E4" stop-opacity="0.55"/>
    <stop offset="60%" stop-color="#FFF6E4" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="horiz" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="#FFAE68" stop-opacity="0"/>
    <stop offset="22%" stop-color="#FFC98F" stop-opacity="0.55"/>
    <stop offset="50%" stop-color="#FFDFB4" stop-opacity="0.9"/>
    <stop offset="78%" stop-color="#FFC98F" stop-opacity="0.55"/>
    <stop offset="100%" stop-color="#FFAE68" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="above"><rect x="0" y="0" width="${S}" height="${HORIZON}"/></clipPath>
`;

/** 太阳 + 地平线主体(破晓构图) */
const SUNRISE = `
  <g clip-path="url(#above)">
    <circle cx="512" cy="${HORIZON}" r="430" fill="url(#core)"/>
    <circle cx="512" cy="${HORIZON}" r="${SUN_R}" fill="url(#sun)"/>
    <path d="M341 562 A213 213 0 0 1 683 562 A256 256 0 0 0 341 562 Z" fill="url(#rim)"/>
  </g>
  <rect x="120" y="616" width="784" height="28" rx="14" fill="url(#horiz)"/>
  <rect x="290" y="718" width="444" height="17" rx="8.5" fill="url(#horiz)" opacity="0.35"/>
`;

/** 浅色模式:满幅深底 + 边缘微光描边(圆角略大于 iOS 遮罩,深色壁纸下保轮廓) */
const lightSvg = `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
  <defs>${DEFS}</defs>
  <rect width="${S}" height="${S}" fill="url(#bg)"/>
  <rect width="${S}" height="${S}" fill="url(#amb)"/>
  ${SUNRISE}
  <rect x="26" y="26" width="${S - 52}" height="${S - 52}" rx="218" fill="none"
        stroke="#FFB877" stroke-opacity="0.22" stroke-width="14"/>
</svg>`;

/** 深色模式:透明底,只留发光体(系统会垫自己的深色底) */
const darkSvg = `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
  <defs>${DEFS}</defs>
  ${SUNRISE}
</svg>`;

/** 着色模式:灰度剪影,系统按用户主题色上色 */
const tintedSvg = `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gsun" x1="35%" y1="0%" x2="65%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#B9B9B9"/>
    </linearGradient>
    <linearGradient id="gline" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="50%" stop-color="#FFFFFF" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="gabove"><rect x="0" y="0" width="${S}" height="${HORIZON}"/></clipPath>
  </defs>
  <g clip-path="url(#gabove)">
    <circle cx="512" cy="${HORIZON}" r="${SUN_R}" fill="url(#gsun)"/>
  </g>
  <rect x="120" y="616" width="784" height="28" rx="14" fill="url(#gline)"/>
  <rect x="290" y="718" width="444" height="17" rx="8.5" fill="url(#gline)" opacity="0.4"/>
</svg>`;

/** Android 前景:主体缩到安全区(中心 66%) */
const androidFgSvg = `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
  <defs>${DEFS}</defs>
  <g transform="translate(512 512) scale(0.62) translate(-512 -512)">${SUNRISE}</g>
</svg>`;

const androidBgSvg = `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
  <defs>${DEFS}</defs>
  <rect width="${S}" height="${S}" fill="url(#bg)"/>
  <rect width="${S}" height="${S}" fill="url(#amb)"/>
</svg>`;

/** Android 单色:白色剪影(半日 + 一道线) */
const monoSvg = `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(512 512) scale(0.62) translate(-512 -512)">
    <path d="M297 ${HORIZON} A215 215 0 0 1 727 ${HORIZON} Z" fill="#FFFFFF"/>
    <rect x="120" y="616" width="784" height="30" rx="15" fill="#FFFFFF"/>
  </g>
</svg>`;

/** 启动屏:透明底的发光太阳(浅/深启动背景都能用) */
const splashSvg = darkSvg;

const jobs = [
  ["icon.png", lightSvg, 1024],
  ["icon-dark.png", darkSvg, 1024],
  ["icon-tinted.png", tintedSvg, 1024],
  ["android-icon-foreground.png", androidFgSvg, 1024],
  ["android-icon-background.png", androidBgSvg, 1024],
  ["android-icon-monochrome.png", monoSvg, 1024],
  ["splash-icon.png", splashSvg, 512],
  ["favicon.png", lightSvg, 64],
];

for (const [name, svg, size] of jobs) {
  await sharp(Buffer.from(svg), { density: 300 })
    .resize(size, size)
    .png()
    .toFile(join(OUT, name));
  console.log(`✓ ${name} (${size}x${size})`);
}
console.log("全部图标已生成到 assets/images/");
