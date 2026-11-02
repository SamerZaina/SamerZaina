// Dragon contribution-eater + Dragon Streak generator
// Builds animated SVGs:
//   1) dist/dragon-snake.svg  (Dragon flying through contribution grid)
//   2) dist/dragon-streak.svg (Cyberpunk dragon streak card)
//
// Usage: GH_USER=SamerZaina GITHUB_TOKEN=xxx node .github/scripts/dragon-snake.mjs
// Local test: MOCK=1 node .github/scripts/dragon-snake.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const USER = process.env.GH_USER || "SamerZaina";
const TOKEN = process.env.GITHUB_TOKEN;
const OUT_SNAKE = process.env.OUT || "dist/dragon-snake.svg";
const OUT_STREAK = process.env.OUT_STREAK || "dist/dragon-streak.svg";

// ---------- theme ----------
const LEVEL_COLORS = ["#1b0d10", "#5a1511", "#a3191a", "#e8321a", "#ff8a1f"];
const EATEN = "#32120f";
const FLASH = "#ffe08a";
const BG = "#0b0709";

// ---------- layout ----------
const PITCH = 15;
const CELL = 12;
const OX = 20;
const OY = 40;
const HEAD_FRAC = 0.9;
const BODY_LEN = 96;

const LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

// ---------- data ----------
function mockWeeks() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const weeks = [];
  for (let w = 0; w < 53; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      if (w === 0 && d < 3) continue;
      if (w === 52 && d > 4) continue;
      const r = rnd();
      const level = r < 0.45 ? 0 : r < 0.7 ? 1 : r < 0.85 ? 2 : r < 0.95 ? 3 : 4;
      days.push({ weekday: d, level, count: level * 3 });
    }
    weeks.push(days);
  }
  return weeks;
}

async function fetchWeeks() {
  if (process.env.MOCK === "1") return mockWeeks();
  if (!TOKEN) throw new Error("GITHUB_TOKEN is not set");
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{weeks{contributionDays{date contributionCount contributionLevel weekday}}}}}}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "dragon-snake" },
    body: JSON.stringify({ query, variables: { login: USER } }),
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const calendar = json.data.user.contributionsCollection.contributionCalendar;
  return calendar.weeks.map((w) =>
    w.contributionDays.map((d) => ({ weekday: d.weekday, level: LEVELS[d.contributionLevel] ?? 0, count: d.contributionCount })),
  );
}

// ---------- build dragon snake ----------
const weeks = await fetchWeeks();
const N = weeks.length;
const W = OX + N * PITCH + 10;
const H = OY + 7 * PITCH + 26;

// cells in flight order
const cells = [];
weeks.forEach((days, c) => {
  const sorted = [...days].sort((a, b) => a.weekday - b.weekday);
  if (c % 2 === 1) sorted.reverse();
  for (const d of sorted) {
    const x = OX + c * PITCH;
    const y = OY + d.weekday * PITCH;
    cells.push({ x, y, cx: x + CELL / 2, cy: y + CELL / 2, level: d.level, count: d.count });
  }
});

let P = 0;
cells.forEach((cell, i) => {
  if (i > 0) P += Math.hypot(cell.cx - cells[i - 1].cx, cell.cy - cells[i - 1].cy);
  cell.s = P;
});

const T = Math.max(12, Math.round((cells.length * 0.055) / HEAD_FRAC));
const fmt = (n) => Number(n.toFixed(3));
const route = cells.map((c, i) => `${i === 0 ? "M" : "L"}${fmt(c.cx)} ${fmt(c.cy)}`).join(" ");
const total = cells.reduce((a, c) => a + c.count, 0);

// streak calculation
const allDays = weeks.flatMap((w) => w);
let longestStreak = 0, currentStreak = 0, temp = 0;
for (const day of allDays) {
  if (day.count > 0) {
    temp++;
    if (temp > longestStreak) longestStreak = temp;
  } else {
    temp = 0;
  }
}
for (let i = allDays.length - 1; i >= 0; i--) {
  if (allDays[i].count > 0) {
    currentStreak++;
  } else if (i === allDays.length - 1) {
    continue;
  } else {
    break;
  }
}

// snake cells
const rects = cells
  .map((c) => {
    const base = LEVEL_COLORS[c.level];
    if (c.level === 0) return `<rect x="${c.x}" y="${c.y}" width="${CELL}" height="${CELL}" rx="3" fill="${base}"/>`;
    const t = fmt((HEAD_FRAC * c.s) / P);
    const t2 = fmt(Math.min(t + 0.008, 0.96));
    return (
      `<rect x="${c.x}" y="${c.y}" width="${CELL}" height="${CELL}" rx="3" fill="${base}">` +
      `<animate attributeName="fill" calcMode="discrete" dur="${T}s" repeatCount="indefinite" ` +
      `keyTimes="0;${t};${t2};0.97;1" values="${base};${FLASH};${EATEN};${base};${base}"/></rect>`
    );
  })
  .join("\n    ");

