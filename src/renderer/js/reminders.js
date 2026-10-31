// Reminders she keeps for you. You ask in her chat, in any of her languages ("rappelle-moi dans
// 20 min de sortir le linge", "remind me at 6pm to call mom", "напомни через 15 минут выключить
// духовку"): parseReminder reads when and what straight off your message, so it works the same on
// the smallest model. They're kept in her settings and survive a restart; one that came due while
// she was off, she brings up when she's back.

const TRIGGER = /(rappelle[- ]?(?:moi|nous)|fais[- ]moi penser|pense à me (?:le )?(?:rappeler|dire)|n['’]oublie pas de me (?:le )?(?:rappeler|dire)|mets[- ]moi un rappel|remind me|set (?:a|an) (?:reminder|alarm)|recu[eé]rd(?:a|e)me|recordarme|av[ií]same|pon(?:me)? un recordatorio|me lembr[ae]|lembr[ae][- ]me|me avis[ae]|cri[ae] um lembrete|напомни(?:те)?(?: мне)?|поставь напоминание|เตือน(?:ฉัน|ผม|หนู|เรา|หน่อย)?|แจ้งเตือน|อย่าลืมเตือน|ตั้ง(?:การ)?แจ้งเตือน|เตือนให้(?:ฉัน)?|ตั้งเตือน|จับเวลา|ตั้งเวลา|นับถอยหลัง|ตั้งไทม์เมอร์|set (?:a )?timer|timer for|countdown|minuteur|temporizador|cron[oô]metro|таймер)/i;

// small numbers said in words (in 5 of her languages)
const WORDS = {
  un: 1, une: 1, a: 1, an: 1, one: 1, uno: 1, una: 1, um: 1, uma: 1, один: 1, одна: 1, одну: 1, หนึ่ง: 1, หนึง: 1,
  deux: 2, two: 2, dos: 2, dois: 2, duas: 2, два: 2, две: 2, สอง: 2,
  trois: 3, three: 3, tres: 3, três: 3, три: 3, สาม: 3,
  quatre: 4, four: 4, cuatro: 4, quatro: 4, четыре: 4, สี่: 4,
  cinq: 5, five: 5, cinco: 5, пять: 5, ห้า: 5,
  dix: 10, ten: 10, diez: 10, dez: 10, десять: 10, สิบ: 10,
  quinze: 15, fifteen: 15, quince: 15, пятнадцать: 15, สิบห้า: 15,
  vingt: 20, twenty: 20, veinte: 20, vinte: 20, двадцать: 20, ยี่สิบ: 20,
  trente: 30, thirty: 30, treinta: 30, trinta: 30, тридцать: 30, สามสิบ: 30,
  quarante: 40, forty: 40, cuarenta: 40, quarenta: 40, сорок: 40, สี่สิบ: 40,
  cinquante: 50, fifty: 50, cincuenta: 50, cinquenta: 50, пятьдесят: 50, ห้าสิบ: 50,
};
const NUM = `(\\d+(?:[.,]\\d+)?|${Object.keys(WORDS).sort((a, b) => b.length - a.length).join('|')})`;
const UNIT = '(secondes?|seconds?|secs?|segundos?|секунд[уы]?|сек|s|วินาที|นาที|minutes?|minutos?|mins?|mn|минут[уы]?|мин|m|heures?|hours?|hrs?|horas?|час(?:а|ов)?|ч|h|ชั่วโมง)';
const SOON = '(?:(?<![\\p{L}])(?:dans|in|en|em|daqui a|dentro de|через)|(?:ใน|อีก|ภายใน))';
// "dans 20 min", "in 1 hour and 30 minutes", "через 2 часа"
const IN = new RegExp(`${SOON}\\s+${NUM}\\s*${UNIT}(?![a-zA-Z\\u00C0-\\u024F\\u0400-\\u04FF])(?:\\s*(?:et|and|y|e|и)?\\s*${NUM}\\s*${UNIT}(?![a-zA-Z\\u00C0-\\u024F\\u0400-\\u04FF]))?`, 'iu');
// "จับเวลา 30 วินาที", "เมื่อครบ 10 นาที", "after 5 min", "timer for 2 minutes"
const AFTER = new RegExp(`(?:จับเวลา|ตั้งเวลา|ตั้งไทม์เมอร์|นับถอยหลัง|เมื่อครบ|ครบ|หลังจาก|หลัง|timer(?: for)?|countdown(?: of)?|after|minuteur(?: de)?|temporizador(?: de)?|таймер(?: на)?)\\s*${NUM}\\s*${UNIT}(?![a-zA-Z\\u00C0-\\u024F\\u0400-\\u04FF])`, 'iu');
// the words of a timer that aren't what to remind you of
const TIMER_WORDS = /จับเวลา|ตั้งเวลา|นับถอยหลัง|ตั้งไทม์เมอร์|(?:เมื่อ|พอ)?ครบเวลา|เมื่อครบ|ครบ|timer|countdown|minuteur|temporizador|таймер/giu;
// "dans 1h30"
const IN_HM = new RegExp(`${SOON}\\s+(\\d{1,2})\\s*h\\s*(\\d{1,2})(?!\\d)`, 'iu');
// "dans une demi-heure", "in half an hour", "через полчаса", "dans un quart d'heure"
const IN_HALF = new RegExp(`${SOON}\\s*(?:une |a |an |um |uma )?(demi[- ]heure|half an hour|media hora|meia hora|полчаса|quart d['’]heure|quarter of an hour|cuarto de hora|четверть часа|ครึ่งชั่วโมง|ครึ่งชม|เสี้ยวชั่วโมง)`, 'iu');
// "через час", "через минуту"
const IN_ONE = /через\s+(час|минуту)(?![\p{L}])/iu;
// "à 18h30", "at 6:30 pm", "a las 18:00", "às 18h", "в 18:00", or a bare "18h30" / "18:30" / "6pm"
const AT = /(?:(?:à|a|at|a las|a la|às|as|в|к|ตอน|เวลา|ตี)\s+)?(?<![\d:])(\d{1,2})(?:\s*(?:h|:|\.|นาฬิกา|น\.?)\s*(\d{2})?|\s*(?:heures?|hours?|horas?|час(?:а|ов)?|โมง|นาฬิกา)\b)?\s*(a\.?m\.?|p\.?m\.?|เช้า|บ่าย|เย็น|ค่ำ)?(?![\d\p{L}])/iu;
// words, start and end, in any alphabet (\b only knows ASCII: not "amanhã", not Cyrillic)
const word = (list, flags = 'iu') => new RegExp(`(?<![\\p{L}])(?:${list})(?![\\p{L}])`, flags);
const NOON = word('(?:(?:à|at|a|al|ao|в|ตอน)\\s+)?(?:midi|noon|mediod[ií]a|meio-dia|полдень|เที่ยง)');
const MIDNIGHT = word('(?:(?:à|at|a|al|в|ตอน)\\s+)?(?:minuit|midnight|medianoche|meia-noite|полночь|เที่ยงคืน)');
const TOMORROW = word('demain|tomorrow|amanh[ãa]|завтра|(?<!de la\\s)mañana|พรุ่งนี้');
const PM = word("ce soir|du soir|de l['’]après-midi|cet après-midi|tonight|this evening|in the evening|this afternoon|in the afternoon|de la tarde|de la noche|esta tarde|esta noche|da tarde|da noite|hoje à noite|вечера|дня|เย็น|ค่ำ|บ่าย|ตอนเย็น|ตอนค่ำ");
const AM = word('du matin|ce matin|in the morning|de la mañana|da manhã|de manhã|утра|เช้า|ตอนเช้า');
const POLITE = word("s['’]il te pla[iî]t|stp|svp|please|pls|plz|por favor|пожалуйста|หน่อย|ด้วย|นะ|ค่ะ", 'giu');
// what comes before what to remind you of, once the rest is gone
const LEAD = new RegExp("^(?:[\\s,:;.!?-]|d['’]|qu['’]|(?:capri|de que|de|que|pour|à|to|that|about|of|for|para|pra|me|о|об|что|чтобы|мне)(?![\\p{L}])|(?:ให้|ว่า|เรื่อง|ถึง)\\s*)+", 'iu');

const MAX_MS = 7 * 24 * 3600 * 1000;

// Repeating: "ทุก 1 ชั่วโมง", "ทุกชั่วโมง", "every 2 hours", "toutes les 30 min", "cada hora", "каждые 2 часа".
// Never more often than every 5 minutes, never rarer than every 7 days.
const MIN_EVERY = 5 * 60 * 1000;
const DAY_UNIT = /^(?:วัน|days?|jours?|d[ií]as?|дн(?:я|ей)|день)$/i;
const EVERY = new RegExp(
  `(?:ทุกๆ|ทุก|every|each|chaque|toutes les|tous les|toutes|tous|a cada|cada|todos los|todas las|каждые|каждый|каждую|раз в)\\s*${NUM}?\\s*(${UNIT.slice(1, -1)}|วัน|days?|jours?|d[ií]as?|дн(?:я|ей)|день)(?![a-zA-Z\\u00C0-\\u024F\\u0400-\\u04FF])`,
  'iu',
);

function number(word) {
  if (!word) return NaN;
  const n = Number(word.replace(',', '.'));
  return Number.isFinite(n) ? n : WORDS[word.toLowerCase()] ?? NaN;
}

function unitMs(unit) {
  const u = unit.toLowerCase();
  if (/^(s|sec|secs|seconde|secondes|second|seconds|segundo|segundos|секунд|секунду|секунды|сек|วินาที)$/.test(u)) return 1000;
  if (/^(h|hr|hrs|heure|heures|hour|hours|hora|horas|час|часа|часов|ч|ชั่วโมง)$/.test(u)) return 3600 * 1000;
  return 60 * 1000;
}

// How often, read off text: { ms, span } or null.
export function parseEvery(text) {
  const m = EVERY.exec(text);
  if (!m) return null;
  const n = m[1] ? number(m[1]) : 1;
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = DAY_UNIT.test(m[2]) ? 24 * 3600 * 1000 : unitMs(m[2]);
  return { ms: Math.max(MIN_EVERY, Math.min(n * unit, MAX_MS)), span: m[0] };
}

// "every hour", as she says it: everyText(3600000, 'en') → "every hour".
const EVERY_WORDS = {
  th: { d: ['วัน', 'วัน'], h: ['ชั่วโมง', 'ชั่วโมง'], m: ['นาที', 'นาที'], one: (u) => `ทุก${u}`, many: (n, u) => `ทุก ${n} ${u}` },
  en: { d: ['day', 'days'], h: ['hour', 'hours'], m: ['minute', 'minutes'], one: (u) => `every ${u}`, many: (n, u) => `every ${n} ${u}` },
  fr: { d: ['jour', 'jours'], h: ['heure', 'heures'], m: ['minute', 'minutes'], one: (u) => `chaque ${u}`, many: (n, u) => `toutes les ${n} ${u}` },
  es: { d: ['día', 'días'], h: ['hora', 'horas'], m: ['minuto', 'minutos'], one: (u) => `cada ${u}`, many: (n, u) => `cada ${n} ${u}` },
  pt: { d: ['dia', 'dias'], h: ['hora', 'horas'], m: ['minuto', 'minutos'], one: (u) => `a cada ${u}`, many: (n, u) => `a cada ${n} ${u}` },
  ru: { d: ['день', 'дн.'], h: ['час', 'ч.'], m: ['минуту', 'мин.'], one: (u) => `каждый ${u}`.replace('каждый минуту', 'каждую минуту'), many: (n, u) => `каждые ${n} ${u}` },
};
export function everyText(ms, lang = 'en') {
  const w = EVERY_WORDS[lang] || EVERY_WORDS.en;
  const [key, size] = ms % 86400000 === 0 ? ['d', 86400000] : ms % 3600000 === 0 ? ['h', 3600000] : ['m', 60000];
  const n = Math.round(ms / size);
  return n === 1 ? w.one(w[key][0]) : w.many(n, w[key][1]);
}

// When, read off text: { at (ms), spans: the parts of the text that said it }, or null.
export function parseWhen(text, now = Date.now()) {
  let m = IN_HM.exec(text);
  if (m) return { at: now + (Number(m[1]) * 60 + Number(m[2])) * 60000, spans: [m] };
  m = IN.exec(text);
  if (m) {
    let ms = number(m[1]) * unitMs(m[2]);
    if (m[3] && m[4]) ms += number(m[3]) * unitMs(m[4]);
    if (Number.isFinite(ms) && ms > 0) return { at: now + ms, spans: [m] };
  }
  m = AFTER.exec(text);
  if (m) {
    const ms = number(m[1]) * unitMs(m[2]);
    if (Number.isFinite(ms) && ms > 0) return { at: now + ms, spans: [m] };
  }
  m = IN_HALF.exec(text);
  if (m) return { at: now + (/quart|quarter|cuarto|четверть/i.test(m[1]) ? 15 : 30) * 60000, spans: [m] };
  m = IN_ONE.exec(text);
  if (m) return { at: now + (/час/i.test(m[1]) ? 60 : 1) * 60000, spans: [m] };

  // a time of day, today or tomorrow
  const spans = [];
  let h = null, min = 0;
  const noon = NOON.exec(text) || MIDNIGHT.exec(text);
  if (noon) {
    h = NOON.test(noon[0]) ? 12 : 0;
    spans.push(noon);
  } else {
    m = AT.exec(text);
    if (m && Number(m[1]) <= 23 && (m[2] === undefined || Number(m[2]) <= 59)) {
      // a bare number only counts as a time with a "h", ":", am/pm or "at" in front
      const said = /[h:.]|heure|hour|hora|час|am|pm|a\.m|p\.m/i.test(m[0].slice(String(m[1]).length)) || /^\s*(à|a|at|a las|a la|às|as|в|к)\s/i.test(m[0]);
      if (said) {
        h = Number(m[1]);
        min = Number(m[2] || 0);
        const ampm = (m[3] || '').toLowerCase().replace(/\./g, '');
        if (ampm === 'pm' && h < 12) h += 12;
        if (ampm === 'am' && h === 12) h = 0;
        if (!ampm && h < 12) {
          if (PM.test(text)) h += 12;
          else if (!AM.test(text) && !TOMORROW.test(text) && h > 0) {
            // "at 6", said in the afternoon: the next 6 o'clock to come
            const at6 = new Date(now);
            at6.setHours(h, min, 0, 0);
            if (at6.getTime() <= now && at6.getTime() + 12 * 3600000 > now) h += 12;
          }
        }
        spans.push(m);
      }
    }
  }
  if (h === null) return null;
  const d = new Date(now);
  d.setHours(h, min, 0, 0);
  const tomorrow = TOMORROW.exec(text);
  if (tomorrow) {
    d.setDate(d.getDate() + 1);
    spans.push(tomorrow);
  } else if (d.getTime() <= now) {
    d.setDate(d.getDate() + 1); // already past today: tomorrow
  }
  return { at: d.getTime(), spans };
}

// A reminder asked for in text: { at (ms, or null if it doesn't say when), text: what to remind
// you of ('' if nothing) }, or null if it isn't asking for one.
export function parseReminder(text, now = Date.now()) {
  const trigger = TRIGGER.exec(text);
  if (!trigger) return null;
  // "every 2 hours" out first: its "2 hours" would read as a time of day
  const every = parseEvery(text);
  const src = every ? text.replace(every.span, ' ') : text;
  const when = parseWhen(src, now);
  let what = src;
  for (const m of when?.spans || []) what = what.replace(m[0], ' '); // the time first: a timer's words hold it
  what = what.replace(new RegExp(TRIGGER.source, 'giu'), ' ');
  what = what.replace(/(?<![\p{L}\p{M}])set\s+(?:a|an)(?![\p{L}\p{M}])/giu, ' ').replace(TIMER_WORDS, ' ').replace(/(?<![\p{L}\p{M}])\d+\s*(?:วินาที|นาที|ชั่วโมง)\s*(?:แล้ว)?/gu, ' ').replace(/แล้ว(?:ก็)?\s*$/, ' ').replace(PM, ' ').replace(AM, ' ').replace(TOMORROW, ' ').replace(POLITE, ' ');
  what = what.replace(/\s+/g, ' ').replace(LEAD, '').replace(/[\s,;:.!?]+$/, '').trim().slice(0, 140);
  let at = when && when.at - now >= 5000 && when.at - now <= MAX_MS ? when.at : null;
  if (every && !at) at = now + every.ms; // no start said: the first one is one period from now
  return { at, text: what, ...(every && { every: every.ms }) };
}

// When a reminder is for, as she says it: the time, with the day if it isn't today.
export function clock(at, lang = 'en') {
  const d = new Date(at);
  const sameDay = d.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(lang, sameDay ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}

// The ones she keeps: [{ id, at, text, made }], saved in her settings (main.js shows them in her
// menu, where you can cancel one). onDue(reminder) when one comes due, one at a time.
export class Reminders {
  constructor({ host, list = [] }) {
    this.host = host;
    this.list = Array.isArray(list) ? list : [];
    this.onDue = null;
    this.firing = new Set(); // ids being shown right now
    setInterval(() => this.check(), 5000);
  }

  // the list as saved (after one was cancelled from her menu)
  sync(list) {
    if (Array.isArray(list)) this.list = list;
  }

  get upcoming() {
    return [...this.list].sort((a, b) => a.at - b.at);
  }

  // `every` (ms): a repeating one, which comes back by itself once it's been dealt with (complete)
  add(at, text, every = 0) {
    const r = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at, text, made: Date.now(), ...(every > 0 && { every }) };
    this.list = [...this.list, r];
    this.save();
    return r;
  }

  // Dealt with (done, or seen): a one-off goes, a repeating one is set for its next turn on its own
  // schedule (skipping the ones missed while she was off). Cancelling is still remove().
  complete(id) {
    const r = this.list.find((x) => x.id === id);
    if (!r?.every) return this.remove(id);
    this.firing.delete(id);
    const next = r.at + (Math.floor((Date.now() - r.at) / r.every) + 1) * r.every;
    this.list = this.list.map((x) => (x.id === id ? { ...x, at: next } : x));
    this.save();
    return undefined;
  }

  remove(id) {
    this.firing.delete(id);
    this.list = this.list.filter((r) => r.id !== id);
    this.save();
  }

  snooze(id, ms) {
    this.firing.delete(id);
    this.list = this.list.map((r) => (r.id === id ? { ...r, at: Date.now() + ms } : r));
    this.save();
  }

  save() {
    this.host.setConfig({ reminders: this.list });
  }

  check() {
    if (this.firing.size || !this.onDue) return;
    const due = this.upcoming.find((r) => r.at <= Date.now());
    if (!due) return;
    this.firing.add(due.id);
    this.onDue(due);
  }
}