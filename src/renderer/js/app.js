import { Capri } from './capri.js';
import { FxLayer, GRAB_FRAMES } from './fx.js';
import { Chip, Mask } from './chip.js';
import { Panel } from './panel.js';
import { ThemedMenu } from './menu.js';
import { Voice } from './voice.js';
import { Brain } from './brain.js';
import { Guide } from './guide.js';
import { Mission } from './mission.js';
import { Chat } from './chat.js';
import { Setup } from './setup.js';
import { Custom } from './custom.js';
import { Bond, Jealousy } from './bond.js';
import { Reminders, clock } from './reminders.js';
import { Look } from './look.js';
import { Pc } from './pc.js';
import { Tts, SAMPLE } from './tts.js';
import { linesFor } from './lines.js';
import { pick, fmt, reducedMotion } from './util.js';
import { installExtras, bootPayload } from './extras.js';
import { Mischief } from './mischief.js';
import { HackSim } from './hacksim.js';

const host = window.host;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// close-ups of her for the cut-ins, frames of the show (tools/build-cutins.py)
const CUTINS = ['grin', 'laugh', 'eyes', 'many', 'look'];
const WATCH_MS = 2000; // how often she checks the pointer still reaches her
const FOLLOW_AFTER = 2; // checks in a row with the pointer on another screen before she follows it there
const AWAY_MS = 15 * 60 * 1000; // the pointer still this long: you were away from your PC
const SNOOZE_MS = 10 * 60 * 1000;

// what you made her, from the config (custom.js)
const mine = (cfg) => ({ userName: cfg.userName || '', persona: cfg.persona || '', myLines: cfg.myLines || [], memories: cfg.memories || [] });

