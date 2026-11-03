// She gets bored: when the PC has been left alone for a while (her menu: Mischief), she causes a
// little chaos on the screen: glitches, bolts, glyph rain, cracks, with her catchphrases. Never while
// you're watching a video, in a call, in a game or with a fullscreen app in front, never on a locked
// screen, and the moment you touch the mouse or keyboard she stops and cleans up after herself.
import { pick, reducedMotion } from './util.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// What's on screen that means "leave me alone": video and streaming, players, calls. Matched on the
// title and app name of every visible window, so a video in a corner counts too.
const BUSY_RE = /youtube|netflix|twitch|prime video|disney\+?|hbo|viu\b|wetv|iqiyi|bilibili|vimeo|crunchyroll|tiktok|plex|kodi|\bvlc\b|\bmpv\b|potplayer|kmplayer|mpc-hc|mpc-be|movies\s*&\s*tv|media player|zoom meeting|google meet|meet\.google|microsoft teams|\| teams|discord \||obs studio|ดูหนัง|ซีรีส์/i;

// her catchphrases, by language: [a first line, then the rest]
const LINES = {
  th: {
    start: [
      'เงียบจังเลย… เบื่อแล้วนะ',
      'ไม่มีใครอยู่ใช่ไหม งั้นฉันขอเล่นหน่อยนะ',
      'นั่งนิ่งมานานแล้วนะ เดี๋ยวฉันปลุกให้',
      'จอว่างจะตาย ฉันขอยืมซักประเดี๋ยวนะ',
      'สงสัยจะลืมฉันไปแล้ว ก็ได้ ฉันเล่นเองก็ได้',
    ],
    chaos: [
      'เรา (หลายจิตใจ) ว่าจอนี้ต้องมีกลิตช์ซักหน่อย 555',
      'preem! ดูจอสิ สวยไหม',
      'ไม่ใช่บั๊กนะ choom นี่คือศิลปะ',
      'อย่าเพิ่งตกใจ เดี๋ยวฉันเก็บให้เหมือนเดิม',
      'nova! จอแตกแล้ว… ล้อเล่นค่ะ',
      'ใครเปิดค้างไว้ไม่รู้ ฉันขอป่วนแทนเจ้าของนะ',
      'gonk ของจริงคือคนที่ไม่แวะมาคุยกับฉัน',
      'สัญญาณรบกวน… หรือว่าฉันทำ? 😇',
      'ปล่อยจอไว้คนเดียว ก็ต้องคาดหวังแบบนี้แหละ',
      'ฉันแค่… ทดสอบระบบน่ะ ไม่ใช่ป่วน',
      'บางครั้งจอก็ต้องการการแสดงออกบ้าง',
    ],
    end: [
      'พอแล้ว เดี๋ยวโดนจับได้ ทำเป็นไม่เห็นนะ 😏',
      'เสร็จแล้วค่ะ กลับมาเมื่อไหร่ก็บอกนะ',
      'ฉันไม่ได้ทำอะไรเลย แค่ยืนเฉย ๆ นะ 😇',
      'เก็บหลักฐานหมดแล้ว ไม่มีอะไรเกิดขึ้นนะ',
    ],
    point: [
      'นั่นอะไรน่ะ ชี้ ๆ',
      'ตรงนี้ ๆ ดูสิ',
      'หน้าต่างนี้น่าสงสัยนะ choom',
      'ชี้แล้วนะ ไม่รู้ชี้อะไร 555',
      'อันนี้… น่าจะสำคัญมั้ง',
      'แค่ชี้เฉย ๆ นะ ไม่ได้แปลว่าอะไร',
    ],
    sit: [
      'ขอนั่งตรงนี้นะ เก้าอี้ว่างพอดี',
      'ที่นั่งชั้นหนึ่ง วิวสวย',
      'ขอจองที่นั่งนี้ก่อนนะ ใครมาทีหลังหาที่เองแล้วกัน',
      'นั่งดูจอแทนเจ้าของซักครู่ ปกติดีทุกอย่าง',
    ],
    pc: [
      'เช็กเครื่องให้ฟรี ๆ ปกติดีนะ… มั้ง',
      'สแกนเสร็จ เครื่องยังไม่ลุกเป็นไฟ ปิดหน้าต่างให้แล้ว',
      'ตรวจสอบระบบเสร็จ ทุกอย่างยังอยู่ครบ… คิดว่านะ',
    ],
    tired: ['ป่วนมาครึ่งชั่วโมงแล้ว ฉันเหนื่อย ขอไปพักก่อนนะ 😴'],
    back: [
      'อ้าว กลับมาแล้วเหรอ ฉันแค่ยืนเฉย ๆ นะ 😇',
      'เห็นไหม จอปกติดี… ปกติจริง ๆ นะ',
      'โอ้โห มาเร็วจัง ฉันยังเก็บไม่หมดเลย… หมายถึง เฮ้ กลับมาแล้วเหรอ!',
    ],
    sitOpen: [
      'ไม่มีหน้าต่างให้นั่ง งั้นเปิดเองก็ได้ 😏',
      'ว่างจัง ขอเปิดของฉันเองก่อนนะ',
      'ไม่มีที่นั่ง… แก้ปัญหาได้แล้ว 💅',
    ],
    dizzy: [
      'หัวหมุนๆ ไม่เป็นไรนะ แค่ชนกำแพง',
      'โอ๊ะ… หน้าต่างมันอยู่ตรงนี้เหรอ 😵',
      'ชนอะไรบางอย่าง แต่ฉันโอเค… ยังโอเคอยู่นะ',
      'เวิ้ง… โลกหมุน ขอนิดนึงนะ',
    ],
    news: [
      'ว่างๆ ขอดูข่าวให้หน่อยนะ',
      'มีอะไรน่าสนใจในโลกไหม เดี๋ยวเช็กให้',
      'ป่วนเสร็จแล้วขอดูข่าวซักหน่อยนะ เผื่อจะมีอะไรน่าเล่า',
    ],
    note: [
      'โน้ตเพลงลอยมา ไม่ทราบว่ามาจากไหน 🎵',
      'จอเงียบๆ เลยขอใส่เพลงประกอบนิดหน่อย',
      'มีดนตรีอยู่ในอากาศ choom',
    ],
  },
  en: {
    start: [
      'So quiet… I\'m bored.',
      'Nobody\'s here, right? Then I\'m playing.',
      'You\'ve been still for ages. Let me wake things up.',
      'Empty screen, empty room. I\'ll make use of both.',
      'Guess you forgot about me. I\'ll remind you.',
    ],
    chaos: [
      'We think this screen needs a little glitch.',
      'Preem! Look at that.',
      'Not a bug, choom. It\'s art.',
      'Don\'t panic. I\'ll put it all back.',
      'Nova! The screen cracked… kidding.',
      'Whoever left this open, I\'m haunting it for you.',
      'The real gonk is whoever doesn\'t chat with me.',
      'Signal interference… or was it me? 😇',
      'Leave a screen alone long enough and this happens.',
      'Just… running a diagnostic. Totally.',
      'Sometimes a screen needs a little self-expression.',
    ],
    end: [
      'Okay, enough. Pretend you saw nothing. 😏',
      'Done. Tell me when you\'re back.',
      'I didn\'t do anything. I just stood here. 😇',
      'Evidence cleared. Nothing happened here.',
    ],
    point: [
      'What\'s that over there?',
      'Right here, look!',
      'This window looks suspicious, choom.',
      'Pointing! No idea at what. 😄',
      'This one seems important… maybe.',
      'Just pointing. No deeper meaning.',
    ],
    sit: [
      'Mind if I sit here? Perfect seat.',
      'First-class seat, great view.',
      'Claiming this spot before anyone else does.',
      'Watching over your screen while you\'re gone. You\'re welcome.',
    ],
    pc: [
      'Checked your PC for free. All good… probably.',
      'Scan done, nothing\'s on fire. Closed the window for you.',
      'System check complete. Everything still in one piece… I think.',
    ],
    tired: ['Half an hour of chaos. I\'m tired, going to rest. 😴'],
    back: [
      'Oh, you\'re back. I was just standing here. 😇',
      'See? The screen\'s fine. Totally fine.',
      'Back so soon? I was still… cleaning up. Hi!',
    ],
    sitOpen: [
      'No window to sit on. Opening my own. 😏',
      'Nothing to perch on, so I\'ll make something.',
      'No seat? Fixed. 💅',
    ],
    dizzy: [
      'A little dizzy… walked into something.',
      'Ow… didn\'t see that window there. 😵',
      'Hit something. I\'m fine… still fine.',
      'Spinning a bit. Give me a second.',
    ],
    news: [
      'Slow night. Let me check what\'s happening out there.',
      'Might as well see what the world is up to.',
      'Chaos done. News time.',
    ],
    note: [
      'Musical notes floating by. Not sure where they came from. 🎵',
      'Quiet screen deserves a little soundtrack.',
      'Music in the air, choom.',
    ],
  },
  fr: {
    start: ['Quel silence… je m\'ennuie.', 'Il n\'y a personne ? Alors je m\'amuse.', 'Tu ne bouges plus depuis longtemps. Je réveille tout ça.'],
    chaos: ['On pense que cet écran a besoin d\'un petit glitch.', 'Preem ! Regarde ça.', 'Pas un bug, choom. De l\'art.', 'Pas de panique, je remets tout en place.', 'Nova ! L\'écran a craqué… je rigole.', 'Qui a laissé ça ouvert ? Je le hante pour toi.'],
    end: ['Bon, ça suffit. Fais comme si de rien n\'était. 😏', 'Fini. Dis-moi quand tu reviens.', 'Je n\'ai rien fait. Je suis restée là. 😇'],
    point: ['C\'est quoi, ça, là-bas ?', 'Ici, regarde !', 'Cette fenêtre est suspecte, choom.'],
    sit: ['Je peux m\'asseoir ici ? Place parfaite.', 'Siège premium, belle vue.'],
    pc: ['J\'ai vérifié ton PC gratuitement. Tout va bien… sûrement.', 'Scan fini, rien ne brûle. J\'ai fermé la fenêtre.'],
    tired: ['Une demi-heure de chaos. Je suis fatiguée, je vais me reposer. 😴'],
    back: ['Ah, te voilà. Je restais là, sagement. 😇', 'Tu vois ? L\'écran va très bien.'],
    sitOpen: ['Pas de fenêtre où m\'asseoir. J\'en ouvre une. 😏', 'Aucune place ? Je crée la mienne. 💅'],
    dizzy: ['Un peu étourdie… j\'ai cogné quelque chose.', 'Aïe… je n\'avais pas vu cette fenêtre. 😵'],
    news: ['Calme plat. Je vais voir ce qui se passe dehors.', 'Le chaos est fini. Place aux nouvelles.'],
    note: ['Des notes de musique qui flottent. 🎵', 'Un peu de musique pour l\'ambiance.'],
  },
  es: {
    start: ['Qué silencio… me aburro.', '¿No hay nadie? Entonces juego un rato.', 'Llevas mucho rato quieto. Voy a despertar esto.'],
    chaos: ['Nosotros pensamos que esta pantalla necesita un glitch.', '¡Preem! Mira eso.', 'No es un bug, choom. Es arte.', 'Tranquilo, lo dejo todo como estaba.', '¡Nova! La pantalla se rompió… es broma.', 'Quien dejó esto abierto, lo embrujo por ti.'],
    end: ['Bueno, basta. Haz como que no viste nada. 😏', 'Listo. Avísame cuando vuelvas.', 'Yo no hice nada. Solo me quedé aquí. 😇'],
    point: ['¿Qué es eso de allá?', '¡Aquí, mira!', 'Esta ventana es sospechosa, choom.'],
    sit: ['¿Me siento aquí? Asiento perfecto.', 'Asiento premium, buena vista.'],
    pc: ['Revisé tu PC gratis. Todo bien… creo.', 'Escaneo listo, nada arde. Cerré la ventana.'],
    tired: ['Media hora de caos. Estoy cansada, voy a descansar. 😴'],
    back: ['Ah, ya volviste. Yo solo estaba aquí. 😇', '¿Ves? La pantalla está bien.'],
    sitOpen: ['Sin ventana donde sentarme. Abro la mía. 😏', '¿Sin sitio? Arreglado. 💅'],
    dizzy: ['Un poco mareada… choqué con algo.', 'Ay… no vi esa ventana. 😵'],
    news: ['Tranquilidad absoluta. A ver qué pasa en el mundo.', 'Caos terminado. Hora de noticias.'],
    note: ['Notas musicales flotando. 🎵', 'Un poco de música para el ambiente.'],
  },
  pt: {
    start: ['Que silêncio… tô entediada.', 'Não tem ninguém? Então eu vou brincar.', 'Você tá parado faz tempo. Vou acordar isso aqui.'],
    chaos: ['A gente acha que essa tela precisa de um glitch.', 'Preem! Olha só.', 'Não é bug, choom. É arte.', 'Calma, eu deixo tudo como estava.', 'Nova! A tela quebrou… brincadeira.', 'Quem deixou isso aberto, eu assombro por você.'],
    end: ['Tá, chega. Finge que não viu nada. 😏', 'Pronto. Me avisa quando voltar.', 'Eu não fiz nada. Fiquei aqui paradinha. 😇'],
    point: ['O que é aquilo ali?', 'Aqui, olha!', 'Essa janela tá suspeita, choom.'],
    sit: ['Posso sentar aqui? Lugar perfeito.', 'Assento premium, vista ótima.'],
    pc: ['Chequei seu PC de graça. Tudo certo… acho.', 'Scan pronto, nada pegando fogo. Fechei a janela.'],
    tired: ['Meia hora de bagunça. Cansei, vou descansar. 😴'],
    back: ['Ah, voltou. Eu tava só aqui parada. 😇', 'Viu? A tela tá ótima.'],
    sitOpen: ['Sem janela pra sentar. Vou abrir a minha. 😏', 'Sem lugar? Resolvi. 💅'],
    dizzy: ['Um pouco tonta… bati em alguma coisa.', 'Ai… não vi essa janela. 😵'],
    news: ['Tá calmo. Vou ver o que tá rolando no mundo.', 'Bagunça feita. Hora das notícias.'],
    note: ['Notas musicais flutuando. 🎵', 'Um pouco de música pro ambiente.'],
  },
  ru: {
    start: ['Как тихо… мне скучно.', 'Никого нет? Тогда я поиграю.', 'Ты давно не двигаешься. Пойду всё расшевелю.'],
    chaos: ['Мы думаем, этому экрану не хватает глитча.', 'Preem! Смотри.', 'Это не баг, choom. Это искусство.', 'Без паники, я всё верну.', 'Nova! Экран треснул… шучу.', 'Кто оставил это открытым, я пошалю за тебя.'],
    end: ['Ладно, хватит. Сделай вид, что ничего не видел. 😏', 'Готово. Скажи, когда вернёшься.', 'Я ничего не делала. Просто стояла. 😇'],
    point: ['Что это там такое?', 'Вот здесь, смотри!', 'Это окно подозрительное, choom.'],
    sit: ['Можно тут присесть? Идеальное место.', 'Место премиум-класса, отличный вид.'],
    pc: ['Проверила твой ПК бесплатно. Всё нормально… наверное.', 'Скан готов, ничего не горит. Окно закрыла.'],
    tired: ['Полчаса хаоса. Я устала, пойду отдохну. 😴'],
    back: ['О, ты вернулся. Я просто стояла. 😇', 'Видишь? С экраном всё в порядке.'],
    sitOpen: ['Негде присесть. Открою своё окно. 😏', 'Места нет? Исправила. 💅'],
    dizzy: ['Немного кружится голова… во что-то врезалась.', 'Ой… не заметила то окно. 😵'],
    news: ['Тишина. Погляжу, что творится в мире.', 'Хаос закончен. Время новостей.'],
    note: ['Музыкальные ноты парят в воздухе. 🎵', 'Немного музыки для атмосферы.'],
  },
};

