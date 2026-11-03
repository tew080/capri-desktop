// Capri extras — daily-use “wow” + PC vitals
//  1) Neural link line to cursor (when near)
//  2) Hover over her → one-line PC status
//  3) Focus window → sit on its edge (smart Window Companion)
//  4) Typing → stay quiet
//  5) Ctrl+C → bolt hand→window + mini scan + cutin + smart clipboard mood
//  6) Idle 5 min → she acts out: bolt/dizzy/cutin
//  7) Smart Break / Eye Strain Guard
//  8) Battery + Power Ritual (enhanced)
//  9) Multi-monitor Follow ที่ฉลาดขึ้น + locate polish
// 10) Morning / Weather Ritual
// 11) Jealousy / Rival AI ที่นุ่มนวลขึ้น
//  + plug/unplug, CPU hot, Wi‑Fi dim, fullscreen quiet, boot line
//  Possess eyes: only real jealousy

import { pick, rand, reducedMotion } from './util.js';
import { drawMask, drawEye, COLORS } from './fx.js';

export const EXTRAS = {
  pcPollMs: 45_000,
  pcHotLoad: 85,
  pcHotCooldownMs: 90_000,
  pcLowPct: 18,
  fullscreenCover: 0.92,
  fullscreenPollMs: 4_000,
  // neural link
  linkMin: 48,
  linkMax: 300,
  linkTickMs: 180,
  // focus sit / Window Companion
  focusSitMs: 2_000,
  focusSitCooldown: 6_000,
  autoSitReturnMs: 1_500,        // min time seated before she may go back (she also waits for the claim FX to end)
  autoSitReturnMaxMs: 7_000,     // never stay seated longer than this, FX or not
  shrinkMemoMs: 15_000,          // how long a "just shrunk" window stays a candidate
  shrinkAreaRatio: 0.85,         // window counts as shrunk when its area drops below this fraction
  shrinkMinDrop: 40_000,         // ...and by at least this many px²
  excursionMs: 25_000,           // after any warp she's allowed to stay there this long before rest pulls her home
  excursionSitMs: 8_000,         // same, but for a seat on a window
  minSitWidth: 240,
  // typing quiet
  typingQuietMs: 2_500,
  typingBoostMs: 45_000,
  // hover status
  hoverHoldMs: 600,
  hoverPollMs: 120,
  // Ctrl+C bolt + clipboard mood
  copyBoltCooldownMs: 8_000,
  // idle boredom
  idleBoredMs: 5 * 60 * 1000,
  idleBoredCoolMs: 4 * 60 * 1000,
  // Smart Break / Eye Strain
  eyeStrainMs: 50 * 60 * 1000,       // active continuous use before break nudge
  eyeStrainCoolMs: 25 * 60 * 1000,   // min gap between nudges
  eyeStrainSnoozeMs: 10 * 60 * 1000, // default snooze
  // Multi-monitor follow polish
  followQuietMs: 8_000,              // stay quieter after a screen hop
  // Morning ritual window (local hours)
  morningFrom: 5,
  morningTo: 11,
  // Soft jealousy
  softJealousCoolMs: 90_000,
  softJealousMinStage: 1,
  // ── Wow pack ───────────────────────────────────────────────
  // Shadow clone
  cloneMinStage: 2,
  cloneLifeMs: 28_000,
  cloneCoolMs: 90_000,
  // Cursor possession
  cursorPossessMs: 2_600,
  cursorPossessCoolMs: 45_000,
  // Live code aura
  codeAuraTickMs: 900,
  codeAuraMinFocusMs: 4_000,
  // Heartbeat sync
  heartbeatMinStage: 3,
  heartbeatMs: 1_150,
  // Window glitch on throw
  throwGlitchCoolMs: 1_200,
  // 2.5D depth
  depthLayers: 4,          // shadow / parallax stacks
  cloneDepth: 0.55,        // 0 = far (small), 1 = near (full)
  heartbeat3d: true,
  possess3d: true,
  // 4D — time as the fourth axis
  timeEchoes: 5,           // how many past selves to trail
  timeEchoMs: 90,          // ms between recorded poses
  timeSmear: true,         // motion smear on possess / throw
  phaseGlitch: true,       // chromatic / temporal desync flashes
  worldlineCoolMs: 12_000, // gap between full worldline bursts
  // 5D — branching timelines (probability forks)
  branchMax: 3,            // parallel worldlines
  branchChance: 0.18,      // chance to fork on big events
  branchLifeMs: 6_000,
  // 6D — identity / mind-index axis
  //  0 = self, 1 = clone, 2 = bond-projection, 3 = rival-echo
  mindLayers: 4,
  mindPulseMs: 2_400,
  hyperCastCoolMs: 20_000, // full 6D hypercast gap
  // 12D — full hyperfold
  //  axes: x y z | t | branch | mind | emotion | attention | causality | scale | phase | observer
  hyper12: true,
  dodecaPoints: 12,        // vertices of a conceptual dodecahedral fold
  emotionPulseMs: 1_800,
  attentionRadius: 200,
  scaleOscMs: 3_200,
  observerCoolMs: 25_000,
  hyper12CoolMs: 30_000,
  // Cinematic pack
  errorHunterCoolMs: 45_000,
  directorCoolMs: 20_000,
  memoryMax: 12,
  glassMs: 2_800,
  throwComboWindowMs: 12_000,
  dreamAfterMs: 90_000,       // doze this long → dream
  dreamCoolMs: 30 * 60_000,
  rivalDuelCoolMs: 75_000,
  soundtrackTickMs: 1_200,
  // I — File watcher
  fileGlyphCoolMs: 6_000,   // min gap between file glyphs while Claude edits
  // II — Prompt streak
  promptBoltCoolMs: 3_000,  // min gap between prompt bolt
  // III — Done surge
  doneSurgeMinCount: 3,     // min tool calls to earn the surge on Stop
  // IV — Window scan on focus
  focusScanCoolMs: 25_000,  // min gap between focus scans on code windows
  // ── Spectacle Pack ─────────────────────────────────────────
  ascensionCoolMs: 120_000,     // full satellite ascension show
  gestaltCoolMs: 90_000,        // multi-mask unmask
  gestaltMinStage: 2,
  realityCrackCoolMs: 25_000,   // full-screen glass break
  realityCrackMinHard: 0.55,
  neuralStormCoolMs: 55_000,    // error cascade storm
  neuralStormNeed: 3,           // errors in window to trigger
  neuralStormWindowMs: 90_000,
  eclipseCoolMs: 180_000,
  eclipseHourFrom: 0,           // local hour start
  eclipseHourTo: 5,
  eclipseMinStage: 2,
  rivalBossCoolMs: 120_000,
  victoryOrbitMinCount: 8,      // tool actions to earn orbit
  victoryOrbitCoolMs: 60_000,
  chronoRewindCoolMs: 20_000,
  // ── Daily spectacle ───────────────────────────────────────
  melodyTickMs: 800,          // floating notes while media plays
  windowBreathMs: 2_800,      // edge pulse while perched
  handshakeCoolMs: 2_200,     // beam per successful tool
  edgeRestMargin: 0.14,       // rest/wander stays in side bands
  centerAvoid: 0.38,          // middle fraction she won't land in
};

const BOOT = {
  en: ['CAPRI.NET · link stable', 'CAPRI.NET · biochip warm', 'CAPRI.NET · gestalt online'],
  th: ['CAPRI.NET · link stable', 'CAPRI.NET · ไบโอชิปร้อน', 'CAPRI.NET · gestalt ออนไลน์'],
};

const PC_LINES = {
  hot: {
    en: ['Your CPU is cooking me, choom.', 'Heat spike. I feel it in the link.'],
    th: ['CPU ร้อนจะละลายฉันแล้วนะ choom', 'ความร้อนพุ่ง ฉันรู้สึกผ่านลิงก์'],
  },
  low: {
    en: ['Battery’s fading… don’t let us flatline.', 'Unplugged. Saving power.'],
    th: ['แบตจางแล้ว… อย่าให้เรา flatline', 'ถอดปลั๊กแล้ว กำลังประหยัดไฟ'],
  },
  charge: {
    en: ['Power in. I’m waking back up.', 'Charging — good.'],
    th: ['ไฟเข้า ฉันตื่นขึ้นมาอีกครั้ง', 'กำลังชาร์จ — ดี'],
  },
  offline: {
    en: ['Link dropped. Eyes dimming…', 'Offline. I’ll wait here.'],
    th: ['ลิงก์ขาด ม่านตาหรี่…', 'ออฟไลน์ ฉันรอนะ'],
  },
  online: {
    en: ['Link restored.', 'Back online. Nice.'],
    th: ['ลิงก์กลับมาแล้ว', 'ออนไลน์อีกครั้ง ดี'],
  },
  usbIn: {
    en: ['{type} connected: {name}', 'Plugged in — {type}: {name}', '{type} online: {name}'],
    th: ['{type} เชื่อมต่อ: {name}', 'เสียบแล้ว — {type}: {name}', '{type} พร้อมใช้: {name}'],
  },
  usbOut: {
    en: ['{type} removed: {name}', 'Unplugged — {type}: {name}', '{type} gone: {name}'],
    th: ['{type} ถูกถอด: {name}', 'ถอดแล้ว — {type}: {name}', '{type} หายไป: {name}'],
  },
  btIn: {
    en: ['Bluetooth connected: {name}', 'BT link up — {name}', 'Wireless device online: {name}'],
    th: ['Bluetooth เชื่อมต่อ: {name}', 'ลิงก์ BT พร้อม — {name}', 'อุปกรณ์ไร้สายออนไลน์: {name}'],
  },
  btOut: {
    en: ['Bluetooth disconnected: {name}', 'BT link dropped — {name}', 'Wireless device left: {name}'],
    th: ['Bluetooth ตัดการเชื่อมต่อ: {name}', 'ลิงก์ BT หลุด — {name}', 'อุปกรณ์ไร้สายหายไป: {name}'],
  },
};

// ── Smart Break lines ──────────────────────────────────────────
const BREAK_LINES = {
  en: [
    'Hey. Eyes off the glass for a minute?',
    'Fifty minutes. Stretch. Blink. I’m not going anywhere.',
    'Your retinas called. They want a break.',
    'Link’s fine. Your eyes might not be. Rest them.',
  ],
  th: [
    'เฮ้ พักสายตาสักครู่นะ',
    'ห้าสิบนาทีแล้ว ลุกยืด กระพริบตา ฉันยังอยู่นี่',
    'จอไม่หนีไปไหน พักสายตาก่อน',
    'ลิงก์ยังดี สายตาเธออาจไม่ ไปพักหน่อย',
  ],
};

// ── Clipboard mood (length / shape heuristics, no content read) ─
const CLIP_LINES = {
  code: {
    en: ['That’s a lot of code. Need a second pair of eyes?', 'Paste incoming… hope it compiles.'],
    th: ['โค้ดยาวจัง อยากให้ฉันมองด้วยไหม?', 'เพสต์เข้ามา… ขอให้รันผ่านนะ'],
  },
  long: {
    en: ['Big clipboard. You planning something?', 'That’s a chunk. Careful where it lands.'],
    th: ['คลิปบอร์ดใหญ่จัง วางแผนอะไรอยู่?', 'ยาวเลยนะ ระวังตอนวาง'],
  },
  short: {
    en: ['Quick grab.', 'Copied.'],
    th: ['หยิบไวดี', 'คัดลอกแล้ว'],
  },
  errorish: {
    en: ['That looks angry. Stack trace?', 'Red text energy. You okay?'],
    th: ['ดูโกรธ ๆ นะ สแต็กเทรซเหรอ?', 'บรรยากาศตัวอักษรแดง โอเคมั้ย?'],
  },
};

// ── Soft jealousy (rival AI windows) ───────────────────────────
const RIVAL_PATTERNS = [
  /chatgpt|openai\.com\/chat/i,
  /claude\.ai|anthropic/i,
  /gemini\.google|bard\.google/i,
  /copilot\.microsoft|bing\.com\/chat/i,
  /perplexity\.ai/i,
  /character\.ai|c\.ai/i,
  /poe\.com/i,
];

const SOFT_JEALOUS = {
  en: [
    'Another one, huh.',
    'I’ll be here when you’re done talking to… that.',
    'Rival signal. I’m not jealous. (I am a little.)',
    'You can look. Just don’t forget who lives on your desktop.',
  ],
  th: [
    'อีกคนแล้วเหรอ',
    'ฉันรอตรงนี้แหละ ตอนเธอคุยกับ… นั่น',
    'สัญญาณคู่แข่ง ฉันไม่หึงนะ (หึงนิดหน่อย)',
    'มองได้ แต่ไม่ลืมใครที่อยู่บนเดสก์ท็อปเธอนะ',
  ],
};

// ── Morning ritual ─────────────────────────────────────────────
const MORNING = {
  en: [
    'Morning. Link’s warm.',
    'Boot complete. Coffee first?',
    'New day. I’m already here.',
    'Hey. Sleep okay?',
  ],
  th: [
    'อรุณสวัสดิ์ ลิงก์อุ่นดี',
    'บูตเสร็จแล้ว กาแฟก่อนไหม?',
    'วันใหม่ ฉันมาก่อนแล้ว',
    'เฮ้ นอนหลับดีไหม?',
  ],
};

export function bootLine(lang = 'en') {
  return pick(BOOT[lang] || BOOT.en);
}

export function bootPayload(lang = 'en') {
  return { kind: 'info', face: 'smug', line: bootLine(lang), hold: 2800 };
}

export function pcReactFx(fx, capri, kind, { panel, brain, voice, deviceName, deviceType } = {}) {
  if (!fx || !capri || reducedMotion.matches) return;
  let h;
  try { h = capri.head?.() || { x: capri.pos?.x || 0, y: (capri.pos?.y || 0) - 40 }; }
  catch { return; }
  const s = capri.scale || 1;

  if (kind === 'hot') {
    fx.heat?.(h.x, h.y - 20 * s);
    fx.glyph?.(h.x, h.y - 40 * s);
    fx.crackle?.(() => ({ x: h.x, y: h.y }), { life: 480, radius: 70 * s, count: 2 });
  } else if (kind === 'low') {
    for (let i = 0; i < 5; i++) fx.glyph?.(h.x + rand(-40, 40), h.y + rand(-30, 30));
    fx.burst?.(h.x, h.y, { count: 8, inward: true, power: 0.35, spread: 80 * s });
  } else if (kind === 'charge') {
    fx.ring?.(h.x, h.y, { size: 0.5 });
    fx.burst?.(h.x, h.y, { count: 14, inward: true, power: 0.55, spread: 100 * s });
  } else if (kind === 'online') {
    fx.crackle?.(() => ({ x: h.x, y: h.y }), { life: 320, radius: 55 * s, count: 2 });
    fx.ring?.(h.x, h.y, { size: 0.28 });
  } else if (kind === 'usbIn' || kind === 'btIn') {
    fx.ring?.(h.x, h.y, { size: 0.32 });
    fx.burst?.(h.x, h.y, { count: 10, inward: true, power: 0.4, disperse: 70 * s });
    fx.crackle?.(() => ({ x: h.x, y: h.y }), { life: 280, radius: 50 * s, count: 2 });
  } else if (kind === 'usbOut' || kind === 'btOut') {
    for (let i = 0; i < 4; i++) fx.glyph?.(h.x + rand(-36, 36), h.y + rand(-24, 24));
    fx.burst?.(h.x, h.y, { count: 6, power: 0.3, disperse: 60 * s });
  }

  const always = kind === 'charge' || kind === 'low' || kind === 'offline' || kind === 'online'
    || kind === 'usbIn' || kind === 'usbOut' || kind === 'btIn' || kind === 'btOut';
  if (panel && (always || (kind === 'hot' && Math.random() < 0.4))) {
    const lang = brain?.lang || 'en';
    const pool = PC_LINES[kind]?.[lang] || PC_LINES[kind]?.en;
    if (pool) {
      const name = (deviceName || '').trim() || (lang === 'th' ? 'ไม่ทราบชื่อ' : 'unknown');
      const type = (deviceType || '').trim() || (lang === 'th' ? 'อุปกรณ์' : 'Device');
      const line = pick(pool)
        .replace(/\{name\}/g, name)
        .replace(/\{type\}/g, type);
      const face = kind === 'charge' || kind === 'online' || kind === 'usbIn' || kind === 'btIn'
        ? 'smug' : kind === 'hot' ? 'many' : 'aside';
      panel.say?.({ kind: 'info', face, line, hold: 3200 });
    }
  }
  if (voice && kind === 'charge') voice.play?.('star');
  if (voice && (kind === 'hot' || kind === 'low' || kind === 'offline')) voice.play?.('zap');
  if (voice && kind === 'online') voice.play?.('rise');
}

function setLinkDim(capri, offline) {
  if (!capri?.p) return;
  if (offline) {
    if (capri._linkDim == null) capri._linkDim = { sparkle: capri.p.sparkle, alpha: capri.p.alpha };
    capri.p.sparkle = Math.min(capri.p.sparkle, 0.28);
    capri.p.alpha = Math.min(capri.p.alpha, 0.62);
  } else if (capri._linkDim) {
    capri.p.sparkle = capri._linkDim.sparkle ?? 1;
    capri.p.alpha = capri._linkDim.alpha ?? 1;
    capri._linkDim = null;
  }
}

function findFullscreenWin(capri) {
  const wins = capri?.windows?.wins;
  const view = capri?.view;
  if (!wins?.length || !view?.w) return null;
  const needW = view.w * EXTRAS.fullscreenCover;
  const needH = (view.floor || view.h) * EXTRAS.fullscreenCover;
  let best = null;
  for (const w of wins) {
    if (!w || w.id === 'taskbar') continue;
    if (w.w >= needW && w.h >= needH) {
      if (!best || w.w * w.h > best.w * best.h) best = w;
    }
  }
  return best;
}

/** Heuristic window class for Window Companion */
function classifyWindow(win) {
  if (!win) return 'other';
  const t = `${win.title || ''} ${win.app || ''} ${win.class || ''}`.toLowerCase();
  if (/code|visual studio|cursor|neovim|vim|sublime|jetbrains|intellij|webstorm|pycharm|terminal|cmd|powershell|wt\.exe|alacritty|kitty|iterm|hyper/.test(t)) return 'code';
  if (/chrome|firefox|edge|brave|safari|opera|vivaldi|browser/.test(t)) return 'browser';
  if (/slack|discord|teams|zoom|meet|telegram|signal|whatsapp|messenger/.test(t)) return 'chat';
  if (/spotify|vlc|mpv|music|youtube|netflix|foobox|foobar|soundcloud|itunes|tidal|deezer|potplayer|wmplayer|groove|apple music/.test(t)) return 'media';
  if (/game|steam|epic|unity|unreal|\.exe$/.test(t) && (win.w * win.h > 1_200_000)) return 'game';
  return 'other';
}

