// Capri PC reactions only — plug/unplug + CPU hot.
// Wire once from app.js: installExtras({ capri, panel, brain, fx, host, launch, pc, voice })

import { pick, rand, reducedMotion } from './util.js';

export const EXTRAS = {
  pcPollMs: 45_000,          // how often to sample CPU
  pcHotLoad: 85,             // CPU % ≥ this → heat FX
  pcHotCooldownMs: 90_000,   // min gap between hot reactions
  pcLowPct: 18,              // battery % ≤ this while unplugged → low (also used on unplug)
};

const PC_LINES = {
  hot: {
    en: ['Your CPU is cooking me, choom.', 'Heat spike. I feel it in the link.', 'Processor’s loud. Cool it a little?'],
    th: ['CPU ร้อนจะละลายฉันแล้วนะ choom', 'ความร้อนพุ่ง ฉันรู้สึกผ่านลิงก์', 'โปรเซสเซอร์ดังมาก ลดหน่อยได้ไหม'],
  },
  low: {
    en: ['Battery’s fading… don’t let us flatline.', 'Power low. Stay close to the outlet.', 'I’m dimming with your cells.'],
    th: ['แบตจางแล้ว… อย่าให้เรา flatline', 'ไฟใกล้หมด อยู่ใกล้ปลั๊กหน่อย', 'ฉันจางตามเซลล์ของนาย'],
  },
  charge: {
    en: ['Power in. I’m waking back up.', 'Charging — good. Keep me plugged.', 'Current’s clean. Nice.'],
    th: ['ไฟเข้า ฉันตื่นขึ้นมาอีกครั้ง', 'กำลังชาร์จ — ดี เสียบไว้เลย', 'กระแสสะอาด ดีมาก'],
  },
};

/** Call for CPU hot · battery low · charging */
export function pcReactFx(fx, capri, kind, { panel, brain, voice } = {}) {
  if (!fx || !capri || reducedMotion.matches) return;
  let h;
  try { h = capri.head?.() || { x: capri.pos?.x || 0, y: (capri.pos?.y || 0) - 40 }; }
  catch { return; }
  const s = capri.scale || 1;

  if (kind === 'hot') {
    fx.heat?.(h.x, h.y - 20 * s);
    fx.heat?.(h.x + rand(-20, 20), h.y - 10 * s);
    fx.glyph?.(h.x, h.y - 40 * s);
    fx.glyph?.(h.x + rand(-25, 25), h.y - 55 * s);
    fx.crackle?.(() => ({ x: h.x, y: h.y }), { life: 480, radius: 70 * s, count: 2 });
    if (Math.random() < 0.35) fx.slices?.(h.x - 40 * s, h.y - 30 * s, 90 * s, 60 * s, { count: 3, life: 140 });
  } else if (kind === 'low') {
    for (let i = 0; i < 6; i++) fx.glyph?.(h.x + rand(-40, 40), h.y + rand(-30, 30));
    fx.burst?.(h.x, h.y, { count: 8, inward: true, power: 0.35, spread: 80 * s });
    if (Math.random() < 0.4) fx.ring?.(h.x, h.y, { size: 0.25 });
  } else if (kind === 'charge') {
    fx.ring?.(h.x, h.y, { size: 0.5 });
    fx.burst?.(h.x, h.y, { count: 16, inward: true, power: 0.6, spread: 110 * s });
    fx.glyph?.(h.x, h.y - 35 * s);
    fx.glyph?.(h.x + 20, h.y - 20 * s);
    if (Math.random() < 0.5) fx.crackle?.(() => ({ x: h.x, y: h.y + 20 * s }), { life: 360, radius: 50 * s, count: 2 });
  }

  // Always announce charge / low; hot stays occasional
  const shouldSay = kind === 'charge' || kind === 'low' || (kind === 'hot' && Math.random() < 0.45);
  if (panel && shouldSay) {
    const lang = brain?.lang || 'en';
    const pool = PC_LINES[kind]?.[lang] || PC_LINES[kind]?.en;
    if (pool) {
      const face = kind === 'charge' ? 'smug' : kind === 'hot' ? 'many' : 'aside';
      panel.say?.({ kind: 'info', face, line: pick(pool), hold: 3200 });
    }
  }
  if (voice && kind === 'charge') voice.play?.('star');
  if (voice && (kind === 'hot' || kind === 'low')) voice.play?.('zap');
}

/**
 * Call once from app.js after capri / panel / brain / fx exist.
 * Enables: plug-in, unplug, CPU hot.
 */
export function installExtras(ctx) {
  const { capri, panel, brain, fx, host, launch, pc, voice } = ctx;
  const reactCtx = { panel, brain, voice: voice || null };

  // Wrap Capri drain / recharge if present (pc.js path)
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

  // Battery via navigator.getBattery (edge-detect plug / unplug)
  let lastHot = 0;
  let battPrev = null;

  const readBattery = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.getBattery) {
        const b = await navigator.getBattery();
        return { charging: !!b.charging, level: Math.round((b.level || 0) * 100) };
      }
    } catch { /* */ }
    return null;
  };

  const onBatteryEdge = (cur) => {
    if (!cur || !fx || !capri) return;
    if (capri.stowed || capri.dormant) return;
    const prev = battPrev;
    battPrev = cur;
    if (!prev) return;
    if (!prev.charging && cur.charging) {
      pcReactFx(fx, capri, 'charge', reactCtx);
      try {
        if (capri.free) capri.perform?.('hop');
        else capri.wake?.();
      } catch { /* */ }
      return;
    }
    if (prev.charging && !cur.charging) {
      pcReactFx(fx, capri, 'low', reactCtx);
      return;
    }
    if (!cur.charging && prev.level > EXTRAS.pcLowPct && cur.level <= EXTRAS.pcLowPct) {
      pcReactFx(fx, capri, 'low', reactCtx);
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

  const pollPc = async () => {
    if (!fx || !capri || reducedMotion.matches) return;
    if (capri.stowed || capri.dormant || capri.busy) return;
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
      const cur = await readBattery();
      if (cur) onBatteryEdge(cur);
    } catch { /* */ }
  };
  setInterval(pollPc, EXTRAS.pcPollMs);
  setTimeout(pollPc, 8_000);

  return { pcReactFx: (kind) => pcReactFx(fx, capri, kind, reactCtx) };
}

export default { EXTRAS, pcReactFx, installExtras };
