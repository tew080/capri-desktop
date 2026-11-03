// Her "hack demo": a login-page brute-force SIMULATION, played out on screen, start to finish, with her in it.
//
// What it is: a prop. A fake login page of her own ("ACME-TEST PORTAL", an address that can never resolve,
// `.invalid`) drawn in her overlay, and a make-believe dictionary attack on it, animated for show. Nothing is sent
// anywhere, nothing is tested, no real site, brand or password is involved, and the "password" she finds is one the
// demo picked itself a moment ago. It's the movie scene, with a lesson at the end (why weak passwords lose).
//
// How you take part: you can give her a hint (she's grateful), or switch on the page's defence (rate limit) and
// watch her get locked out; switch it off in time and she carries on. Start it by telling her in her chat
// ("จำลอง brute force ให้ดูหน่อย", "simulate a brute force on a fake login page") or from her menu › Mischief
// (she may also do it on her own among her tricks while you're away).
import { pick, reducedMotion } from './util.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// the demo's own little dictionary of famously bad passwords (the sort every breach list opens with)
const COMMON = ['123456', 'password', '12345678', 'qwerty', '123456789', '12345', '1234', '111111', 'dragon', 'abc123', 'monkey', 'letmein',
  'iloveyou', 'admin', 'welcome', 'sunshine', 'princess', 'football', 'baseball', 'master', 'shadow', 'superman', 'trustno1', 'hello123',
  'freedom', 'whatever', 'qazwsx', 'michael', 'jordan', 'harley', 'ranger', 'buster', 'soccer', 'hockey', 'killer', 'george', 'charlie',
  'andrew', 'pepper', 'austin', 'joshua', 'matrix', 'maverick', 'cheese', 'banana', 'cookie', 'summer', 'winter', 'flower', 'purple'];
const TARGETS = ['sunshine', 'letmein', 'dragon', 'welcome', 'iloveyou', 'monkey', 'football', 'princess'];