const dash = () =>
  `<animate attributeName="stroke-dashoffset" dur="${T}s" repeatCount="indefinite" ` +
  `keyTimes="0;${HEAD_FRAC};1" values="${BODY_LEN};${fmt(BODY_LEN - P)};${fmt(BODY_LEN - P)}"/>`;
const dashAttrs = `fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${BODY_LEN} ${fmt(P)}" stroke-dashoffset="${BODY_LEN}"`;

const snakeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="blur" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
    <linearGradient id="edge" x1="0" x2="1">
      <stop offset="0" stop-color="#ff2a2a" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#ff6a1f"/>
      <stop offset="1" stop-color="#ff2a2a" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="aura" cx="50%" cy="60%" r="70%">
      <stop offset="0" stop-color="#ff3a14" stop-opacity="0.14"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="headGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8f0f0b"/>
      <stop offset="1" stop-color="#ff3b1f"/>
    </linearGradient>
    <mask id="bodyMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">
      <path d="${route}" ${dashAttrs} stroke="#fff" stroke-width="9">${dash()}</path>
    </mask>
  </defs>

  <rect width="${W}" height="${H}" rx="16" fill="${BG}"/>
  <rect width="${W}" height="${H}" rx="16" fill="url(#aura)"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="15" fill="none" stroke="#2a0d0d"/>
  <line x1="30" y1="1" x2="${W - 30}" y2="1" stroke="url(#edge)" stroke-width="2"/>
  <line x1="30" y1="${H - 1}" x2="${W - 30}" y2="${H - 1}" stroke="url(#edge)" stroke-width="2"/>

  <text x="${OX}" y="18" font-family="'Courier New',monospace" font-size="11" letter-spacing="3" fill="#ff6a3c">// DRAGON FLIGHT</text>
  <text x="${W - 20}" y="18" text-anchor="end" font-family="'Courier New',monospace" font-size="11" letter-spacing="2" fill="#d8b4a6">${total} CONTRIBUTIONS BURNED</text>

  <g>
    ${rects}
  </g>

  <g>
    <animate attributeName="opacity" dur="${T}s" repeatCount="indefinite" keyTimes="0;0.02;0.95;1" values="0;1;1;0"/>
    <path d="${route}" ${dashAttrs} stroke="#ff4d1f" stroke-width="15" opacity="0.5" filter="url(#blur)">${dash()}</path>
    <path d="${route}" ${dashAttrs} stroke="#b3150e" stroke-width="9">${dash()}</path>
    <path d="${route}" ${dashAttrs} stroke="#ff7a3c" stroke-width="2.5" opacity="0.9">${dash()}</path>
    <g mask="url(#bodyMask)">
      <path d="${route}" fill="none" stroke="#ffb347" stroke-width="9" stroke-dasharray="1.2 6.8" opacity="0.65"/>
    </g>

    <g>
      <animateMotion dur="${T}s" repeatCount="indefinite" rotate="auto" calcMode="linear" keyPoints="0;1;1" keyTimes="0;${HEAD_FRAC};1" path="${route}"/>
      <g transform="translate(22,0)" filter="url(#glow)">
        <g>
          <animateTransform attributeName="transform" type="scale" values="1 1;1.5 1.1;0.9 0.9;1.3 1;1 1" dur="0.5s" repeatCount="indefinite"/>
          <polygon points="0,0 24,-7 15,0 24,7" fill="#ff9a3c"/>
          <polygon points="0,0 13,-3.5 8,0 13,3.5" fill="#ffe08a"/>
        </g>
      </g>
      <polygon points="-6,-7 -17,-17 -12,-5" fill="#3a0f0c" stroke="#ff7a3c" stroke-width="0.8"/>
      <polygon points="-6,7 -17,17 -12,5" fill="#3a0f0c" stroke="#ff7a3c" stroke-width="0.8"/>
      <polygon points="-9,-8 5,-10 15,-6 22,-2.2 22,2.2 15,6 5,10 -9,8 -13,0" fill="url(#headGrad)" stroke="#ffb347" stroke-width="0.9" filter="url(#glow)"/>
      <circle cx="8" cy="-5" r="2.3" fill="#ffe08a"><animate attributeName="opacity" values="0.6;1;0.6" dur="1.2s" repeatCount="indefinite"/></circle>
      <circle cx="8" cy="5" r="2.3" fill="#ffe08a"><animate attributeName="opacity" values="0.6;1;0.6" dur="1.2s" repeatCount="indefinite"/></circle>
      <circle cx="19" cy="-1.3" r="0.9" fill="#2a0808"/>
      <circle cx="19" cy="1.3" r="0.9" fill="#2a0808"/>
    </g>
  </g>