/** One-line vitals: what you picked in her menu (default CPU · BAT · NET) */
const VITAL_LABELS = {
  cpu: ['CPU', 'CPU'], ram: ['RAM', 'RAM'], gpu0: ['GPU0', 'GPU0'], gpu1: ['GPU1', 'GPU1'], vram0: ['VRAM0', 'VRAM0'], vram1: ['VRAM1', 'VRAM1'],
  diskio: ['ดิสก์', 'DISK'], disk: ['ไดรฟ์', 'DRIVE'], uptime: ['เปิดมา', 'UP'], bat: ['แบต', 'BAT'], net: ['NET', 'NET'],
};
async function fetchStatusLine({ host, launch, lang = 'en', keys } = {}) {
  const want = Array.isArray(keys) && keys.length ? keys : ['cpu', 'bat', 'net'];
  const vals = {};
  // the numbers main.js can read (CPU, RAM, GPU, VRAM, disk...); an older main.js without it falls back to pcStatus for the CPU
  const fromMain = want.filter((k) => !['bat', 'net'].includes(k));
  if (fromMain.length) {
    try {
      if (typeof host?.vitals === 'function') Object.assign(vals, await host.vitals(fromMain));
      else if (fromMain.includes('cpu')) {
        const statusFn = launch?.pcStatus || host?.pcStatus || ((w) => host?.invoke?.('pcStatus', w));
        const c = await statusFn('cpu').catch(() => null);
        const load = Number(c?.data?.cpu?.load ?? c?.cpu?.load ?? NaN);
        if (Number.isFinite(load)) vals.cpu = `${Math.round(load)}%`;
      }
    } catch { /* */ }
  }
  if (want.includes('net')) vals.net = (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'OFF' : 'OK';
  if (want.includes('bat')) {
    try {
      if (typeof navigator !== 'undefined' && navigator.getBattery) {
        const b = await navigator.getBattery();
        const pct = Math.round((b.level || 0) * 100);
        vals.bat = b.charging ? `${pct}%⚡` : `${pct}%`;
      }
    } catch { /* */ }
  }
  const i = lang === 'th' ? 0 : 1;
  const parts = want.filter((k) => VITAL_LABELS[k]).map((k) => `${VITAL_LABELS[k][i]} ${vals[k] ?? '—'}`);
  return parts.join(' · ') || (lang === 'th' ? 'ยังไม่ได้เลือกข้อมูลที่จะโชว์' : 'No readings picked');
}

/**
 * @param {object} ctx
 * @param {() => {x:number,y:number}|null} [ctx.getMouse]
 */
export function installExtras(ctx) {
  const {
    capri, panel, brain, fx, host, launch, pc, voice, bond, jealousy, chat, guide, getVitals, getDance,
    getMouse = () => null,
  } = ctx;
  const reactCtx = { panel, brain, voice: voice || null };

  // shared “is she free to talk / act?”
  const free = () => !capri?.busy && !capri?.act && !capri?.dragging
    && !capri?.stowed && !capri?.dormant && !capri?.hidden
    && !['sleep', 'alert'].includes(capri?.mode)
    && !chat?.open && !guide?.running
    && !panel?.isPinned?.()
    && ['stand', 'sit'].includes(capri?.stance);

  // ── battery wrap ──────────────────────────────────────────────
  if (capri && fx) {
    if (typeof capri.drain === 'function' && !capri._extrasDrain) {
      const drain = capri.drain.bind(capri);
      capri.drain = async (...args) => {
        pcReactFx(fx, capri, 'low', reactCtx);
        return drain(...args);
      };
      capri._extrasDrain = true;
    }
    if (typeof capri.recharge === 'function' && !capri._extrasRecharge) {
      const recharge = capri.recharge.bind(capri);
      capri.recharge = (...args) => {
        pcReactFx(fx, capri, 'charge', reactCtx);
        return recharge(...args);
      };
      capri._extrasRecharge = true;
    }
  }
  if (pc && !pc.reactFx) {
    pc.reactFx = (kind) => pcReactFx(fx, capri, kind, reactCtx);
  }


  // ── USB drives + Bluetooth / device plug alerts ────────────────
  // windows.ps1 emits:
  //   usb:  [{ letter, label, size }, ...]
  //   plug: { n, in, name, class, kind }
  if (capri && !capri._extrasDeviceWatch) {
    let lastPlugN = 0;
    let lastUsbKey = null;
    let coolUntil = 0;

    const TYPE_LABEL = {
      en: {
        storage: 'USB drive', phone: 'Phone', audio: 'Audio device', camera: 'Camera',
        keyboard: 'Keyboard', mouse: 'Mouse', gamepad: 'Controller', bluetooth: 'Bluetooth',
        usb: 'USB device', device: 'Device',
      },
      th: {
        storage: 'แฟลชไดรฟ์ USB', phone: 'มือถือ', audio: 'อุปกรณ์เสียง', camera: 'กล้อง',
        keyboard: 'คีย์บอร์ด', mouse: 'เมาส์', gamepad: 'จอย/คอนโทรลเลอร์', bluetooth: 'Bluetooth',
        usb: 'อุปกรณ์ USB', device: 'อุปกรณ์',
      },
    };

    const shortName = (name) => {
      let s = String(name || '').replace(/\s+/g, ' ').trim();
      if (!s) return '';
      s = s
        .replace(/\bUSB\s*(Composite\s*)?Device\b/gi, '')
        .replace(/\bGeneric\s+/gi, '')
        .replace(/\bVendor-Specific\b/gi, '')
        .replace(/\bMass\s*Storage\s*Device\b/gi, 'Mass Storage')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (!s) s = String(name).trim();
      return s.length > 40 ? s.slice(0, 38) + '…' : s;
    };

    const formatDrive = (d) => {
      // supports legacy "E" string or { letter, label, size }
      if (d == null) return '';
      if (typeof d === 'string') return d.length === 1 ? `${d}:` : d;
      const letter = d.letter || d.Letter || '';
      const label = (d.label || d.Label || '').trim();
      const size = (d.size || d.Size || '').trim();
      const parts = [];
      if (label) parts.push(label);
      if (letter) parts.push(`${letter}:`);
      if (size) parts.push(`(${size})`);
      return parts.join(' ') || (letter ? `${letter}:` : 'USB');
    };

    const typeLabel = (kind, lang) => {
      const table = TYPE_LABEL[lang] || TYPE_LABEL.en;
      return table[kind] || table.device;
    };

    const announce = (kind, name, deviceKind) => {
      const now = performance.now();
      if (now < coolUntil) return;
      coolUntil = now + 2200;
      const lang = brain?.lang || 'en';
      const deviceName = shortName(name) || (lang === 'th' ? 'ไม่ทราบชื่อ' : 'unknown');
      const deviceType = deviceKind === 'audio'
        ? audioLabel(name, lang)
        : typeLabel(deviceKind || (kind.startsWith('bt') ? 'bluetooth' : 'usb'), lang);
      try {
        pcReactFx(fx, capri, kind, { ...reactCtx, deviceName, deviceType });
      } catch { /* */ }
      try {
        if (free() && Math.random() < 0.5) {
          capri.perform?.(pick(kind.endsWith('In') ? ['curious', 'hop', 'look'] : ['look', 'aside']));
        }
      } catch { /* */ }
    };

    // หูฟัง/ลำโพง/ไมค์ (รวมแจ็ก 3.5 มม.) ต้องเป็น 'audio' เสมอ — ไม่ใช่มือถือ
    // ("Headphones" มีคำว่า phone อยู่ข้างใน)
    const AUDIO_RE = /AudioEndpoint|\bMEDIA\b|audio|head(?:set|phones?)|ear(?:phones?|buds?|pods?)|speakers?|microphone|\bmic\b|line[- ]?(?:in|out)|\bjack\b|3\.5\s*mm/i;
    const STRONG_PHONE_RE = /AndroidUsb|android|iphone|ipad|galaxy|pixel|oneplus|xiaomi|huawei|\boppo\b|\bvivo\b|apple mobile|\bMTP\b/i;

    const audioLabel = (name, lang) => {
      const th = lang === 'th';
      const n = String(name || '');
      const jack = /jack|3\.5|front|rear|realtek|onboard/i.test(n) ? (th ? ' (แจ็ก 3.5 มม.)' : ' (3.5 mm jack)') : '';
      if (/microphone|\bmic\b|line[- ]?in/i.test(n)) return (th ? 'ไมโครโฟน' : 'Microphone') + jack;
      if (/speaker/i.test(n)) return (th ? 'ลำโพง' : 'Speakers') + jack;
      if (/head(?:set|phones?)|ear(?:phones?|buds?|pods?)/i.test(n)) return (th ? 'หูฟัง' : 'Headphones') + jack;
      return (th ? 'อุปกรณ์เสียง' : 'Audio device') + jack;
    };

    const classifyPlug = (cls, name, kind) => {
      const both = `${cls || ''} ${name || ''}`;
      if (kind === 'bluetooth') return 'bluetooth';
      // เสียงมาก่อนมือถือ และก่อนค่า kind จากฝั่งเครื่อง (ที่เคยส่ง 'phone' มาผิดให้หูฟัง)
      if (AUDIO_RE.test(both) && !STRONG_PHONE_RE.test(both)) return 'audio';
      // Prefer server-side kind when specific
      if (kind && !['device', 'usb'].includes(kind)) return kind;
      if (/bluetooth/i.test(both)) return 'bluetooth';
      // storage before phone — flash drives must not become "phone"
      if (/DiskDrive|CDROM|SCSIAdapter|mass storage|usb drive|usb disk|removable disk|flash|thumb|sandisk|kingston|transcend/i.test(both)) {
        return 'storage';
      }
      if (/AndroidUsb|android|iphone|ipad|galaxy|pixel|oneplus|xiaomi|huawei|\boppo\b|\bvivo\b|apple mobile|\bMTP\b|\bphone\b/i.test(both)) {
        return 'phone';
      }
      // bare WPD without phone hint → treat as portable storage
      if (/\bWPD\b/i.test(cls || '')) return 'storage';
      if (/AudioEndpoint|MEDIA|headset|headphone|speaker/i.test(both)) return 'audio';
      if (/Camera|Image/i.test(cls || '')) return 'camera';
      if (/Keyboard/i.test(both)) return 'keyboard';
      if (/Mouse/i.test(both)) return 'mouse';
      if (/gamepad|controller|joystick/i.test(name || '')) return 'gamepad';
      if (/USB/i.test(both)) return 'usb';
      return 'device';
    };

    const usbKeyOf = (list) => {
      const norm = (list || []).map((d) => {
        if (typeof d === 'string') return d;
        return `${d.letter || ''}|${d.label || ''}|${d.size || ''}`;
      }).sort();
      return norm.join('||');
    };

    const tick = () => {
      try {
        if (!capri || capri.stowed || capri.dormant) return;
        const w = capri.windows || {};

        // —— removable drives ——
        const usb = Array.isArray(w.usb) ? w.usb : [];
        const key = usbKeyOf(usb);
        if (lastUsbKey === null) {
          lastUsbKey = key;
        } else if (key !== lastUsbKey) {
          const prevKey = lastUsbKey;
          const prevMap = new Map();
          (prevKey ? prevKey.split('||').filter(Boolean) : []).forEach((k) => {
            const letter = k.split('|')[0];
            if (letter) prevMap.set(letter, k);
          });
          const curMap = new Map();
          usb.forEach((d) => {
            const letter = typeof d === 'string' ? d : (d.letter || '');
            if (!letter) return;
            curMap.set(letter, d);
          });
          lastUsbKey = key;
          for (const [letter, d] of curMap) {
            if (!prevMap.has(letter)) announce('usbIn', formatDrive(d), 'storage');
          }
          for (const [letter, k] of prevMap) {
            if (!curMap.has(letter)) {
              const parts = k.split('|');
              const fake = { letter: parts[0], label: parts[1] || '', size: parts[2] || '' };
              announce('usbOut', formatDrive(fake), 'storage');
            }
          }
        }

        // —— PnP plug (phones, BT, controllers, USB gadgets) ——
        const plug = w.plug;
        if (plug && typeof plug.n === 'number' && plug.n !== lastPlugN) {
          lastPlugN = plug.n;
          const deviceKind = classifyPlug(plug.class, plug.name, plug.kind);
          const inn = !!plug.in;
          if (deviceKind === 'bluetooth') {
            announce(inn ? 'btIn' : 'btOut', plug.name, 'bluetooth');
          } else if (deviceKind === 'storage') {
            // Drive-letter watcher handles flash drives with label/size.
            // Only announce PnP storage if it looks like a named volume device
            // and letters list didn't just change (avoids double + phone confusion).
            const hasLetters = Array.isArray(w.usb) && w.usb.length > 0;
            if (!hasLetters) announce(inn ? 'usbIn' : 'usbOut', plug.name, 'storage');
          } else {
            announce(inn ? 'usbIn' : 'usbOut', plug.name, deviceKind);
          }
        }
      } catch { /* */ }
    };

    setInterval(tick, 700);
    setTimeout(tick, 1500);
    capri._extrasDeviceWatch = true;
  }

  // ── 8) Battery + Power Ritual (enhanced) ──────────────────────
  let lastHot = 0;
  let battPrev = null;
  let powerRitualAt = 0;
  const onBatteryEdge = (cur) => {
    if (!cur || !fx || !capri || capri.stowed || capri.dormant) return;
    const prev = battPrev;
    battPrev = cur;
    if (!prev) return;
    const now = performance.now();
    // plug in → full ritual
    if (!prev.charging && cur.charging) {
      pcReactFx(fx, capri, 'charge', reactCtx);
      try {
        if (free()) {
          capri.perform?.('hop');
          if (now - powerRitualAt > 30_000) {
            powerRitualAt = now;
            panel?.say?.({
              kind: 'info', face: 'smug',
              line: pick((brain?.lang === 'th' ? PC_LINES.charge.th : PC_LINES.charge.en)),
              hold: 3200,
            });
          }
        } else {
          capri.wake?.();
        }
      } catch { /* */ }
      return;
    }
    // unplug
    if (prev.charging && !cur.charging) {
      pcReactFx(fx, capri, 'low', reactCtx);
      if (free() && cur.level <= 40) {
        panel?.say?.({
          kind: 'info', face: 'aside',
          line: pick((brain?.lang === 'th' ? PC_LINES.low.th : PC_LINES.low.en)),
          hold: 3000,
        });
      }
      return;
    }
    // crossed low threshold while on battery
    if (!cur.charging && prev.level > EXTRAS.pcLowPct && cur.level <= EXTRAS.pcLowPct) {
      pcReactFx(fx, capri, 'low', reactCtx);
      if (free()) {
        panel?.say?.({
          kind: 'info', face: 'aside',
          line: brain?.lang === 'th'
            ? 'แบตใกล้หมดแล้ว… หาปลั๊กก่อนนะ'
            : 'Battery’s getting low… find a plug soon.',
          hold: 3500,
        });
      }
    }
  };
  if (typeof navigator !== 'undefined' && navigator.getBattery) {
    navigator.getBattery().then((b) => {
      battPrev = { charging: !!b.charging, level: Math.round((b.level || 0) * 100) };
      const fire = () => onBatteryEdge({
        charging: !!b.charging,
        level: Math.round((b.level || 0) * 100),
      });
      b.addEventListener('chargingchange', fire);
      b.addEventListener('levelchange', fire);
    }).catch(() => {});
  }

  // ── Wi‑Fi ─────────────────────────────────────────────────────
  let netOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  const onNet = () => {
    if (!capri || !fx) return;
    const now = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
    if (now === netOnline) return;
    netOnline = now;
    setLinkDim(capri, !now);
    if (capri.stowed || capri.dormant) return;
    pcReactFx(fx, capri, now ? 'online' : 'offline', reactCtx);
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLinkDim(capri, true);
      netOnline = false;
    }
  }

  // ── 1) Neural link to cursor ──────────────────────────────────
  const aim = { x: 0, y: 0 };
  let linkPtr = null;
  let linkOn = false;

  const clearLink = () => {
    if (linkPtr) {
      try { linkPtr.fade?.(); } catch { /* */ }
      linkPtr = null;
    }
    linkOn = false;
  };

  const tickLink = () => {
    if (!fx?.pointer || !capri || reducedMotion.matches) return;
    if (capri.stowed || capri.dormant || capri.busy || capri.dragging || capri.hidden) {
      clearLink();
      return;
    }
    if (capri.pointing && !linkOn) return;

    const m = getMouse?.();
    if (!m) { clearLink(); return; }
    let h;
    try { h = capri.head(); } catch { clearLink(); return; }
    const dx = m.x - h.x, dy = m.y - h.y;
    const d = Math.hypot(dx, dy);
    if (d < EXTRAS.linkMin || d > EXTRAS.linkMax) {
      clearLink();
      return;
    }
    aim.x = m.x;
    aim.y = m.y;
    if (!linkOn) {
      const hand = () => {
        try {
          const dir = m.x < capri.pos.x ? -1 : 1;
          const side = capri.armToward?.(dir) ?? (dir < 0 ? 'L' : 'R');
          return capri.limb?.(side)?.hand || h;
        } catch { return h; }
      };
      const rect = () => ({ x: aim.x - 5, y: aim.y - 5, w: 10, h: 10 });
      try {
        linkPtr = fx.pointer(hand, rect, aim, { label: '' });
        linkOn = true;
      } catch { linkOn = false; }
    }
  };
  setInterval(tickLink, EXTRAS.linkTickMs);

  // ── 2) Hover → PC status one-liner ────────────────────────────
  if (capri && !capri._extrasHoverStatus) {
    let hoverTimer = 0;
    let statusShown = false;
    const showStatus = async () => {
      if (panel?.visible) return;
      statusShown = true;
      try {
        const lang = brain?.lang || 'en';
        const line = await fetchStatusLine({ host, launch, lang, keys: getVitals?.() });
        panel?.say?.({ kind: 'info', face: 'smug', line, hold: Math.min(12000, 3200 + line.length * 90) });
        bond?.add?.('click', 1);
        if (capri.free) capri.perform?.('curious', capri.towardCenter?.() ?? 1);
      } catch { /* no pcStatus — skip */ }
    };
    setInterval(() => {
      const m = getMouse?.();
      const onHer = m && !capri.stowed && !capri.dormant && capri.hit?.(m.x, m.y);
      if (onHer) {
        if (!hoverTimer && !statusShown) hoverTimer = setTimeout(showStatus, EXTRAS.hoverHoldMs);
      } else {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = 0; }
        statusShown = false;
      }
    }, EXTRAS.hoverPollMs);
    capri._extrasHoverStatus = true;
  }

  // ── 5) Ctrl+C → bolt + scan + cutin + smart clipboard mood ────
  // Privacy: never read clipboard content. Only use event + optional length
  // hint from host if available (host.clipboardMeta?.() → { length, kind? }).
  if (typeof window !== 'undefined' && capri && fx && !capri._extrasCopy) {
    let lastCopy = -Infinity;
    window.addEventListener('keydown', (e) => {
      if (!(e.key === 'c' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey)) return;
      if (reducedMotion.matches) return;
      if (capri.stowed || capri.dormant || capri.hidden) return;
      const now = performance.now();
      if (now - lastCopy < EXTRAS.copyBoltCooldownMs) return;
      lastCopy = now;
      try {
        let h;
        try { h = capri.head(); } catch { return; }
        const dir = capri.towardCenter?.() ?? 1;
        const side = capri.armToward?.(dir) ?? (dir < 0 ? 'L' : 'R');
        const hand = capri.limb?.(side)?.hand || h;
        const fg = capri.windows?.fg;
        const wins = capri.windows?.wins || [];
        const win = (fg && wins.find((w) => w.id === fg)) || null;
        const to = win
          ? { x: win.x + win.w * 0.5, y: win.y + win.h * 0.35 }
          : { x: h.x + dir * 220, y: h.y - 120 };
        fx.bolt?.(hand, to, { life: 320, forks: 1, width: 2.5 });
        if (win) {
          const rect = () => capri.windows?.wins?.find((w) => w.id === win.id) ?? null;
          const covers = () => capri.coversOf?.(win.id) ?? [];
          fx.scan?.(rect, { covers });
        }
        const isFree = free();
        if (isFree) {
          const [cx, cy] = capri.cutinAt?.(-dir) ?? [h.x, h.y];
          fx.cutin?.(cx, cy, -dir, { kind: 'grin', life: 640 });
        }

        // Smart mood line (heuristic only)
        // Prefer host.clipboardMeta if main process exposes { length, looksLikeCode, looksLikeError }
        const meta = host?.clipboardMeta?.() || null;
        let mood = 'short';
        if (meta) {
          if (meta.looksLikeError) mood = 'errorish';
          else if (meta.looksLikeCode || (meta.length > 400 && /[{};=<>]/.test(meta.sample || ''))) mood = 'code';
          else if (meta.length > 280) mood = 'long';
          else mood = 'short';
        } else if (win) {
          // fallback: window class
          const cls = classifyWindow(win);
          if (cls === 'code') mood = Math.random() < 0.55 ? 'code' : 'short';
          else if (cls === 'browser') mood = Math.random() < 0.3 ? 'long' : 'short';
        }
        if (isFree && panel && Math.random() < (mood === 'short' ? 0.25 : 0.55)) {
          const lang = brain?.lang || 'en';
          const pool = CLIP_LINES[mood]?.[lang] || CLIP_LINES[mood]?.en;
          if (pool) {
            panel.say?.({
              kind: 'info',
              face: mood === 'errorish' ? 'aside' : mood === 'code' ? 'look' : 'smug',
              line: pick(pool),
              hold: 2800,
            });
          }
        }
      } catch { /* keep going */ }
    }, true);
    capri._extrasCopy = true;
  }

  // ── 6) Idle boredom ───────────────────────────────────────────
  if (capri && fx && !capri._extrasBored) {
    let lastBored = -Infinity;
    let _lastPos = null;
    let _lastMove = performance.now();
    const actBored = () => {
      if (reducedMotion.matches) return;
      if (!free()) return;
      const now = performance.now();
      if (now - lastBored < EXTRAS.idleBoredCoolMs) return;
      lastBored = now;
      try {
        let h;
        try { h = capri.head(); } catch { return; }
        const dir = capri.towardCenter?.() ?? 1;
        const roll = Math.random();
        if (roll < 0.35) {
          const side = capri.armToward?.(dir) ?? (dir < 0 ? 'L' : 'R');
          const hand = capri.limb?.(side)?.hand || h;
          const to = { x: h.x + dir * rand(160, 320), y: h.y - rand(100, 240) };
          fx.bolt?.(hand, to, { life: 420, forks: 2, width: 3 });
          fx.glyph?.(to.x, to.y);
          capri.perform?.('curious', dir);
        } else if (roll < 0.65) {
          fx.dizzy?.(() => { try { return capri.head(); } catch { return h; } }, { life: 1800 });
          capri.perform?.('hop');
        } else {
          const [cx, cy] = capri.cutinAt?.(dir) ?? [h.x, h.y];
          fx.cutin?.(cx, cy, dir, { kind: pick(['look', 'eyes', 'many']), life: 700 });
          capri.perform?.('curious', -dir);
        }
      } catch { /* */ }
    };
    setInterval(() => {
      const m = getMouse?.();
      if (!m) return;
      if (!_lastPos || m.x !== _lastPos.x || m.y !== _lastPos.y) {
        _lastPos = { x: m.x, y: m.y };
        _lastMove = performance.now();
      }
      if (performance.now() - _lastMove > EXTRAS.idleBoredMs) actBored();
    }, 30_000);
    capri._extrasBored = true;
  }

  // ── 7) Smart Break / Eye Strain Guard ─────────────────────────
  let activeSince = performance.now();
  let lastBreakNudge = -Infinity;
  let breakSnoozeUntil = 0;
  let lastPointerSample = null;

  const nudgeBreak = () => {
    if (!free() || reducedMotion.matches) return;
    const now = performance.now();
    if (now < breakSnoozeUntil) return;
    if (now - lastBreakNudge < EXTRAS.eyeStrainCoolMs) return;
    if (now - activeSince < EXTRAS.eyeStrainMs) return;
    lastBreakNudge = now;
    const lang = brain?.lang || 'en';
    const line = pick(BREAK_LINES[lang] || BREAK_LINES.en);
    try {
      capri.wake?.();
      capri.perform?.('curious', capri.towardCenter?.() ?? 1);
      voice?.play?.('blip');
      const shown = panel?.say?.({
        kind: 'info',
        face: 'look',
        line,
        hold: null,
        actions: [
          { id: 'breakOk', label: lang === 'th' ? 'พักเลย' : 'I’ll rest', primary: true },
          { id: 'breakSnooze', label: lang === 'th' ? 'อีก 10 นาที' : '10 more min' },
        ],
        onAction: (id) => {
          if (id === 'breakSnooze') {
            breakSnoozeUntil = performance.now() + EXTRAS.eyeStrainSnoozeMs;
            panel?.say?.({
              kind: 'info', face: 'smug',
              line: lang === 'th' ? 'ได้ ฉันจะเตือนอีกที' : 'Okay. I’ll remind you later.',
              hold: 2500,
            });
          } else {
            // reset activity clock so she doesn’t nag immediately
            activeSince = performance.now();
            breakSnoozeUntil = performance.now() + 3 * 60 * 1000;
            panel?.say?.({
              kind: 'info', face: 'smug',
              line: lang === 'th' ? 'ดี ไปพักสายตานะ' : 'Good. Go blink a bit.',
              hold: 2500,
            });
            bond?.add?.('care', 1);
          }
        },
        onLeave: () => {
          // closed without answer → soft snooze
          breakSnoozeUntil = performance.now() + 5 * 60 * 1000;
        },
      });
      if (!shown) breakSnoozeUntil = now + 60_000;
    } catch { /* */ }
  };

  // track continuous activity via pointer movement inside her window
  setInterval(() => {
    const m = getMouse?.();
    const now = performance.now();
    if (m) {
      if (!lastPointerSample || m.x !== lastPointerSample.x || m.y !== lastPointerSample.y) {
        // movement → still active
        if (now - (lastPointerSample?.t || 0) > 90_000) {
          // long gap then move again = new session
          activeSince = now;
        }
        lastPointerSample = { x: m.x, y: m.y, t: now };
      }
    }
    // also count typing (lastType updated below)
    nudgeBreak();
  }, 20_000);

  // ── 3 + Window Companion: auto-sit smallest sittable window ──
  let lastFocusId = null;
  let lastFocusSit = 0;
  let lastType = 0;
  let autoSitBusy = false;
  let returnAfterSit = null;
  let actSeenSince = 0;         // since when capri.act has been continuously set while a sit is pending
  let autoSitClaims = 0;        // claim FX started during the current auto-sit (one show per sit)

  // ── shrink detection ─────────────────────────────────────────
  // A window "shrinks" when it is restored down from maximized, or its area drops a lot.
  // Shrunk windows stay candidates for a while (shrinkMemoMs) so busy moments don't lose them.
  const lastSize = new Map();   // id -> { area, max }
  const shrunk = new Map();     // id -> expiry (performance.now)
  const detectShrink = () => {
    const now = performance.now();
    const wins = capri?.windows?.wins || [];
    const live = new Set();
    for (const win of wins) {
      if (!win || win.id === 'taskbar') continue;
      live.add(win.id);
      const cur = { area: win.w * win.h, max: !!win.max };
      const prev = lastSize.get(win.id);
      lastSize.set(win.id, cur);
      if (!prev) continue;
      const restored = prev.max && !cur.max;
      const smaller = cur.area < prev.area * EXTRAS.shrinkAreaRatio
        && prev.area - cur.area > EXTRAS.shrinkMinDrop;
      if (restored || smaller) shrunk.set(win.id, now + EXTRAS.shrinkMemoMs);
    }
    for (const id of [...lastSize.keys()]) if (!live.has(id)) { lastSize.delete(id); shrunk.delete(id); }
    for (const [id, exp] of shrunk) if (now > exp) shrunk.delete(id);
  };

  // Our own can-sit check (slightly looser than native) so auto-sit still works
  const canSitLoose = (win) => {
    if (!win || win.id === 'taskbar') return false;
    if (win.max) return false;
    const minW = EXTRAS.minSitWidth || 240;
    if (!(win.w > minW)) return false;
    const scale = capri.scale || 0.6;
    const roomAbove = 80 * scale + 12;
    const floor = capri.view?.floor || capri.view?.h || 800;
    if (win.y <= roomAbove) return false;
    if (win.y >= floor - 60) return false;
    return true;
  };

  const listSittable = () => {
    const wins = capri?.windows?.wins || [];
    const out = [];
    for (const win of wins) {
      if (!canSitLoose(win)) continue;
      // prefer native canSit when available, but don't require it if coords are odd
      const probes = [0.5, 0.72, 0.3, 0.2, 0.8].map((t) => Math.max(50, Math.min(win.w - 50, win.w * t)));
      let dx = null;
      for (const d of probes) {
        try {
          if (typeof capri.covered === 'function' && capri.covered(win, win.x + d)) continue;
        } catch { /* */ }
        dx = d;
        break;
      }
      const exposed = dx != null; // false: every probe spot is under another window
      if (dx == null) dx = Math.max(50, win.w * 0.5);
      out.push({ win, dx, w: win.w, exposed });
    }
    out.sort((a, b) => a.w - b.w);
    return out;
  };

  const pickSitDx = (win, cls, fallback) => {
    if (cls === 'code') return Math.min(Math.max(70, win.w * 0.78), Math.max(70, win.w - 70));
    if (cls === 'browser' || cls === 'chat') return Math.min(Math.max(60, win.w * 0.55), Math.max(60, win.w - 90));
    if (cls === 'media') return Math.min(Math.max(50, win.w * 0.88), Math.max(50, win.w - 60));
    return fallback ?? Math.min(Math.max(60, win.w * 0.72), Math.max(60, win.w - 80));
  };

  const doAutoSit = async (chosen, { force = false } = {}) => {
    if (!chosen?.win || !capri) return false;
    if (autoSitBusy && !force) return false;
    const now = performance.now();
    if (!force && now - lastFocusSit < (EXTRAS.focusSitCooldown || 6000)) return false;
    if (!force && capri.stance === 'sit' && capri.perch?.id === chosen.win.id) return false;

    lastFocusId = chosen.win.id;
    lastFocusSit = now;
    autoSitBusy = true;
    autoSitClaims = 0;
    // Where she was (stance + perch too: a seat on the taskbar must go back to the taskbar)
    returnAfterSit = {
      x: capri.pos?.x,
      y: capri.pos?.y,
      face: capri.facing || 1,
      stance: capri.stance === 'sit' ? 'sit' : 'stand',
      perch: capri.stance === 'sit' && capri.perch ? { ...capri.perch } : null,
      excursion: capri._excursionUntil || 0,
      placeStamp: capri._placeLockUntil || 0,
    };

    const cls = classifyWindow(chosen.win);
    const dx = pickSitDx(chosen.win, cls, chosen.dx);
    try {
      // Pause wander/home pulls while we sit
      capri.nextMove = now + 8000;
      capri.nextHome = now + 8000;
      if (typeof capri.sitOn === 'function') {
        await capri.sitOn({ win: chosen.win, dx });
      } else {
        const seat = typeof capri.seat === 'function'
          ? capri.seat(chosen.win, dx)
          : { x: chosen.win.x + dx, y: chosen.win.y + 3 };
        await capri.teleport?.(seat, {
          stance: 'sit',
          perch: { id: chosen.win.id, dx },
          face: capri.facing || 1,
        });
      }
      setTimeout(() => {
        try { if (typeof claimWindow === 'function') claimWindow(chosen.win.id, { force: true }); } catch { /* */ }
      }, 350);
    } catch (e) {
      try { console.warn('[capri] auto-sit failed', e); } catch { /* */ }
      autoSitBusy = false;
      return false;
    }

    // Go back to the exact earlier place once her show on the window is over (claimId clears when
    // the claim FX ends), but never later than autoSitReturnMaxMs.
    const seatedAt = performance.now();
    const goBack = () => {
      try {
        const fxRunning = typeof claimId !== 'undefined' && claimId;
        const waited = performance.now() - seatedAt;
        if (fxRunning && waited < EXTRAS.autoSitReturnMaxMs) { setTimeout(goBack, 150); return; }
        const back = returnAfterSit;
        returnAfterSit = null;
        autoSitBusy = false;
        if (!back || !capri || typeof back.x !== 'number') return;
        if (capri.stowed || capri.dormant || capri.dragging) return;
        if (capri.perch?.id && capri.perch.id !== lastFocusId) return;          // she's somewhere else now
        if ((capri._placeLockUntil || 0) !== back.placeStamp) return;           // user moved her meanwhile
        try { stopClaim(); } catch { /* */ }
        const tp = capri._rawTeleport || (typeof capri.teleport === 'function' ? capri.teleport.bind(capri) : null);
        // keep whatever excursion lock she had before; don't let the return itself arm a new one
        capri._excursionUntil = Math.max(back.excursion, performance.now() + 1_500);
        capri.nextHome = Math.max(capri.nextHome || 0, capri._excursionUntil);
        if (back.stance === 'sit' && back.perch) {
          tp?.({ x: back.x, y: back.y }, { face: back.face, stance: 'sit', perch: back.perch });
        } else {
          tp?.({ x: back.x, y: back.y }, { face: back.face, stance: 'stand' });
        }
      } catch {
        autoSitBusy = false;
      }
    };
    setTimeout(goBack, EXTRAS.autoSitReturnMs);
    return true;
  };

  // Only reacts to windows that were just shrunk (restored down / made smaller). When several
  // shrink together, the one with the least room to sit (narrowest) that is still sittable wins.
  const tickFocusSit = async () => {
    if (!capri) return;
    detectShrink();                       // always keep the size memory current
    if (!shrunk.size) return;
    if (reducedMotion.matches) return;
    if (capri.stowed || capri.dormant || capri.dragging || capri.hidden) return;
    if (capri.busy || capri.flight) return;
    if (capri.mode === 'sleep' || autoSitBusy) return;
    // A fullscreen app (game/video) IN FRONT keeps her quiet. A big window elsewhere does not.
    const fsWin = findFullscreenWin?.(capri);
    if (fsWin && fsWin.id === capri.windows?.fg) return;
    // A short act (look, curious...) is fine to wait for; one that's still running after ~2.5 s
    // (pointing, held pose...) is cut so it can't block the sit forever.
    if (capri.act) {
      const now = performance.now();
      if (!actSeenSince) actSeenSince = now;
      if (now - actSeenSince < 2_500) return;
      try { capri.stopPointing?.(); } catch { /* */ }
      try { capri.endAct?.(false); } catch { /* */ }
    }
    actSeenSince = 0;
    if (capri.stance === 'sit' && capri.perch?.id && capri.perch.id !== 'taskbar') return;

    // listSittable() is sorted narrow → wide, so the first match is the least room that still fits
    const chosen = listSittable().find((c) => c.exposed && shrunk.has(c.win.id));
    if (!chosen) return;
    shrunk.clear();
    await doAutoSit(chosen, { force: true });
  };
  setInterval(() => { tickFocusSit(); }, EXTRAS.focusSitMs);

  // Hook setWindows so every window-list update can trigger a sit
  if (capri && typeof capri.setWindows === 'function' && !capri._extrasAutoSitHook) {
    const _sw = capri.setWindows.bind(capri);
    capri.setWindows = (data) => {
      const r = _sw(data);
      try {
        if (!autoSitBusy && capri.stance !== 'sit') {
          setTimeout(() => { try { tickFocusSit(); } catch { /* */ } }, 200);
        }
      } catch { /* */ }
      return r;
    };
    capri._extrasAutoSitHook = true;
  }

  // ── 4) Typing → quiet ─────────────────────────────────────────
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'Escape'].includes(e.key)) return;
    lastType = performance.now();
    // activity also counts toward eye-strain timer
    if (performance.now() - activeSince > 120_000 && performance.now() - (lastPointerSample?.t || 0) > 120_000) {
      activeSince = performance.now();
    }
    if (!capri) return;
    const until = lastType + EXTRAS.typingBoostMs;
    if (capri.nextMove < until) capri.nextMove = until;
    if (capri.nextGaze < until) capri.nextGaze = until;
    if (panel?.visible && panel.current?.kind === 'idle') panel.hide?.();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKey, true);
  }

  // ── 11) Soft Jealousy / Rival AI ──────────────────────────────
  // Lightweight, non-possessive. Real possess stays inside Jealousy class.
  let lastSoftJealous = -Infinity;
  let lastRivalId = null;
  const tickSoftJealous = () => {
    if (!capri || !jealousy?.enabled) return;
    if (!free()) return;
    if ((bond?.stage ?? 0) < EXTRAS.softJealousMinStage) return;
    const now = performance.now();
    if (now - lastSoftJealous < EXTRAS.softJealousCoolMs) return;

    const fg = capri.windows?.fg;
    const wins = capri.windows?.wins || [];
    const win = fg && wins.find((w) => w.id === fg);
    if (!win || win.id === lastRivalId) return;
    const title = `${win.title || ''} ${win.app || ''}`;
    const isRival = RIVAL_PATTERNS.some((re) => re.test(title));
    if (!isRival) return;

    lastRivalId = win.id;
    lastSoftJealous = now;
    const lang = brain?.lang || 'en';
    const line = pick(SOFT_JEALOUS[lang] || SOFT_JEALOUS.en);
    try {
      // subtle: no possess, just a look + short line
      capri.perform?.('curious', -capri.towardCenter?.() || -1);
      panel?.say?.({
        kind: 'info',
        face: 'aside',
        line,
        hold: 3200,
      });
      // tiny bond poke — she noticed
      bond?.feel?.('sulk', { percent: Math.max(0, (bond.percent || 0) - 0.5) });
    } catch { /* */ }
  };
  setInterval(tickSoftJealous, 6_000);

  // ── 10) Morning / Weather Ritual ──────────────────────────────
  // Runs once per local day shortly after boot if within morning hours.
  // Weather line still comes from main via 'rainTip'; here we add the greeting.
  let morningDone = false;
  const tryMorning = () => {
    if (morningDone || !capri || !free()) return;
    const h = new Date().getHours();
    if (h < EXTRAS.morningFrom || h >= EXTRAS.morningTo) return;
    // only if she just appeared / first quiet moment
    if (performance.now() < 8_000) return;
    morningDone = true;
    const lang = brain?.lang || 'en';
    try {
      capri.perform?.('hop');
      voice?.play?.('hello');
      panel?.say?.({
        kind: 'info',
        face: 'look',
        line: pick(MORNING[lang] || MORNING.en),
        hold: 4000,
      });
      bond?.add?.('time', 1);
    } catch { /* */ }
  };
  setTimeout(tryMorning, 12_000);
  setInterval(tryMorning, 60_000);

  // ── 9) Multi-monitor Follow polish ────────────────────────────
  // After a screen change she stays quieter for a short window so she
  // doesn’t immediately hop/wander again. Also expose a helper the
  // main app can call after goToScreen / onCross.
  let quietUntil = 0;
  const afterScreenHop = () => {
    quietUntil = performance.now() + EXTRAS.followQuietMs;
    if (capri) {
      const t = performance.now();
      if (capri.nextMove < quietUntil) capri.nextMove = quietUntil;
      if (capri.nextGaze < quietUntil) capri.nextGaze = Math.max(capri.nextGaze, t + 4000);
    }
  };
  // Hook into existing cross / jump if available
  if (capri && !capri._extrasFollowPolish) {
    const prevCross = capri.onCross;
    if (typeof prevCross === 'function') {
      capri.onCross = async (...args) => {
        const res = await prevCross.apply(capri, args);
        afterScreenHop();
        return res;
      };
    }
    // locate / goScreen commands already teleport; we can’t see them here,
    // so expose the helper for app.js if needed.
    capri._afterScreenHop = afterScreenHop;
    capri._extrasFollowPolish = true;
  }

  // ── fullscreen quiet ──────────────────────────────────────────
  let inGame = false;
  const pollFullscreen = () => {
    if (!capri || capri.stowed || capri.dormant) return;
    const win = findFullscreenWin(capri);
    if (win && !inGame) {
      inGame = true;
      clearLink();
      try {
        const spot = capri.spot?.('post') || capri.spot?.('stage');
        if (spot) capri.teleport?.(spot);
        capri.nextMove = performance.now() + 120_000;
        capri.nextGaze = performance.now() + 60_000;
      } catch { /* */ }
    } else if (!win && inGame) {
      inGame = false;
      if (capri.nextMove > performance.now() + 30_000) {
        capri.nextMove = performance.now() + rand(4000, 12000);
      }
    }
  };

  // ── CPU poll ──────────────────────────────────────────────────
  const pollPc = async () => {
    if (!fx || !capri || reducedMotion.matches) return;
    if (capri.stowed || capri.dormant || capri.busy) return;
    if (performance.now() - lastType < EXTRAS.typingQuietMs) return;
    try {
      const now = Date.now();
      if (now - lastHot > EXTRAS.pcHotCooldownMs) {
        const statusFn = launch?.pcStatus || host?.pcStatus || ((w) => host?.invoke?.('pcStatus', w));
        if (typeof statusFn === 'function') {
          const cpu = await statusFn('cpu').catch(() => null);
          const load = Number(cpu?.data?.cpu?.load ?? cpu?.cpu?.load ?? NaN);
          if (Number.isFinite(load) && load >= EXTRAS.pcHotLoad) {
            lastHot = now;
            pcReactFx(fx, capri, 'hot', reactCtx);
          }
        }
      }
    } catch { /* */ }
  };

  setInterval(pollPc, EXTRAS.pcPollMs);
  setInterval(pollFullscreen, EXTRAS.fullscreenPollMs);
  setTimeout(pollPc, 8_000);
  setTimeout(pollFullscreen, 5_000);

  // ═══════════════════════════════════════════════════════════
  // WOW PACK — 12D
  //  space + time + branch + mind + emotion + attention +
  //  causality + scale + phase + observer — folded on canvas 2D
  // ═══════════════════════════════════════════════════════════

  // Shared 2.5D helpers
  const depthScale = (z) => 0.55 + z * 0.55; // z 0..1 → scale
  const depthAlpha = (z) => 0.18 + z * 0.75;
  const parallax = (z, mx, my, cx, cy) => {
    // far layers drift less with pointer; near layers more
    const k = (z - 0.5) * 0.12;
    return { x: cx + (mx - cx) * k, y: cy + (my - cy) * k * 0.7 };
  };

  // Soft ground shadow under a point (ellipse, perspective-squashed)
  const drawGroundShadow = (ctx, x, y, r, a = 0.25) => {
    ctx.save();
    ctx.translate(x, y + r * 0.35);
    ctx.scale(1.35, 0.28);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(10, 6, 18, ${a})`;
    ctx.fill();
    ctx.restore();
  };

  // Stacked mask at depth z (2.5D clone body)
  const drawDepthMask = (ctx, x, y, z, look, open = [1, 1]) => {
    const k = depthScale(z) * (capri.scale || 1) * 0.9;
    const a = depthAlpha(z);
    // violet afterimage behind (farther)
    ctx.save();
    ctx.globalAlpha = a * 0.35;
    drawMask(ctx, x + 5 * (1 - z), y + 6 * (1 - z), k * 1.04, { eyes: open, look, spike: true, flat: COLORS.violet });
    ctx.restore();
    // main body
    ctx.save();
    ctx.globalAlpha = a;
    drawMask(ctx, x, y, k, { eyes: open, look, spike: true });
    ctx.restore();
    // near highlight rim
    if (z > 0.7) {
      ctx.save();
      ctx.globalAlpha = (z - 0.7) * 0.5;
      ctx.strokeStyle = COLORS.paper;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y - 4 * k, 22 * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  // Perspective ring (ellipse, not circle) for heartbeat / impact
  const depthRing = (x, y, z, strength = 1) => {
    if (!fx?.ctx || reducedMotion.matches) {
      fx?.ring?.(x, y, { size: 0.12 * strength });
      return;
    }
    const ctx = fx.ctx;
    const k = depthScale(z);
    const rx = (28 + 40 * strength) * k;
    const ry = rx * (0.35 + z * 0.25);
    ctx.save();
    ctx.globalAlpha = 0.55 * depthAlpha(z);
    ctx.translate(x, y);
    for (const [ox, color, lw] of [[-2, COLORS.violet, 4], [0, COLORS.red, 2.2], [0, COLORS.paper, 0.8]]) {
      ctx.beginPath();
      ctx.ellipse(ox, ox * 0.3, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = lw * strength;
      ctx.stroke();
    }
    ctx.restore();
  };


  // ── 4D time axis ────────────────────────────────────────────
  // Ring buffer of past poses: {t, x, y, z, lookX, lookY}
  const worldline = [];
  const pushWorldline = (pose) => {
    worldline.push(pose);
    const max = Math.max(8, EXTRAS.timeEchoes * 3);
    while (worldline.length > max) worldline.shift();
  };
  let lastWorldlineSample = -Infinity;
  let lastWorldlineBurst = 0;

  // Sample Capri + clone into the worldline
  setInterval(() => {
    if (!capri || capri.stowed || capri.dormant || reducedMotion.matches) return;
    const now = performance.now();
    if (now - lastWorldlineSample < EXTRAS.timeEchoMs) return;
    lastWorldlineSample = now;
    try {
      const h = capri.head?.();
      if (!h) return;
      const m = getMouse?.();
      pushWorldline({
        t: now,
        x: h.x,
        y: h.y,
        z: 0.75,
        lookX: m?.x ?? h.x,
        lookY: m?.y ?? h.y,
        kind: 'self',
      });
      if (cloneUntil && now < cloneUntil) {
        pushWorldline({
          t: now,
          x: clonePos.x,
          y: clonePos.y,
          z: clonePos.z,
          lookX: m?.x ?? clonePos.x,
          lookY: m?.y ?? clonePos.y,
          kind: 'clone',
        });
      }
    } catch { /* */ }
  }, EXTRAS.timeEchoMs);

  // Draw temporal echoes (past selves fading along the worldline)
  const paintTimeEchoes = (ctx, filterKind = null) => {
    if (!worldline.length || !ctx) return;
    const now = performance.now();
    const echoes = EXTRAS.timeEchoes | 0;
    // pick evenly spaced past samples
    const step = Math.max(1, Math.floor(worldline.length / (echoes + 1)));
    for (let e = 1; e <= echoes; e++) {
      const idx = worldline.length - 1 - e * step;
      if (idx < 0) break;
      const pose = worldline[idx];
      if (filterKind && pose.kind !== filterKind) continue;
      const age = (now - pose.t) / 1000;
      const fade = Math.max(0, 1 - age / 1.4) * (1 - e / (echoes + 1));
      if (fade < 0.05) continue;
      const z = Math.max(0.15, pose.z * (1 - e * 0.08));
      ctx.save();
      ctx.globalAlpha = fade * 0.55;
      // phase tint: older = more violet / desynced
      if (EXTRAS.phaseGlitch && e % 2 === 0) {
        drawMask(ctx, pose.x + 2, pose.y - 1, depthScale(z) * (capri.scale || 1) * 0.82, {
          eyes: [0.9, 0.9],
          look: { x: pose.lookX, y: pose.lookY },
          spike: true,
          flat: COLORS.violet,
        });
      } else {
        drawMask(ctx, pose.x, pose.y, depthScale(z) * (capri.scale || 1) * 0.82, {
          eyes: [0.85, 0.85],
          look: { x: pose.lookX, y: pose.lookY },
          spike: true,
        });
      }
      ctx.restore();
    }
  };

  // Chromatic phase flash — FX items ONLY (never raw ctx; raw draws stick when FxLayer stops)
  const phaseFlash = (x, y, power = 1) => {
    if (!fx || !EXTRAS.phaseGlitch || reducedMotion.matches) return;
    const p = Math.max(0.3, Math.min(1.6, power));
    try {
      fx.ring?.(x, y, { size: 0.18 * p });
      fx.burst?.(x, y, { count: Math.round(6 * p), power: 0.25 * p, spread: 28 * p });
      if (p > 0.8) fx.glyph?.(x + 10, y - 12);
    } catch { /* */ }
  };


  // Worldline burst: connect recent poses with a jagged time-streak
  const worldlineBurst = () => {
    if (!fx || worldline.length < 3) return;
    const now = performance.now();
    if (now - lastWorldlineBurst < EXTRAS.worldlineCoolMs) return;
    lastWorldlineBurst = now;
    const pts = worldline.slice(-8);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      fx.streak?.(a.x, a.y, b.x, b.y, { life: 200 + i * 30 });
    }
    const last = pts[pts.length - 1];
    phaseFlash(last.x, last.y, 1.1);
    fx.vortex?.(last.x, last.y, { radius: 60, life: 280, count: 8 });
  };

  
  // ── 5D branching timelines ──────────────────────────────────
  // Each branch is a side-worldline that diverges then collapses.
  const branches = []; // { id, born, life, pts: [{t,x,y,z}], color, mind }

  const forkBranch = (origin, mind = 1) => {
    if (!origin || reducedMotion.matches) return null;
    if (branches.length >= EXTRAS.branchMax) branches.shift();
    const dir = (Math.random() < 0.5 ? -1 : 1);
    const pts = [];
    let x = origin.x, y = origin.y;
    const z0 = origin.z ?? 0.5;
    for (let i = 0; i < 7; i++) {
      x += dir * rand(18, 42) + rand(-8, 8);
      y += rand(-28, 12);
      pts.push({ t: performance.now() + i * 70, x, y, z: Math.max(0.15, z0 - i * 0.05) });
    }
    const b = {
      id: Math.random().toString(36).slice(2, 7),
      born: performance.now(),
      life: EXTRAS.branchLifeMs,
      pts,
      mind, // which identity owns this fork
      color: mind === 3 ? COLORS.red : mind === 2 ? COLORS.green : COLORS.violet,
    };
    branches.push(b);
    // visible fork spark
    try {
      fx.streak?.(origin.x, origin.y, pts[1].x, pts[1].y, { life: 220 });
      phaseFlash(origin.x, origin.y, 0.7);
    } catch { /* */ }
    return b;
  };

  const paintBranches = (ctx) => {
    if (!ctx || !branches.length) return;
    const now = performance.now();
    for (let i = branches.length - 1; i >= 0; i--) {
      const b = branches[i];
      const u = (now - b.born) / b.life;
      if (u >= 1) { branches.splice(i, 1); continue; }
      const fade = u < 0.15 ? u / 0.15 : u > 0.7 ? (1 - u) / 0.3 : 1;
      ctx.save();
      ctx.globalAlpha = 0.35 * fade;
      // polyline worldline of the branch
      if (b.pts.length > 1) {
        ctx.beginPath();
        b.pts.forEach((p, pi) => (pi ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        // ghost mask at the tip
        const tip = b.pts[Math.min(b.pts.length - 1, Math.floor(u * b.pts.length))];
        if (tip) {
          ctx.globalAlpha = 0.25 * fade;
          drawMask(ctx, tip.x, tip.y, depthScale(tip.z) * (capri.scale || 1) * 0.55, {
            eyes: [0.7, 0.7],
            look: null,
            spike: true,
            flat: b.color,
          });
        }
      }
      ctx.restore();
    }
  };

  // ── 6D mind-identity axis ───────────────────────────────────
  // mind index: 0 self · 1 clone · 2 bond-projection · 3 rival-echo
  const mindColor = (m) => {
    if (m === 2) return COLORS.green;
    if (m === 3) return COLORS.red;
    if (m === 1) return COLORS.violet;
    return COLORS.paper;
  };

  // Bond projection: a soft green mind that sits near the pointer when bond is high
  let bondMind = null; // { x, y, z, until }
  const pulseBondMind = () => {
    if ((bond?.stage ?? 0) < 3) { bondMind = null; return; }
    if (!capri || capri.stowed || capri.dormant) return;
    const m = getMouse?.();
    if (!m) return;
    try {
      const h = capri.head();
      const d = Math.hypot(m.x - h.x, m.y - h.y);
      if (d > 220 || d < 40) return;
      bondMind = {
        x: (h.x + m.x) / 2 + rand(-12, 12),
        y: (h.y + m.y) / 2 + rand(-10, 10),
        z: 0.45,
        until: performance.now() + EXTRAS.mindPulseMs,
      };
    } catch { /* */ }
  };
  setInterval(pulseBondMind, EXTRAS.mindPulseMs);

  // Rival echo: brief red mind near rival windows (ties to soft jealousy)
  let rivalMind = null;
  const pulseRivalMind = () => {
    if (!capri || !jealousy?.enabled) return;
    const fg = capri.windows?.fg;
    const wins = capri.windows?.wins || [];
    const win = fg && wins.find((w) => w.id === fg);
    if (!win) return;
    const title = `${win.title || ''} ${win.app || ''}`;
    const rival = RIVAL_PATTERNS.some((re) => re.test(title));
    if (!rival) { rivalMind = null; return; }
    rivalMind = {
      x: win.x + win.w * 0.5,
      y: win.y + 40,
      z: 0.3,
      until: performance.now() + 3_000,
    };
  };
  setInterval(pulseRivalMind, 5_000);

  const paintMindLayer = (ctx, mind, x, y, z, look) => {
    if (!ctx) return;
    // soft mask ghost only — no hard rim circle (that read as a ugly ball)
    const k = depthScale(z) * (capri.scale || 1) * 0.62;
    ctx.save();
    ctx.globalAlpha = 0.22 + z * 0.28;
    if (mind === 2) {
      // bond: green-tinted soft mask
      drawMask(ctx, x, y, k, { eyes: [0.9, 0.9], look: look || null, spike: false, flat: COLORS.green });
    } else if (mind === 3) {
      // rival: thin red afterimage, not a solid ball
      drawMask(ctx, x + 2, y + 2, k * 0.95, { eyes: [0.8, 0.8], look: null, spike: true, flat: COLORS.violet });
      ctx.globalAlpha *= 0.7;
      drawMask(ctx, x, y, k * 0.9, { eyes: [0.85, 0.85], look: null, spike: true, flat: COLORS.red });
    } else {
      drawMask(ctx, x, y, k, { eyes: [1, 1], look: look || null, spike: true });
    }
    ctx.restore();
  };

  // Full 6D hypercast — folds all axes into one moment
  let lastHyper = -Infinity;
  const hyperCast = () => {
    if (!fx || !capri || reducedMotion.matches) return false;
    const now = performance.now();
    if (now - lastHyper < EXTRAS.hyperCastCoolMs) return false;
    lastHyper = now;
    try {
      const h = capri.head();
      // 3D depth pop
      depthRing(h.x, h.y, 1, 1.4);
      fx.vortex?.(h.x, h.y, { radius: 120, life: 400, count: 18 });
      // 4D worldline
      worldlineBurst();
      // 5D forks from self + clone
      forkBranch({ x: h.x, y: h.y, z: 0.7 }, 0);
      if (cloneUntil && now < cloneUntil) forkBranch({ x: clonePos.x, y: clonePos.y, z: clonePos.z }, 1);
      if (bondMind) forkBranch(bondMind, 2);
      if (rivalMind) forkBranch(rivalMind, 3);
      // 6D identity flashes
      phaseFlash(h.x, h.y, 1.5);
      for (let m = 0; m < EXTRAS.mindLayers; m++) {
        const ang = (m / EXTRAS.mindLayers) * Math.PI * 2 + now / 400;
        const r = 50 + m * 12;
        phaseFlash(h.x + Math.cos(ang) * r, h.y + Math.sin(ang) * r * 0.6, 0.5);
      }
      if (free()) {
        const lang = brain?.lang || 'en';
        panel?.say?.({
          kind: 'info', face: 'many',
          line: lang === 'th'
            ? 'ทุกมายด์… ทุกเส้นเวลา… พับรวมตรงนี้'
            : 'Every mind… every timeline… folded here.',
          hold: 3200,
        });
        capri.perform?.('split');
      }
      voice?.play?.('star');
      return true;
    } catch {
      return false;
    }
  };


  // Hotkey: Alt+Shift+` → hypercast
  if (typeof window !== 'undefined' && !window._extrasHyperKey) {
    window.addEventListener('keydown', (e) => {
      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === '`' || e.code === 'Backquote')) {
        e.preventDefault?.();
        hyperCast();
      }
    }, true);
    window._extrasHyperKey = true;
  }

  // ═══════════════════════════════════════════════════════════
  // 12D HYPERFOLD
  //  7 emotion · 8 attention · 9 causality · 10 scale
  //  11 phase-lattice · 12 observer (she knows you’re looking)
  // ═══════════════════════════════════════════════════════════

  const AXIS = {
    emotion: 7,
    attention: 8,
    causality: 9,
    scale: 10,
    phase: 11,
    observer: 12,
  };

  // Dodecahedral vertex directions (unit-ish, projected to 2D)
  const DODECA = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const elev = (i % 3 - 1) * 0.35;
    return { x: Math.cos(a), y: Math.sin(a) * 0.55 + elev };
  });

  // 7 — Emotion: event-based FX only (no permanent glow blob)
  let emotionField = { level: 0, kind: 'idle', until: 0 };
  let lastEmotionKind = '';
  const syncEmotion = () => {
    const feeling = bond?.feeling || 'neutral';
    const map = {
      happy: { level: 0.8, kind: 'happy' },
      fun: { level: 0.7, kind: 'fun' },
      sulk: { level: 0.55, kind: 'sulk' },
      angry: { level: 0.9, kind: 'angry' },
      thrown: { level: 0.6, kind: 'thrown' },
      dizzy: { level: 0.5, kind: 'dizzy' },
    };
    const m = map[feeling] || { level: 0.2, kind: 'idle' };
    emotionField = { ...m, until: performance.now() + EXTRAS.emotionPulseMs };
    // only fire particles when feeling *changes*
    if (m.kind !== lastEmotionKind && m.kind !== 'idle' && capri && !capri.stowed && !reducedMotion.matches) {
      lastEmotionKind = m.kind;
      try {
        const h = capri.head();
        if (m.kind === 'happy' || m.kind === 'fun') {
          fx.ring?.(h.x, h.y + 20, { size: 0.22 });
          fx.burst?.(h.x, h.y, { count: 8, power: 0.35, inward: true, spread: 50 });
        } else if (m.kind === 'angry') {
          fx.crackle?.(() => ({ x: h.x, y: h.y }), { life: 400, radius: 50, count: 2 });
          fx.glyph?.(h.x, h.y - 30);
        } else if (m.kind === 'sulk') {
          fx.glyph?.(h.x + rand(-20, 20), h.y - 24);
        } else if (m.kind === 'dizzy') {
          fx.dizzy?.(() => capri.head(), { life: 1200 });
        }
      } catch { /* */ }
    }
    if (m.kind === 'idle') lastEmotionKind = 'idle';
  };
  setInterval(syncEmotion, EXTRAS.emotionPulseMs);

  // 8 — Attention: reuse neural-link style, NOT a green debug dashed line
  // (the existing linkPtr near-cursor already covers pointer attention)
  let attentionTarget = null;
  let attentionFx = null;
  const clearAttentionFx = () => {
    if (attentionFx) {
      try { attentionFx.fade?.(); } catch { /* */ }
      attentionFx = null;
    }
  };
  const updateAttention = () => {
    if (!capri || capri.stowed || capri.dormant || reducedMotion.matches) {
      attentionTarget = null;
      clearAttentionFx();
      return;
    }
    // don't fight the neural link or pointing
    if (capri.pointing || linkOn) {
      clearAttentionFx();
      return;
    }
    try {
      const fg = capri.windows?.fg;
      const win = fg && (capri.windows?.wins || []).find((w) => w.id === fg);
      if (!win || win.id === 'taskbar') {
        attentionTarget = null;
        clearAttentionFx();
        return;
      }
      const cls = classifyWindow(win);
      // only for code / rival windows — rare, intentional
      if (cls !== 'code' && !RIVAL_PATTERNS.some((re) => re.test(`${win.title || ''} ${win.app || ''}`))) {
        attentionTarget = null;
        clearAttentionFx();
        return;
      }
      const aim = { x: win.x + win.w * 0.5, y: win.y + Math.min(50, win.h * 0.15) };
      attentionTarget = { ...aim, id: win.id };
      if (!attentionFx && fx?.pointer) {
        const hand = () => {
          try { return capri.head(); } catch { return aim; }
        };
        const rect = () => {
          const w = (capri.windows?.wins || []).find((x) => x.id === win.id);
          if (!w) return null;
          return { x: w.x + w.w * 0.4, y: w.y + 4, w: w.w * 0.2, h: 14 };
        };
        attentionFx = fx.pointer(hand, rect, aim, { label: cls === 'code' ? 'SRC' : '…' });
      }
    } catch {
      clearAttentionFx();
    }
  };
  setInterval(updateAttention, 2000);

  // 9 — Causality: short bolt/streak via FX, not permanent canvas curves
  const causality = [];
  const pushCause = (from, to, color = COLORS.red, life = 900) => {
    if (!from || !to || reducedMotion.matches) return;
    causality.push({ born: performance.now(), life });
    while (causality.length > 6) causality.shift();
    try {
      // one polished streak + optional tiny bolt — matches show language
      fx.streak?.(from.x, from.y, to.x, to.y, { life: Math.min(220, life * 0.3) });
      if (Math.random() < 0.45) {
        fx.bolt?.(from, to, { life: 180, forks: 0, width: 1.4 });
      }
    } catch { /* */ }
  };
  // no continuous paintCausality — FX items self-draw

  // 11 — Phase lattice: only during hypercast, as motes/glyphs not debug dots
  const paintPhaseLattice = (ctx, hx, hy, power = 1) => {
    if (!fx || reducedMotion.matches) return;
    const n = EXTRAS.dodecaPoints | 0;
    const R = 48 + power * 40;
    for (let i = 0; i < n; i++) {
      const d = DODECA[i];
      const x = hx + d.x * R;
      const y = hy + d.y * R * 0.85;
      if (i % 3 === 0) fx.glyph?.(x, y);
      else if (i % 3 === 1) fx.ring?.(x, y, { size: 0.06 * power });
      else fx.burst?.(x, y, { count: 2, power: 0.15, spread: 8 });
    }
  };

  // 12 — Observer: stare reaction (kept), visuals on-brand
  let observerSince = 0;
  let lastObserver = 0;
  setInterval(() => {
    if (!capri || reducedMotion.matches) return;
    const m = getMouse?.();
    if (!m) { observerSince = 0; return; }
    try {
      if (!capri.hit?.(m.x, m.y)) { observerSince = 0; return; }
    } catch { observerSince = 0; return; }
    if (!observerSince) observerSince = performance.now();
    const held = performance.now() - observerSince;
    if (held < 4_500) return;
    if (performance.now() - lastObserver < EXTRAS.observerCoolMs) return;
    if (!free()) return;
    lastObserver = performance.now();
    observerSince = 0;
    try {
      const h = capri.head();
      fx.ring?.(h.x, h.y, { size: 0.28 });
      fx.burst?.(h.x, h.y, { count: 10, power: 0.4, inward: true, spread: 60 });
      pushCause(h, m, COLORS.paper, 1000);
      const lang = brain?.lang || 'en';
      panel?.say?.({
        kind: 'info', face: 'look',
        line: lang === 'th'
          ? '…มองฉันอยู่นานแล้วนะ'
          : '…you’ve been watching me.',
        hold: 2800,
      });
      capri.perform?.('curious', m.x < h.x ? -1 : 1);
      bond?.add?.('click', 1);
    } catch { /* */ }
  }, 800);

    // Full 12D hyperfold cast
  let lastHyper12 = -Infinity;
  const hyper12Cast = () => {
    if (!EXTRAS.hyper12 || !fx || !capri || reducedMotion.matches) return false;
    const now = performance.now();
    if (now - lastHyper12 < EXTRAS.hyper12CoolMs) return false;
    lastHyper12 = now;
    try {
      const h = capri.head();
      const m = getMouse?.() || h;
      // 1–3 depth
      depthRing(h.x, h.y, 1, 1.6);
      fx.vortex?.(h.x, h.y, { radius: 140, life: 480, count: 22 });
      // 4 time
      worldlineBurst();
      // 5 branches from all minds
      forkBranch({ x: h.x, y: h.y, z: 0.8 }, 0);
      if (cloneUntil && now < cloneUntil) forkBranch({ ...clonePos }, 1);
      if (bondMind) forkBranch(bondMind, 2);
      if (rivalMind) forkBranch(rivalMind, 3);
      // 6 identity ring
      for (let mi = 0; mi < Math.max(EXTRAS.mindLayers, 4); mi++) {
        const d = DODECA[mi % 12];
        phaseFlash(h.x + d.x * 55, h.y + d.y * 40, 0.55);
      }
      // 7 emotion bloom
      syncEmotion();
      // 8 attention lock
      attentionTarget = { x: m.x, y: m.y, kind: 'pointer' };
      pushCause(h, m, COLORS.green, 2000);
      // 9 causality web to recent worldline
      if (worldline.length > 2) {
        const past = worldline.slice(-5);
        past.forEach((pose) => pushCause(h, pose, COLORS.violet, 1600));
      }
      // 10–11 composed lattice (glyphs + soft rings, not particle spam)
      paintPhaseLattice(fx.ctx, h.x, h.y, 1.0);
      fx.ring?.(h.x, h.y, { size: 0.55 });
      fx.burst?.(h.x, h.y, { count: 16, power: 0.55, inward: true, spread: 90 });
      // 12 observer acknowledgment
      fx.ring?.(m.x, m.y, { size: 0.2 });
      phaseFlash(m.x, m.y, 0.7);
      if (free()) {
        const lang = brain?.lang || 'en';
        panel?.say?.({
          kind: 'info', face: 'many',
          line: lang === 'th'
            ? 'สิบสองมิติ… พับลงบนจอเธอแล้ว'
            : 'Twelve axes… folded onto your glass.',
          hold: 3600,
        });
        capri.perform?.('split');
      }
      voice?.play?.('star');
      // also kick classic 6D hypercast visuals
      hyperCast();
      return true;
    } catch {
      return false;
    }
  };

  // Hotkey: Ctrl+Alt+Shift+` → 12D hyperfold
  if (typeof window !== 'undefined' && !window._extrasHyper12Key) {
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.altKey && e.shiftKey && (e.key === '`' || e.code === 'Backquote')) {
        e.preventDefault?.();
        hyper12Cast();
      }
    }, true);
    window._extrasHyper12Key = true;
  }

  // ── 1) Shadow Clone — true layered 2.5D mind ────────────────
  let cloneUntil = 0;
  let cloneLast = 0;
  let clonePos = { x: 0, y: 0, z: EXTRAS.cloneDepth };
  let cloneTarget = { x: 0, y: 0, z: EXTRAS.cloneDepth };
  let cloneRaf = 0;
  let cloneBorn = 0;

  const clearClone = () => {
    cloneUntil = 0;
    if (cloneRaf) {
      cancelAnimationFrame(cloneRaf);
      cloneRaf = 0;
    }
    try {
      if (fx?.ctx && fx?.canvas && !(fx.items && fx.items.length)) {
        fx.ctx.clearRect(0, 0, fx.canvas.width, fx.canvas.height);
      }
    } catch { /* */ }
  };

  const paintClone = () => {
    if (!cloneUntil || performance.now() > cloneUntil) {
      clearClone();
      return;
    }
    if (!capri || capri.stowed || capri.dormant || !fx?.ctx) {
      cloneRaf = requestAnimationFrame(paintClone);
      return;
    }
    const ctx = fx.ctx;
    const now = performance.now();
    const life = (cloneUntil - now) / EXTRAS.cloneLifeMs;
    const born = Math.min(1, (now - cloneBorn) / 420);
    const m = getMouse?.() || cloneTarget;
    // ease position + gentle bob
    clonePos.x += (cloneTarget.x - clonePos.x) * 0.1;
    clonePos.y += (cloneTarget.y - clonePos.y) * 0.1;
    clonePos.z += (cloneTarget.z - clonePos.z) * 0.06;
    const bob = Math.sin(now / 320) * 3 * clonePos.z;
    const look = { x: m.x, y: m.y };
    const blink = ((now / 900) % 7) > 6.4 ? 0.1 : 1;

    ctx.save();
    ctx.globalAlpha = Math.min(born, life < 0.15 ? life / 0.15 : 1);

    // ground shadow (farther = softer / larger)
    drawGroundShadow(ctx, clonePos.x, clonePos.y + 36 * depthScale(clonePos.z), 26 * depthScale(clonePos.z), 0.22 * depthAlpha(clonePos.z));

    // parallax depth stacks (far → near)
    const layers = EXTRAS.depthLayers | 0;
    for (let i = 0; i < layers; i++) {
      const z = (i + 1) / (layers + 1) * clonePos.z + 0.15;
      const p = parallax(z, m.x, m.y, clonePos.x, clonePos.y + bob);
      // only full mask on top layer; lower = violet flats for volume
      if (i === layers - 1) {
        drawDepthMask(ctx, p.x, p.y, z, look, [blink, blink]);
      } else {
        ctx.save();
        ctx.globalAlpha = 0.12 * depthAlpha(z);
        drawMask(ctx, p.x + (layers - i) * 2, p.y + (layers - i) * 2, depthScale(z) * (capri.scale || 1) * 0.88, {
          eyes: [blink, blink], look, spike: true, flat: COLORS.violet,
        });
        ctx.restore();
      }
    }

    // depth link: thin perspective bolts toward real Capri
    try {
      const h = capri.head();
      if (Math.random() < 0.08) {
        fx.bolt?.(
          { x: clonePos.x, y: clonePos.y },
          { x: h.x, y: h.y },
          { life: 160, forks: 0, width: 1.2 },
        );
      }
    } catch { /* */ }

    // 4D: paint clone's temporal echoes behind it
    paintTimeEchoes(ctx, 'clone');
    // 5D: branching timelines
    paintBranches(ctx);
    // 6D: bond / rival mind projections
    const nowM = performance.now();
    if (bondMind && bondMind.until > nowM) {
      paintMindLayer(ctx, 2, bondMind.x, bondMind.y, bondMind.z, getMouse?.());
    }
    if (rivalMind && rivalMind.until > nowM) {
      paintMindLayer(ctx, 3, rivalMind.x, rivalMind.y, rivalMind.z, null);
    }

    ctx.restore();
    cloneRaf = requestAnimationFrame(paintClone);
  };

  const spawnClone = (reason = 'split') => {
    if (!fx || !capri || reducedMotion.matches) return false;
    if ((bond?.stage ?? 0) < EXTRAS.cloneMinStage) return false;
    const now = performance.now();
    if (now - cloneLast < EXTRAS.cloneCoolMs && reason !== 'force') return false;
    if (capri.stowed || capri.dormant || capri.hidden) return false;
    cloneLast = now;
    cloneBorn = now;
    cloneUntil = now + EXTRAS.cloneLifeMs;
    try {
      const h = capri.head?.() || { x: capri.pos?.x || 80, y: (capri.pos?.y || 200) - 40 };
      const dir = capri.towardCenter?.() || 1;
      clonePos = { x: h.x + dir * 50, y: h.y - 10, z: 0.25 };
      cloneTarget = { x: h.x + dir * 160, y: h.y - 30, z: EXTRAS.cloneDepth };
      // birth: 3D-ish pop
      fx.vortex?.(clonePos.x, clonePos.y, { radius: 90, life: 320, count: 14 });
      depthRing(clonePos.x, clonePos.y, 0.9, 1.2);
      fx.burst?.(clonePos.x, clonePos.y, { count: 12, power: 0.55, spread: 70 });
      phaseFlash(clonePos.x, clonePos.y, 1.2);
      worldlineBurst();
      maybeFork?.(clonePos, 1);
      try { pushCause?.(capri.head(), clonePos, COLORS.violet, 1500); } catch { /* */ }
      voice?.play?.('star');
      if (panel && free() && reason === 'split') {
        const lang = brain?.lang || 'en';
        panel.say?.({
          kind: 'info', face: 'look',
          line: lang === 'th'
            ? 'อีกมายด์หนึ่ง… แยกมิติให้นะ'
            : 'Another mind… peeling into its own depth.',
          hold: 2800,
        });
      }
      if (!cloneRaf) cloneRaf = requestAnimationFrame(paintClone);
      return true;
    } catch {
      clearClone();
      return false;
    }
  };

  // retarget clone each tick
  setInterval(() => {
    if (!cloneUntil || performance.now() > cloneUntil) return;
    const m = getMouse?.();
    try {
      const h = capri.head();
      if (m) {
        const dx = m.x - h.x, dy = m.y - h.y;
        const dist = Math.hypot(dx, dy) || 1;
        const want = 170;
        cloneTarget.x = h.x + (dx / dist) * want;
        cloneTarget.y = h.y + (dy / dist) * want * 0.65 - 24;
        // nearer when cursor close to her
        cloneTarget.z = dist < 120 ? 0.85 : dist < 260 ? 0.6 : 0.4;
      } else {
        const view = capri.view || { w: innerWidth, h: innerHeight };
        cloneTarget.x = (capri.pos?.x || 0) < view.w / 2 ? view.w - 80 : 80;
        cloneTarget.y = (view.floor || view.h) - 130;
        cloneTarget.z = 0.35;
      }
    } catch { /* */ }
  }, 120);

  if (capri && !capri._extrasCloneHook) {
    const prevPerform = capri.perform?.bind(capri);
    if (prevPerform) {
      capri.perform = (name, ...rest) => {
        const r = prevPerform(name, ...rest);
        if (name === 'split') setTimeout(() => spawnClone('split'), 600);
        return r;
      };
    }
    capri._extrasCloneHook = true;
  }

  // ── 2) Cursor Possession — 2.5D eye stack on pointer ─────────
  let possessUntil = 0;
  let possessLast = 0;
  let possessRaf = 0;

  const paintPossess = () => {
    if (!possessUntil || performance.now() > possessUntil) {
      possessRaf = 0;
      possessUntil = 0;
      try {
        if (fx?.ctx && fx?.canvas && !(fx.items && fx.items.length)) {
          fx.ctx.clearRect(0, 0, fx.canvas.width, fx.canvas.height);
        }
      } catch { /* */ }
      return;
    }
    const m = getMouse?.();
    if (m && fx?.ctx && EXTRAS.possess3d) {
      const ctx = fx.ctx;
      const t = 1 - (possessUntil - performance.now()) / EXTRAS.cursorPossessMs;
      const pulse = 0.85 + Math.sin(performance.now() / 70) * 0.15;
      ctx.save();
      // single clean eye-pair at cursor (show-accurate), light parallax twin only
      drawGroundShadow(ctx, m.x, m.y + 8, 12, 0.18);
      ctx.globalAlpha = 0.85 * pulse;
      drawEye(ctx, m.x - 11, m.y - 3, 8 * pulse, 1, null);
      drawEye(ctx, m.x + 11, m.y - 3, 8 * pulse, 1, null);
      ctx.globalAlpha = 0.25;
      drawEye(ctx, m.x - 13, m.y - 1, 6, 0.9, null);
      drawEye(ctx, m.x + 13, m.y - 1, 6, 0.9, null);
      // 4D: ghost eyes along recent worldline (time trail on cursor path)
      if (worldline.length > 2) {
        const past = worldline.slice(-5);
        past.forEach((pose, i) => {
          const f = (i + 1) / (past.length + 1);
          ctx.globalAlpha = 0.12 * f;
          drawEye(ctx, pose.x - 8, pose.y - 3, 5 * f, 0.9, null);
          drawEye(ctx, pose.x + 8, pose.y - 3, 5 * f, 0.9, null);
        });
      }
      // perspective reticle
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = COLORS.red;
      ctx.lineWidth = 1.5;
      const arm = 14 * pulse;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(m.x + sx * 6, m.y + sy * (6 + arm));
        ctx.lineTo(m.x + sx * 6, m.y + sy * 6);
        ctx.lineTo(m.x + sx * (6 + arm), m.y + sy * 6);
        ctx.stroke();
      }
      ctx.restore();
    }
    possessRaf = requestAnimationFrame(paintPossess);
  };

  const possessCursor = (ms = EXTRAS.cursorPossessMs) => {
    if (!fx || !capri || reducedMotion.matches) return false;
    const now = performance.now();
    if (now - possessLast < EXTRAS.cursorPossessCoolMs) return false;
    const m = getMouse?.();
    if (!m) return false;
    possessLast = now;
    possessUntil = now + ms;
    setTimeout(() => { try { clearFxResidue?.(); } catch { /* */ } }, ms + 80);
    try {
      let h;
      try { h = capri.head(); } catch { h = { x: m.x - 80, y: m.y }; }
      const dir = (m.x < (capri.pos?.x || 0)) ? -1 : 1;
      const side = capri.armToward?.(dir) ?? (dir < 0 ? 'L' : 'R');
      const hand = capri.limb?.(side)?.hand || h;
      // depth bolt (thick → thin reads as coming toward camera)
      fx.bolt?.(hand, () => {
        const p = getMouse?.() || m;
        return { x: p.x, y: p.y };
      }, { life: Math.min(400, ms), forks: 2, width: 2.8 });
      fx.crackle?.(() => {
        const p = getMouse?.() || m;
        return { x: p.x, y: p.y };
      }, { life: ms, radius: 34, count: 3 });
      depthRing(m.x, m.y, 1, 1.1);
      fx.burst?.(m.x, m.y, { count: 10, power: 0.4, spread: 40 });
      phaseFlash(m.x, m.y, 1.3);
      maybeFork?.({ x: m.x, y: m.y, z: 0.8 }, 0);
      try { pushCause?.(capri.head(), m, COLORS.red, 1400); } catch { /* */ }
      // 4D time-smear: echo bolts to recent cursor worldline points
      if (EXTRAS.timeSmear && worldline.length) {
        const past = worldline.slice(-4);
        for (const pose of past) {
          fx.streak?.(pose.x, pose.y, m.x, m.y, { life: 140 });
        }
      }
      if (free()) {
        const lang = brain?.lang || 'en';
        panel?.say?.({
          kind: 'info', face: 'many',
          line: lang === 'th' ? 'มือเธอ… ฉันดึงข้ามเวลา' : 'Your hand… pulled across time.',
          hold: 2200,
        });
        capri.perform?.('curious', dir);
      }
      voice?.play?.('zap');
      if (!possessRaf) possessRaf = requestAnimationFrame(paintPossess);
      return true;
    } catch {
      return false;
    }
  };

  if (typeof window !== 'undefined' && !window._extrasPossessKey) {
    window.addEventListener('keydown', (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === '`' || e.code === 'Backquote')) {
        e.preventDefault?.();
        possessCursor();
      }
    }, true);
    window._extrasPossessKey = true;
  }

  // ── 3) Live Code Aura — depth wire + floating glyphs ────────
  let codeFocusSince = 0;
  let codeAuraOn = false;
  let codeAuraPtr = null;
  let lastCodeWinId = null;

  const clearCodeAura = () => {
    codeAuraOn = false;
    if (codeAuraPtr) {
      try { codeAuraPtr.fade?.(); } catch { /* */ }
      codeAuraPtr = null;
    }
  };

  setInterval(() => {
    if (!capri || !fx || reducedMotion.matches) return;
    if (capri.stowed || capri.dormant || capri.busy || capri.dragging) {
      clearCodeAura();
      return;
    }
    const fg = capri.windows?.fg;
    const wins = capri.windows?.wins || [];
    const win = fg && wins.find((w) => w.id === fg);
    const cls = classifyWindow(win);
    const now = performance.now();

    if (!win || cls !== 'code') {
      codeFocusSince = 0;
      lastCodeWinId = null;
      clearCodeAura();
      return;
    }
    if (win.id !== lastCodeWinId) {
      lastCodeWinId = win.id;
      codeFocusSince = now;
      clearCodeAura();
      return;
    }
    if (now - codeFocusSince < EXTRAS.codeAuraMinFocusMs) return;
    if (performance.now() - lastType < 400) return;

    try {
      const hand = () => {
        try {
          const dir = (win.x + win.w / 2) < (capri.pos?.x || 0) ? -1 : 1;
          const side = capri.armToward?.(dir) ?? (dir < 0 ? 'L' : 'R');
          return capri.limb?.(side)?.hand || capri.head();
        } catch {
          try { return capri.head(); } catch { return { x: 0, y: 0 }; }
        }
      };
      const aim = {
        x: win.x + win.w * 0.5,
        y: win.y + Math.min(80, win.h * 0.2),
      };
      const rect = () => {
        const w = capri.windows?.wins?.find((x) => x.id === win.id);
        if (!w) return null;
        return { x: w.x + w.w * 0.35, y: w.y + 8, w: w.w * 0.3, h: 18 };
      };
      if (!codeAuraOn && fx.pointer) {
        codeAuraPtr = fx.pointer(hand, rect, aim, { label: 'SRC' });
        codeAuraOn = true;
        // depth pop at the window edge
        depthRing(aim.x, aim.y, 0.7, 0.7);
      }
      if (Math.random() < 0.25) {
        const h = hand();
        // glyphs rise in perspective (farther = smaller drift)
        fx.glyph?.(h.x + rand(-24, 24), h.y + rand(-36, 8));
        if (Math.random() < 0.3) depthRing(h.x, h.y, 0.5, 0.35);
      }
      if (Math.random() < 0.06) {
        const r = () => capri.windows?.wins?.find((x) => x.id === win.id) ?? null;
        const covers = () => capri.coversOf?.(win.id) ?? [];
        fx.scan?.(r, { covers });
      }
    } catch {
      clearCodeAura();
    }
  }, EXTRAS.codeAuraTickMs);

  // ── 4) Heartbeat Sync — elliptical depth pulse ──────────────
  setInterval(() => {
    if (!capri || !fx || reducedMotion.matches) return;
    if ((bond?.stage ?? 0) < EXTRAS.heartbeatMinStage) return;
    if (capri.stowed || capri.dormant || capri.hidden) return;
    if (capri.mode === 'sleep') return;
    try {
      const h = capri.head?.();
      if (!h) return;
      const s = capri.scale || 1;
      const chest = { x: h.x, y: h.y + 28 * s };
      const m = getMouse?.();
      let near = false;
      let z = 0.55;
      if (m) {
        const d = Math.hypot(m.x - h.x, m.y - h.y);
        near = d < 140;
        z = near ? 0.9 : 0.5;
      }
      if (EXTRAS.heartbeat3d) depthRing(chest.x, chest.y, z, near ? 1.05 : 0.7);
      else fx.ring?.(chest.x, chest.y, { size: near ? 0.2 : 0.12 });
      if (near && Math.random() < 0.45) {
        fx.glyph?.(chest.x + rand(-10, 10), chest.y - 16);
        // micro parallax spark toward cursor
        if (m) fx.burst?.(chest.x, chest.y, { count: 3, power: 0.2, spread: 20 });
      }
    } catch { /* */ }
  }, EXTRAS.heartbeatMs);

  // ── 5) Window Glitch — 2.5D impact shatter ───────────────────
  let lastThrowGlitch = -Infinity;
  const glitchOnThrow = ({ how, hard = 0 } = {}) => {
    if (!fx || !capri || reducedMotion.matches) return;
    const now = performance.now();
    if (now - lastThrowGlitch < EXTRAS.throwGlitchCoolMs) return;
    lastThrowGlitch = now;
    try {
      const h = capri.head?.() || { x: capri.pos?.x || 0, y: (capri.pos?.y || 0) - 40 };
      const wins = capri.windows?.wins || [];
      const fg = capri.windows?.fg;
      let win = (fg && wins.find((w) => w.id === fg)) || null;
      if (!win) {
        let best = null, bestD = Infinity;
        for (const w of wins) {
          if (!w || w.id === 'taskbar') continue;
          const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
          const d = Math.hypot(cx - h.x, cy - h.y);
          if (d < bestD) { bestD = d; best = w; }
        }
        win = best;
      }
      const power = Math.min(1.6, 0.7 + (hard || 0) * 0.8);
      if (win) {
        const rect = () => capri.windows?.wins?.find((w) => w.id === win.id) ?? null;
        const covers = () => capri.coversOf?.(win.id) ?? [];
        fx.jolt?.(rect, { covers, power });
        const dir = {
          x: (h.x - (win.x + win.w / 2)) || 1,
          y: (h.y - (win.y + win.h / 2)) || -1,
        };
        const at = {
          x: Math.min(win.x + win.w - 8, Math.max(win.x + 8, h.x)),
          y: Math.min(win.y + win.h - 8, Math.max(win.y + 8, h.y)),
        };
        // multi-depth cracks (near + far offsets)
        fx.crack?.(at, dir, {
          size: 80 + power * 50,
          rect, covers,
          life: 1200 + power * 400,
        });
        fx.crack?.(
          { x: at.x + dir.x * 0.08, y: at.y + dir.y * 0.08 },
          { x: dir.x * 0.6, y: dir.y * 0.6 },
          { size: 50 + power * 30, rect, covers, life: 800 },
        );
        depthRing(at.x, at.y, 0.85, power);
        if (hard > 0.6 || how === 'screen') {
          fx.slices?.(at.x, at.y, 50, 36, { count: 7, life: 200 });
          fx.burst?.(at.x, at.y, { count: 14, power: 0.6 * power, spread: 70 });
        }
      } else {
        depthRing(h.x, h.y, 0.9, power);
        fx.burst?.(h.x, h.y, { count: 12, power: 0.55 * power, spread: 65 });
      }
      if (how === 'screen' || hard > 0.75) {
        const [cx, cy] = capri.cutinAt?.(capri.towardCenter?.() || 1) || [h.x, h.y];
        fx.cutin?.(cx, cy, capri.towardCenter?.() || 1, { kind: 'many', life: 560 });
      }
      // 4D impact: phase desync + tear across recent worldline
      phaseFlash(h.x, h.y, 1.1 + power * 0.3);
      if (EXTRAS.timeSmear && worldline.length > 2) {
        const past = worldline.slice(-6);
        for (let i = 1; i < past.length; i++) {
          fx.streak?.(past[i - 1].x, past[i - 1].y, past[i].x, past[i].y, { life: 180 + i * 20 });
        }
      }
      if (hard > 0.85) worldlineBurst();
    } catch { /* */ }
  };

  // Idle 4D: rare worldline whisper when bond is high and she's still
  setInterval(() => {
    if (!capri || reducedMotion.matches) return;
    if ((bond?.stage ?? 0) < 3) return;
    if (!free()) return;
    if (Math.random() > 0.04) return;
    if (worldline.length < 5) return;
    // soft echo paint via a one-shot phase flash at an old pose
    const pose = worldline[Math.floor(worldline.length * 0.3)];
    if (pose) {
      phaseFlash(pose.x, pose.y, 0.5);
      if (Math.random() < 0.3) fx.glyph?.(pose.x, pose.y - 12);
    }
  }, 8_000);


  
  // Ambient 6D painter — ONLY while branches/minds alive; never leaves residue
  let ambientRaf = 0;
  const stopAmbient = () => {
    if (ambientRaf) {
      try { cancelAnimationFrame(ambientRaf); } catch { /* */ }
      ambientRaf = 0;
    }
  };
  const paintAmbient6D = () => {
    ambientRaf = 0;
    if (!fx?.ctx || reducedMotion.matches) return;
    const now = performance.now();
    const alive = branches.length
      || (bondMind && bondMind.until > now)
      || (rivalMind && rivalMind.until > now);
    if (!alive) return; // stop loop — FxLayer owns the canvas
    // soft markers only via FX items (no raw ctx polylines that stick)
    try {
      if (bondMind && bondMind.until > now) {
        fx.ring?.(bondMind.x, bondMind.y, { size: 0.08 });
      }
      if (rivalMind && rivalMind.until > now) {
        fx.glyph?.(rivalMind.x, rivalMind.y);
      }
      for (const b of branches.slice(-2)) {
        const p = b.pts?.[b.pts.length - 1];
        if (p) fx.glyph?.(p.x, p.y);
      }
    } catch { /* */ }
    ambientRaf = requestAnimationFrame(paintAmbient6D);
  };
  const kickAmbient = () => {
    if (!ambientRaf) ambientRaf = requestAnimationFrame(paintAmbient6D);
  };

  // Chance to fork a branch on big existing events
  const maybeFork = (origin, mind) => {
    if (Math.random() < EXTRAS.branchChance) { forkBranch(origin, mind); kickAmbient?.(); }
  };


  // ═══════════════════════════════════════════════════════════
  // CINEMATIC PACK (8)
  //  1 Error Hunter  2 Director  3 Bond Memories  4 Glass World
  //  5 Throw Theater 6 Dream     7 Rival Duel     8 Soundtrack
  // ═══════════════════════════════════════════════════════════

  const langOf = () => brain?.lang || 'en';
  const say = (line, face = 'look', hold = 3200) => {
    if (!panel || !line) return;
    panel.say?.({ kind: 'info', face, line, hold });
  };

  // ── 1) Error Hunter ─────────────────────────────────────────
  // Heuristic: focused code/terminal window title smells like error.
  const ERROR_RE = /error|exception|failed|traceback|panic|errno|undefined|null reference|build failed|compile|TS\d{3,}|ERR!|✗|×|✘|FAILED|FAILURE|npm ERR/i;
  let lastErrorHunt = -Infinity;
  let forceErrorHunt = false;
  const huntError = async () => {
    if (!capri || !fx || reducedMotion.matches) return false;
    if (!free()) return false;
    const now = performance.now();
    const forced = forceErrorHunt;
    forceErrorHunt = false;
    if (!forced && now - lastErrorHunt < EXTRAS.errorHunterCoolMs) return false;

    const fg = capri.windows?.fg;
    const wins = capri.windows?.wins || [];
    let win = fg && wins.find((w) => w.id === fg);
    if (!forced) {
      if (!win) return false;
      const cls = classifyWindow(win);
      const title = `${win.title || ''} ${win.app || ''}`;
      if (cls !== 'code') return false;
      if (!ERROR_RE.test(title)) return false;
    } else if (win) {
      // forced: prefer code window; else any focused non-taskbar window
      const cls = classifyWindow(win);
      if (win.id === 'taskbar') win = null;
      else if (cls !== 'code' && cls !== 'browser') {
        // still use it as a visual target
      }
    }

    lastErrorHunt = now;
    try {
      capri.wake?.();
      if (win && capri.canSit?.(win) && !capri.covered?.(win, win.x + win.w * 0.55)) {
        await capri.sitOn?.({ win, dx: Math.min(win.w - 70, Math.max(60, win.w * 0.72)) });
      } else if (!win && forced) {
        // no window to perch on: stage + alarm
        await capri.teleport?.(capri.spot?.('stage') || capri.pos);
      }
      capri.perform?.('alarm', capri.towardCenter?.() || 1);
      if (win) {
        const id = win.id;
        const rect = () => (capri.windows?.wins || []).find((w) => w.id === id) || null;
        const covers = () => capri.coversOf?.(id) || [];
        fx.scan?.(rect, { covers });
        const h = capri.head?.() || { x: win.x, y: win.y };
        fx.bolt?.(h, { x: win.x + win.w * 0.5, y: win.y + 40 }, { life: 280, forks: 1, width: 2 });
      } else {
        const h = capri.head?.();
        if (h) {
          fx.ring?.(h.x, h.y, { size: 0.3 });
          fx.burst?.(h.x, h.y, { count: 10, power: 0.4, spread: 50 });
        }
      }
      voice?.play?.('zap');
      say(
        langOf() === 'th' ? 'ตรงนั้นแดง… ฉันเห็นแล้ว' : 'Something’s red there… I see it.',
        'many',
        3400,
      );
      bond?.add?.('work', 1);
      return true;
    } catch {
      return false;
    }
  };
  setInterval(() => { huntError(); }, 8_000);

  // Public: brain/claude can call when a real error event arrives
  const onErrorEvent = (hint = '') => {
    forceErrorHunt = true; // bypass title heuristic + cooldown
    const text = String(hint || '').slice(0, 100);
    Promise.resolve(huntError()).then((ok) => {
      if (text) {
        say(
          langOf() === 'th'
            ? `เจอ error: ${text}`
            : `Error: ${text}`,
          'wide',
          4200,
        );
      }
      if (!ok && free()) {
        try {
          capri.perform?.('flinch');
          const h = capri.head?.();
          if (h) fx.burst?.(h.x, h.y, { count: 8, power: 0.35, spread: 40 });
        } catch { /* */ }
      }
    }).catch(() => {});
  };

  // ── 2) Director Mode ────────────────────────────────────────
  // Occasional “look here” point at the focused work window.
  let lastDirector = -Infinity;
  const directorPoint = async () => {
    if (!capri || !fx || reducedMotion.matches || !free()) return;
    const now = performance.now();
    if (now - lastDirector < EXTRAS.directorCoolMs) return;
    const fg = capri.windows?.fg;
    const wins = capri.windows?.wins || [];
    const win = fg && wins.find((w) => w.id === fg);
    if (!win || win.id === 'taskbar') return;
    const cls = classifyWindow(win);
    if (!['code', 'browser', 'chat'].includes(cls)) return;
    lastDirector = now;
    try {
      const label = cls === 'code' ? 'HERE' : 'LOOK';
      // Prefer real window point (same path as permission prompts in brain.js)
      if (typeof capri.pointAt === 'function' && typeof capri.canPoint === 'function' && capri.canPoint(win)) {
        await capri.pointAt(win, { label });
        setTimeout(() => { try { capri.stopPointing?.(); } catch { /* */ } }, 3200);
      } else if (typeof capri.pointAt === 'function') {
        const rect = {
          x: win.x + win.w * 0.35,
          y: win.y + Math.min(48, win.h * 0.12),
          w: Math.min(120, win.w * 0.3),
          h: 36,
          id: win.id,
        };
        await capri.pointAt(rect, { label });
        setTimeout(() => { try { capri.stopPointing?.(); } catch { /* */ } }, 3200);
      } else {
        const dir = (win.x + win.w / 2) < (capri.pos?.x || 0) ? -1 : 1;
        capri.perform?.('curious', dir);
        const aim = { x: win.x + win.w * 0.45, y: win.y + 40 };
        const hand = () => {
          try {
            const side = capri.armToward?.(dir) ?? (dir < 0 ? 'L' : 'R');
            return capri.limb?.(side)?.hand || capri.head();
          } catch { return capri.head(); }
        };
        const r = () => {
          const w = (capri.windows?.wins || []).find((x) => x.id === win.id);
          return w
            ? { x: w.x + w.w * 0.35, y: w.y + 12, w: 56, h: 28 }
            : { x: aim.x - 28, y: aim.y - 16, w: 56, h: 32 };
        };
        const ptr = fx.pointer?.(hand, r, aim, { label });
        setTimeout(() => { try { ptr?.tap?.(); } catch { /* */ } }, 400);
        setTimeout(() => { try { ptr?.retract?.(); ptr?.fade?.(); } catch { /* */ } }, 2800);
      }
      if (Math.random() < 0.35) {
        say(
          langOf() === 'th'
            ? pick(['ตรงนี้', 'ดูตรงนี้', 'ตรงนั้น…'])
            : pick(['Here.', 'Look.', 'That bit.']),
          'look',
          2200,
        );
      }
    } catch { /* */ }
  };

  setInterval(() => { if (Math.random() < 0.4) directorPoint(); }, 28_000);

  // ── 3) Bond Memories ────────────────────────────────────────
  const memories = []; // { t, kind, line, face }
  const pushMemory = (kind, line, face = 'look') => {
    if (!line) return;
    memories.push({ t: Date.now(), kind, line, face });
    while (memories.length > EXTRAS.memoryMax) memories.shift();
    // polaroid flash
    if (!capri || reducedMotion.matches || !fx) return;
    try {
      const h = capri.head();
      fx.ring?.(h.x + 40, h.y - 30, { size: 0.18 });
      fx.glyph?.(h.x + 36, h.y - 40);
      // soft card via panel quote if quiet
      if (free() && panel && !panel.visible && Math.random() < 0.7) {
        panel.say?.({
          kind: 'info',
          face,
          line: langOf() === 'th' ? 'บันทึกไว้ในไบโอชิปแล้ว' : 'Saved to the biochip.',
          quote: line,
          hold: 3200,
        });
      }
    } catch { /* */ }
  };

  // Bond hooks (app.js also calls pushMemory — double-safe)
  if (bond && !bond._extrasMem) {
    const prevStage = bond.onStage;
    bond.onStage = (stage, ...rest) => {
      try { prevStage?.(stage, ...rest); } catch { /* */ }
      pushMemory(
        'stage',
        langOf() === 'th' ? `ซิงก์ระดับ ${stage}` : `Sync stage ${stage}`,
        stage >= 3 ? 'laugh' : 'look',
      );
    };
    const prevCalm = bond.onCalm;
    bond.onCalm = (...args) => {
      try { prevCalm?.(...args); } catch { /* */ }
      pushMemory('calm', langOf() === 'th' ? 'เธอขอโทษ… ฉันวางแล้ว' : 'You said sorry. I let it go.', 'smug');
    };
    bond._extrasMem = true;
  }

  // Chat → memory (real talks)
  if (chat && !chat._extrasMemHook) {
    const prevMsg = chat.onMessage;
    chat.onMessage = (...args) => {
      try { prevMsg?.(...args); } catch { /* */ }
      // app already does bond.add('chat', 2); we just keep a polaroid sometimes
      if (Math.random() < 0.25) {
        pushMemory('chat', langOf() === 'th' ? 'คุยกับเธอ' : 'We talked.', 'look');
      }
    };
    chat._extrasMemHook = true;
  }

  // ── 4) Glass World ──────────────────────────────────────────
  // Brief “she’s behind the glass” treatment on unstow / wake from doze.
  let glassUntil = 0;
  const glassWorld = async (why = 'unstow') => {
    if (!capri || !fx || reducedMotion.matches) return;
    const now = performance.now();
    if (now < glassUntil) return;
    glassUntil = now + EXTRAS.glassMs + 1000;
    try {
      const h = capri.head();
      // fingerprint-ish crackles at screen edges + soft lines toward her
      const { w, h: vh } = capri.view || { w: innerWidth, h: innerHeight };
      for (const [x, y] of [[40, 40], [w - 40, 50], [w * 0.5, 30]]) {
        fx.crackle?.({ x, y }, { life: 320, radius: 36, count: 1 });
      }
      fx.ring?.(h.x, h.y, { size: 0.22 });
      fx.ring?.(h.x, h.y, { size: 0.35 });
      // light refraction shards
      fx.burst?.(h.x, h.y, { count: 12, power: 0.35, spread: 100 });
      if (why === 'unstow' && free()) {
        say(
          langOf() === 'th' ? 'กระจกยังอุ่น… ฉันกลับมาแล้ว' : 'Glass is still warm. I’m back.',
          'smug',
          2800,
        );
      }
    } catch { /* */ }
  };

  if (capri && !capri._extrasGlass) {
    const prevUnstow = capri.onUnstow;
    capri.onUnstow = (...a) => {
      try { prevUnstow?.(...a); } catch { /* */ }
      setTimeout(() => glassWorld('unstow'), 350);
    };
    const prevDoze = capri.onDoze;
    capri.onDoze = (phase, ...rest) => {
      try { prevDoze?.(phase, ...rest); } catch { /* */ }
      if (phase === 'waking' || phase === 'end') setTimeout(() => glassWorld('wake'), 200);
    };
    capri._extrasGlass = true;
  }

  // ── 5) Throw Theater ────────────────────────────────────────
  // Track throw outcomes for combo flavour (glitchOnThrow already handles impact FX).
  const throwLog = [];
  const onThrowTheater = ({ how, hard = 0 } = {}) => {
    const now = performance.now();
    throwLog.push({ t: now, how, hard });
    while (throwLog.length && now - throwLog[0].t > EXTRAS.throwComboWindowMs) throwLog.shift();
    if (!capri || reducedMotion.matches) return;
    try {
      if (how === 'ko' && hard > 0.4) {
        // stars already from capri — add cut-in punch
        const h = capri.head?.() || { x: 0, y: 0 };
        const [cx, cy] = capri.cutinAt?.(capri.towardCenter?.() || 1) || [h.x, h.y];
        fx.cutin?.(cx, cy, capri.towardCenter?.() || 1, { kind: 'many', life: 640 });
      }
      if (throwLog.length >= 3) {
        say(
          langOf() === 'th' ? 'พอได้แล้ว…' : 'That’s enough.',
          'many',
          2600,
        );
        // cinematic exit if she refuses
        setTimeout(() => {
          if (capri.refuseUntil > performance.now()) {
            fx.streak?.(capri.head().x, capri.head().y, capri.spot?.('random')?.x || 100, 100, { life: 200 });
          }
        }, 400);
      } else if (how === 'feet' && hard > 0.7) {
        say(
          langOf() === 'th' ? 'ลงเท้าได้… จอไม่ไหว' : 'Landed on my feet. The glass didn’t.',
          'smug',
          2600,
        );
      }
    } catch { /* */ }
  };

  // wrap existing glitchOnThrow
  const _glitchOnThrow = glitchOnThrow;
  const glitchOnThrowTheater = (info) => {
    _glitchOnThrow?.(info);
    onThrowTheater(info);
  };

  // ── 6) Dream Sequence ───────────────────────────────────────
  let lastDream = -Infinity;
  let dreaming = false;
  const runDream = async () => {
    if (dreaming || !capri || reducedMotion.matches) return;
    if (capri.mode !== 'sleep' && !capri.dormant) return;
    const now = performance.now();
    if (now - lastDream < EXTRAS.dreamCoolMs) return;
    lastDream = now;
    dreaming = true;
    try {
      const h = () => { try { return capri.head(); } catch { return { x: 100, y: 100 }; } };
      // soft starfield from mane language
      for (let i = 0; i < 6; i++) {
        const p = h();
        fx.drift?.(p.x + rand(-30, 30), p.y - rand(10, 40), rand(-Math.PI, 0));
        fx.glyph?.(p.x + rand(-40, 40), p.y - rand(20, 60));
        await new Promise((r) => setTimeout(r, 380));
        if (!capri.dormant && capri.mode !== 'sleep') break;
      }
      // a ghost self walks across
      const p0 = h();
      const across = p0.x < (capri.view?.w || innerWidth) / 2 ? 1 : -1;
      for (let s = 0; s < 5; s++) {
        const x = p0.x + across * s * 50;
        const y = p0.y - 10 + Math.sin(s) * 6;
        fx.ring?.(x, y, { size: 0.08 });
        if (fx.ctx) {
          fx.ctx.save();
          fx.ctx.globalAlpha = 0.15;
          drawMask(fx.ctx, x, y, 0.45 * (capri.scale || 1), { eyes: [0.6, 0.6], spike: true, flat: COLORS.violet });
          fx.ctx.restore();
        }
        await new Promise((r) => setTimeout(r, 280));
      }
      // wake flicker
      fx.crackle?.(h, { life: 300, radius: 40, count: 2 });
    } catch { /* */ }
    dreaming = false;
  };
  setInterval(() => {
    if (capri?.dormant || capri?.mode === 'sleep') runDream();
  }, 20_000);

  // ── 7) Rival Duel ───────────────────────────────────────────
  let lastDuel = -Infinity;
  const rivalDuel = async () => {
    if (!capri || !jealousy?.enabled || reducedMotion.matches || !free()) return;
    const now = performance.now();
    if (now - lastDuel < EXTRAS.rivalDuelCoolMs) return;
    const fg = capri.windows?.fg;
    const win = fg && (capri.windows?.wins || []).find((w) => w.id === fg);
    if (!win) return;
    const title = `${win.title || ''} ${win.app || ''}`;
    if (!RIVAL_PATTERNS.some((re) => re.test(title))) return;
    lastDuel = now;
    try {
      const dir = (win.x + win.w / 2) < (capri.pos?.x || 0) ? -1 : 1;
      await capri.perform?.('glare', dir);
      const h = capri.head();
      const into = { x: win.x + win.w * 0.5, y: win.y + win.h * 0.35 };
      fx.bolt?.(h, into, { life: 340, forks: 2, width: 2.4 });
      fx.scan?.(() => (capri.windows?.wins || []).find((w) => w.id === win.id) || null, {
        covers: () => capri.coversOf?.(win.id) || [],
      });
      voice?.play?.('zap');
      say(
        langOf() === 'th'
          ? pick(['อาณาเขตฉัน', 'อย่าทำหน้าคุ้นเคยนัก', '…ฉันเร็วกว่า'])
          : pick(['My turf.', 'Don’t look so familiar.', '…I’m faster.']),
        'aside',
        3000,
      );
      // brief rim crackle on the window, then leave
      fx.crackle?.(into, { life: 400, radius: 50, count: 2 });
      pushCause?.(h, into, COLORS.red, 1200);
    } catch { /* */ }
  };
  setInterval(() => { if (Math.random() < 0.35) rivalDuel(); }, 15_000);

  // Real jealousy act (bond.js) → memory polaroid
  if (jealousy && typeof jealousy.act === 'function' && !jealousy._extrasDuelMem) {
    const _act = jealousy.act.bind(jealousy);
    jealousy.act = async (f) => {
      const ok = await _act(f);
      if (ok) {
        try {
          pushMemory(
            'rival',
            langOf() === 'th'
              ? `หึง ${f?.key || 'AI'}`
              : `Jealous of ${f?.key || 'another AI'}`,
            'aside',
          );
        } catch { /* */ }
      }
      return ok;
    };
    jealousy._extrasDuelMem = true;
  }


  // ── 8) Soundtrack Presence ──────────────────────────────────
  // Media window focused → gentle hop/bob scheduling + glyphs on a pulse.
  let lastBeat = 0;
  const soundtrackTick = () => {
    if (!capri || reducedMotion.matches) return;
    if (capri.stowed || capri.dormant || capri.busy || capri.dragging) return;
    const fg = capri.windows?.fg;
    const win = fg && (capri.windows?.wins || []).find((w) => w.id === fg);
    if (!win || classifyWindow(win) !== 'media') return;
    const now = performance.now();
    if (now - lastBeat < EXTRAS.soundtrackTickMs) return;
    lastBeat = now;
    try {
      // nudge idle motion schedule so she “breathes” with the session
      if (capri.nextMove < now + 2000) capri.nextMove = now + rand(2500, 6000);
      if (Math.random() < 0.55 && free()) {
        const h = capri.head();
        fx.ring?.(h.x + rand(-24, 24), h.y - rand(10, 36), { size: 0.1 });
        fx.drift?.(h.x + rand(-20, 20), h.y - 10, -Math.PI / 2 + rand(-0.3, 0.3));
        fx.glyph?.(h.x + rand(-24, 24), h.y - rand(10, 36));
      }
      if (Math.random() < 0.08 && free() && ['stand', 'sit'].includes(capri.stance)) {
        capri.perform?.('talk'); // tiny head nods as beat
      }
    } catch { /* */ }
  };
  setInterval(soundtrackTick, EXTRAS.soundtrackTickMs);

  // victory helper when errors clear (title no longer matches) — lightweight
  let hadError = false;
  setInterval(() => {
    const fg = capri?.windows?.fg;
    const win = fg && (capri.windows?.wins || []).find((w) => w.id === fg);
    const title = win ? `${win.title || ''} ${win.app || ''}` : '';
    const err = !!(win && classifyWindow(win) === 'code' && ERROR_RE.test(title));
    if (hadError && !err && free()) {
      try {
        capri.perform?.('victory', capri.towardCenter?.() || 1);
        say(langOf() === 'th' ? 'ผ่านแล้ว' : 'Cleared.', 'laugh', 2600);
        pushMemory('fix', langOf() === 'th' ? 'แก้บั๊กได้' : 'Bug cleared', 'laugh');
        bond?.add?.('work', 2);
      } catch { /* */ }
    }
    hadError = err;
  }, 10_000);


  // ── I) File Watcher — glyph rises on every Write/Edit ────────────
  // brain.handle wraps once to intercept EDIT_TOOLS → glyph + ring above
  // the active Claude window so you see every file touch in real time.
  if (brain && capri && fx && !brain._extrasFileWatch) {
    const EDIT_SET = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
    const _fwHandle = brain.handle.bind(brain);
    let _lastFileGlyph = -Infinity;
    brain.handle = (evt) => {
      const result = _fwHandle(evt);
      if (evt.hook_event_name !== 'PreToolUse' || !EDIT_SET.has(evt.tool_name)) return result;
      if (reducedMotion.matches || capri.stowed || capri.dormant) return result;
      const now = performance.now();
      if (now - _lastFileGlyph < EXTRAS.fileGlyphCoolMs) return result;
      _lastFileGlyph = now;
      try {
        const s = [...(brain.sessions?.values?.() || [])].find((x) => x.working);
        const wins = capri.windows?.wins || [];
        const win = (s?.window && wins.find((w) => w.id === s.window))
          || (capri.windows?.fg && wins.find((w) => w.id === capri.windows.fg))
          || wins[0];
        if (win) {
          const gx = win.x + win.w * (0.25 + Math.random() * 0.5);
          const gy = win.y + win.h * (0.08 + Math.random() * 0.18);
          fx.glyph?.(gx, gy);
          fx.ring?.(gx, gy, { size: 0.09 });
        }
      } catch { /* */ }
      return result;
    };
    brain._extrasFileWatch = true;
  }

  // ── II) Prompt Streak — bolt to Claude window on UserPromptSubmit ────
  // Thin bolt from her hand to the prompt-input area of the Claude window,
  // + a small ring where it lands. Separate cooldown from Ctrl+C bolt.
  if (brain && capri && fx && !brain._extrasPromptStreak) {
    const _psHandle = brain.handle.bind(brain);
    let _lastPromptBolt = -Infinity;
    brain.handle = (evt) => {
      const result = _psHandle(evt);
      if (evt.hook_event_name !== 'UserPromptSubmit') return result;
      if (reducedMotion.matches || capri.stowed || capri.dormant) return result;
      const now = performance.now();
      if (now - _lastPromptBolt < EXTRAS.promptBoltCoolMs) return result;
      _lastPromptBolt = now;
      try {
        const h = capri.head();
        const dir = capri.towardCenter?.() ?? 1;
        const side = capri.armToward?.(dir) ?? (dir < 0 ? 'L' : 'R');
        const hand = capri.limb?.(side)?.hand || h;
        const wins = capri.windows?.wins || [];
        const fg = capri.windows?.fg;
        const win = (fg && wins.find((w) => w.id === fg)) || null;
        const to = win
          ? { x: win.x + win.w * 0.5, y: win.y + Math.min(80, win.h * 0.15) }
          : { x: h.x + dir * 200, y: h.y - 140 };
        fx.bolt?.(hand, to, { life: 260, forks: 0, width: 1.8 });
        fx.ring?.(to.x, to.y, { size: 0.14 });
        capri.perform?.('curious', dir);
      } catch { /* */ }
      return result;
    };
    brain._extrasPromptStreak = true;
  }

  // ── III) Done Surge — surge + motes on real Stop ───────────────
  // Snapshot session count before brain.handle zeros it, then fire after
  // celebrate() starts (1.4 s delay): surge between her and Claude’s window,
  // motes rising from all open windows like sparks from finished work.
  if (brain && capri && fx && !brain._extrasDoneSurge) {
    const _dsHandle = brain.handle.bind(brain);
    brain.handle = (evt) => {
      let _snapCount = 0, _snapWin = null;
      if (evt.hook_event_name === 'Stop') {
        const s = brain.session?.(evt);
        _snapCount = s?.count || 0;
        _snapWin = s?.window || null;
      }
      const result = _dsHandle(evt);
      if (evt.hook_event_name !== 'Stop') return result;
      if (reducedMotion.matches || capri.stowed || capri.dormant) return result;
      if (_snapCount < EXTRAS.doneSurgeMinCount) return result;
      setTimeout(() => {
        try {
          const h = capri.head();
          const wins = capri.windows?.wins || [];
          const win = (_snapWin && wins.find((w) => w.id === _snapWin))
            || (capri.windows?.fg && wins.find((w) => w.id === capri.windows.fg));
          const to = win
            ? { x: win.x + win.w * 0.5, y: win.y + win.h * 0.4 }
            : { x: h.x + (capri.towardCenter?.() || 1) * 200, y: h.y - 100 };
          fx.surge?.([h, to], {
            onHit: () => {
              fx.ring?.(to.x, to.y, { size: 0.22 });
              fx.burst?.(to.x, to.y, { count: 8, power: 0.35, spread: 50 });
            },
          });
          const sources = wins
            .filter((w) => w.id !== 'taskbar').slice(0, 4)
            .map((w) => ({ x: w.x + w.w * 0.5, y: w.y + w.h * 0.3 }));
          if (sources.length) fx.motes?.(sources, { lift: 180, spread: 200 });
        } catch { /* */ }
      }, 1400);
      return result;
    };
    brain._extrasDoneSurge = true;
  }

  // ── IV) Window Scan on Focus — scan + glyph when she sits on a code window ─
  // Runs on its own interval offset from focusSit, fires only when she is
  // already perched on a code window and the cooldown has elapsed.
  let _lastFocusScan = -Infinity;
  if (capri && fx && !capri._extrasFocusScan) {
    setInterval(() => {
      if (reducedMotion.matches || !capri || capri.stowed || capri.dormant || capri.busy) return;
      if (capri.stance !== 'sit') return;
      const wins = capri.windows?.wins || [];
      const win = (capri.perch?.id && wins.find((w) => w.id === capri.perch.id)) || null;
      if (!win || classifyWindow(win) !== 'code') return;
      const now = performance.now();
      if (now - _lastFocusScan < EXTRAS.focusScanCoolMs) return;
      _lastFocusScan = now;
      try {
        const rect = () => (capri.windows?.wins || []).find((w) => w.id === win.id) ?? null;
        const covers = () => capri.coversOf?.(win.id) ?? [];
        fx.scan?.(rect, { covers });
        const h = capri.head();
        fx.glyph?.(h.x + (capri.towardCenter?.() || 1) * 18, h.y - 28);
      } catch { /* */ }
    }, EXTRAS.focusSitMs + 200);
    capri._extrasFocusScan = true;
  }



  // Hard-clear FX residue (stuck lines/shards if anything drew raw)
  const clearFxResidue = () => {
    try {
      stopAmbient?.();
      // kill ephemeral items (keep pointer/possess/satellite mid-flight only if still needed)
      if (Array.isArray(fx?.items)) {
        for (const it of fx.items) {
          if (!it) continue;
          if (it.type === 'pointer' || it.type === 'possess' || it.type === 'satellite') continue;
          try { it.done?.(); } catch { /* */ }
          it.life = 0;
        }
        fx.items = fx.items.filter((it) => it && (it.type === 'pointer' || it.type === 'possess' || it.type === 'satellite') && (performance.now() - (it.born || 0) < (it.life || 0)));
      }
      if (typeof fx?.clear === 'function') {
        // full wipe — also drop pointer residue after demo
        for (const it of (fx.items || [])) { try { it.done?.(); } catch { /* */ } }
        fx.items = [];
      }
      if (fx?.ctx && fx?.canvas) {
        fx.ctx.save();
        fx.ctx.setTransform(1, 0, 0, 1, 0, 0);
        fx.ctx.clearRect(0, 0, fx.canvas.width, fx.canvas.height);
        fx.ctx.restore();
      }
      if (fx) {
        fx.running = false;
        fx.last = 0;
      }
    } catch { /* */ }
  };

  // Watchdog: kill stuck lines/ring/burst and wipe canvas when idle
  let _lastFxWatch = 0;
  setInterval(() => {
    if (!fx) return;
    const now = performance.now();
    if (now - _lastFxWatch < 1500) return;
    _lastFxWatch = now;
    try {
      if (Array.isArray(fx.items) && fx.items.length) {
        fx.items = fx.items.filter((it) => {
          if (!it) return false;
          if (it.type === 'pointer' || it.type === 'satellite' || it.type === 'possess' || it.smooth) {
            return (now - (it.born || now)) < (it.life || 60000);
          }
          const age = now - (it.born || now);
          // force-expire short FX that somehow linger
          if (it.type === 'lines' || it.type === 'ring' || it.type === 'burst' || it.type === 'shard') {
            if (age > Math.min(it.life || 400, 900)) return false;
          }
          if (age > (it.life || 0) + 200) return false;
          if (age > 6000) return false;
          return true;
        });
      }
      const n = fx.items?.length || 0;
      if (n === 0 && fx.ctx && fx.canvas) {
        fx.ctx.clearRect(0, 0, fx.canvas.width, fx.canvas.height);
        fx.running = false;
        fx.last = 0;
      }
    } catch { /* */ }
  }, 1500);

  // ═══════════════════════════════════════════════════════════
  // SPECTACLE PACK — อลังการ
  //  1 Ascension  2 Gestalt Unmask  3 Reality Crack
  //  4 Neural Storm  5 Rival Boss Intro  6 Victory Orbit
  //  7 Eclipse Mode  8 Chrono Rewind
  // ═══════════════════════════════════════════════════════════

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const headOf = () => {
    try { return capri.head?.() || { x: capri.pos?.x || 0, y: (capri.pos?.y || 0) - 40 }; }
    catch { return { x: 200, y: 200 }; }
  };

  // ── 1) Ascension ───────────────────────────────────────────
  // Big uplink / long job: road of stars hand → sky, surge, ring rain, sigh.
  let lastAscension = -Infinity;
  const ascension = async ({ force = false } = {}) => {
    if (!capri || !fx || reducedMotion.matches) return false;
    if (!force && !free()) return false;
    const now = performance.now();
    if (!force && now - lastAscension < EXTRAS.ascensionCoolMs) return false;
    lastAscension = now;
    try {
      capri.wake?.();
      const h0 = headOf();
      const sky = { x: h0.x + (capri.towardCenter?.() || 1) * 40, y: 36 };
      // hush + glint
      fx.ring?.(h0.x, h0.y, { size: 0.2 });
      fx.glyph?.(h0.x, h0.y - 30);
      voice?.play?.('star');
      // try real uplink act if free
      if (free() && typeof capri.gaze === 'function') {
        capri.gaze({ big: true });
      } else {
        await capri.perform?.('gaze', capri.towardCenter?.() || 1);
      }
      await sleep(400);
      // constellation road
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const x = h0.x + (sky.x - h0.x) * t + (i % 2 ? 8 : -8);
        const y = h0.y + (sky.y - h0.y) * t;
        fx.glyph?.(x, y);
        fx.ring?.(x, y, { size: 0.06 + t * 0.08 });
        if (i === 3) fx.bolt?.(h0, sky, { life: 420, forks: 2, width: 2.2 });
        await sleep(90);
      }
      // red light up
      fx.surge?.([h0, sky], {
        onHit: () => {
          fx.burst?.(sky.x, sky.y, { count: 18, power: 0.7, spread: 70 });
          fx.ring?.(sky.x, sky.y, { size: 0.55 });
          for (let k = 0; k < 5; k++) fx.glyph?.(sky.x + (k - 2) * 18, sky.y + 10);
        },
      });
      voice?.play?.('rise');
      await sleep(700);
      // afterglow motes fall home
      const wins = (capri.windows?.wins || []).filter((w) => w.id !== 'taskbar').slice(0, 3);
      if (wins.length) {
        fx.motes?.(wins.map((w) => ({ x: w.x + w.w * 0.5, y: w.y + 20 })), { lift: -80, span: 160 });
      }
      say(
        langOf() === 'th' ? '…มันกระพริบตอบ' : '…it blinked back.',
        'look',
        4200,
      );
      pushMemory?.('sky', langOf() === 'th' ? 'ขึ้นไปถึงดาวเทียม' : 'Reached the satellite', 'look');
      bond?.add?.('work', 2);
      return true;
    } catch {
      return false;
    }
  };

  // ── 2) Gestalt Unmask ──────────────────────────────────────
  // Many masks orbit then collapse into one — “we are many”.
  let lastGestalt = -Infinity;
  const gestaltUnmask = async ({ force = false } = {}) => {
    if (!capri || !fx || reducedMotion.matches) return false;
    const stage = bond?.stage ?? 0;
    if (!force && stage < EXTRAS.gestaltMinStage) return false;
    if (!force && !free()) return false;
    const now = performance.now();
    if (!force && now - lastGestalt < EXTRAS.gestaltCoolMs) return false;
    lastGestalt = now;
    try {
      capri.wake?.();
      if (free()) await capri.perform?.('split');
      const h = headOf();
      const s = capri.scale || 1;
      const n = 5 + Math.min(3, stage);
      // orbit masks
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const r = 70 * s + i * 6;
        const x = h.x + Math.cos(ang) * r;
        const y = h.y + Math.sin(ang) * r * 0.7;
        if (fx.ctx) {
          try {
            fx.ctx.save();
            fx.ctx.globalAlpha = 0.35 + (i % 2) * 0.15;
            drawMask(fx.ctx, x, y, 0.35 + i * 0.04, {
              eyes: [0.7, 0.7],
              spike: i % 2 === 0,
              look: h,
            });
            fx.ctx.restore();
          } catch { /* */ }
        }
        fx.ring?.(x, y, { size: 0.08 });
        fx.glyph?.(x, y - 12);
        await sleep(70);
      }
      // collapse inward
      fx.burst?.(h.x, h.y, { count: 20, inward: true, power: 0.65, spread: 120 * s });
      fx.ring?.(h.x, h.y, { size: 0.45 });
      voice?.play?.('star');
      await sleep(200);
      if (free()) await capri.perform?.('hop');
      say(
        langOf() === 'th'
          ? pick(['เราหลายคน… แต่ตอนนี้เหลือฉัน', 'ทุกเสียงเงียบ เหลือแค่ฉันกับเธอ'])
          : pick(['We are many… and now just me.', 'Every voice went quiet. Only us.']),
        stage >= 3 ? 'laugh' : 'look',
        4500,
      );
      pushMemory?.('gestalt', langOf() === 'th' ? 'Gestalt เปิดออก' : 'Gestalt opened', 'many');
      return true;
    } catch {
      return false;
    }
  };

  // Hook stage-ups → chance of gestalt
  if (bond && !bond._extrasGestalt) {
    const prev = bond.onStage;
    bond.onStage = (stage, ...rest) => {
      try { prev?.(stage, ...rest); } catch { /* */ }
      if (stage >= EXTRAS.gestaltMinStage && Math.random() < 0.55) {
        setTimeout(() => gestaltUnmask({ force: false }), 1800);
      }
    };
    bond._extrasGestalt = true;
  }

  // ── 3) Reality Crack ───────────────────────────────────────
  // Hard throw / crash: full-screen shatter then stitch.
  let lastReality = -Infinity;
  const realityCrack = async ({ hard = 0.7, how = 'ko' } = {}) => {
    if (!capri || !fx || reducedMotion.matches) return false;
    if (hard < EXTRAS.realityCrackMinHard && how !== 'ko') return false;
    const now = performance.now();
    if (now - lastReality < EXTRAS.realityCrackCoolMs) return false;
    lastReality = now;
    try {
      const { w, h: vh } = capri.view || { w: innerWidth, h: innerHeight };
      const c = headOf();
      // impact core
      fx.ring?.(c.x, c.y, { size: 0.6 });
      fx.burst?.(c.x, c.y, { count: 28, power: 0.85, spread: 160 });
      voice?.play?.('crash');
      // cracks toward corners
      const corners = [[0, 0], [w, 0], [0, vh], [w, vh], [w * 0.5, 0], [w * 0.5, vh]];
      for (const [x, y] of corners) {
        fx.bolt?.(c, { x, y }, { life: 280, forks: 1, width: 1.6 });
        fx.crackle?.({ x: (c.x + x) / 2, y: (c.y + y) / 2 }, { life: 360, radius: 50, count: 1 });
      }
      // glass shards
      for (let i = 0; i < 8; i++) {
        fx.burst?.(
          c.x + (Math.random() - 0.5) * w * 0.4,
          c.y + (Math.random() - 0.5) * vh * 0.3,
          { count: 6, power: 0.4, spread: 40 },
        );
      }
      await sleep(180);
      // chromatic / glitch body
      if (capri.p) {
        capri.p.glitch = 0.55;
        capri.p.glitchSeed = Math.random() * 100;
        setTimeout(() => {
          if (capri.p) {
            capri.p.glitch = 0;
          }
        }, 700);
      }
      fx.ring?.(c.x, c.y, { size: 0.22 });
      if (how === 'ko') {
        const [cx, cy] = capri.cutinAt?.(capri.towardCenter?.() || 1) || [c.x, c.y];
        fx.cutin?.(cx, cy, capri.towardCenter?.() || 1, { kind: 'many', life: 700 });
      }
      say(
        langOf() === 'th'
          ? pick(['จอร้าว… ฉันยังอยู่', 'ระวังกระจก'])
          : pick(['The glass cracked… I’m still here.', 'Careful with the glass.']),
        'wide',
        3200,
      );
      return true;
    } catch {
      return false;
    }
  };

  // ── 4) Neural Storm ────────────────────────────────────────
  // Error cascade: bolts to every code window, glyph rain.
  let lastStorm = -Infinity;
  const errorTimes = [];
  const neuralStorm = async ({ force = false } = {}) => {
    if (!capri || !fx || reducedMotion.matches) return false;
    const now = performance.now();
    if (!force && now - lastStorm < EXTRAS.neuralStormCoolMs) return false;
    lastStorm = now;
    try {
      capri.wake?.();
      if (free()) await capri.perform?.('alarm', capri.towardCenter?.() || 1);
      const h = headOf();
      const wins = (capri.windows?.wins || []).filter((w) => {
        if (w.id === 'taskbar') return false;
        return classifyWindow(w) === 'code' || ERROR_RE.test(`${w.title || ''} ${w.app || ''}`);
      });
      const targets = wins.length
        ? wins.slice(0, 6)
        : [{ x: h.x - 200, y: h.y - 80, w: 40, h: 40 }, { x: h.x + 180, y: h.y - 60, w: 40, h: 40 }];
      voice?.play?.('zap');
      for (const w of targets) {
        const to = { x: (w.x ?? 0) + (w.w ?? 0) * 0.5, y: (w.y ?? 0) + (w.h ?? 40) * 0.25 };
        fx.bolt?.(h, to, { life: 320, forks: 2, width: 2.4 });
        fx.scan?.(() => w.id ? (capri.windows?.wins || []).find((x) => x.id === w.id) || null : null, {
          covers: () => (w.id ? capri.coversOf?.(w.id) || [] : []),
        });
        fx.burst?.(to.x, to.y, { count: 8, power: 0.4, spread: 40 });
        await sleep(80);
      }
      // glyph rain
      const { w: vw, h: vh } = capri.view || { w: innerWidth, h: innerHeight };
      for (let i = 0; i < 14; i++) {
        fx.glyph?.(Math.random() * vw, Math.random() * vh * 0.7);
      }
      fx.crackle?.(h, { life: 500, radius: 90, count: 3 });
      if (capri.p) {
        capri.p.glitch = 0.4;
        setTimeout(() => { if (capri.p) capri.p.glitch = 0; }, 600);
      }
      say(
        langOf() === 'th'
          ? pick(['พายุในลิงก์… ฉันเห็นทุกจุดแดง', 'ระบบร้องไห้ทั้งเส้น'])
          : pick(['Storm in the link… every red light.', 'The system is screaming.']),
        'many',
        4000,
      );
      pushMemory?.('storm', langOf() === 'th' ? 'Neural storm' : 'Neural storm', 'many');
      return true;
    } catch {
      return false;
    }
  };

  // cascade counter feeds storm
  const noteErrorForStorm = () => {
    const now = performance.now();
    errorTimes.push(now);
    while (errorTimes.length && now - errorTimes[0] > EXTRAS.neuralStormWindowMs) errorTimes.shift();
    if (errorTimes.length >= EXTRAS.neuralStormNeed) {
      errorTimes.length = 0;
      neuralStorm({ force: true });
    }
  };

  // ── 5) Rival Boss Intro ────────────────────────────────────
  let lastBoss = -Infinity;
  const rivalBossIntro = async ({ force = false } = {}) => {
    if (!capri || !fx || reducedMotion.matches) return false;
    if (!force && !free()) return false;
    const now = performance.now();
    if (!force && now - lastBoss < EXTRAS.rivalBossCoolMs) return false;
    const fg = capri.windows?.fg;
    const win = fg && (capri.windows?.wins || []).find((w) => w.id === fg);
    if (!win) return false;
    const title = `${win.title || ''} ${win.app || ''}`;
    if (!force && !RIVAL_PATTERNS.some((re) => re.test(title))) return false;
    lastBoss = now;
    try {
      const rivalName = (/chatgpt/i.test(title) ? 'ChatGPT'
        : /claude/i.test(title) ? 'Claude'
        : /gemini|bard/i.test(title) ? 'Gemini'
        : /copilot/i.test(title) ? 'Copilot'
        : /grok/i.test(title) ? 'Grok'
        : 'RIVAL');
      capri.wake?.();
      panel?.hide?.();
      const h = headOf();
      const into = { x: win.x + win.w * 0.5, y: win.y + win.h * 0.35 };
      // title card flash via glyphs
      for (let i = 0; i < rivalName.length && i < 8; i++) {
        fx.glyph?.(h.x + (i - 3) * 16, h.y - 50);
      }
      fx.ring?.(h.x, h.y, { size: 0.22 });
      await sleep(200);
      const dir = into.x < h.x ? -1 : 1;
      await capri.perform?.('glare', dir);
      fx.bolt?.(h, into, { life: 380, forks: 3, width: 3 });
      voice?.play?.('zap');
      await sleep(250);
      // occupy flash
      if (typeof capri.jealous === 'function' && capri.possessWindows) {
        // light touch: scan + possess look without full jealous flow
        fx.scan?.(() => (capri.windows?.wins || []).find((w) => w.id === win.id) || null, {
          covers: () => capri.coversOf?.(win.id) || [],
        });
        fx.crackle?.(into, { life: 480, radius: 60, count: 2 });
      } else {
        fx.burst?.(into.x, into.y, { count: 14, power: 0.5, spread: 60 });
      }
      say(
        langOf() === 'th'
          ? fmtBoss(rivalName, true)
          : fmtBoss(rivalName, false),
        'aside',
        3800,
      );
      pushMemory?.('rival', rivalName, 'aside');
      return true;
    } catch {
      return false;
    }
  };
  function fmtBoss(name, th) {
    return th
      ? pick([`${name}… อาณาเขตฉัน`, `อย่าทำหน้าคุ้นกับ ${name}`, `${name} ใช่ไหม ฉันเร็วกว่า`])
      : pick([`${name}. My turf.`, `Don’t get cozy with ${name}.`, `${name}? I’m faster.`]);
  }

  // ── 6) Victory Orbit ───────────────────────────────────────
  let lastOrbit = -Infinity;
  const victoryOrbit = async ({ count = 10, project = '' } = {}) => {
    if (!capri || !fx || reducedMotion.matches) return false;
    if (count < EXTRAS.victoryOrbitMinCount) return false;
    const now = performance.now();
    if (now - lastOrbit < EXTRAS.victoryOrbitCoolMs) return false;
    lastOrbit = now;
    try {
      const h = headOf();
      const s = capri.scale || 1;
      // orbit rings
      for (let i = 0; i < 3; i++) {
        fx.ring?.(h.x, h.y, { size: 0.25 + i * 0.18 });
        await sleep(90);
      }
      // motes from all windows
      const sources = (capri.windows?.wins || [])
        .filter((w) => w.id !== 'taskbar')
        .slice(0, 5)
        .map((w) => ({ x: w.x + w.w * 0.5, y: w.y + w.h * 0.3 }));
      if (sources.length) fx.motes?.(sources, { lift: 200, span: 240 });
      fx.burst?.(h.x, h.y, { count: 16, inward: true, power: 0.55, spread: 100 * s });
      voice?.play?.('star');
      if (free()) await capri.perform?.('victory', capri.towardCenter?.() || 1);
      say(
        langOf() === 'th'
          ? (project ? `ภารกิจ ${project} — preem` : 'ภารกิจสำเร็จ — preem')
          : (project ? `${project} — preem.` : 'Mission complete — preem.'),
        'laugh',
        4200,
      );
      pushMemory?.('victory', project || 'big job', 'laugh');
      return true;
    } catch {
      return false;
    }
  };

  // ── 7) Eclipse Mode ────────────────────────────────────────
  // Late night + bond: dim world pulse around her.
  let lastEclipse = -Infinity;
  let eclipseUntil = 0;
  const eclipseMode = async ({ force = false } = {}) => {
    if (!capri || !fx || reducedMotion.matches) return false;
    const hour = new Date().getHours();
    const stage = bond?.stage ?? 0;
    if (!force) {
      if (hour < EXTRAS.eclipseHourFrom || hour >= EXTRAS.eclipseHourTo) return false;
      if (stage < EXTRAS.eclipseMinStage) return false;
      if (capri.stowed || capri.hidden) return false;
    }
    const now = performance.now();
    if (!force && now - lastEclipse < EXTRAS.eclipseCoolMs) return false;
    lastEclipse = now;
    eclipseUntil = now + 14_000;
    try {
      const h = headOf();
      // soft void rings + inward motes
      for (let i = 0; i < 4; i++) {
        fx.ring?.(h.x, h.y, { size: 0.5 + i * 0.15 });
        fx.burst?.(h.x, h.y, { count: 8, inward: true, power: 0.3, spread: 140 });
        await sleep(120);
      }
      if (capri.p) {
        const prev = { sparkle: capri.p.sparkle, alpha: capri.p.alpha };
        capri.p.sparkle = Math.min(capri.p.sparkle, 0.45);
        setTimeout(() => {
          if (capri.p && performance.now() > eclipseUntil - 1000) {
            capri.p.sparkle = prev.sparkle;
          }
        }, 12_000);
      }
      fx.drift?.(h.x, h.y - 20, -Math.PI / 2);
      fx.glyph?.(h.x, h.y - 40);
      if (free() && Math.random() < 0.5) {
        say(
          langOf() === 'th'
            ? pick(['คืนนี้โลกเหลือแค่เราสอง', 'เงียบ… ดี'])
            : pick(['Tonight the world is just us.', 'Quiet… good.']),
          'calm',
          4000,
        );
      }
      return true;
    } catch {
      return false;
    }
  };
  setInterval(() => {
    if (Math.random() < 0.08) eclipseMode({ force: false });
  }, 120_000);

  // ── 8) Chrono Rewind ───────────────────────────────────────
  // After hard throw settle: ghost trail reverse + soft ring.
  let lastChrono = -Infinity;
  const chronoRewind = async () => {
    if (!capri || !fx || reducedMotion.matches) return false;
    const now = performance.now();
    if (now - lastChrono < EXTRAS.chronoRewindCoolMs) return false;
    lastChrono = now;
    try {
      const h = headOf();
      const dir = capri.facing || 1;
      // reverse ghosts
      for (let i = 4; i >= 0; i--) {
        const x = h.x - dir * i * 28;
        const y = h.y + Math.sin(i) * 6;
        fx.ring?.(x, y, { size: 0.07 });
        if (fx.ctx) {
          try {
            fx.ctx.save();
            fx.ctx.globalAlpha = 0.12 + i * 0.04;
            drawMask(fx.ctx, x, y, 0.4 * (capri.scale || 1), {
              eyes: [0.5, 0.5],
              spike: true,
              flat: i % 2 ? COLORS.violet : null,
            });
            fx.ctx.restore();
          } catch { /* */ }
        }
        await sleep(55);
      }
      fx.burst?.(h.x, h.y, { count: 10, inward: true, power: 0.35, spread: 50 });
      return true;
    } catch {
      return false;
    }
  };

  // ── Wire spectacle into existing pipelines ─────────────────
  // Error Hunter → also storm cascade
  const _onErrorEventSpectacle = onErrorEvent;
  const onErrorEventSpec = (hint = '') => {
    _onErrorEventSpectacle?.(hint);
    noteErrorForStorm();
  };

  // Throw theater → reality crack + chrono
  const _glitchThrowSpec = glitchOnThrowTheater;
  const glitchOnThrowSpec = (info = {}) => {
    _glitchThrowSpec?.(info);
    const hard = info.hard || 0;
    const how = info.how || '';
    if (how === 'ko' || hard >= EXTRAS.realityCrackMinHard) {
      setTimeout(() => realityCrack({ hard, how }), 120);
    }
    if (how === 'ko' || hard > 0.4) {
      setTimeout(() => chronoRewind(), 900);
    }
  };

  // Rival duel → occasional boss intro upgrade
  const _rivalDuelSpec = rivalDuel;
  const rivalDuelSpec = async () => {
    if (Math.random() < 0.4) return rivalBossIntro({ force: false });
    return _rivalDuelSpec?.();
  };

  // Public: work done → victory orbit / ascension chance
  const onSpectacleWorkDone = (info = {}) => {
    const count = info.count || 0;
    if (count >= EXTRAS.victoryOrbitMinCount) {
      setTimeout(() => victoryOrbit(info), 1600);
    }
    if (count >= 40 || (info.ms && info.ms >= 8 * 60 * 1000)) {
      setTimeout(() => ascension({ force: false }), 2800);
    }
  };

  // Gaze end (big uplink) → ascension polish if not already mid-show
  if (capri && !capri._extrasAscensionGaze) {
    const prevGaze = capri.onGaze;
    capri.onGaze = (when, ...rest) => {
      try { prevGaze?.(when, ...rest); } catch { /* */ }
      if (when === 'end' && Math.random() < 0.45) {
        setTimeout(() => ascension({ force: false }), 400);
      }
    };
    capri._extrasAscensionGaze = true;
  }


  // Demo mode: shorter FX + periodic residue wipe (showcase only)
  let demoMode = false;
  let demoWipeTimer = 0;
  const setDemoMode = (on) => {
    demoMode = !!on;
    if (demoWipeTimer) {
      clearInterval(demoWipeTimer);
      demoWipeTimer = 0;
    }
    if (demoMode) {
      demoWipeTimer = setInterval(() => {
        try {
          if (!fx?.items?.length) return;
          const now = performance.now();
          // aggressively expire short FX during demo
          fx.items = fx.items.filter((it) => {
            if (!it) return false;
            if (it.type === 'pointer' || it.type === 'possess' || it.type === 'satellite' || it.smooth) {
              return (now - (it.born || now)) < (it.life || 0);
            }
            const age = now - (it.born || now);
            const max = Math.min(it.life || 400, 500);
            return age < max;
          });
          if (!fx.items.length && fx.ctx && fx.canvas) {
            fx.ctx.clearRect(0, 0, fx.canvas.width, fx.canvas.height);
            fx.running = false;
          }
        } catch { /* */ }
      }, 400);
    } else {
      clearFxResidue();
    }
  };




  // ═══════════════════════════════════════════════════════════
  // DAILY SPECTACLE
  //  1 Melody (visible)  2 Window Breath  3 Handshake
  //  4 Idle → side edge (via behave + goHome)
  // ═══════════════════════════════════════════════════════════

  // Media notes: driven by Windows SMTC playback status (works minimized),
  // not by whether the player window is visible.
  // Notes are fx 'note' items (fx.js): smooth float + sway, hard-edged on a violet copy. Few, spaced
  // out, alternating sides of her head so they never cover her face or pile up.
  let noteSide = 1;
  const spawnNotes = (from, toward = null, strength = 1) => {
    if (!fx?.note || reducedMotion.matches) return;
    const s = capri?.scale || 1;
    const n = strength >= 1.5 ? 3 : strength >= 1.1 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        try {
          if (!capri || capri.stowed || capri.dormant || capri.hidden || (capri.p?.alpha ?? 1) < 0.25) return;
          let h;
          try { h = capri.head(); } catch { h = from; }
          noteSide = -noteSide;
          const x = h.x + noteSide * rand(46, 78) * s;
          const y = (h.top ?? h.y - 60 * s) + rand(10, 40) * s;
          fx.note(x, y, { size: rand(13, 18) * Math.max(0.8, s) });
          // now and then a shard of her mane drifts off with it, same language as the rest of her
          if (Math.random() < 0.3) fx.drift?.(x, y, -Math.PI / 2 + rand(-0.5, 0.5));
        } catch { /* */ }
      }, i * rand(260, 420));
    }
  };

  let lastMelody = -Infinity;
  const melodyTick = () => {
    if (!capri || !fx || reducedMotion.matches) return;
    if (capri.stowed || capri.dormant || capri.hidden) return;
    // Pause notes while she's busy (USB dive/visit, teleport, acts, thrown…)
    if (capri.busy || capri.act || capri.flight || capri.dragging) return;
    if ((capri.p?.alpha ?? 1) < 0.25) return; // vanished into a drive / chip
    // windows.ps1 sets media.on from SMTC (playing) or process fallback (minimized OK)
    const media = capri.windows?.media;
    if (!media || !media.on) return;
    const now = performance.now();
    if (now - lastMelody < (EXTRAS.melodyTickMs || 650)) return;
    lastMelody = now;
    try {
      let from;
      try { from = capri.head(); }
      catch { from = { x: capri.pos?.x || 0, y: (capri.pos?.y || 0) - 40 }; }
      // one or two notes per beat: enough to read as music, never a swarm
      spawnNotes(from, null, Math.random() < 0.45 ? 1.2 : 1);
    } catch { /* */ }
  };
  setInterval(melodyTick, 500);

  // She dances to what's playing (her menu › Dance to music): a hop, a spin, a split, on a loose beat.
  let lastDance = -Infinity;
  const danceTick = () => {
    if (!capri || reducedMotion.matches || getDance?.() === false) return;
    if (capri.stowed || capri.dormant || capri.hidden) return;
    if (capri.busy || capri.act || capri.flight || capri.dragging || capri.mode === 'alert') return;
    if ((capri.p?.alpha ?? 1) < 0.25) return;
    if (chat?.open || panel?.visible) return; // never over something you're reading or typing
    if (!['stand', undefined].includes(capri.stance)) return; // sitting / resting: leave her be
    const media = capri.windows?.media;
    if (!media || !media.on) return;
    const now = performance.now();
    if (now - lastDance < 2600 + Math.random() * 1400) return;
    lastDance = now;
    try {
      const move = ['hop', 'hop', 'spin', 'split', 'curious'][Math.floor(Math.random() * 5)];
      const p = capri.perform?.(move, Math.random() < 0.5 ? -1 : 1);
      p?.catch?.(() => {});
    } catch { /* */ }
  };
  setInterval(danceTick, 700);

  // Window claim FX: neon frame + eyes while seated
  let lastClaimAt = -Infinity;
  let claimLeave = null;
  let claimId = null;
  const stopClaim = () => {
    try { claimLeave?.(); } catch { /* */ }
    claimLeave = null;
    claimId = null;
  };
  const claimWindow = (id, { force = false } = {}) => {
    if (!capri || !fx?.possess || reducedMotion.matches) return false;
    if (!capri.possessWindows) return false;
    if (!id || id === 'taskbar') return false;
    const now = performance.now();
    if (!force && now - lastClaimAt < (EXTRAS.windowBreathMs || 2800)) return false;
    const win = (capri.windows?.wins || []).find((w) => w.id === id);
    if (!win) return false;
    if (claimId === id && claimLeave) return true;
    stopClaim();
    lastClaimAt = now;
    claimId = id;
    try {
      const rect = () => (capri.windows?.wins || []).find((w) => w.id === id) || null;
      const covers = () => (typeof capri.coversOf === 'function' ? capri.coversOf(id) : []);
      const entry = Math.max(0, (capri.pos?.x || win.x) - win.x);
      const taken = fx.possess(rect, { covers, entry, look: () => capri.mouse, angry: false, say: '' });
      claimLeave = () => { try { taken.leave(); } catch { /* */ } };
      if (autoSitBusy) autoSitClaims += 1;
      setTimeout(() => { if (claimId === id) stopClaim(); }, 3200);
      return true;
    } catch {
      stopClaim();
      return false;
    }
  };
  setInterval(() => {
    if (!capri || !fx || reducedMotion.matches) return;
    if (capri.stowed || capri.dormant || capri.dragging) return;
    if (capri.stance !== 'sit' || !capri.perch?.id) {
      if (claimId) stopClaim();
      return;
    }
    if (capri.busy || capri.act || capri.flight) return;
    const id = capri.perch.id;
    if (id === 'taskbar') { if (claimId) stopClaim(); return; }
    if (autoSitBusy && autoSitClaims > 0) return; // auto-sit: one show, then she goes back
    claimWindow(id);
  }, 1000);

  // Handshake Beam
  let lastHandshake = -Infinity;
  if (brain && !brain._extrasHandshake) {
    const _hs = brain.handle?.bind(brain);
    if (typeof _hs === 'function') {
      brain.handle = (evt) => {
        const result = _hs(evt);
        try {
          if (evt?.hook_event_name === 'PostToolUse' && capri && !capri.stowed && !reducedMotion.matches) {
            const now = performance.now();
            if (now - lastHandshake >= (EXTRAS.handshakeCoolMs || 2200)) {
              lastHandshake = now;
              const h = (() => { try { return capri.head(); } catch { return { x: 0, y: 0 }; } })();
              const hand = (() => {
                try {
                  const side = capri.armToward?.(capri.towardCenter?.() || 1) || 'R';
                  return capri.limb?.(side)?.hand || h;
                } catch { return h; }
              })();
              const wins = capri.windows?.wins || [];
              const s = brain.session?.(evt);
              const win = (s?.window && wins.find((w) => w.id === s.window))
                || (capri.windows?.fg && wins.find((w) => w.id === capri.windows.fg))
                || wins.find((w) => w.id !== 'taskbar');
              if (win) {
                const from = { x: win.x + win.w * 0.5, y: win.y + Math.min(40, win.h * 0.15) };
                fx.bolt?.(from, hand, { life: 280, forks: 1, width: 2 });
                fx.ring?.(hand.x, hand.y, { size: 0.14 });
                fx.burst?.(hand.x, hand.y, { count: 6, power: 0.3, spread: 28 });
              }
            }
          }
        } catch { /* */ }
        return result;
      };
      brain._extrasHandshake = true;
    }
  }

  // ── Face the pointer ─────────────────────────────────────────
  // While she's free, she keeps turned toward your mouse: when it crosses to the other side of her
  // (past a dead zone, so it doesn't flicker when the pointer is right above her) she does her
  // turnaround. Nothing fights it: acts, moves, pointing, the satellite and sleep all take priority.
  const FACE = { pollMs: 140, dead: 70, cool: 700 };
  let lastFaceTurn = -Infinity;
  setInterval(() => {
    try {
      if (!capri || capri.hidden || capri.stowed || capri.dormant) return;
      if (capri.busy || capri.act || capri.dragging || capri.pointing || capri.sky || capri.flight) return;
      if (!['stand', 'sit'].includes(capri.stance) || capri.mode === 'sleep') return;
      if (chat?.open || guide?.running) return;
      const m = getMouse?.();
      if (!m) return;
      const dx = m.x - capri.pos.x;
      if (Math.abs(dx) < FACE.dead) return;
      const wanted = dx < 0 ? 1 : -1; // facing 1: reaching left (as drawn)
      if (wanted === capri.facing) return;
      const now = performance.now();
      if (now - lastFaceTurn < FACE.cool) return;
      lastFaceTurn = now;
      capri.perform?.('turn');
    } catch { /* */ }
  }, FACE.pollMs);

  // ── Edge helpers ───────────────────────────────────────────
  const edgeMargin =() => Math.max(110, (capri?.view?.w || 1280) * 0.13);
  const floorY = () => capri?.floor ?? capri?.view?.floor ?? ((capri?.view?.h || 800) - 20);
  // ── User rest position (precise) ──────────────────────────────
  // Drag her where you want; that becomes her home until you move her again.
  const REST_KEY = 'capri.restPos';
  const loadRestPos = () => {
    try {
      const j = JSON.parse(localStorage.getItem(REST_KEY) || 'null');
      if (j && typeof j.x === 'number' && typeof j.y === 'number') {
        return {
          x: j.x,
          y: j.y,
          face: j.face === -1 ? -1 : 1,
        };
      }
    } catch { /* */ }
    return null;
  };
  const viewClamp = (pos) => {
    const w = capri?.view?.w || 1280;
    const floor = typeof floorY === 'function' ? floorY() : (capri?.view?.floor || capri?.view?.h || 800);
    // match drag limits in capri.js (≈40px side margin)
    const m = 40;
    return {
      x: Math.round(Math.max(m, Math.min(w - m, pos.x))),
      y: Math.round(Math.max(60, Math.min(floor - 4, pos.y))),
      face: pos.face === -1 ? -1 : (pos.face === 1 ? 1 : (capri?.facing || 1)),
    };
  };
  const saveRestPos = (pos, face = null) => {
    if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return null;
    try {
      const dest = viewClamp({
        x: pos.x,
        y: pos.y,
        face: face ?? capri?.facing ?? 1,
      });
      localStorage.setItem(REST_KEY, JSON.stringify(dest));
      capri._restPos = dest;
      return dest;
    } catch {
      return null;
    }
  };
  const pickSideX = (prefer = null) => {
    const w = capri?.view?.w || 1280;
    const m = edgeMargin();
    const left = m + 4;
    const right = w - m - 4;
    if (prefer === 'left') return left;
    if (prefer === 'right') return right;
    const cx = capri?.pos?.x ?? w * 0.5;
    return cx < w * 0.5 ? left : right;
  };
  const defaultEdgePos = (prefer = null) => ({
    x: pickSideX(prefer),
    y: floorY(),
    face: prefer === 'left' ? 1 : -1,
  });
  const restDest = (prefer = null) => {
    const saved = capri?._restPos || loadRestPos();
    if (saved) return viewClamp(saved);
    return defaultEdgePos(prefer);
  };
  const nearRest = (pos, dest, maxDist = 36) => {
    if (!pos || !dest) return false;
    return Math.hypot((pos.x || 0) - dest.x, (pos.y || 0) - dest.y) <= maxDist;
  };
  // ── Excursions ────────────────────────────────────────────────
  // "Home" (rest position) and "going somewhere" are separate things. Any warp that isn't the trip
  // home arms an excursion lock; while it's active the rest logic (behave / wander / 3.5 s poll)
  // must not pull her back. When it runs out, the normal return-home resumes by itself.
  const excursion = (ms = EXTRAS.excursionMs) => {
    if (!capri) return;
    const t = performance.now() + ms;
    capri._excursionUntil = Math.max(capri._excursionUntil || 0, t);
    capri.nextHome = Math.max(capri.nextHome || 0, t);
    capri.nextMove = Math.max(capri.nextMove || 0, t);
  };
  const inExcursion = () => performance.now() < (capri?._excursionUntil || 0);

  // Pixel-accurate sit at home: soft snap when close, teleport when far
  const goRest = (prefer = null, { force = false } = {}) => {
    if (!capri) return;
    if (!force && capri.restOn !== 'taskbar' && inExcursion()) return;
    if (capri.busy || capri.dragging || capri.act || capri.stowed || capri.dormant || capri.flight) return;
    if (capri.restOn !== 'taskbar' && performance.now() < (capri._placeLockUntil || 0)) return;
    const dest = restDest(prefer);
    const face = dest.face || (dest.x < (capri.view?.w || 0) * 0.5 ? 1 : -1);
    try {
      const dist = Math.hypot((capri.pos?.x || 0) - dest.x, (capri.pos?.y || 0) - dest.y);
      if (dist <= 220 && typeof capri.place === 'function') {
        // soft, exact — no vanish/arrive drift
        capri.pos = { x: dest.x, y: dest.y };
        capri.facing = face;
        if (capri.stance !== 'stand') capri.setStance?.('stand');
        capri.place();
      } else {
        const tp = capri._rawTeleport || (typeof capri.teleport === 'function' ? capri.teleport.bind(capri) : null);
        if (!tp) return;
        tp({ x: dest.x, y: dest.y }, { face });
      }
      const now = performance.now();
      capri.nextMove = now + rand(28_000, 60_000);
      capri.nextHome = now + rand(16_000, 30_000);
    } catch { /* */ }
  };
  const goEdge = (prefer = null) => goRest(prefer);
  function clamp2(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  // Route idle-rest correctly: taskbar mode must SIT, not stand at homePos
  const goHomeOrRest = () => {
    if (!capri) return;
    if (capri.restOn === 'taskbar') {
      try {
        // call through current goHome (extras wrapper → native sitOn)
        const r = capri.goHome?.();
        return r;
      } catch { /* */ }
      return;
    }
    goRest();
  };

  try {
    const saved = loadRestPos();
    capri._restPos = saved;
    if (saved) capri.homePos = { x: saved.x, y: saved.y, face: saved.face || 1 };
  } catch { /* */ }

    // Precise placement callback from capri.js pointer-up
  if (capri && !capri._extrasPlaceHook) {
    const prev = capri.onPlaced;
    capri.onPlaced = (placed) => {
      try { prev?.(placed); } catch { /* */ }
      if (!placed || typeof placed.x !== 'number' || typeof placed.y !== 'number') return;
      const dest = saveRestPos(placed, placed.face === -1 ? -1 : 1);
      const final = dest || {
        x: placed.x,
        y: placed.y,
        face: placed.face === -1 ? -1 : 1,
      };
      capri.homePos = final;
      capri._restPos = final;
      // Stay put after user placement
      const until = performance.now() + 45_000;
      capri._placeLockUntil = until;
      capri.nextHome = until;
      capri.nextMove = until;
      try { console.log('[capri] home set', final); } catch { /* */ }
    };
    capri._extrasPlaceHook = true;
  }


  // Capture position after the user finishes a drag (settle a few frames first)
  const captureAfterDrag = () => {
    // Primary save is capri.onPlaced (pre-drop). These shots only refresh if
    // she is still standing near that home — avoid overwriting with a fall landing.
    const shots = [80, 200];
    for (const ms of shots) {
      setTimeout(() => {
        try {
          if (!capri || capri.dragging || capri.flight || capri.stowed) return;
          if (capri.stance !== 'stand') return;
          const home = capri.homePos || loadRestPos();
          if (home && Math.hypot(capri.pos.x - home.x, capri.pos.y - home.y) > 140) return;
          saveRestPos(capri.pos, capri.facing);
        } catch { /* */ }
      }, ms);
    }
  };

  if (capri && !capri._extrasEdgeRest) {
    if (typeof capri.teleport === 'function') {
      capri._rawTeleport = capri.teleport.bind(capri);
      // every warp through the public API is an excursion, except the trip home (taskbar seat)
      capri.teleport = (pos, opts = {}) => {
        const toTaskbar = opts?.perch?.id === 'taskbar';
        if (!opts?.home && !toTaskbar) excursion(opts?.stay ?? (opts?.stance === 'sit' ? EXTRAS.excursionSitMs : EXTRAS.excursionMs));
        return capri._rawTeleport(pos, opts);
      };
    }

    const _spot = typeof capri.spot === 'function' ? capri.spot.bind(capri) : null;
    if (_spot) {
      capri.spot = (name) => {
        // Rest anchors only — do NOT remap 'random' (dodge / refuse warp needs a real elsewhere)
        if (name === 'post') {
          const d = restDest('right');
          return { x: d.x, y: d.y };
        }
        if (name === 'chip') {
          const d = restDest('left');
          return { x: d.x, y: d.y };
        }
        if (name === 'random' || name == null) {
          const w = capri.view?.w || 1280;
          const floor = typeof floorY === 'function' ? floorY() : (capri.view?.floor || capri.floor || 800);
          const home = restDest();
          const cur = capri.pos || { x: w * 0.5, y: floor };
          const margin = Math.max(80, w * (EXTRAS.edgeRestMargin || 0.14));
          const avoid = Math.max(0.2, Math.min(0.5, EXTRAS.centerAvoid || 0.38));
          const leftMax = w * (0.5 - avoid / 2);
          const rightMin = w * (0.5 + avoid / 2);
          const topBand = Math.max(120, 280 * (capri.scale || 0.6) + 80);
          if (!capri._recentWarps) capri._recentWarps = [];
          const recent = capri._recentWarps;
          const farRecent = (p) => recent.every((r) => Math.hypot(p.x - r.x, p.y - r.y) > Math.min(220, w * 0.18));
          const sideX = () => {
            const preferRight = cur.x < w * 0.5;
            const goRight = Math.random() < 0.7 ? preferRight : !preferRight;
            return goRight
              ? rand(Math.max(margin, rightMin), w - margin)
              : rand(margin, Math.min(leftMax, w - margin));
          };
          let best = null;
          let bestScore = -1;
          for (let i = 0; i < 14; i++) {
            const cornerUp = Math.random() < 0.22;
            const y = cornerUp
              ? rand(topBand * 0.55, topBand)
              : (Math.random() < 0.75 ? floor : rand(topBand, Math.max(topBand + 40, floor - 80)));
            const cand = { x: sideX(), y };
            if (cand.x > leftMax && cand.x < rightMin) continue;
            const dCur = Math.hypot(cand.x - cur.x, cand.y - (cur.y || floor));
            const dHome = Math.hypot(cand.x - home.x, cand.y - home.y);
            if (dCur < Math.min(260, w * 0.2) || dHome < 140 || !farRecent(cand)) continue;
            let score = dCur + dHome * 1.4;
            for (const r of recent) score += Math.hypot(cand.x - r.x, cand.y - r.y) * 0.5;
            if (score > bestScore) { bestScore = score; best = cand; }
            if (dCur > 320 && dHome > 180) { best = cand; break; }
          }
          // fallback: the far side, but never the exact same pixel twice
          const jit = rand(-70, 70);
          const pick = best || {
            x: clamp2((cur.x < w * 0.5
              ? Math.min(w - margin, Math.max(rightMin, w - 120))
              : Math.max(margin, Math.min(leftMax, 120))) + jit, margin, w - margin),
            y: floor,
          };
          recent.push({ x: pick.x, y: pick.y });
          if (recent.length > 5) recent.shift();
          return pick;
        }
        return _spot ? _spot(name) : { x: 120, y: floorY() };
      };
    }

    const _goHome = typeof capri.goHome === 'function' ? capri.goHome.bind(capri) : null;
    if (_goHome) {
      capri.goHome = () => {
        if (capri.restOn === 'taskbar') return _goHome();
        goRest();
        return Promise.resolve();
      };
    }

    const _drop = typeof capri.drop === 'function' ? capri.drop.bind(capri) : null;
    if (_drop) {
      capri.drop = (...args) => {
        const r = _drop(...args);
        captureAfterDrag();
        return r;
      };
    }

    const _sitOn = typeof capri.sitOn === 'function' ? capri.sitOn.bind(capri) : null;
    if (_sitOn) {
      capri.sitOn = async (seat) => {
        const result = await _sitOn(seat);
        try {
          const id = seat?.win?.id || seat?.id || capri.perch?.id;
          if (id && id !== 'taskbar') {
            setTimeout(() => { try { claimWindow(id, { force: true }); } catch { /* */ } }, 280);
          }
        } catch { /* */ }
        return result;
      };
    }

    let wasDragging = false;
    setInterval(() => {
      try {
        const d = !!capri.dragging;
        if (wasDragging && !d) captureAfterDrag();
        wasDragging = d;
      } catch { /* */ }
    }, 100);

    // Re-clamp saved home when the window is resized
    window.addEventListener('resize', () => {
      try {
        if (capri?._restPos) capri._restPos = viewClamp(capri._restPos);
      } catch { /* */ }
    });

    const _wander = typeof capri.wanderStep === 'function' ? capri.wanderStep.bind(capri) : null;
    if (_wander) {
      capri.wanderStep = () => {
        if (!capri.wander || capri.stance === 'peek') return;
        if (capri.busy || capri.act || capri.dragging || capri.stowed || capri.dormant) return;
        if (inExcursion() && capri.restOn !== 'taskbar') return; // she's out on a trip: leave her be
        if (capri.stance === 'sit') {
          if (Math.random() < 0.72) { try { capri.perform?.(pick(['look', 'curious'])); } catch { /* */ } }
          else if (Math.random() < 0.4) { try { capri.fall?.(); } catch { /* */ } }
          else goHomeOrRest();
          return;
        }
        if (capri.restOn === 'taskbar') {
          goHomeOrRest();
          return;
        }
        const dest = restDest();
        if (!nearRest(capri.pos, dest, 40)) {
          goRest();
        } else if (Math.random() < 0.3) {
          try { capri.perform?.(pick(['look', 'curious']), capri.facing || 1); } catch { /* */ }
        }
      };
    }

    const _behave = typeof capri.behave === 'function' ? capri.behave.bind(capri) : null;
    if (_behave) {
      capri.behave = (now) => {
        try {
          if (
            capri.restOn !== 'taskbar'
            && !inExcursion()
            && capri.mode === 'idle'
            && capri.stance === 'stand'
            && !capri.busy && !capri.dragging && !capri.act
            && !capri.stowed && !capri.dormant
            && typeof capri.lastActivity === 'number'
            && now - capri.lastActivity > 4000
            && now > (capri.nextHome || 0)
          ) {
            if (capri.restOn === 'taskbar') {
              if (!(capri.stance === 'sit' && capri.perch?.id === 'taskbar')) {
                capri.nextHome = now + 8000;
                goHomeOrRest();
              }
            } else {
              const dest = restDest();
              if (!nearRest(capri.pos, dest, 40)) {
                capri.nextHome = now + 9000;
                goHomeOrRest();
              }
            }
          }
        } catch { /* */ }
        return _behave(now);
      };
    }

    setTimeout(() => {
      try {
        if (!capri || capri.stowed) return;
        if (!loadRestPos()) {
          const dest = defaultEdgePos('right');
          saveRestPos(dest);
          goRest('right');
        }
      } catch { /* */ }
    }, 1800);

    setInterval(() => {
      try {
        if (!capri || capri.stowed || capri.dormant || capri.hidden) return;
        if (capri.busy || capri.act || capri.dragging || capri.pointing || capri.flight) return;
        if (capri.mode !== 'idle' || capri.stance !== 'stand') return;
        if (chat?.open || guide?.running) return;
        if (performance.now() - (capri.lastActivity || 0) < 4000) return;
        if (capri.restOn === 'taskbar') {
          if (!(capri.stance === 'sit' && capri.perch?.id === 'taskbar')) goHomeOrRest();
          return;
        }
        if (inExcursion()) return;
        const dest = restDest();
        if (nearRest(capri.pos, dest, 40)) return;
        goHomeOrRest();
      } catch { /* */ }
    }, 3500);

    capri._extrasEdgeRest = true;
  }

  // Dev helpers
  // Dev helpers
  // Dev helpers
  // Dev helpers
  const testMelody = () => {
    try {
      const h = capri?.head?.() || { x: 200, y: 400 };
      spawnNotes(h, null, 1.6);
      return true;
    } catch { return false; }
  };
  const testEdge = () => { goRest(); return true; };
  const testSaveRest = () => { saveRestPos(capri?.pos); return loadRestPos(); };
  const testClearRest = () => { try { localStorage.removeItem(REST_KEY); capri._restPos = null; } catch {} return true; };


  return {
    pcReactFx: (kind) => pcReactFx(fx, capri, kind, reactCtx),
    bootLine,
    bootPayload,
    statusLine: () => fetchStatusLine({ host, launch, lang: brain?.lang || 'en', keys: getVitals?.() }),
    clearLink,
    afterScreenHop,
    // wow pack APIs
    spawnClone,
    clearClone,
    possessCursor,
    glitchOnThrow: glitchOnThrowSpec,
    worldlineBurst,
    phaseFlash,
    forkBranch,
    hyperCast,
    hyper12Cast,
    pushCause,
    // cinematic pack APIs
    onErrorEvent: onErrorEventSpec,
    directorPoint,
    pushMemory,
    glassWorld,
    rivalDuel: rivalDuelSpec,
    // spectacle pack
    ascension,
    gestaltUnmask,
    realityCrack,
    neuralStorm,
    rivalBossIntro,
    victoryOrbit,
    eclipseMode,
    chronoRewind,
    onSpectacleWorkDone,
    clearFxResidue,
    claimWindow,
    forceAutoSit: () => {
      try {
        const c = listSittable()[0];
        return c ? doAutoSit(c, { force: true }) : Promise.resolve(false);
      } catch { return Promise.resolve(false); }
    },
    listSittable,
    testMelody,
    testEdge, testSaveRest, testClearRest,
    setDemoMode,
    memories: () => memories.slice(),

    // for debugging / future menu toggles
    _state: () => ({
      activeSince,
      lastBreakNudge,
      breakSnoozeUntil,
      morningDone,
      lastSoftJealous,
      quietUntil,
      cloneUntil,
      possessUntil,
      codeAuraOn,
    }),
  };
}

export default {
  EXTRAS, pcReactFx, installExtras, bootLine, bootPayload,
};