const T = {
  th: {
    sim: 'SIMULATION · เว็บปลอมของ Capri · ไม่มีการเชื่อมต่อเครือข่ายจริง',
    attempts: 'ลองไปแล้ว', rate: 'ครั้ง/วิ', lock: 'ระบบกันเดา', hint: '💡 ใบ้ให้เธอ', hintUsed: '💡 ใบ้แล้ว', defOn: '🛡 เปิดกันเดา', defOff: '🛡 ปิดกันเดา', stop: '✕ หยุด',
    granted: 'ACCESS GRANTED (จำลอง)', denied: 'ระบบรอด! ถูกล็อกไว้', blocked: '429 · ถูกบล็อก ลองใหม่ภายหลัง', granted2: 'เข้าได้แล้ว',
    start: ['โอเค choom ขอดูฝีมือหน่อย นี่คือเว็บปลอมที่ฉันทำเอง ไม่มีอะไรจริงเลยนะ', 'เปิดหน้าเว็บปลอมแล้ว คอยดูนะ ฉันจะเดารหัสแอดมินให้ดู (ในฉากเท่านั้น!)'],
    mid: ['กำลังไล่ลิสต์รหัสยอดแย่ตลอดกาล… เร็วมาก', 'ยังไม่ติด… แต่ฉันมีหลายจิตใจช่วยกันเดา', 'ถ้าคุณใบ้ได้ก็ใบ้มาเลย 😏'],
    think: {
      digits: ['ตัวเลขล้วน ๆ… คนขี้เกียจชอบตั้งแบบนี้ ลอง "{w}" ดู', 'หืม… ตัวเลขเรียง ๆ น่าสงสัยนะ "{w}" ไหม?'],
      kb: ['เรียงตามแป้นพิมพ์รึเปล่า… "{w}" ล่ะ?', 'คนเหนื่อยๆ มักกดมั่ว ๆ ตามแป้น ลอง "{w}"'],
      name: ['ชื่อคนล่ะ? แอดมินอาจตั้งเป็นชื่อเพื่อน… "{w}"', 'ลองใช้ชื่อดู "{w}" น่าจะเป็นชื่อที่คุ้น ๆ'],
      word: ['คำง่าย ๆ ที่จำได้… "{w}" ไหม?', 'ถ้าฉันเป็นแอดมินขี้เกียจ ฉันจะตั้งว่า "{w}"', 'อืม… "{w}" ดูมีลุ้น', 'คิดแบบคนจำรหัสยาก… "{w}"'],
      miss: ['ไม่ใช่เหรอ… งั้นเปลี่ยนแนวคิดใหม่', 'ไม่เป็นไร ลิสต์ยังอีกเยอะ', 'ใกล้แล้วมั้ง… (ไม่รู้) ลองต่อ'],
    },
    hint1: 'ขอบคุณที่ใบ้นะ! ตัดตัวเลือกออกเยอะเลย',
    blockedLine: 'โดนบล็อกแล้ว! ระบบนี้ฉลาดกว่าที่คิด… ปิดกันเดาหน่อยสิ ขอร้อง 🥺',
    resume: 'กลับมาแล้ว! ลุยต่อ',
    win: (pw) => `เข้าได้แล้ว! รหัสคือ "${pw}" 😎 เห็นไหม รหัสแบบนี้ไม่รอดหรอก`,
    tip: 'บทเรียน: รหัสสั้น/คำทั่วไปโดนเดาในไม่กี่วิ ใช้รหัสยาว ๆ + เปิด 2FA + จำกัดจำนวนครั้งที่ล็อกอิน',
    lose: 'ไม่ไหวแล้ว ระบบกันเดานี่เก่งจริง… ยอมแพ้ 🏳️',
    lost2: 'บทเรียน: ระบบจำกัดครั้งที่ลองล็อกอิน (rate limit) + 2FA ทำให้การเดารหัสแทบเป็นไปไม่ได้',
    aborted: 'โอเค หยุดแล้ว เก็บเว็บปลอมให้',
    tired: 'เบื่อแล้ว ไม่เข้าซะที… พอเท่านี้แหละ',
    busy: 'ตอนนี้ฉันกำลังเล่นอยู่ รอเดี๋ยวนะ',
  },
  en: {
    sim: 'SIMULATION · Capri\'s fake page · no real network involved',
    attempts: 'attempts', rate: '/s', lock: 'rate limit', hint: '💡 Hint her', hintUsed: '💡 Hinted', defOn: '🛡 Turn defence on', defOff: '🛡 Turn defence off', stop: '✕ Stop',
    granted: 'ACCESS GRANTED (simulated)', denied: 'System held! Locked out', blocked: '429 · blocked, try later', granted2: 'in',
    start: ['Okay choom, watch this. A fake login page I built myself, nothing real in it.', 'Fake portal up. I\'ll guess the admin password for show (on set only!).'],
    mid: ['Running the all-time worst password list… fast.', 'Not yet… but there are a lot of us guessing.', 'Got a hint? Now\'s the time. 😏'],
    think: {
      digits: ['All digits… lazy people do that. Try "{w}".', 'Hmm, a run of numbers… "{w}", maybe?'],
      kb: ['Keyboard pattern? What about "{w}"…', 'Tired people mash the keys. "{w}".'],
      name: ['A person\'s name? Admins love those… "{w}"', 'Let\'s try a name, "{w}" sounds familiar.'],
      word: ['An easy word to remember… "{w}"?', 'If I were a lazy admin I\'d pick "{w}".', 'Mm… "{w}" looks promising.', 'Thinking like someone who forgets passwords… "{w}"'],
      miss: ['No? Then a new angle.', 'Fine, the list is long.', 'Getting close, I think. (No idea.) Next.'],
    },
    hint1: 'Thanks for the hint! That cuts it down a lot.',
    blockedLine: 'Blocked! This system is smarter than it looks… turn the defence off, pretty please? 🥺',
    resume: 'I\'m back in! Carrying on.',
    win: (pw) => `I\'m in! The password was "${pw}" 😎 See? That one never stood a chance.`,
    tip: 'Lesson: short or common passwords fall in seconds. Use a long one, turn on 2FA, and limit login attempts.',
    lose: 'Can\'t do it, that rate limit is good… I give up. 🏳️',
    lost2: 'Lesson: limiting login attempts (rate limit) plus 2FA makes guessing practically hopeless.',
    aborted: 'Okay, stopped. Cleaning up the fake page.',
    tired: 'Bored, it won\'t open… that\'s enough.',
    busy: 'I\'m in the middle of something. One sec.',
  },
};