</svg>
`;

// ---------- build dragon streak card ----------
const streakSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="170" viewBox="0 0 820 170">
  <defs>
    <filter id="sglow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="stxt" x1="0" x2="1">
      <stop offset="0" stop-color="#ff2a2a"/>
      <stop offset="1" stop-color="#ff9a3c"/>
    </linearGradient>
    <linearGradient id="sedge" x1="0" x2="1">
      <stop offset="0" stop-color="#ff2a2a" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#ff6a1f"/>
      <stop offset="1" stop-color="#ff2a2a" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="saura" cx="50%" cy="50%" r="60%">
      <stop offset="0" stop-color="#ff3a14" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#0b0709" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="820" height="170" rx="16" fill="#0b0709"/>
  <rect width="820" height="170" rx="16" fill="url(#saura)"/>
  <rect x="1" y="1" width="818" height="168" rx="15" fill="none" stroke="#2a0d0d"/>
  <line x1="30" y1="1" x2="790" y2="1" stroke="url(#sedge)" stroke-width="2"/>
  <line x1="30" y1="169" x2="790" y2="169" stroke="url(#sedge)" stroke-width="2"/>

  <!-- Col 1: Total Contributions -->
  <g transform="translate(136, 0)">
    <text x="0" y="42" text-anchor="middle" font-family="'Courier New',monospace" font-size="12" letter-spacing="3" fill="#ff6a3c">TOTAL CONTRIBUTIONS</text>
    <text x="0" y="98" text-anchor="middle" font-family="'Courier New',monospace" font-size="42" font-weight="bold" letter-spacing="2" fill="url(#stxt)" filter="url(#sglow)">${total}</text>
    <text x="0" y="132" text-anchor="middle" font-family="'Courier New',monospace" font-size="11" letter-spacing="2" fill="#d8b4a6">PAST YEAR</text>
  </g>

  <!-- Divider 1 -->
  <line x1="273" y1="30" x2="273" y2="140" stroke="#2a0d0d" stroke-width="1.5" stroke-dasharray="6 6"/>

  <!-- Col 2: Current Streak (Centerpiece) -->
  <g transform="translate(410, 0)">
    <g transform="translate(0, 36)" filter="url(#sglow)">
      <path d="M0,-16 C3,-11 5,-9 4,-5 C3,-1 1,0 0,0 C-3,0 -5,-2 -3,-6 C-2,-8 -1,-8 0,-12 Z" fill="#ff3b1f"/>
      <path d="M0,-9 C2,-7 2,-4 1,-2 C0,-1 -1,-1 -1,-2 C-2,-4 -1,-6 0,-9 Z" fill="#ffd27a"/>
    </g>
    <text x="0" y="52" text-anchor="middle" font-family="'Courier New',monospace" font-size="13" font-weight="bold" letter-spacing="4" fill="#ff5a2e">CURRENT STREAK</text>
    <text x="0" y="105" text-anchor="middle" font-family="'Courier New',monospace" font-size="48" font-weight="bold" letter-spacing="2" fill="#ff8a1f" filter="url(#sglow)">${currentStreak}</text>
    <text x="0" y="136" text-anchor="middle" font-family="'Courier New',monospace" font-size="12" font-weight="bold" letter-spacing="3" fill="#ff7a3c">DAYS IN A ROW</text>
  </g>

  <!-- Divider 2 -->
  <line x1="547" y1="30" x2="547" y2="140" stroke="#2a0d0d" stroke-width="1.5" stroke-dasharray="6 6"/>

  <!-- Col 3: Longest Streak -->
  <g transform="translate(684, 0)">
    <text x="0" y="42" text-anchor="middle" font-family="'Courier New',monospace" font-size="12" letter-spacing="3" fill="#ff6a3c">LONGEST STREAK</text>
    <text x="0" y="98" text-anchor="middle" font-family="'Courier New',monospace" font-size="42" font-weight="bold" letter-spacing="2" fill="url(#stxt)" filter="url(#sglow)">${longestStreak}</text>
    <text x="0" y="132" text-anchor="middle" font-family="'Courier New',monospace" font-size="11" letter-spacing="2" fill="#d8b4a6">RECORD STREAK</text>
  </g>

  <rect x="30" y="160" width="80" height="2" fill="#ff5a2a" filter="url(#sglow)">
    <animate attributeName="x" values="30;710;30" dur="5s" repeatCount="indefinite"/>
  </rect>
</svg>`;

// write files
mkdirSync(dirname(OUT_SNAKE), { recursive: true });
writeFileSync(OUT_SNAKE, snakeSvg);
console.log(`Dragon snake written to ${OUT_SNAKE} (${cells.length} cells, ${N} weeks, loop ${T}s, ${(snakeSvg.length / 1024).toFixed(0)} KB)`);

mkdirSync(dirname(OUT_STREAK), { recursive: true });
writeFileSync(OUT_STREAK, streakSvg);
console.log(`Dragon streak written to ${OUT_STREAK} (Total: ${total}, Current: ${currentStreak}, Longest: ${longestStreak})`);