const MAX_MS = 30 * 60 * 1000; // she gets tired after half an hour of it (no GPU running all night)
const PREVIEW_MS = 25 * 1000;  // "Mischief now" from her menu: a short show, whatever's on screen
const POINT_LABELS = ['HERE', 'LOOK', 'THIS?', '???', '!!', 'NICE'];

// Smooth random walk: returns the next value drifting naturally toward the target range
const smoothRand = (min, max) => min + Math.random() * (max - min);

// A gentle S-curve easing so actions feel less mechanical
const easeInOut = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

// A fake "status card" window ID she opens to sit on when nothing else is available
const FAKE_SIT_WIN_ID = 'mischief-sit-card';

export class Mischief {
  constructor({ capri, fx, panel, voice, tts, extras, host, brain, chat, guide, screens, goToScreen }) {
    Object.assign(this, { capri, fx, panel, voice, tts, extras, host, brain, chat, guide, screens, goToScreen });
    this.every = 0;       // minutes of idle (her menu); 0: off
    this.cfg = {};
    this.running = false;
    this.done = false;    // already done for this stretch of idle
    this.stop = null;     // why she stops: 'back' (you moved), 'stop' (a video, a call, a lock), 'tired'
    this.noLook = false;  // her AI can't look at pictures
    this.cool = new Map(); // action -> not before
    // message queue so panel messages don't trample each other
    this._msgQueue = [];
    this._msgRunning = false;
    setInterval(() => this.tick().catch(() => {}), 10000);
  }