async function boot() {
  const [config, image, intro, ...cutins] = await Promise.all([
    host.getConfig(),
    loadImage('../../assets/capri/capri-full.png'),
    // her intro: her close-up grabbing the screen, and its drawings with her mouth and arm moving
    Promise.all(GRAB_FRAMES.map((name) => loadImage(`../../assets/capri/intro-${name}.webp`).catch(() => null)))
      // decoded now, not the first time each one shows up (a hitch right on "hi", on the wave)
      .then((cels) => Promise.all(cels.map((cel) => cel && createImageBitmap(cel))))
      .then((cels) => (cels[0] ? Object.fromEntries(GRAB_FRAMES.map((name, i) => [name, cels[i]])) : null)),
    ...CUTINS.map((name) => loadImage(`../../assets/capri/cutin-${name}.png`)),
    document.fonts.load('600 16px "Chakra Petch"'),
    document.fonts.load('400 11px "JetBrains Mono"'),
  ]);
  document.documentElement.lang = config.lang;
  // her animations: like Windows, full or reduced (her menu)
  const applyMotion = (setting) => {
    reducedMotion.setting = setting || 'auto';
    document.documentElement.dataset.motion = reducedMotion.matches ? 'reduced' : 'full';
  };
  applyMotion(config.motion);
  reducedMotion.onSystemChange(() => applyMotion(reducedMotion.setting));

  const fx = new FxLayer(document.getElementById('fx'), {
    cutins: Object.fromEntries(CUTINS.map((name, i) => [name, cutins[i]])),
    intro,
  });
  fx.resize(innerWidth, innerHeight);
  // how far the top of the taskbar is from the bottom of her window: she covers it too while she
  // rests on it (the floor she stands on stays its top)
  let floorGap = config.floorGap ?? 0;
  const chip = new Chip(document.getElementById('chip'));
  chip.place(innerWidth, innerHeight - floorGap);
  const mask = new Mask(document.getElementById('mask'));
  // her right-click menu, drawn here in her overlay (menu.js): she stays clickable while it is open
  const menu = new ThemedMenu({ host });
  menu.onChange = () => refreshHit();

  const voice = new Voice();
  voice.configure(config);
  host.listSounds().then((list) => list.length && voice.loadCustom(list));

  const panel = new Panel({
    panel: document.getElementById('panel'),
    ticker: document.getElementById('ticker'),
    labels: linesFor(config.lang, config.assistant),
  });

  const capri = new Capri({
    root: document.getElementById('capri'),
    canvas: document.getElementById('sprite'),
    image,
    fx,
    voice,
  });
  capri.wander = config.wander;
  capri.possessWindows = config.possess;
  capri.restOn = config.rest || 'corner';
  capri.setView(innerWidth, innerHeight, innerHeight - floorGap);
  capri.setScale(config.scale);

  const mission = new Mission();
  const brain = new Brain({ capri, panel, voice, host, mission, lang: config.lang, assistant: config.assistant });

  // Click-through everywhere except on her body, the panel and her biochip.
  let interactive = false;
  let hack = null; // HackSim, made once her layers exist
  let mouse = null;
  const setInteractive = (on) => {
    if (on === interactive) return;
    interactive = on;
    host.setInteractive(on);
  };
  const onChip = () => Boolean(chip.visible && mouse && chip.contains(mouse.x, mouse.y, 0));
  // A left button held down keeps her clickable: she moves a little under a still pointer (breathing,
  // the window she sits on), and if the hit test flipped to click-through between the press and
  // the release, the release went to the window behind her and the click was lost.
  // Only the left button — a right-click (menu) must not leave pressed stuck true, or the next
  // left-click / drag never reaches her.
  let pressed = false;
  // the last mouse events that reached the page and what they landed on (window.dev.pointer, Ctrl+Alt+D)
  const trace = [];
  const describe = (el) => (el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}` : null);
  for (const type of ['mousedown', 'mouseup', 'contextmenu', 'click']) {
    window.addEventListener(type, (e) => {
      trace.push({ type, b: e.button, bs: e.buttons, x: e.clientX, y: e.clientY, on: describe(e.target), at: performance.now() });
      if (trace.length > 8) trace.shift();
    }, true);
  }
  window.addEventListener('mousedown', (e) => { if (e.button === 0) pressed = true; }, true);
  const released = () => {
    if (!pressed) return;
    pressed = false;
    refreshHit();
  };
  window.addEventListener('mouseup', (e) => { if (e.button === 0) released(); }, true);
  window.addEventListener('mousemove', (e) => { if (pressed && e.buttons === 0) released(); }, true);
  window.addEventListener('blur', released);
  const refreshHit = () => {
    if (capri.dragging || pressed || menu.open) return setInteractive(true);
    if (!mouse) return setInteractive(false);
    const r = panel.rect();
    const onPanel = r && mouse.x >= r.left && mouse.x <= r.right && mouse.y >= r.top && mouse.y <= r.bottom;
    document.body.style.cursor = onChip() ? 'pointer' : '';
    return setInteractive(Boolean(onPanel || capri.hit(mouse.x, mouse.y) || onChip() || hack?.contains(mouse.x, mouse.y)));
  };
  // Her biochip: her eyes on it follow the pointer over it, and she comes out when you click it
  // (only then, so the pointer passing through that corner doesn't call her back).
  // Her mask, asleep: the pointer coming over it stirs her, and a moment of that wakes her up.
  let wakeTimer = 0;
  const comeOut = () => {
    if (capri.stowed) host.setConfig({ visible: true }); // the tray and Ctrl+Alt+C follow
    capri.unstow();
  };
  const hoverChip = () => {
    chip.pointer = chip.visible && mouse && chip.contains(mouse.x, mouse.y) ? mouse : null;
    const near = mask.visible && mouse && mask.contains(mouse.x, mouse.y, 30);
    mask.pointer = near ? mouse : null;
    if (!near) {
      clearTimeout(wakeTimer);
      wakeTimer = 0;
    } else if (!wakeTimer) {
      wakeTimer = setTimeout(() => {
        wakeTimer = 0;
        if (capri.dormant) capri.wake();
      }, 400);
    }
  };
  let lastMove = performance.now();
  let onBack = null; // (away ms) => you're back at your PC after a while (the bond, below)
  window.addEventListener('mousemove', (e) => {
    const now = performance.now();
    if (now - lastMove > AWAY_MS) onBack?.(now - lastMove);
    lastMove = now;
    mouse = { x: e.clientX, y: e.clientY };
    refreshHit();
    hoverChip();
  });
  document.addEventListener('mouseleave', () => {
    mouse = null;
    refreshHit();
    hoverChip();
  });
  // Where the pointer really is, every couple of seconds: if it moved over her window and no
  // mousemove came, the hook that brings it to her is gone (Windows drops it without a word, after
  // sleep say), and main.js puts in a new one.
  let seen = null;
  let rearmedAt = -Infinity;
  let follow = null; // (pointer) => she may follow it to another screen (below)
  setInterval(async () => {
    const at = await host.cursor().catch(() => null);
    const before = seen;
    seen = at;
    follow?.(at);
    if (!at?.inside) return;
    const now = performance.now();
    // the pointer is on her and she isn't clickable (its moves stopped reaching her): she is now
    if (!interactive && now - lastMove > WATCH_MS) {
      mouse = { x: at.x, y: at.y };
      refreshHit();
    }
    if (!before?.inside || (at.x === before.x && at.y === before.y)) return;
    if (now - lastMove < WATCH_MS * 1.5 || now - rearmedAt < 20000) return;
    rearmedAt = now;
    host.rearm();
  }, WATCH_MS);
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (chip.visible && chip.contains(e.clientX, e.clientY, 0)) menu.show();
  });
  window.addEventListener('click', (e) => {
    if (chip.visible && chip.contains(e.clientX, e.clientY, 0)) comeOut();
  });

  // wiring
  capri.onMove = (head) => {
    // pointing at something: the panel goes on her other side, so it doesn't cover it
    panel.setAnchor({ ...head, lean: capri.pointing ? -capri.pointing.dir : 0 }, capri.view);
    // she may have moved out from under a still pointer: never leave a dead click zone behind
    refreshHit();
  };
  capri.onTeleport = (phase) => (phase === 'start' ? panel.suspend() : panel.resume());
  capri.chipAt = () => chip.center();
  capri.onStow = () => {
    chip.setMode(capri.mode);
    chip.show();
  };
  capri.onUnstow = () => chip.hide();
  capri.onDoze = (phase, face) => {
    if (phase === 'start') {
      mask.place(face.x, face.y, capri.scale * 1.1);
      mask.show();
    } else if (phase === 'waking') {
      mask.wake();
    } else {
      mask.hide();
    }
  };
  capri.onMode = (mode, prev) => chip.setMode(mode, prev);
  // now and then she says something about the satellite: while she looks at it, or once
  // the red light has gone up (never during, nothing should cover that)
  capri.onGaze = (when) => {
    const lines = when === 'end' ? brain.t.uplink : brain.t.gaze;
    if (!panel.visible && Math.random() < (when === 'end' ? 0.6 : 0.4)) panel.say({ kind: 'info', line: pick(lines), hold: 3800 });
  };
  panel.onChar = (kind) => voice.play('blip', { mood: kind });
  panel.onTalk = (talking) => talking && capri.perform('talk');
  capri.onMenu = () => menu.show();

  // Her guide (guide.js): her welcome on first launch, and "How does it work?" in her menu,
  // where she takes you to things and points at them.
  const guide = new Guide({ capri, panel, voice, host, brain });
  // Talking to her (chat.js): "Talk to her" in her menu, or the button when you click her idle.
  const chat = new Chat({ capri, panel, voice, host, brain });
  brain.onTalk = () => chat.start();
  // Her voice out loud (tts.js, her menu › Her voice): what she answers in her chat, when she's done
  // (a line added under an answer is read alone). The chat closing cuts her off.
  const tts = new Tts({ capri, lang: () => brain.lang });
  tts.muted = Boolean(config.muted);
  tts.setMode(config.speak);
  tts.applyPreset?.(config.voicePreset || 'animeRobot');
  tts.onNotice = (line) => panel.say({ kind: 'info', face: 'aside', line, hold: 9000 });
  const streamOf = panel.stream.bind(panel);
  panel.stream = (text, opts) => {
    streamOf(text, opts);
    if (opts?.done && chat.open) tts.say(text);
  };
  const closeChat = chat.close.bind(chat);
  chat.close = () => {
    closeChat();
    tts.stop();
    tts.last = '';
  };
  // Getting her chat going with buttons (setup.js): Ollama and a model, a key, or an address
  const setup = new Setup({ guide, panel, host, brain, capri, voice });
  guide.setup = setup;
  guide.onTalk = () => chat.start();
  chat.onSetup = (status) => setup.chat(status);
  chat.onBetterModel = () => setup.better();
  setup.onReady = () => chat.start();
  // What she calls you, how she is, your lines, what she remembers (custom.js)
  const custom = new Custom({ guide, host, brain, capri, voice });
  guide.custom = custom;
  brain.custom = mine(config);

  // How close she is to you (bond.js), her jealousy of your other AIs, the reminders she keeps.
  const bond = new Bond({ host, data: config.bond });
  brain.bond = bond;
  chat.bond = bond;
  capri.fondness = bond.stage;
  // small settings from her menu (main.js keeps them): what she reads out on hover, how clingy she is,
  // how often she invites you to talk, whether she dances to music
  const prefs = {
    vitals: config.vitals, jealousLevel: config.jealousLevel ?? 2, chatEvery: Number(config.chatEvery) || 0, danceMusic: config.danceMusic !== false,
  };
  const jealousy = new Jealousy({ capri, panel, brain, bond, chat, guide });
  jealousy.enabled = config.jealous !== false;
  jealousy.level = config.jealousLevel || 2;
  chat.jealousy = jealousy;
  brain.onRival = (key) => jealousy.onRivalEvent(key);
  // Possess eyes only during real jealousy (Jealousy.act → capri.jealous)
  {
  }
  const reminders = new Reminders({ host, list: config.reminders || [] });
  chat.reminders = reminders;
  chat.onMessage = () => bond.add('chat', 2);
  // looking at your screen (look.js): when you ask, or now and then if you turned it on
  const look = new Look({ capri, panel, brain, chat, guide, host, fx, voice, active: () => performance.now() - lastMove });
  look.configure(config);
  chat.look = look; // "regarde mon écran" in her chat
  // your PC as she feels it (pc.js): the processor, the battery, the network, a USB stick, a game
  const pc = new Pc({ capri, panel, brain, host, voice, chat, guide });
  pc.enabled = config.pcReact !== false;
  let wantsOut = config.visible !== false; // not put away in your settings (Ctrl+Alt+C, her menu)
  pc.wantsOut = () => wantsOut;

  // Daily extras: vitals, smart break, clipboard mood, window companion,
  // soft jealousy, morning ritual, multi-monitor polish, battery ritual…
  const extras = installExtras({
    capri, panel, brain, bond, chat, look, fx, launch: null, host, tts, pc, voice,
    jealousy, guide,
    getVitals: () => prefs.vitals,
    getDance: () => prefs.danceMusic,
    getMouse: () => mouse,
  });

  // Clear stuck FX when she stows / on demand
  {
    const prevStow = capri.onStow;
    capri.onStow = (...args) => {
      try { prevStow?.(...args); } catch { /* */ }
      try { extras?.clearFxResidue?.(); } catch { /* */ }
    };
  }

  // ── Real Claude events → cinematic pack ─────────────────────
  brain.onError = (info) => {
    const detail = [info?.tool, info?.detail].filter(Boolean).join(': ').slice(0, 120);
    try { extras?.onErrorEvent?.(detail || info?.kind || 'error'); } catch { /* */ }
    // demo: hunter/storm residue off quickly
    if (info?.demo || info?.session_id === 'demo-session') {
      setTimeout(() => { try { extras?.clearFxResidue?.(); } catch { /* */ } }, 600);
    }
  };
  brain.onWorkDone = (info) => {
    try {
      if ((info?.count || 0) >= 3) {
        extras?.pushMemory?.(
          'work',
          brain.lang === 'th'
            ? `งาน ${info.project || ''} จบ · ${info.count} actions`
            : `Finished ${info.project || 'task'} · ${info.count} actions`,
          'laugh',
        );
      }
      // Spectacle: victory orbit / ascension on big jobs
      extras?.onSpectacleWorkDone?.(info);
      // demo sessions wipe fast; normal jobs a bit later
      const ms = info?.demo || info?.session_id === 'demo-session' ? 900 : 4500;
      setTimeout(() => { try { extras?.clearFxResidue?.(); } catch { /* */ } }, ms);
    } catch { /* */ }
  };
  // Rival assistant hooks while she watches Claude → soft duel path
  const prevRival = brain.onRival;
  brain.onRival = (source) => {
    try { prevRival?.(source); } catch { /* */ }
    // jealousy system already handles bond; cinematic duel when free
    try {
      if (extras?.rivalDuel && Math.random() < 0.5) extras.rivalDuel();
    } catch { /* */ }
  };

  // Clicking her: panel toggle + jealousy. Vitals shown on hover (extras.js ── 2).
  capri.onClick = () => {
    if (panel.visible) { panel.hide(); return; }
    if (jealousy.onClick()) return;
    brain.status();
    bond.add('click', 1);
  };

  // Thrown around (capri.js throwHer): she says how it was. The first time she's shaken (or she
  // loves it, once she's attached to you); twice in a row she's dizzy and fed up; three times in
  // two minutes she zaps your pointer and won't let you pick her up for a bit.
  const throws = [];
  capri.onThrown = ({ how, hard = 0 }) => {
    const t = brain.t.thrown;
    if (how === 'leap') {
      if (Math.random() < 0.4) panel.say({ kind: 'info', face: 'smug', line: pick(brain.t.screens.hello), hold: 3000 });
      return;
    }
    const now = performance.now();
    throws.push(now);
    while (throws.length && now - throws[0] > 120000) throws.shift();
    // how she says it, and how she feels about it after (her chat knows: bond.js)
    let line, face = 'smug', feel = null;
    if (throws.length >= 3) {
      throws.length = 0;
      line = pick(t.angry);
      face = 'many';
      feel = 'angry';
      capri.refuseUntil = now + 25000;
      bond.lose(1);
      if (mouse) capri.zap(mouse.x, mouse.y);
    } else if (how === 'ledge') line = pick(t.ledge);
    else if (how === 'feet') line = pick(t.feet);
    else if (throws.length === 2) {
      line = pick(t.again);
      face = 'aside';
      feel = 'dizzy';
    } else if (hard > 0.75 && Math.random() < 0.5) {
      line = pick(t.screen);
      face = 'laugh';
      feel = 'thrown';
    } else if (bond.stage >= 3) {
      line = pick(t.fun);
      face = 'laugh';
      feel = 'fun';
    } else {
      line = pick(t.ow);
      face = 'wide';
      feel = 'thrown';
    }
    if (feel && bond.feeling !== 'angry') bond.feel(feel);
    panel.say({ kind: 'info', face, line, hold: 3800 });
    // Wow: window glitch / crack on impact
    try { extras?.glitchOnThrow?.({ how, hard }); } catch { /* */ }
  };
  // you said sorry in her chat: she lets it go (and lets you pick her up again)
  bond.onCalm = () => {
    jealousy.forgive();
    capri.refuseUntil = 0;
    try { extras?.pushMemory?.('calm', brain.lang === 'th' ? 'เธอขอโทษ… ฉันวางแล้ว' : 'You said sorry. I let it go.', 'smug'); } catch { /* */ }
  };
  capri.onDodge = () => panel.say({ kind: 'info', face: 'smug', line: pick(brain.t.thrown.dodge), hold: 2500 });

  // A new stage with you: her minds come out to look at you, and she says so, the sync bar under it.
  // At a quiet moment, so it isn't missed.
  let newStage = 0;
  bond.onStage = (stage) => {
    newStage = stage;
    capri.fondness = stage;
    try {
      extras?.pushMemory?.(
        'stage',
        brain.lang === 'th' ? `ซิงก์ระดับ ${stage}` : `Sync stage ${stage}`,
        stage >= 3 ? 'laugh' : 'look',
      );
    } catch { /* */ }
  };
  const quiet = () => !capri.busy && !capri.act && !capri.dragging && !capri.stowed && !capri.dormant && !capri.hidden
    && capri.mode !== 'alert' && !chat.open && !guide.running && !panel.visible && ['stand', 'sit'].includes(capri.stance);
  setInterval(async () => {
    if (!newStage || !quiet()) return;
    const stage = newStage;
    newStage = 0;
    const up = brain.t.bond.up[stage];
    if (!['angry', 'sulk'].includes(bond.feeling)) bond.feel('happy', { percent: bond.percent });
    voice.play('star');
    await capri.perform('split');
    capri.perform('hop');
    panel.say({
      kind: 'done', face: stage >= 3 ? 'laugh' : 'look',
      line: fmt(up.line, { percent: bond.percent }),
      quote: up.quote,
      hold: 9000,
    });
  }, 3000);
  // time spent together: a little sync for every ten minutes you're at your PC with her out
  setInterval(() => {
    if (performance.now() - lastMove < 10 * 60 * 1000 && !capri.stowed) bond.add('time', 1);
  }, 10 * 60 * 1000);
  // back at your PC after a while: once she's attached to you, she's glad to see you
  onBack = () => {
    if (bond.stage < 2 || capri.stowed) return;
    capri.wake();
    setTimeout(() => {
      if (!quiet()) return;
      capri.perform('hop');
      panel.say({ kind: 'idle', face: 'look', line: pick(brain.t.bond.back), hold: 3500 });
    }, 700);
  };
  // She comes to ask you to talk (her menu › how often she invites you), only when you've been quiet a while and
  // nothing else is on: a line in her words, with "talk" / "later". Never twice within the time you picked.
  let lastInvite = performance.now();
  setInterval(async () => {
    const every = (prefs.chatEvery || 0) * 60 * 1000;
    if (!every || !quiet() || capri.mode === 'work') return;
    const now = performance.now();
    if (now - lastInvite < every || now - lastMove < Math.min(every / 2, 90 * 1000)) return; // not while you're busy at the PC
    lastInvite = now;
    const name = brain.custom?.userName || '';
    const line = (await chat.greet().catch(() => null)) || pick(chat.t.hello);
    if (!quiet()) { lastInvite = now - every + 60 * 1000; return; } // something came up meanwhile: try again in a minute
    if (capri.stowed) return;
    capri.wake();
    capri.perform('hop');
    let done = false;
    panel.say({
      kind: 'idle', face: pick(['grin', 'look', 'smug']), tag: 'CAPRI', line: String(line).replace(/\{name\}/g, name || 'นาย'),
      actions: [{ id: 'talk', label: brain.lang === 'th' ? 'คุยกัน' : 'Talk', primary: true }, { id: 'later', label: brain.lang === 'th' ? 'ไว้ก่อน' : 'Later' }],
      onAction: (id) => {
        if (done) return;
        done = true;
        panel.setActions([]);
        if (id === 'talk') { bond.add('click', 1); chat.start(); } else { panel.hide(); lastInvite = performance.now(); }
      },
      hold: 20000,
    });
    if (tts.mode !== 'off') tts.say(line);
  }, 30 * 1000);

  // A reminder due: she comes and finds you (on whichever screen you're on), and holds it up until
  // you say it's done or ask for ten more minutes. One that came due while she was off, she brings
  // up when she's back. Talking with her, it comes in the chat.
  const startedAt = Date.now();
  const remind = async (r) => {
    const t = brain.t.remind;
    const time = clock(r.at, brain.lang);
    const missed = r.at < startedAt - 60000;
    const name = brain.custom?.userName ? ` ${brain.custom.userName}` : ' นาย'; // what she calls you (Thai lines use {name})
    // Thai lines say "ถึงเวลา{text}แล้ว": a text that already starts that way, or with a pronoun, loses it
    const said = brain.lang === 'th' ? String(r.text || '').replace(/^(?:ถึงเวลา|ได้เวลา|อย่าลืม)\s*/, '').replace(/^(?:ผม|ฉัน|หนู|เรา)\s*(?=[\u0E01-\u0E4E])/, '').trim() : r.text;
    const line = missed
      ? fmt(said ? t.missed : t.missedBare, { text: said, time, name })
      : fmt(pick(said ? t.now : t.nowBare), { text: said, name });
    let answered = false;
    // her reply goes where the reminder was shown: in the chat if it's the chat on the panel, else a line
    const reply = (text) => {
      if (chat.open && panel.current?.chat) chat.interject(text, [], null);
      else panel.say({ kind: 'info', face: 'smug', line: text, hold: 2500 });
    };
    const onAction = (id) => {
      if (answered) return; // a second click on the same button does nothing
      answered = true;
      if (id === 'snooze') {
        reminders.snooze(r.id, SNOOZE_MS);
        panel.setActions([]);
        reply(t.snoozed);
        return;
      }
      reminders.complete(r.id); // a repeating one comes back on its own
      bond.add('remind', 2);
      panel.setActions([]);
      reply(pick(t.doneLine));
    };
    const actions = [{ id: 'done', label: t.done, primary: true }, { id: 'snooze', label: t.snooze }];
    voice.play('remind');
    // In her chat: it comes in front as a message of its own, even over a list or a confirm / cancel
    // (they come back afterwards), as soon as she's done answering. Never on top of the chat itself.
    if (chat.open) {
      let inChat = false;
      for (let i = 0; chat.open && !inChat && i < 240; i++) {
        inChat = chat.interject(line, actions, onAction);
        if (!inChat) await wait(500); // her answer first
      }
      if (inChat) {
        // read in the chat: talked over (the buttons gone) or the chat closed without a button counts as seen
        const shownAt = performance.now();
        const stillAsked = () => panel.current?.chat && panel.current.actions?.some((a) => a.id === 'done');
        while (!answered && chat.open) {
          await wait(800);
          if (performance.now() - shownAt > 2500 && !stillAsked()) break;
        }
        if (!answered) {
          answered = true;
          reminders.complete(r.id);
        }
        return;
      }
    }
    if (capri.stowed) {
      host.setConfig({ visible: true });
      await capri.unstow();
    }
    capri.wake();
    await until(() => !capri.busy && !capri.dragging, 8000);
    await capri.toPointer(await host.cursor().catch(() => null));
    capri.perform('hop');
    const shownAt = performance.now();
    const shown = panel.say({
      kind: 'remind', face: 'look', line, quote: missed ? '' : fmt(t.asked, { time }), actions, onAction, hold: null,
      // closed without an answer: seen, if it was up long enough to read; else back in a couple of minutes
      onLeave: () => {
        if (answered) return;
        answered = true;
        if (performance.now() - shownAt > 2500) reminders.complete(r.id);
        else reminders.snooze(r.id, 2 * 60 * 1000);
      },
    });
    if (!shown) reminders.snooze(r.id, 60 * 1000); // something more important on: in a minute
  };
  reminders.onDue = (r) => remind(r).catch((err) => {
    console.error('[capri] reminder', err);
    reminders.snooze(r.id, 60 * 1000);
  });
  // the first Claude Code event that ever reaches her: so you know it worked
  brain.linked = config.linked;
  brain.watching = config.claude !== false;
  brain.onLinked = () => {
    host.setConfig({ linked: true, welcomed: true });
    voice.play('hello');
    capri.perform('hop');
    panel.say({ kind: 'done', badge: 'LINK', line: brain.t.welcome.linked, hold: 6000 });
  };

  // The demo's second half, after its fake Claude session: everything she does on her own, one
  // after the other, a line before each.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (done, max = 15000) => {
    for (const t0 = Date.now(); !done() && Date.now() - t0 < max;) await wait(100);
  };
  const free = () => !capri.busy && !capri.act && capri.stance !== 'fall';
  brain.onShowcase = async () => {
    const t = brain.t.showcase;
    const caption = (line) => panel.say({ kind: 'info', line, hold: 2200 });
    const wipe = () => { try { extras?.clearFxResidue?.(); } catch { /* */ } };
    // demo mode: extras shortens FX life + auto-wipe
    try { extras?.setDemoMode?.(true); } catch { /* */ }
    capri.nextMove = capri.nextGaze = performance.now() + 120000; // nothing of her own in between
    if (capri.stowed) await capri.unstow();
    if (capri.dormant) capri.wake();
    await until(free);
    panel.hide();
    wipe();

    caption(t.minds);
    await wait(1000);
    await capri.perform('split');
    await wait(500);
    wipe(); // split/gestalt residue off fast
    await wait(400);

    caption(t.zap);
    await wait(800);
    const h = capri.head();
    capri.zap(h.x + capri.towardCenter() * 280, h.y - 170);
    await wait(1200);
    wipe();

    panel.hide();
    if (capri.gaze({ big: true })) await until(() => !capri.sky);
    wipe(); // ascension / uplink particles
    await wait(1200);

    // Window possess (same FX as night-city-api): frame lightning + eyes
    caption(t.possess || t.zap || '…');
    await wait(600);
    try {
      if (capri.canPossess?.()) {
        await capri.possess();
      } else {
        const wins = capri.windows?.wins || [];
        const win = wins.find((w) => w.id !== 'taskbar') || null;
        if (win && capri.canSit?.(win)) {
          await capri.sitOn({ win, dx: Math.min(win.w - 70, Math.max(60, win.w * 0.72)) });
          await wait(300);
          if (capri.canPossess?.()) await capri.possess();
        }
      }
    } catch { /* */ }
    await wait(2200);
    wipe();

    caption(t.sleep);
    await wait(1000);
    panel.hide();
    wipe();
    capri.setMode('sleep');
    await wait(2000); // dozing off
    await capri.doze();
    await wait(3500);
    wipe();
    capri.wake();
    await until(free);
    await wait(800);

    caption(t.chip);
    await wait(1200);
    panel.hide();
    await capri.stow();
    wipe();
    await wait(2800);
    await capri.unstow();
    await wait(400);
    wipe(); // glass-world residue
    panel.say({ kind: 'info', line: t.end, hold: 5000 });
    await wait(200);
    wipe();
    try { extras?.setDemoMode?.(false); } catch { /* */ }
  };

  // what's in here, for --dev scripts (debug route `eval`)
  window.dev = { pointer: () => ({
    interactive, pressed, mouse, hit: mouse ? capri.hit(mouse.x, mouse.y) : null, busy: capri.busy, dragging: capri.dragging,
    stance: capri.stance, hidden: capri.hidden, alpha: capri.p.alpha, act: Boolean(capri.act), refused: capri.refuseUntil > performance.now(),
    pos: capri.pos,
    under: mouse ? describe(document.elementFromPoint(mouse.x, mouse.y)) : null,
    events: trace.map((e) => ({ ...e, at: undefined, agoS: Math.round((performance.now() - e.at) / 100) / 10 })),
  }), tts, capri, brain, panel, chat, guide, fx, voice, bond, jealousy, reminders, look, pc, setup, extras, screens: () => screens, memories: () => extras?.memories?.() };

  // Global shortcut for status HUD (Capri window is click-through — renderer keys won't fire)
  // Main process should register: globalShortcut.register('CommandOrControl+Alt+S', () => sendCommand('statusHud'))
  try {
    host.registerShortcut?.('CommandOrControl+Alt+S', () => host.sendCommand?.('statusHud') || host.command?.({ name: 'statusHud' }));
    host.bindShortcut?.('CommandOrControl+Alt+S', 'statusHud');
  } catch { /* main may not expose this yet */ }

  host.onClaudeEvent((evt) => {
    // brain.handle fires onError / onWorkDone / onRival for real hook events
    brain.handle(evt);
  });

  host.onWindows((data) => {
    capri.setWindows(data);
    brain.onWindows(data);
    jealousy.onWindows(data);
    pc.onWindows(data);
  });
  // the windows as they are now: the watcher only speaks again when something changes
  host.windowsNow().then((data) => data && capri.setWindows(data));

  // her window resized, or moved to another screen (whose pixels may be another size)
  let dpr = window.devicePixelRatio;
  const applySize = ({ width, height, gap = 0 }) => {
    floorGap = gap;
    fx.resize(width, height);
    chip.place(width, height - gap);
    capri.setView(width, height, height - gap);
    if (window.devicePixelRatio !== dpr) {
      dpr = window.devicePixelRatio;
      capri.setScale(capri.scale); // her drawing redone at the new screen's pixels
    }
  };
  host.onResize(applySize);

  // Your screens. She goes from one to the other through their shared edge (thrown, or jumping
  // over to follow you), else in her column of light. `screens`: { current, origin (her window's
  // corner), list: [{ id, x, y, w, h }] }, all in the desktop's coordinates.
  let screens = await host.screens().catch(() => null);
  const refreshScreens = async () => {
    screens = await host.screens().catch(() => screens);
  };
  // the screen right past one side of hers (-1 left, 1 right), at height y of her window, if any
  const beyond = (side, y) => {
    const here = screens?.list.find((d) => d.id === screens.current);
    if (!here) return null;
    const gy = screens.origin.y + y;
    return screens.list.find((d) => d.id !== here.id && gy >= d.y && gy < d.y + d.h
      && (side > 0 ? Math.abs(d.x - (here.x + here.w)) <= 2 : Math.abs(d.x + d.w - here.x) <= 2)) || null;
  };
  const moveTo = async (id) => {
    const res = await host.moveScreen(id);
    if (!res) return null;
    screens = { ...screens, current: id, origin: res.origin };
    applySize(res);
    return res;
  };
  capri.canCross = (side, y) => Boolean(beyond(side, y));
  capri.onCross = async (side, at) => {
    const there = beyond(side, at.y);
    if (!there) return null;
    const gy = screens.origin.y + at.y;
    const res = await moveTo(there.id);
    extras?.afterScreenHop?.();
    return res && { y: gy - res.origin.y };
  };
  capri.onScreenOf = (cursor) => capri.jumpScreen(async () => {
    await moveTo(cursor.display);
    extras?.afterScreenHop?.();
    return host.cursor();
  }, { toPointer: true });
  // to screen `id`: jumping over the shared edge if there's one at her height, else teleporting
  const goToScreen = async (id) => {
    if (!screens || id === screens.current) return;
    const mid = capri.screenPoint(118, 232);
    const side = [-1, 1].find((s) => beyond(s, Math.max(120, mid.y - 140))?.id === id);
    if (side && (await capri.leapTo(side))) {
      extras?.afterScreenHop?.();
      return;
    }
    await capri.jumpScreen(async () => {
      await moveTo(id);
      extras?.afterScreenHop?.();
      return host.cursor();
    });
  };
  // The pointer on another of your screens for a few seconds: she follows you there, when she's
  // free to (not in the middle of something, not asleep, not put away).
  let followOn = config.follow !== false;
  let awayChecks = 0;
  follow = (at) => {
    const elsewhere = followOn && screens && screens.list.length > 1 && at && !at.inside && at.display != null && at.display !== screens.current;
    awayChecks = elsewhere ? awayChecks + 1 : 0;
    if (awayChecks < FOLLOW_AFTER) return;
    if (capri.busy || capri.dragging || capri.stowed || capri.dormant || capri.hidden || capri.act || capri.pointing) return;
    if (!['stand', 'sit'].includes(capri.stance) || capri.mode === 'sleep' || capri.mode === 'alert' || chat.open || guide.running) return;
    awayChecks = 0;
    goToScreen(at.display);
  };
  window.addEventListener('resize', () => {
    fx.resize(innerWidth, innerHeight);
    chip.place(innerWidth, innerHeight - floorGap);
    capri.setView(innerWidth, innerHeight, innerHeight - floorGap);
  });

  // She gets bored when the PC is left alone (mischief.js, her menu › Mischief)
  // her hack demo (hacksim.js): a fake login page and a make-believe attack on it, from her chat or her Mischief menu
  hack = new HackSim({ capri, fx, panel, voice, brain, tts, chat });
  chat.onHack = (opts = {}) => hack.run(opts);
  const mischief = new Mischief({ capri, fx, panel, voice, tts, extras, host, brain, chat, guide, screens: () => screens, goToScreen });
  mischief.configure(config);
  mischief.hack = hack;

  host.onConfig((cfg) => {
    mischief.configure(cfg);
    voice.configure(cfg);
    jealousy.enabled = cfg.jealous !== false;
    jealousy.level = cfg.jealousLevel || 2;
    Object.assign(prefs, { vitals: cfg.vitals, jealousLevel: cfg.jealousLevel ?? 2, chatEvery: Number(cfg.chatEvery) || 0, danceMusic: cfg.danceMusic !== false });
    followOn = cfg.follow !== false;
    look.configure(cfg);
    pc.enabled = cfg.pcReact !== false;
    wantsOut = cfg.visible !== false;
    tts.muted = Boolean(cfg.muted);
    if (cfg.voicePreset && tts.applyPreset) tts.applyPreset(cfg.voicePreset);
    if ((cfg.speak || 'off') !== tts.mode) {
      tts.setMode(cfg.speak);
      tts.last = '';
      if (tts.mode !== 'off') tts.say(SAMPLE[cfg.lang] || SAMPLE.en); // a sample, as soon as she's picked
    }
    reminders.sync(cfg.reminders); // one may have been cancelled from her menu
    capri.wander = cfg.wander;
    capri.possessWindows = cfg.possess;
    capri.restOn = cfg.rest || 'corner';
    applyMotion(cfg.motion);
    if ((cfg.claude === false && brain.watching) || cfg.assistant !== brain.assistant) {
      guide.answer(null);
      panel.hide();
      capri.stopPointing();
      brain.replyFor = null;
      brain.linked = cfg.linked;
      // no longer watching Claude Code: whatever it was in the middle of is no business of hers
      brain.sessions.clear();
      panel.setTicker(null);
      if (capri.mode === 'work' || capri.mode === 'alert') capri.setMode('idle');
    }
    brain.watching = cfg.claude !== false;
    brain.custom = mine(cfg);
    brain.assistant = cfg.assistant;
    panel.labels = linesFor(cfg.lang, cfg.assistant);
    if (cfg.scale !== capri.scale) capri.setScale(cfg.scale);
    if (cfg.lang !== brain.lang) {
      brain.lang = cfg.lang;
      panel.labels = linesFor(cfg.lang, cfg.assistant);
      document.documentElement.lang = cfg.lang;
    }
  });

  host.onCommand(async (cmd) => {
    const t = brain.t;
    switch (cmd.name) {
      case 'teleport':
        capri.teleport(capri.spot('random'));
        break;
      case 'status':
        brain.status();
        break;
      case 'demo':
        capri.teleport(capri.spot('random'));
        break;
      case 'customize': // "Make her yours" in her menu
        custom.open();
        break;
      case 'setupChat': // "Set it up with her" in her menu's AI model
        setup.chat();
        break;
      case 'setupKey': // "API key or address" in her menu's AI model, or a service picked there that needs one
        setup.key();
        break;
      case 'setupFree': // --dev: Claude Code (or Codex) through Ollama
        setup.free();
        break;
      case 'setupStep': // --dev: one step of her setup on its own (pickModel, pull, pickKeyed, address…)
        guide.scene(() => setup[cmd.step]?.(...(cmd.args || [])));
        break;
      case 'look': // "Look at my screen" in her menu: once, now
        look.once();
        break;
      case 'watchScreen': // "Look at my screen now and then" in her menu
        look.setAuto(cmd.on);
        break;
      case 'goScreen': // a screen picked in her menu: she goes there
        goToScreen(cmd.id);
        break;
      case 'screens': // a screen plugged in, unplugged or moved
        refreshScreens();
        break;
      case 'remindIn': // --dev: a reminder `ms` from now
        reminders.add(Date.now() + (cmd.ms ?? 3000), cmd.text ?? '');
        break;
      case 'bond': // --dev: sync points from a source (as if earned)
        bond.add(cmd.source || 'chat', cmd.n || 1);
        break;
      case 'rearmed': // a new mouse hook (main.js): click-through until the pointer comes over her again
        mouse = null;
        pressed = false;
        capri.resetPointer?.(); // a press whose release never reached her
        refreshHit();
        break;
      case 'rearm': // --dev: as if she'd noticed the pointer no longer reaches her
        host.rearm();
        break;
      case 'loseGl': { // --dev: as if the GPU had been reset (waking from sleep): she goes, then comes back
        const lose = capri.sprite.gl.getExtension('WEBGL_lose_context');
        lose?.loseContext();
        setTimeout(() => lose?.restoreContext(), cmd.ms ?? 1500);
        break;
      }
      case 'answer': { // --dev: as if that button of her panel had been clicked (her chat's too)
        const button = document.querySelector(`.panel__action[data-id="${CSS.escape(cmd.id)}"]`);
        if (button) button.click();
        else guide.answer(cmd.id);
        break;
      }
      case 'assistantChanged': // Claude Code, Codex or Antigravity, picked in her menu
        guide.welcome();
        break;
      case 'welcome': // "How does it work?" in her menu
        guide.menu();
        break;
      case 'forget': // "Forget our conversations" in her menu, maybe with her chat open
        chat.history = [];
        chat.summary = '';
        try { host.saveSummary(''); } catch { /* non-fatal */ }
        break;
      case 'chat': // "Talk to her" in her menu
        chat.start();
        break;
      case 'report': // "Mission report" in her menu
        if (capri.stowed) {
          host.setConfig({ visible: true });
          await capri.unstow();
        }
        capri.wake();
        if (brain.report()) capri.perform('curious', capri.towardCenter());
        break;
      case 'fakeClaude': { // --dev: the topmost window (the test window) is where a prompt was typed, and you're elsewhere
        const win = capri.windows.wins[0];
        if (win) {
          brain.sessions.set('dev', { id: 'dev', project: 'dev', taskStart: Date.now(), count: 0, files: new Set(), log: [], working: true, waiting: false, window: win.id, seen: Date.now() });
          capri.windows = { ...capri.windows, fg: -1 };
        }
        break;
      }
      case 'guide': // --dev: one topic of her guide (welcome, menu, connect, icon, claude, folder)
        if (cmd.topic === 'welcome') guide.welcome();
        else if (cmd.topic === 'menu') guide.menu();
        else if (typeof guide[cmd.topic] === 'function') guide.scene(() => guide[cmd.topic]());
        break;
      case 'stow': // Ctrl+Alt+C: into her biochip, or back out
        if (cmd.on) capri.stow();
        else capri.unstow();
        break;
      case 'locate': { // Ctrl+Alt+X: "where is she?" — out of her biochip, to the middle of the screen, one line
        if (capri.stowed) {
          host.setConfig({ visible: true });
          await capri.unstow();
        }
        capri.wake();
        if (capri.stance === 'peek') await capri.unpeek();
        panel.hide();
        const spot = capri.spot('post');
        await capri.teleport(spot && typeof spot === 'object' && 'x' in spot ? { ...spot, x: cmd.x } : spot);
        capri.perform('hop');
        panel.say({ kind: 'info', face: 'laugh', line: cmd.line, hold: 3500 });
        break;
      }
      case 'rainTip': // first start of the day, rain likely: she says to take an umbrella (main.js)
        if (capri.stowed || capri.dormant || chat.open || guide.running || panel.visible) break; // not over something else
        capri.perform('hop');
        panel.say({ kind: 'info', face: 'look', line: cmd.line, hold: 7000 });
        break;
      case 'pcTool': // her menu › PC tools: check the PC, clear RAM, clean junk, Nmap / Wireshark (chat.js tool())
        if (!chat.open) await chat.start();
        if (chat.open) await chat.tool(String(cmd.tool || ''));
        break;
      case 'hacksim': // her menu › Mischief › hack demo
        hack.run({});
        break;
      case 'mischief': // "Mischief now" in her menu (the idle trigger runs from mischief.js itself)
        mischief.run({ force: Boolean(cmd.force) });
        break;
      case 'news': // a headline in her words (main.js, news.js); on a timer she doesn't cut in on anything
        if (!cmd.force && (capri.stowed || capri.dormant || capri.hidden || chat.open || guide.running || panel.visible || capri.mode === 'alert')) break;
        if (capri.stowed) {
          host.setConfig({ visible: true });
          await capri.unstow();
        }
        capri.wake();
        capri.perform('hop');
        panel.say({ kind: 'info', face: 'look', line: cmd.line, hold: Math.min(45000, 14000 + cmd.line.length * 140) }); // news: time to read it (about 14 s + 0.14 s a character)
        if (tts.mode !== 'off') tts.say(cmd.line);
        break;
      case 'satellite': // the whole sequence, on demand (tray)
        if (capri.stowed) {
          host.setConfig({ visible: true });
          await capri.unstow();
        }
        capri.wake();
        if (capri.stance === 'peek') await capri.unpeek();
        if (!capri.gaze({ big: true })) setTimeout(() => capri.gaze({ big: true }), 1500);
        break;
      case 'model': { // at start: her model loading, then ready (main.js, preloadSelectedModel)
        if (capri.stowed || capri.dormant || chat.open || guide.running) break;
        // over her boot line or this bubble's previous step, never over something else being read
        if (panel.visible && !panel.current?.boot && panel.current?.kind !== 'info') break;
        const th = brain.lang === 'th';
        const name = String(cmd.model || '').replace(/:latest$/, '');
        const view = {
          loading: { line: `CAPRI.NET · loading ${name}`, badge: th ? 'ซิงค์' : 'SYNC', face: 'calm', hold: null },
          ready: { line: `CAPRI.NET · ${name} ready`, badge: th ? 'พร้อม' : 'READY', face: 'grin', hold: 3800 },
          failed: { line: `CAPRI.NET · ${name} offline`, badge: th ? 'ออฟไลน์' : 'OFFLINE', face: 'aside', hold: 4500 },
        }[cmd.state];
        if (!view) break;
        panel.say({ kind: 'info', tag: 'CAPRI', boot: true, ...view });
        if (cmd.state !== 'ready') break;
        // everything is loaded: she greets you, in her own words, new each time (her model writes it;
        // one of her written lines if it can't)
        const line = (await chat.greet().catch(() => null)) || pick(chat.t.hello);
        const free = !panel.visible || panel.current?.boot; // not over something you may be reading
        if (!free || chat.open || guide.running || capri.stowed || capri.dormant) break;
        capri.perform('hop');
        panel.say({
          kind: 'info', tag: 'CAPRI', boot: true, face: pick(['grin', 'smug', 'laugh', 'look']), badge: chat.t.badge,
          line, hold: Math.min(14000, 6000 + line.length * 60),
        });
        if (tts.mode !== 'off') tts.say(line);
        break;
      }
      case 'hooks':
        if (cmd.ok) panel.say({ kind: 'info', line: cmd.action === 'install' ? t.hooksOk : t.hooksRemoved, hold: 6000 });
        else panel.say({ kind: 'error', line: fmt(t.hooksFail, { error: cmd.error }), hold: 9000 });
        break;
      // --dev helpers
      case 'intro': // her intro again, as when she starts (still: as with Windows' animations off)
        panel.hide();
        await capri.intro(capri.spot('post'), cmd.still ? { still: true } : {});
        break;
      case 'pose':
        capri.debug = cmd.params || null;
        if (cmd.still) capri.nextMove = capri.nextGaze = Infinity; // no wandering off mid-test
        if (cmd.hush) {
          panel.setTicker(null);
          panel.hide();
        }
        if (cmd.scale) capri.setScale(cmd.scale);
        if (cmd.stance) capri.setStance(cmd.stance, cmd);
        if (cmd.at) capri.pos = cmd.at;
        if (cmd.facing) capri.facing = cmd.facing;
        capri.drawFrame();
        break;
      case 'config': // a setting, as if changed from her menu
        host.setConfig(cmd.patch || {});
        break;
      case 'focus': // as if window `fg` had come to the front
        capri.windows = { ...capri.windows, fg: cmd.fg };
        brain.onWindows(capri.windows);
        break;
      case 'freeze':
        capri.hidden = Boolean(cmd.on);
        break;
      case 'act':
        // behaviours by method name (gaze, celebrate, hurt, shed, peek, fall, wanderStep...) or acts by name
        if (cmd.act === 'sit') {
          // pile: n-th window she could sit on from the top of the pile (0: the --dev test window
          // opened last), instead of the usual choice
          const top = cmd.pile !== undefined && capri.windows.wins.filter((w) => capri.canSit(w))[cmd.pile];
          const seat = top ? { win: top, dx: top.w * 0.4 } : capri.pickSeat();
          if (seat) capri.sitOn(seat);
        } else if (typeof capri[cmd.act] === 'function') capri[cmd.act](...(cmd.args || []));
        else capri.perform(cmd.act, cmd.dir || 0);
        break;
      case 'errorHunt': // --dev: force Error Hunter
        extras?.onErrorEvent?.(cmd.text || '');
        break;
      case 'director': // --dev: force Director point
        extras?.directorPoint?.();
        break;
      case 'glass': // --dev: Glass World
        extras?.glassWorld?.(cmd.why || 'unstow');
        break;
      case 'duel': // --dev: Rival Duel
        extras?.rivalDuel?.();
        break;
      case 'memory': // --dev: push a bond memory
        extras?.pushMemory?.(cmd.kind || 'note', cmd.text || '…', cmd.face || 'look');
        break;
      case 'hyper12': // --dev: 12D cast
        extras?.hyper12Cast?.();
        break;
      case 'ascension':
        extras?.ascension?.({ force: true });
        break;
      case 'gestalt':
        extras?.gestaltUnmask?.({ force: true });
        break;
      case 'reality':
        extras?.realityCrack?.({ hard: 0.9, how: 'ko' });
        break;
      case 'storm':
        extras?.neuralStorm?.({ force: true });
        break;
      case 'boss':
        extras?.rivalBossIntro?.({ force: true });
        break;
      case 'orbit':
        extras?.victoryOrbit?.({ count: 20, project: cmd.project || 'dev' });
        break;
      case 'eclipse':
        extras?.eclipseMode?.({ force: true });
        break;
      case 'chrono':
        extras?.chronoRewind?.();
        break;
      case 'clearFx': // wipe stuck particles / lines
        extras?.clearFxResidue?.();
        break;
      case 'testMelody':
        extras?.testMelody?.();
        break;
      case 'testEdge':
        extras?.testEdge?.();
        break;
      default:
        break;
    }
  });

  // entrance: her face big in the corner says hi, then she dives down to her spot
  // (put away last time: she starts in her biochip)
  if (config.visible === false) capri.stowNow();
  else if (intro) await capri.intro(capri.spot('post'));
  else await capri.materialize(capri.spot('post'));
  // Windows has its animations off and she's following it: she barely moves. The first time, she
  // says so and asks whether to move anyway (her menu › Animations changes it later).
  if (reducedMotion.setting === 'auto' && reducedMotion.system && !config.motionAsked) {
    const m = brain.t.motion;
    await new Promise((done) => {
      const asked = panel.say({
        kind: 'info',
        face: 'aside',
        guide: true,
        line: m.line,
        quote: m.quote,
        actions: [{ id: 'full', label: m.full, primary: true }, { id: 'reduced', label: m.still }],
        onAction: (id) => {
          host.setConfig({ motion: id, motionAsked: true });
          panel.hide();
          if (id === 'full') capri.perform('hop');
        },
        onLeave: done,
        hold: null,
      });
      if (!asked) done();
    });
  }
  const hooks = await host.hooksStatus();
  // her welcome: the first time, or while she's meant to watch Claude Code and isn't plugged into it
  if (!config.welcomed || (config.claude && !hooks.installed)) guide.welcome();
  else {
    // single boot line, no sync %
    panel.say(bootPayload(brain.lang));
    setTimeout(() => {
      if (!panel.visible && !chat.open && !guide.running) {
        panel.say({ kind: 'info', line: brain.onlineLine(), hold: 3500 });
      }
    }, 3000);
  }

  // In the evening, after a real day's work, she brings you her report card once, on her own,
  // at a quiet moment.
  setInterval(() => {
    const day = mission.day;
    const quiet = !brain.busySessions.length && !panel.visible && !guide.running && !capri.busy && !capri.act;
    if (new Date().getHours() < 18 || day.reported || day.missions < 3 || !quiet) return;
    if (capri.stowed || capri.dormant || capri.mode === 'sleep') return;
    if (brain.report()) {
      mission.markReported();
      capri.perform('curious', capri.towardCenter());
    }
  }, 60000);
}

boot().catch((err) => {
  console.error('[capri] boot failed', err);
});