const CSS = `
.capri-hs{position:fixed;left:16px;top:16px;width:min(430px,92vw);z-index:2147483000;pointer-events:auto;
  font:13px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#e8e4f5;background:#0e0b16;border:2px solid #7c4dff;border-radius:8px;
  box-shadow:0 0 0 1px #000,0 0 28px rgba(124,77,255,.55),6px 6px 0 rgba(61,255,154,.35);overflow:hidden;opacity:0;transition:opacity .25s}
.capri-hs.is-on{opacity:1}
.capri-hs *{box-sizing:border-box}
.capri-hs__bar{display:flex;align-items:center;gap:6px;padding:7px 9px;background:#1a1429;border-bottom:1px solid #3a2a63}
.capri-hs__dot{width:9px;height:9px;border-radius:50%;background:#ff4d6d}.capri-hs__dot:nth-child(2){background:#ffcf4d}.capri-hs__dot:nth-child(3){background:#3dff9a}
.capri-hs__url{flex:1;margin-left:6px;padding:3px 8px;background:#0b0813;border:1px solid #3a2a63;border-radius:4px;color:#9d93c9;font-size:11px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.capri-hs__sim{padding:4px 10px;background:#ffcf4d;color:#201400;font-weight:700;font-size:10.5px;letter-spacing:.04em}
.capri-hs__body{padding:12px 14px}
.capri-hs__title{font-weight:700;letter-spacing:.08em;margin-bottom:8px;color:#3dff9a}
.capri-hs__field{display:block;width:100%;margin:4px 0;padding:6px 9px;background:#070510;border:1px solid #3a2a63;border-radius:4px;color:#e8e4f5;font:inherit}
.capri-hs__msg{min-height:18px;margin-top:6px;font-weight:700;color:#ff7a90}
.capri-hs__stats{display:flex;justify-content:space-between;margin-top:8px;color:#9d93c9;font-size:11.5px}
.capri-hs__lock{height:6px;margin-top:5px;background:#1a1429;border-radius:3px;overflow:hidden}
.capri-hs__lock i{display:block;height:100%;width:0;background:#ff4d6d;transition:width .15s}
.capri-hs__log{margin-top:8px;height:5.4em;overflow:hidden;color:#7d74a8;font-size:11px}
.capri-hs__log b{color:#ff7a90;font-weight:400}.capri-hs__log u{color:#3dff9a;text-decoration:none;font-weight:700}
.capri-hs__act{display:flex;gap:6px;padding:0 14px 12px;flex-wrap:wrap}
.capri-hs__act button{flex:1;min-width:92px;padding:6px 8px;background:#1a1429;border:1px solid #7c4dff;border-radius:4px;color:#e8e4f5;font:inherit;cursor:pointer}
.capri-hs__act button:hover:not(:disabled){background:#2a1f4a}.capri-hs__act button:disabled{opacity:.45;cursor:default}
.capri-hs.is-won{border-color:#3dff9a;box-shadow:0 0 0 1px #000,0 0 32px rgba(61,255,154,.6)}
.capri-hs.is-won .capri-hs__msg{color:#3dff9a}
.capri-hs.is-held{border-color:#ffcf4d}.capri-hs.is-held .capri-hs__msg{color:#ffcf4d}
`;

export class HackSim {
  constructor({ capri, fx, panel, voice, brain, tts, chat }) {
    Object.assign(this, { capri, fx, panel, voice, brain, tts, chat });
    this.running = false;
    this.el = null;
    this.abort = false;
  }

  get t() {
    return this.brain?.lang === 'th' ? T.th : T.en;
  }