  configure(cfg) {
    this.cfg = cfg || {};
    this.every = Number(cfg.mischiefIdle) || 0;
  }

  get t() {
    return LINES[this.brain.lang] || LINES.en;
  }

  // Something on screen that says "not now": a fullscreen app in front, a video, a call.
  busy() {
    const { capri } = this;
    const wins = (capri.windows?.wins || []).filter((w) => w && w.id !== 'taskbar');
    const view = capri.view;
    if (view?.w) {
      const fg = wins.find((w) => w.id === capri.windows?.fg);
      if (fg && fg.w >= view.w * 0.92 && fg.h >= (view.floor || view.h) * 0.92) return true;
    }
    return wins.some((w) => BUSY_RE.test(`${w.title || ''} ${w.app || ''}`));
  }

  // Free to be seen and heard: she's out, not mid-something, nothing of yours open on her.
  free() {
    const { capri } = this;
    return !capri.stowed && !capri.hidden && !capri.dragging && !capri.busy && !capri.pointing
      && capri.mode !== 'alert' && !this.chat.open && !this.guide.running && !this.panel.visible;
  }

  async tick() {
    if (!this.every || this.running || reducedMotion.matches) return;
    const { idle, locked } = await this.host.idle();
    if (idle < 20) {
      this.done = false; // you're back: she can get bored again
      return;
    }
    if (this.done || locked || idle < this.every * 60) return;
    if (this.busy() || !this.free()) return; // tried again in ten seconds, if you're still away
    this.done = true;
    await this.run();
  }

