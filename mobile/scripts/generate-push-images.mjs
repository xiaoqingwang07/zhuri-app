/**
 * 推送通知配图生成器 —— 与 lib/sunState.ts 的五个阶段一一对应。
 *
 * iOS 推送附件展开后是横幅,用 2:1 构图;太阳高度对应 SunState.altitude。
 * 产出 assets/images/push-<phase>.png
 *
 * 用法: node scripts/generate-push-images.mjs
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "images");
mkdirSync(OUT, { recursive: true });

const W = 1038;
const H = 519;
const HORIZON = Math.round(H * 0.72);
const SUN_R = 108;
const TRAVEL = 250;

// 与 sunState.ts 的 LIGHT 调色板保持一致(推送图固定用亮色版,深色底也好看)
const PHASES = {
  night: {
    altitude: 0,
    glow: 0.14,
    sky: ["#3B3550", "#5C4A55"],
    sun: ["#8C7E96", "#6E6280"],
    ground: "#241F2E",
    horizon: "#7A6A78",
  },
  dusk: {
    altitude: 0.22,
    glow: 0.32,
    sky: ["#6B5A72", "#C77F63"],
    sun: ["#FFC98F", "#E8763F"],
    ground: "#3A2C33",
    horizon: "#E0906A",
  },
  dawn: {
    altitude: 0.42,
    glow: 0.58,
    sky: ["#FFC9A0", "#FFE6CC"],
    sun: ["#FFF3DC", "#FF9A4D"],
    ground: "#7A4B34",
    horizon: "#FFD1A3",
  },
  rising: {
    altitude: 0.72,
    glow: 0.82,
    sky: ["#FFB877", "#FFF0DC"],
    sun: ["#FFF8E8", "#FFA24D"],
    ground: "#8A5638",
    horizon: "#FFE0B8",
  },
  noon: {
    altitude: 0.95,
    glow: 1,
    sky: ["#FFCE7A", "#FFF6E4"],
    sun: ["#FFFDF4", "#FFC24D"],
    ground: "#9A6540",
    horizon: "#FFEBC4",
  },
};

function svgFor(p) {
  const cy = HORIZON + SUN_R * 0.85 - p.altitude * TRAVEL;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${p.sky[0]}"/>
      <stop offset="100%" stop-color="${p.sky[1]}"/>
    </linearGradient>
    <linearGradient id="sun" x1="35%" y1="0%" x2="65%" y2="100%">
      <stop offset="0%" stop-color="${p.sun[0]}"/>
      <stop offset="100%" stop-color="${p.sun[1]}"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${p.sun[0]}" stop-opacity="${p.glow * 0.7}"/>
      <stop offset="45%" stop-color="${p.sun[1]}" stop-opacity="${p.glow * 0.28}"/>
      <stop offset="100%" stop-color="${p.sun[1]}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="above"><rect x="0" y="0" width="${W}" height="${HORIZON}"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <g clip-path="url(#above)">
    <circle cx="${W / 2}" cy="${cy}" r="${SUN_R * 3.4}" fill="url(#halo)"/>
    <circle cx="${W / 2}" cy="${cy}" r="${SUN_R}" fill="url(#sun)"/>
  </g>
  <rect x="0" y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="${p.ground}"/>
  <rect x="0" y="${HORIZON - 2}" width="${W}" height="4" fill="${p.horizon}" opacity="0.85"/>
</svg>`;
}

for (const [phase, palette] of Object.entries(PHASES)) {
  const name = `push-${phase}.png`;
  await sharp(Buffer.from(svgFor(palette)), { density: 200 })
    .png()
    .toFile(join(OUT, name));
  console.log(`✓ ${name}`);
}
console.log("推送配图已生成");
