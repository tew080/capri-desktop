// Her voice, out loud (her menu › Her voice). Two ways, both off until you pick one:
//  - "babble": cartoon gibberish made of squeaky blips, one per letter, rising at a question and
//    jumping at "!" (like Animal Crossing). Made here with Web Audio: works on every PC, in every language.
//  - "speech": Windows' own voice reading her answer, pitched up like a chipmunk. Needs a voice for
//    the language (Thai: Windows Settings › Time & language › Speech). Without one she babbles instead.
// What she says out loud is what shows in her chat bubble when an answer is done (app.js hooks it).

const PENTA = [0, 2, 4, 7, 9]; // a happy scale, so the gibberish sounds like a tune
const LANG_TAG = { th: 'th-TH', en: 'en-US', fr: 'fr-FR', es: 'es-ES', pt: 'pt-BR', ru: 'ru-RU' };
const MAX_CHARS = 110;

export const SAMPLE = {
  th: 'ฮัลโหล~ ฉันพูดได้แล้วนะ',
  en: 'Hello! I can talk now.',
  fr: 'Coucou ! Je parle maintenant.',
  es: '¡Hola! Ya puedo hablar.',
  pt: 'Oi! Agora eu falo.',
  ru: 'Привет! Теперь я говорю.',
};
const NO_VOICE = {
  th: 'เครื่องนี้ไม่มีเสียงพูดภาษาไทย ฉันเลยจ๊อกแจ๊กแบบการ์ตูนแทนนะ ถ้าอยากได้เสียงจริง ลงเสียงไทยใน Settings › Time & language › Speech',
  en: 'This PC has no voice for my language, so I babble like a cartoon instead. For a real voice, add one in Settings › Time & language › Speech.',
  fr: 'Ce PC n’a pas de voix pour ma langue : je baragouine comme un dessin animé. Pour une vraie voix : Paramètres › Heure et langue › Voix.',
  es: 'Este PC no tiene voz para mi idioma: balbuceo como un dibujo animado. Para una voz real: Configuración › Hora e idioma › Voz.',
  pt: 'Este PC não tem voz para o meu idioma: balbucio feito desenho animado. Para voz real: Configurações › Hora e idioma › Fala.',
  ru: 'На этом ПК нет голоса для моего языка, так что я лепечу по-мультяшному. Настоящий голос: Параметры › Время и язык › Голос.',
};