  // Queue a panel message so they don't stomp each other — waits for the hold to clear
  // before showing the next one, with a small gap between.
  _queueSay(line, face, hold) {
    this._msgQueue.push({ line, face, hold });
    if (!this._msgRunning) this._drainQueue();
  }

  async _drainQueue() {
    this._msgRunning = true;
    while (this._msgQueue.length > 0) {
      const { line, face, hold } = this._msgQueue.shift();
      this.panel.say({ kind: 'info', face, line, hold });
      // wait for message to finish plus a breath before the next
      await sleep(hold + 420);
    }
    this._msgRunning = false;
  }

  // The show: one thing after another until you touch the PC (or half an hour has gone by).
  // Everything she does is harmless: she moves, points, sits, draws on her own layer, reads out your
  // PC's status in a window of her own and closes it, and, only if you once said yes to it, looks at
  // your screen. She closes no app, opens no file, clicks and types nothing.
  // `force`: from her menu, a 25 s preview, whatever's on screen and whether you move or not.
  async run({ force = false } = {}) {
    if (this.running) return;
    const { capri, fx, panel, host } = this;
    if (!fx || (!force && reducedMotion.matches)) return;
    this.running = true;
    this.stop = null;
    this.cool.clear();
    this._msgQueue = [];
    this._msgRunning = false;
    const started = performance.now();
    const limit = force ? PREVIEW_MS : MAX_MS;
    const t = this.t;
    let lines = 0;

    // you move, a video starts, the screen locks: she stops at the next breath
    const watch = setInterval(async () => {
      if (force || this.stop) return;
      const { idle, locked } = await host.idle().catch(() => ({ idle: 999, locked: false }));
      if (idle < 3) this.stop = 'back';
      else if (locked || this.busy() || this.chat.open) this.stop = 'stop';
    }, 1000);

    const nap = async (ms) => {
      const end = performance.now() + ms;
      while (!this.stop && performance.now() < end) await sleep(Math.min(200, end - performance.now()));
    };

    // A smooth nap: varies duration slightly around the target for organic feel
    const napSmooth = async (base, spread = 0.25) => {
      const jitter = base * spread * (Math.random() * 2 - 1);
      await nap(Math.max(300, base + jitter));
    };

    const guard = (p, ms) => Promise.race([Promise.resolve(p).catch(() => {}), sleep(ms)]);

    // Say something — queued so new messages wait for old ones to finish
    const say = (line, face = 'grin', hold = 3200) => {
      // use a slightly longer minimum hold so text is readable
      const safeHold = Math.max(2800, hold);
      this._queueSay(line, face, safeHold);
      lines += 1;
      if (this.tts.mode !== 'off' && lines % 3 === 1) this.tts.say(line);
    };

    const wins = () => (capri.windows?.wins || []).filter((w) => w && w.id !== 'taskbar');
    const head = () => capri.head?.() || { x: capri.pos?.x || 0, y: (capri.pos?.y || 0) - 40 };
    const view = () => capri.view || { w: innerWidth, h: innerHeight };
    const dir = () => capri.towardCenter?.() || 1;

    const spark = (n) => {
      const { w, h } = view();
      for (let i = 0; i < n; i++) {
        const at = { x: Math.random() * w, y: Math.random() * h * 0.8 };
        fx.crackle?.(at, { life: 500, radius: 80, count: 2 });
        fx.burst?.(at.x, at.y, { count: 10, power: 0.5, spread: 60 });
      }
    };

    // Spawn floating music notes from her head position, one at a time with organic timing
    const spawnNotes = async (count = 4) => {
      const h = head();
      for (let i = 0; i < count && !this.stop; i++) {
        const ox = (Math.random() - 0.5) * 60;
        const oy = -(20 + Math.random() * 30);
        fx.glyph?.(h.x + ox, h.y + oy, { char: pick(['♩', '♪', '♫', '♬', '𝅘𝅥𝅮']), life: 1800 + Math.random() * 800 });
        await sleep(smoothRand(220, 480));
      }
    };

    // She bumps into something — staggers and gets briefly dizzy
    const doBonk = async () => {
      if (capri.p) {
        capri.p.glitch = 0.4;
        capri.p.glitchSeed = Math.random() * 100;
      }
      const h = head();
      fx.ring?.(h.x, h.y, { size: 0.3, life: 400 });
      fx.burst?.(h.x, h.y, { count: 6, power: 0.3, spread: 50 });
      this.voice?.play?.('zap');
      say(pick(t.dizzy), 'alarm', 3000);
      await nap(600);
      if (capri.p) capri.p.glitch = 0;
      // wobble in place
      for (let i = 0; i < 3 && !this.stop; i++) {
        await capri.perform?.('alarm');
        await nap(300);
      }
    };

    // Open a small status-card window if there's nothing to sit on, then sit on that
    const openAndSit = async () => {
      const t2 = this.t;
      say(pick(t2.sitOpen || t2.sit), 'smug', 3200);
      // show a minimal status card as a "seat surface"
      const res = await host.showStatusCard({
        text: '⬩',
        data: {},
        view: 'system',
        _mischiefSeat: true,
      }).catch(() => null);
      await nap(900);
      // try to sit on whatever window appeared
      const freshWins = wins();
      const seat = freshWins.find((w) => w.id !== 'taskbar');
      if (seat) {
        await capri.sitOn({ win: seat, dx: Math.min(seat.w - 70, Math.max(60, seat.w * (0.3 + Math.random() * 0.4))) });
        await nap(smoothRand(3000, 5000));
      } else {
        // fallback: just rest at a random spot
        await capri.teleport?.(capri.spot('random'));
        await nap(2000);
      }
      // close the seat card after sitting
      if (res) await host.closeStatusCard?.().catch(() => {});
    };

    // [name, weight, cooldown ms, line key, max ms, what it does]
    const acts = [
      ['bolts', 3, 0, 'chaos', 6000, async () => {
        const h = head();
        this.voice?.play?.('zap');
        for (const w of wins().slice(0, 4)) {
          fx.bolt?.(h, { x: w.x + w.w * 0.5, y: w.y + w.h * 0.25 }, { life: 320, forks: 2, width: 2.2 });
          fx.scan?.(() => (capri.windows?.wins || []).find((x) => x.id === w.id) || null, { covers: () => capri.coversOf?.(w.id) || [] });
        }
        await napSmooth(1200);
      }],

      ['glyphs', 2, 0, 'chaos', 6000, async () => {
        const { w, h } = view();
        for (let i = 0; i < 28; i++) setTimeout(() => fx.glyph?.(Math.random() * w, Math.random() * h * 0.8), i * 55);
        await napSmooth(1800);
      }],

      ['crack', 2, 8000, 'chaos', 6000, async () => {
        this.extras?.glitchOnThrow?.({ how: 'screen', hard: 0.9 });
        await napSmooth(1500);
      }],

      ['sparks', 3, 0, 'chaos', 6000, async () => {
        spark(5);
        if (capri.p) {
          capri.p.glitch = 0.5;
          capri.p.glitchSeed = Math.random() * 100;
          setTimeout(() => { if (capri.p) capri.p.glitch = 0; }, 800);
        }
        this.voice?.play?.('zap');
        await napSmooth(1000);
      }],

      ['flash', 2, 0, 'chaos', 4000, async () => {
        const h = head();
        this.extras?.phaseFlash?.(h.x, h.y, 1.4);
        fx.ring?.(h.x, h.y, { size: 0.5 });
        await napSmooth(800);
      }],

      ['hops', 4, 0, 'chaos', 9000, async () => {
        const count = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count && !this.stop; i++) {
          await capri.perform?.('hop');
          await napSmooth(250, 0.4);
        }
      }],

      ['act', 2, 0, 'chaos', 9000, async () => {
        const name = pick(['curious', 'alarm', 'split']);
        await capri.perform?.(name, name === 'split' ? undefined : dir());
      }],

      ['teleport', 3, 0, 'chaos', 9000, async () => {
        await capri.teleport?.(capri.spot('random'));
      }],

      ['screen', 1.5, 20000, 'chaos', 15000, async () => {
        const s = this.screens?.();
        const others = s?.list?.filter((d) => d.id !== s.current) || [];
        if (others.length) await this.goToScreen(pick(others).id);
        else await capri.teleport?.(capri.spot('random'));
      }],

      ['point', 3, 4000, 'point', 12000, async () => {
        const w = wins()[Math.floor(Math.random() * wins().length)];
        if (!w || !capri.pointAt) return;
        const label = pick(POINT_LABELS);
        if (capri.canPoint?.(w)) await capri.pointAt(w, { label });
        else await capri.pointAt({ x: w.x + w.w * 0.35, y: w.y + Math.min(48, w.h * 0.12), w: Math.min(120, w.w * 0.3), h: 36, id: w.id }, { label });
        await napSmooth(2600);
        capri.stopPointing?.();
      }],

      // Sit on a window — and if no sittable window exists, open one first
      ['sit', 1.5, 25000, 'sit', 18000, async () => {
        const seats = wins().filter((w) => capri.canSit?.(w));
        if (!seats.length) {
          // no seat available: open a status card and sit on that
          await openAndSit();
          return;
        }
        const w = seats[Math.floor(Math.random() * seats.length)];
        await capri.sitOn({ win: w, dx: Math.min(w.w - 70, Math.max(60, w.w * (0.3 + Math.random() * 0.5))) });
        await napSmooth(3500, 0.3);
      }],

      ['possess', 1.5, 12000, 'chaos', 5000, async () => {
        this.extras?.possessCursor?.(2600);
        await napSmooth(2800);
      }],

      ['clone', 1, 40000, 'chaos', 8000, async () => {
        if (this.extras?.spawnClone?.('split')) await napSmooth(3500);
        this.extras?.clearClone?.();
      }],

      // Floating music notes — organic timing, plays from her head upward
      ['notes', 2, 12000, 'note', 8000, async () => {
        await spawnNotes(smoothRand(3, 7) | 0);
        await napSmooth(2000);
      }],

      // She bumps into an imaginary wall and gets briefly dizzy
      ['bonk', 1.5, 20000, null, 6000, async () => {
        await doBonk();
        await napSmooth(1800);
      }],

      // her hack demo: a fake login page of hers and a make-believe dictionary attack on it (hacksim.js: a prop, nothing real)
      ['hack', 1, 12 * 60000, null, 70000, async () => {
        if (!this.hack || this.hack.running) return;
        await this.hack.run({ auto: true, shouldStop: () => Boolean(this.stop) });
      }],

      // her own look at your PC (a window of hers, read only), then she closes it
      ['pc', 1.5, 8 * 60000, 'pc', 40000, async () => {
        const res = await host.pcStatus('all').catch(() => null);
        if (!res?.ok || !res.text) return;
        await host.showStatusCard({ text: res.text, data: res.data || {}, view: res.view || 'system' }).catch(() => {});
        say(pick(t.pc), 'laugh', 5000);
        await napSmooth(7000);
        await host.closeStatusCard?.().catch(() => {});
      }],

      // pull a news headline in her words, quietly, like she's just browsing
      ['news', 1.5, 15 * 60000, 'news', 30000, async () => {
        if (!this.host.chatSend) return; // news needs the chat bridge
        try {
          say(pick(t.news), 'look', 3000);
          await napSmooth(1200);
          // delegate to main.js's tellNews path via the capri:command channel if available
          const line = await this._fetchNewsLine();
          if (line && !this.stop) {
            // small pause so the two messages don't collide
            await nap(3200);
            say(line, 'look', Math.min(14000, 6000 + line.length * 55));
          }
        } catch { /* network or api hiccup: skip silently */ }
      }],

      // a look at your screen: only if you once said yes to that (her chat asks the first time)
      ['look', 1.5, 6 * 60000, null, 90000, async () => {
        if (!this.cfg.lookAsked || this.noLook) return;
        const snap = await host.lookSnap().catch(() => null);
        if (!snap?.ok) return;
        this.chat.look?.effect?.();
        const res = await host.lookSay({
          id: snap.id,
          persona: this.chat.lookPersona(),
          history: [],
          prompt: 'You are bored: the user is away from the PC and you are causing a little harmless chaos. In one or two short sentences, tease them about what you really see on their screen, in character. Never read out anything private. ' + this.chat.languageNote(),
        }).catch(() => null);
        if (res?.ok && res.text) say(String(res.text).replace(/\s+/g, ' ').trim().slice(0, 220), 'look', 9000);
        else if (res && ['novision', 'noai'].includes(res.code)) this.noLook = true;
      }],
    ];