  // her overlay is click-through: the card has to say where it is, so the pointer can use its buttons
  contains(x, y) {
    if (!this.el) return false;
    const r = this.el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  rect() {
    return this.el ? this.el.getBoundingClientRect() : null;
  }

  stop() {
    this.abort = true;
  }

  // Out of her way: in the corner or edge of the screen where neither she nor her panel is (re-checked as she moves)
  place() {
    const el = this.el;
    if (!el) return;
    const w = el.offsetWidth || 430;
    const h = el.offsetHeight || 340;
    const vw = innerWidth;
    const vh = innerHeight;
    const m = 16;
    const hit = (a, b) => a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const p = this.capri.pos || { x: vw / 2, y: vh / 2 };
    const s = (this.capri.scale || 0.6) * 260;
    const her = { left: p.x - s * 0.7, right: p.x + s * 0.7, top: p.y - s * 1.2, bottom: p.y + s * 0.4 };
    let panel = null;
    try { panel = this.panel.visible ? this.panel.rect?.() : null; } catch { /* */ }
    const pad = 12;
    const keep = [her, panel && { left: panel.left - pad, right: panel.right + pad, top: panel.top - pad, bottom: panel.bottom + pad }];
    const spots = [
      { left: vw - w - m, top: m }, { left: m, top: m }, { left: vw - w - m, top: vh - h - m - 60 }, { left: m, top: vh - h - m - 60 },
      { left: (vw - w) / 2, top: m }, { left: vw - w - m, top: (vh - h) / 2 }, { left: m, top: (vh - h) / 2 },
    ];
    const box = (s0) => ({ left: s0.left, right: s0.left + w, top: s0.top, bottom: s0.top + h });
    const free = spots.filter((s0) => !keep.some((k) => hit(box(s0), k)));
    // the first that stays clear (the one she's farthest from, when it takes the choice: none is, she's cornered, it takes the one with least overlap)
    const pick1 = free[0] || spots.reduce((best, s0) => {
      const area = (k) => (k ? Math.max(0, Math.min(box(s0).right, k.right) - Math.max(box(s0).left, k.left)) * Math.max(0, Math.min(box(s0).bottom, k.bottom) - Math.max(box(s0).top, k.top)) : 0);
      const cost = keep.reduce((n, k) => n + area(k), 0);
      return !best || cost < best.cost ? { ...s0, cost } : best;
    }, null);
    el.style.left = `${Math.max(0, Math.round(pick1.left))}px`;
    el.style.top = `${Math.max(0, Math.round(pick1.top))}px`;
  }

  say(line, face = 'grin', hold = 3600, quiet = false) {
    if (!line) return;
    try {
      // Her chat is on the panel while you talk to her: a panel.say is refused there (the chat outranks it), so her
      // lines go into the chat's answer area instead (shown, not added to what she remembers of your talk).
      if (this.chat?.open && this.panel.current?.chat) {
        this.panel.setFace?.(face);
        this.panel.stream(line, { done: true });
      } else {
        this.panel.say({ kind: 'info', face, line, hold });
      }
    } catch { /* */ }
    if (!quiet && this.tts?.mode !== 'off') this.tts?.say?.(line); // her thinking aloud isn't spoken every time
  }

  build(t, target, label = '') {
    // The page's CSP most likely refuses a <style> element (that's why the card showed up as bare, see-through HTML):
    // a constructed stylesheet isn't subject to it. The <style> element stays as the fallback.
    if (!HackSim.sheet) {
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(CSS);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        HackSim.sheet = sheet;
      } catch {
        HackSim.sheet = null;
      }
    }
    if (!HackSim.sheet && !document.getElementById('capri-hs-css')) {
      const s = document.createElement('style');
      s.id = 'capri-hs-css';
      s.textContent = CSS;
      document.head.append(s);
    }
    const el = document.createElement('div');
    el.className = 'capri-hs';
    el.style.cssText = 'position:fixed;left:16px;top:16px;width:min(430px,92vw);z-index:2147483000;background:#0e0b16;color:#e8e4f5;border:2px solid #7c4dff;border-radius:8px;overflow:hidden;';
    el.innerHTML = `
      <div class="capri-hs__bar"><span class="capri-hs__dot"></span><span class="capri-hs__dot"></span><span class="capri-hs__dot"></span>
        <span class="capri-hs__url">https://portal.acme-test.invalid/login</span></div>
      <div class="capri-hs__sim"></div>
      <div class="capri-hs__body">
        <div class="capri-hs__title">ACME-TEST PORTAL</div>
        <input class="capri-hs__field" data-f="user" value="admin" readonly aria-label="username">
        <input class="capri-hs__field" data-f="pass" value="" readonly aria-label="password">
        <div class="capri-hs__msg" data-f="msg"></div>
        <div class="capri-hs__stats"><span data-f="count"></span><span data-f="rate"></span></div>
        <div class="capri-hs__stats"><span data-f="lockLabel"></span></div>
        <div class="capri-hs__lock"><i data-f="lock"></i></div>
        <div class="capri-hs__log" data-f="log"></div>
      </div>
      <div class="capri-hs__act">
        <button type="button" data-a="hint"></button><button type="button" data-a="def"></button><button type="button" data-a="stop"></button>
      </div>`;
    el.querySelector('.capri-hs__sim').textContent = t.sim;
    // a device from her LAN scan lends its name to the prop page (set as text, never as HTML): it is still her fake page
    if (label) {
      el.querySelector('.capri-hs__title').textContent = `DEMO · ${label}`;
      el.querySelector('.capri-hs__url').textContent = 'https://demo.acme-test.invalid/login';
    }
    el.querySelector('[data-a="stop"]').textContent = t.stop;
    document.body.append(el);
    this.el = el;
    this.place();
    requestAnimationFrame(() => el.classList.add('is-on'));
    return el;
  }