// what's fit to say out loud: no links, emoji, markup
function clean(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .replace(/[*_`#~>[\]{}|\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export class Tts {
  // lang: () => her current language; capri: for her mouth to move (capri.pulse)
  constructor({ capri, lang = () => 'en' }) {
    this.capri = capri;
    this.lang = lang;
    this.mode = 'off'; // 'off' | 'babble' | 'speech'
    this.muted = false;
    this.onNotice = null; // (line) => void: said once if there's no voice for her language
    this.noticed = false;
    this.last = '';       // the last thing said, so a line added under it isn't read twice
    this.timers = [];
    this.ctx = null;
    this.out = null;
    if ('speechSynthesis' in window) speechSynthesis.getVoices(); // starts loading the voices
  }

  setMode(mode) {
    this.mode = ['babble', 'speech'].includes(mode) ? mode : 'off';
    if (this.mode === 'off') this.stop();
  }

  // Said out loud (nothing in "off", or muted). A text that starts with what she just said is
  // only its new end (her answer, then a line about what she did under it).
  say(text) {
    if (this.mode === 'off' || this.muted) return;
    let what = String(text || '');
    if (this.last && what.startsWith(this.last)) what = what.slice(this.last.length);
    this.last = String(text || '');
    what = clean(what);
    if (!what) return;
    this.stop();
    const lang = this.lang();
    if (this.mode === 'speech') {
      const voice = this.voiceFor(lang);
      if (voice) return this.speech(what, lang, voice);
      // no Windows voice for her language (Electron often can't see the ones added in Settings): an
      // online voice through main.js (capri://tts), and only if that fails too, the notice and babble
      return this.online(what, lang).then((ok) => {
        if (ok || this.token !== this.lastToken) return;
        if (!this.noticed) {
          this.noticed = true;
          this.onNotice?.(NO_VOICE[lang] || NO_VOICE.en);
        }
        this.babble(what);
      });
    }
    return this.babble(what);
  }

  stop() {
    this.token = (this.token || 0) + 1; // any online reading under way is dropped
    if (this.audio) {
      this.audio.onended = this.audio.onerror = null;
      this.audio.pause();
      this.audio = null;
    }
    for (const id of this.timers) clearTimeout(id);
    this.timers = [];
    try {
      this.out?.disconnect();
    } catch {
      // already gone
    }
    this.out = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  voiceFor(lang) {
    if (!('speechSynthesis' in window)) return null;
    const want = (LANG_TAG[lang] || 'en').slice(0, 2);
    return speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(want)) || null;
  }

  // An online voice (Google Translate's text-to-speech, fetched by main.js through capri://tts so
  // the page needs no network rights). Read in pieces of at most ~150 characters, one after the
  // other. Resolves true if it played, false if it couldn't (offline, blocked): she babbles then.
  async online(text, lang) {
    const token = (this.token = (this.token || 0) + 1);
    this.lastToken = token;
    const tl = lang === 'th' ? 'th' : (LANG_TAG[lang] || 'en').slice(0, 2);
    const pieces = [];
    for (const part of text.replace(/5{3,}/g, 'ฮ่าฮ่าฮ่า').split(/(?<=[.!?。！？…])\s+|\s{2,}/)) {
      let rest = part.trim();
      while (rest.length > 150) {
        const cut = rest.lastIndexOf(' ', 150);
        const at = cut > 40 ? cut : 150; // Thai has no spaces: cut hard
        pieces.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      if (rest) pieces.push(rest);
    }
    let played = false;
    for (const piece of pieces.slice(0, 6)) {
      if (this.token !== token) return true; // stopped or replaced: not an error
      const ok = await new Promise((resolve) => {
        const audio = new Audio(`capri://tts/?tl=${tl}&q=${encodeURIComponent(piece)}`);
        // a light lift for the cartoon feel; Thai is tonal, so only a little
        audio.preservesPitch = false;
        audio.playbackRate = lang === 'th' ? 1.1 : 1.25;
        this.audio = audio;
        let beat = null;
        const done = (result) => {
          clearInterval(beat);
          audio.onended = audio.onerror = null;
          resolve(result);
        };
        audio.onended = () => done(true);
        audio.onerror = () => done(false);
        audio.onplaying = () => {
          beat = setInterval(() => this.capri.pulse?.(), 220);
          this.timers.push(beat);
        };
        audio.play().catch(() => done(false));
      });
      if (this.token !== token) return true;
      if (!ok) return played; // part of it said is still said
      played = true;
    }
    return played;
  }

  // Windows' voice, up in the chipmunk range
  speech(text, lang, voice) {
    const u = new SpeechSynthesisUtterance(text.replace(/5{3,}/g, 'ฮ่าฮ่าฮ่า'));
    u.voice = voice;
    u.lang = voice.lang || LANG_TAG[lang];
    // Thai is a tonal language: a chipmunk pitch flattens the tones and the words become unintelligible,
    // so Thai gets only a slight lift and a normal pace. Other languages keep the chipmunk.
    const thai = lang === 'th';
    u.pitch = thai ? 1.25 : 2; // (some voices ignore it)
    u.rate = thai ? 1 : 1.15;
    u.onboundary = () => this.capri.pulse?.();
    speechSynthesis.speak(u);
  }

  // Cartoon gibberish: one squeaky blip per letter (Thai vowel and tone marks ride on the letter before)
  babble(text) {
    const ctx = this.ctx || (this.ctx = new AudioContext());
    if (ctx.state === 'suspended') ctx.resume();
    const out = ctx.createGain();
    out.gain.value = 0.16;
    out.connect(ctx.destination);
    this.out = out;

    const question = /[?？]\s*$/.test(text);
    const bang = /!\s*$/.test(text);
    const notes = [];
    let t = ctx.currentTime + 0.03;
    for (const ch of [...text].slice(0, MAX_CHARS)) {
      if (/\s/.test(ch)) { t += 0.06; continue; }
      if (/[,.;:!?，。！？…]/.test(ch)) { t += 0.16; continue; }
      if (/[ัิ-ฺ็-๎]/.test(ch)) continue; // marks: no note of their own
      const long = /[เแโใไาอ]/.test(ch);
      notes.push({ at: t, code: ch.codePointAt(0), len: long ? 0.1 : 0.065 });
      t += long ? 0.1 : 0.072;
    }
    notes.forEach((n, i) => {
      let semi = PENTA[n.code % 5] + 12 * ((n.code >> 3) % 2);
      if (question && i >= notes.length - 5) semi += (i - (notes.length - 5) + 1) * 2; // the voice goes up
      if (bang && i >= notes.length - 2) semi += 3;
      const f = 523.25 * 2 ** (semi / 12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, n.at);
      g.gain.linearRampToValueAtTime(0.9, n.at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, n.at + n.len);
      g.connect(out);
      for (const [type, mult, level] of [['square', 1, 0.22], ['triangle', 2, 0.55]]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = level;
        osc.type = type;
        osc.frequency.setValueAtTime(f * mult, n.at);
        osc.frequency.exponentialRampToValueAtTime(f * mult * 1.05, n.at + n.len); // a little chirp
        osc.connect(gain).connect(g);
        osc.start(n.at);
        osc.stop(n.at + n.len + 0.02);
      }
      if (i % 3 === 0) this.timers.push(setTimeout(() => this.capri.pulse?.(), Math.max(0, (n.at - ctx.currentTime) * 1000)));
    });
  }
}