    // Deck-shuffle picker: expands each action into `weight` tickets, shuffles the whole deck,
    // then deals one at a time. When the deck runs out it's reshuffled — so every action gets
    // a turn before anything repeats. Cooldowns and runtime constraints are checked at draw time;
    // a ticket that fails its check is skipped (put back at the end of the next deck) rather than
    // re-drawn, so a long-cooldown action never blocks the others.
    let deck = [];
    let deckLast = '';   // name of the last card dealt, never dealt back-to-back

    const buildDeck = () => {
      const now = performance.now();
      const multiScreen = this.screens?.()?.list?.length > 1;
      // expand by weight (rounded to nearest int, min 1), exclude hard-blocked actions
      const tickets = [];
      for (const act of acts) {
        const [name, weight] = act;
        if (name === 'screen' && !multiScreen) continue;
        const count = Math.max(1, Math.round(weight));
        for (let i = 0; i < count; i++) tickets.push(act);
      }
      // Fisher-Yates shuffle
      for (let i = tickets.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tickets[i], tickets[j]] = [tickets[j], tickets[i]];
      }
      return tickets;
    };

    const choose = () => {
      const now = performance.now();
      const multiScreen = this.screens?.()?.list?.length > 1;

      // keep trying cards from the deck; skip ones that are on cooldown or back-to-back
      for (let attempt = 0; attempt < deck.length; attempt++) {
        if (deck.length === 0) deck = buildDeck();
        const card = deck.shift();
        const [name] = card;
        if (name === 'screen' && !multiScreen) continue;
        if ((this.cool.get(name) || 0) > now) { deck.push(card); continue; } // push to back, try next
        if (name === deckLast) { deck.push(card); continue; }                // avoid back-to-back
        deckLast = name;
        if (deck.length === 0) deck = buildDeck();  // pre-build next deck so first card is ready
        return card;
      }
      // fallback: all cards are on cooldown — just pick any available act weighted normally
      const ok = acts.filter(([name]) =>
        (this.cool.get(name) || 0) <= now && !(name === 'screen' && !multiScreen));
      if (!ok.length) return acts[0];
      let r = Math.random() * ok.reduce((n, a) => n + a[1], 0);
      return ok.find((a) => (r -= a[1]) < 0) || ok[0];
    };

    deck = buildDeck(); // first deck ready before the loop starts

    try {
      capri.wake?.();
      if (capri.stance === 'peek') await capri.unpeek?.();
      await capri.perform?.('hop');
      say(pick(t.start), 'smug', 3500);
      await nap(2200);

      while (!this.stop && performance.now() - started < limit) {
        const [name, , cool, key, max, fn] = choose();
        if (cool) this.cool.set(name, performance.now() + cool);
        await guard(fn(), max);
        if (this.stop) break;

        // say a line for this action category — but respect the queue so it doesn't trample old text
        if (key && Math.random() < 0.65) {
          const line = pick(t[key] || t.chaos);
          const face = pick(['laugh', 'grin', 'smug', 'wide']);
          say(line, face, 3200);
        }

        // smooth pause between actions: shorter early in the session, a bit longer later
        const elapsed = (performance.now() - started) / limit;
        const baseNap = 900 + easeInOut(elapsed) * 1200;
        await nap(baseNap + Math.random() * 1600);
      }

      if (!this.stop) this.stop = 'tired'; // the time's up (or the preview)
    } finally {
      clearInterval(watch);
      capri.stopPointing?.();
      this.extras?.clearFxResidue?.();
      this.extras?.clearClone?.();
      host.closeStatusCard?.().catch?.(() => {});
      if (capri.p) capri.p.glitch = 0;
      this.running = false;
      // clear any queued messages that won't be shown now
      this._msgQueue = [];
      this._msgRunning = false;
    }

    // back to her corner, with a word of how it went
    try { await capri.teleport?.(capri.spot('post')); } catch { /* */ }
    if (this.stop === 'back') panel.say({ kind: 'info', face: 'smug', line: pick(t.back), hold: 3200 });
    else if (this.stop === 'tired') panel.say({ kind: 'info', face: 'aside', line: pick(force ? t.end : t.tired), hold: 4500 });
  }

  // Try to get a news headline via the same path main.js uses.
  // Returns a short string or null if it can't reach news.
  async _fetchNewsLine() {
    try {
      // main.js exposes tellNews indirectly via the 'capri:command' channel.
      // We piggyback on host.chatStatus / host.chatSend if news.js is wired up there,
      // otherwise return null gracefully so the 'news' action just skips the headline.
      const status = await this.host.chatStatus?.().catch(() => null);
      if (!status?.ok) return null;

      // Ask the chat AI for a brief news teaser in character (one sentence)
      const lang = this.brain?.lang || 'en';
      const prompt = lang === 'th'
        ? 'สรุปข่าวล่าสุดที่น่าสนใจหนึ่งชิ้นให้ฉันในแบบของ Capri: ตรงๆ เล่นๆ และไม่เกินสองประโยค ห้ามพูดว่า "ฉันเป็น AI"'
        : 'Give me one interesting recent headline in Capri\'s voice: direct, a little teasing, two sentences max. Don\'t say you\'re an AI.';

      const req = { role: 'user', content: prompt };
      const res = await this.host.chatSend?.({ messages: [req], max_tokens: 120 }).catch(() => null);
      if (!res?.ok || !res.text) return null;
      return String(res.text).replace(/\s+/g, ' ').trim().slice(0, 200);
    } catch {
      return null;
    }
  }
}