  // The show. `shouldStop`: true when it has to end (mischief: you came back). `auto`: she's alone (no buttons to press).
  async run({ shouldStop = () => false, auto = false, label = '' } = {}) {
    const { capri, fx } = this;
    const t = this.t;
    if (this.running) {
      this.say(t.busy, 'look', 2200);
      return false;
    }
    this.running = true;
    this.abort = false;
    const target = pick(TARGETS);
    const dict = shuffle(COMMON.filter((w) => w !== target));
    dict.splice(24 + Math.floor(Math.random() * 14), 0, target); // somewhere in the middle: long enough to watch
    const el = this.build(t, target, String(label || '').slice(0, 60));
    this.el = el;
    const $ = (k) => el.querySelector(`[data-f="${k}"]`);
    const btn = (k) => el.querySelector(`[data-a="${k}"]`);
    let state = { i: 0, attempts: 0, defense: false, blocks: 0, hinted: false, over: false, boosted: false };
    const render = () => {
      $('count').textContent = `${t.attempts}: ${state.attempts}`;
      btn('hint').textContent = state.hinted ? t.hintUsed : t.hint;
      btn('hint').disabled = state.hinted || state.over;
      btn('def').textContent = state.defense ? t.defOff : t.defOn;
      btn('def').disabled = state.over;
      $('lockLabel').textContent = `${t.lock}: ${state.defense ? 'ON' : 'OFF'}`;
      $('lock').style.width = `${Math.min(100, state.blocks * 34)}%`;
    };
    el.querySelector('.capri-hs__act').style.display = auto ? 'none' : '';
    btn('hint').addEventListener('click', () => {
      if (state.hinted || state.over) return;
      state.hinted = true;
      // the user helps her: the right one moves up to just ahead
      const at = dict.indexOf(target);
      if (at > state.i + 4) { dict.splice(at, 1); dict.splice(state.i + 2 + Math.floor(Math.random() * 3), 0, target); }
      this.say(t.hint1, 'laugh', 3200);
      render();
    });
    btn('def').addEventListener('click', () => {
      if (state.over) return;
      state.defense = !state.defense;
      if (!state.defense) { if (state.blocks) this.say(t.resume, 'laugh', 2600); state.blocks = Math.max(0, state.blocks - 1); }
      render();
    });
    btn('stop').addEventListener('click', () => { this.abort = true; });
    render();

    const log = (html) => {
      const row = document.createElement('div');
      row.innerHTML = html;
      $('log').append(row);
      while ($('log').children.length > 5) $('log').firstChild.remove();
    };
    const type = async (str) => { $('pass').value = str; };
    const centre = () => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.45, r }; };
    const zap = () => {
      try {
        const h = capri.head?.() || { x: capri.pos?.x || 0, y: (capri.pos?.y || 0) - 40 };
        const c = centre();
        fx.bolt?.(h, { x: c.x + (Math.random() - 0.5) * c.r.width * 0.5, y: c.y }, { life: 260, forks: 1, width: 1.6 });
        this.voice?.play?.('zap');
      } catch { /* */ }
    };
    const emit = (sel) => { try { const c = centre(); fx.burst?.(c.x, c.y, { count: 14, power: 0.7, spread: 80, ...sel }); } catch { /* */ } };

    const startedAt = performance.now();
    const LIMIT = 75000;
    let outcome = null;
    const follow = setInterval(() => this.place(), 400); // she moves, her panel comes and goes: the card steps aside
    try {
      capri.wake?.();
      await capri.perform?.('hop');
      this.say(pick(t.start), 'smug', 4200);
      try {
        const c = centre();
        capri.pointAt?.({ x: c.r.left + 30, y: c.r.top + 40, w: 120, h: 30, id: 'hacksim' }, { label: 'TARGET' });
      } catch { /* */ }
      await sleep(1800);
      capri.stopPointing?.();

      let lastMid = performance.now();
      let thinkAt = performance.now() + 1500;
      let misses = 0;
      let zapAt = 0;
      let rateWin = [];
      let heldSince = 0;
      while (!outcome) {
        if (this.abort || shouldStop()) { outcome = 'aborted'; break; }
        if (performance.now() - startedAt > LIMIT) { outcome = 'tired'; break; }
        const now = performance.now();
        if (state.defense) {
          // the defence is up: every try is refused, the lock fills; held long enough, she's beaten
          const word = dict[state.i % dict.length];
          await type(word);
          $('msg').textContent = t.blocked;
          state.attempts += 1;
          state.blocks = Math.min(3, state.blocks + 1);
          log(`<b>#${String(state.attempts).padStart(4, '0')} admin:${word} → 429</b>`);
          render();
          if (state.blocks >= 3) {
            if (!heldSince) { heldSince = now; this.say(t.blockedLine, 'alarm', 5000); el.classList.add('is-held'); }
            else if (now - heldSince > 6500) { outcome = 'held'; break; }
          }
          await sleep(420);
          continue;
        }
        if (heldSince) { heldSince = 0; el.classList.remove('is-held'); }
        $('msg').textContent = '';
        const word = dict[state.i];
        state.i += 1;
        await type(word);
        state.attempts += 1;
        rateWin.push(now);
        rateWin = rateWin.filter((x) => now - x < 1000);
        $('rate').textContent = `${rateWin.length} ${t.rate}`;
        if (word === target) {
          log(`<u>#${String(state.attempts).padStart(4, '0')} admin:${word} → 200 OK</u>`);
          render();
          outcome = 'won';
          break;
        }
        log(`<b>#${String(state.attempts).padStart(4, '0')} admin:${word} → 401</b>`);
        render();
        if (now - zapAt > 1300) { zapAt = now; zap(); }
        // in her chat she thinks the password up as she goes: why this one, then the next
        if (now > thinkAt) {
          thinkAt = now + 2600;
          const kind = /^[0-9]+$/.test(word) ? 'digits' : /qwe|asd|zxc|qaz|abc|1234/.test(word) ? 'kb'
            : ['michael', 'jordan', 'george', 'charlie', 'andrew', 'joshua', 'austin', 'harley', 'ranger', 'buster'].includes(word) ? 'name' : 'word';
          misses += 1;
          const line = misses % 4 === 0 ? pick(t.think.miss) : pick(t.think[kind]).replace('{w}', word);
          this.say(line, pick(['look', 'smug', 'aside', 'wide']), 2500, true);
        }
        await sleep(reducedMotion.matches ? 220 : 95);
      }

      state.over = true;
      render();
      if (outcome === 'won') {
        el.classList.add('is-won');
        $('msg').textContent = t.granted;
        $('pass').value = target;
        this.voice?.play?.('star');
        emit({});
        capri.perform?.('hop');
        this.say(t.win(target), 'laugh', 6000);
        await sleep(6200);
        this.say(t.tip, 'smug', 8500);
        await sleep(3500);
      } else if (outcome === 'held') {
        $('msg').textContent = t.denied;
        capri.perform?.('alarm');
        this.say(t.lose, 'aside', 5000);
        await sleep(3500);
        this.say(t.lost2, 'smug', 7500);
        await sleep(3500);
      } else if (outcome === 'tired') {
        this.say(t.tired, 'aside', 4500);
        await sleep(2500);
      } else {
        this.say(t.aborted, 'smug', 2800);
        await sleep(1200);
      }
    } finally {
      clearInterval(follow);
      state.over = true;
      capri.stopPointing?.();
      el.classList.remove('is-on');
      await sleep(260);
      el.remove();
      if (this.el === el) this.el = null;
      this.running = false;
    }
    return outcome;
  }
}