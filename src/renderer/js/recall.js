// Memory for her chat: understanding "what did I ask / what did we talk about" in any wording, and
// answering it from the REAL history, never from the model.
//
// Why: a 7B model asked "what did I ask you?" invents an answer, or confuses the few-shot examples
// (chicken, protein...) with the real conversation. So the questions about the conversation itself are
// answered here, word for word from what was really said (retrieval), and the model is only used for
// the vaguer ones, with a verbatim transcript beside the question (grounded generation).

const SELF = '(?:ผม|ฉัน|หนู|เรา|เค้า|ข้า|ดิฉัน|กระผม)';
const YOU = '(?:คุณ|เธอ|แก|เจ้า|capri|แคปริ|แคปรี่)';
const SAY_ME = '(?:ถาม|พูด|บอก|พิมพ์|ส่ง|เขียน|ทัก)';
const SAY_HER = '(?:ตอบ|พูด|บอก|ส่ง)';
const WHAT = '(?:อะไร|ไงนะ|ว่าไง|ยังไง|เรื่องอะไร)';

// a time marker: "just now", "before", "last"...
const PAST = /เมื่อ(?:กี้|กี|ตะกี้|สักครู่|ครู่|เดี๋ยว)|ตะกี้|ก่อนหน้า|ที่แล้ว|ล่าสุด|เดี๋ยวนี้|a moment ago|earlier|just now|previous|before that|last (?:message|question|thing)/i;
// what may follow the question without changing it ("...ว่าอะไร นะ", "...อะไร ไป", "จำได้ไหม")
const TAIL = /^(?:ไป|ไว้|นะ|หรอ|เหรอ|ครับ|ค่ะ|คะ|จ๊ะ|จ้ะ|เมื่อกี้|ตะกี้|ก่อนหน้า(?:นี้)?|ล่าสุด|ที่แล้ว|เมื่อสักครู่|เมื่อครู่|ใช่ไหม|จำได้(?:ไหม|หรือเปล่า|มั้ย)?|หรือเปล่า|มั้ย|ไหม|ล่ะ|เนี่ย|ผม|ฉัน|หนู|เรา|555+|[\s?!.ๆ๛…~])*$/u;

const lastUserRe = new RegExp(`${SELF}\\s*(?:เพิ่ง)?(?:ได้)?\\s*${SAY_ME}\\s*(?:${YOU})?\\s*(?:ไป)?\\s*(?:ว่า)?\\s*(?:ไป)?\\s*${WHAT}`, 'iu');
const lastHerRe = new RegExp(`${YOU}\\s*(?:เพิ่ง)?(?:ได้)?\\s*${SAY_HER}\\s*(?:${SELF})?\\s*(?:ไป)?\\s*(?:ว่า)?\\s*(?:ไป)?\\s*${WHAT}`, 'iu');
const lastUserEn = /what (?:did|was)(?: the (?:thing|last thing))? i (?:just |last )?(?:ask|say|said|asked|type|typed|write|wrote)|what i (?:just )?(?:asked|said|typed)|my (?:last|previous) (?:message|question)/i;
const lastHerEn = /what (?:did|was)(?: the (?:thing|last thing))? you (?:just |last )?(?:say|said|answer|reply|replied)|what you (?:just )?(?:said|answered)|your (?:last|previous) (?:message|answer|reply)/i;
const yourMsg = /(?:ของ|ที่)\s*(?:คุณ|เธอ|แก|capri)|(?:คุณ|เธอ|แก)\s*(?:เพิ่ง)?(?:ตอบ|พูด|บอก|ส่ง)/i;
const myMsg = /(?:คำถาม|ข้อความ|ประโยค|ที่(?:พิมพ์|ถาม|พูด))\s*(?:ล่าสุด|ก่อนหน้า(?:นี้)?|ที่แล้ว|เมื่อกี้|ตะกี้|เมื่อสักครู่|ของ\s*(?:ผม|ฉัน|หนู))/i;

const FIRST = /แรก(?:สุด)?|เริ่มแรก|ตอนเริ่ม(?:ต้น)?|ตอนต้น|\bfirst\b/i;
const FIRST_VERB = /ถาม|พูด|บอก|พิมพ์|คุย|ส่ง|คำถาม|ข้อความ|ประโยค|asked|said|message|question|talk/i;
const FIRST_WHAT = /อะไร|ว่า|คือ|ไง|what|which/i;
const FIRST_WHO = new RegExp(`${SELF}|เรา|คุย|\\bwe\\b|\\bmy\\b|\\bi\\b`, 'i');

const topicRes = [
  // "เราคุยอะไรกันไปแล้วบ้าง", "คุยเรื่องอะไรกันมา": needs "we" + a time marker, so "what can we talk about" is left alone
  { all: [/(?:คุย|พูดคุย|สนทนา|แชท)/, /อะไร|เรื่องไหน|ไรบ้าง|บ้าง/, /เรา|กัน|พวกเรา/, /ไป|มา|ที่ผ่านมา|ก่อนหน้า|ทั้งหมด|แล้ว|เมื่อกี้|ตะกี้|ตอนนี้|ล่าสุด|อยู่|(?<!ได้)บ้าง/] },
  { one: [/สรุป.{0,8}(?:คุย|แชท|สนทนา|ที่เรา|บทสนทนา|ทั้งหมด)/, /ย้อน(?:ดู)?(?:บทสนทนา|แชท|ที่คุย)/, /ประวัติ(?:การ)?(?:คุย|แชท|สนทนา)/,
    /\brecap\b/i, /what (?:have|did) we (?:talk|discuss|chat)/i, /what (?:were )?we (?:talking|discussing)/i, /summar(?:y|ise|ize)(?: of)? (?:our|the) (?:chat|conversation)/i] },
  // "ผมถามอะไรไปบ้าง": the list of what the user asked
  { one: [new RegExp(`${SELF}?\\s*${SAY_ME}\\s*(?:${YOU})?\\s*${WHAT}\\s*(?:ไป|มา)(?:แล้ว)?\\s*บ้าง`, 'u'), /what (?:have|did) i (?:ask|say)(?:ed)? so far/i] },
];
const generalRe = /เมื่อกี้|เมื่อเดี๋ยว|เมื่อตะกี้|เมื่อสักครู่|เมื่อครู่|ตะกี้|ที่ถามไป|ที่พูดไป|ที่คุยกัน|จำได้(?:ไหม|มั้ย|หรือเปล่า)|จำ.{0,6}ได้(?:ไหม|มั้ย)|ลืมแล้ว|what did i (?:ask|say)|remember (?:what|when)|earlier|just (?:now )?(?:asked|said)|tout à l['’]heure|hace un momento|há pouco|только что/i;

const tailOk = (text, m) => TAIL.test(text.slice(m.index + m[0].length)) || PAST.test(text);

// What the message is asking about the conversation, or null when it isn't about it.
//   lastUser | lastHer | firstUser | topics | general
export function recallIntent(raw) {
  const text = String(raw || '').normalize('NFC').replace(/[\u200b-\u200d\ufeff]/g, '').trim();
  if (!text || text.length > 160) return null; // a long message is a statement, not "what did I ask"
  if (FIRST.test(text) && FIRST_VERB.test(text) && FIRST_WHAT.test(text) && FIRST_WHO.test(text)) return { kind: 'firstUser' };
  for (const rule of topicRes) {
    if (rule.all && rule.all.every((re) => re.test(text))) return { kind: 'topics' };
    if (rule.one && rule.one.some((re) => re.test(text))) return { kind: 'topics' };
  }
  const her = lastHerRe.exec(text);
  if (her && tailOk(text, her)) return { kind: 'lastHer' };
  if (lastHerEn.test(text)) return { kind: 'lastHer' };
  if (myMsg.test(text) || (PAST.test(text) && /(?:คำถาม|ข้อความ|ประโยค)/.test(text))) return { kind: yourMsg.test(text) ? 'lastHer' : 'lastUser' };
  const me = lastUserRe.exec(text);
  if (me && tailOk(text, me)) return { kind: 'lastUser' };
  if (lastUserEn.test(text)) return { kind: 'lastUser' };
  // "what did the reminder say?", "เมื่อเดี๋ยวเตือนอะไรนะ": about the conversation, not a new reminder
  if (/(?:เมื่อ(?:กี้|ตะกี้|เดี๋ยว|สักครู่|ครู่)|ก่อนหน้า|ที่แล้ว).{0,8}(?:แจ้ง)?เตือน|(?:แจ้ง)?เตือน(?:ว่า)?อะไร(?:ไว้|ไป|นะ|บ้าง)?\s*[?？]*$/u.test(text)) return { kind: 'general', reminder: true };
  if (generalRe.test(text)) return { kind: 'general' };
  return null;
}

const cut = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n).trimEnd()}…` : t;
};

// The real exchanges of the conversation, [{ q, a }], without the questions about the conversation
// itself (and her answers to them): asking "what did I ask" twice must not make her answer with that.
export function pairs(history) {
  const out = [];
  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    if (m?.role !== 'user' || typeof m.content !== 'string') continue;
    if (recallIntent(m.content)) continue;
    const next = history[i + 1];
    out.push({ q: m.content, a: next?.role === 'assistant' && typeof next.content === 'string' ? next.content : '' });
  }
  return out;
}

const WORDS = {
  th: {
    lastUser: (name, q) => `เมื่อกี้${name}ถามฉันว่า “${q}” ค่ะ`,
    lastHer: (_n, a) => `เมื่อกี้ฉันตอบไปว่า “${a}” ค่ะ`,
    first: (name, q, partial) => `${partial ? 'ข้อความแรกที่ฉันยังจำได้ ' : 'ข้อความแรกเลย '}${name}พิมพ์ว่า “${q}” ค่ะ`,
    topics: 'เท่าที่จำได้ เราคุยกันเรื่องพวกนี้ค่ะ:',
    more: (n) => `(ก่อนหน้านั้นอีก ${n} ข้อความ)`,
    older: (s) => `ก่อนหน้านั้น (สรุปคร่าว ๆ): ${s}`,
    none: 'ยังไม่มีอะไรให้ย้อนดูเลยค่ะ เราเพิ่งเริ่มคุยกัน',
    noneHer: 'ฉันยังไม่ได้ตอบอะไรเลยค่ะ เราเพิ่งเริ่มคุยกัน',
  },
  en: {
    lastUser: (_n, q) => `A moment ago you asked me: “${q}”.`,
    lastHer: (_n, a) => `I just told you: “${a}”.`,
    first: (_n, q, partial) => `${partial ? 'The first message I still remember: ' : 'The very first thing you said: '}“${q}”.`,
    topics: 'As far as I remember, we talked about:',
    more: (n) => `(and ${n} earlier messages)`,
    older: (s) => `Before that (rough summary): ${s}`,
    none: 'Nothing to look back on yet, we just started talking.',
    noneHer: 'I haven\'t answered anything yet, we just started talking.',
  },
};

// Her answer ({ line, face }) taken word for word from the history (without the message being asked,
// which must not be in `history`), or null when the model should answer ('general').
export function answerRecall(intent, history, { summary = '', lang = 'th', name = '', partial = false } = {}) {
  if (!intent || intent.kind === 'general') return null;
  const w = WORDS[lang] || WORDS.en;
  const who = name || (lang === 'th' ? 'นาย' : 'you');
  const list = pairs(history);
  const face = 'smug';
  if (intent.kind === 'lastUser') {
    if (!list.length) return { line: summary ? `${w.none} ${w.older(cut(summary, 200))}` : w.none, face: 'aside' };
    return { line: w.lastUser(who, cut(list.at(-1).q, 160)), face };
  }
  if (intent.kind === 'lastHer') {
    const last = [...list].reverse().find((p) => p.a);
    if (!last) return { line: w.noneHer, face: 'aside' };
    return { line: w.lastHer(who, cut(last.a, 160)), face };
  }
  if (intent.kind === 'firstUser') {
    if (!list.length) return { line: w.none, face: 'aside' };
    return { line: w.first(who, cut(list[0].q, 160), partial || Boolean(summary)), face };
  }
  // topics: what was said, most recent last
  if (!list.length) return { line: summary ? w.older(cut(summary, 300)) : w.none, face: 'aside' };
  const shown = list.slice(-5);
  const lines = [w.topics, ...shown.map((p, i) => `${i + 1}. ${cut(p.q, 50)}`)];
  if (list.length > shown.length) lines.push(w.more(list.length - shown.length));
  if (summary) lines.push(w.older(cut(summary, 160)));
  return { line: lines.join('\n'), face };
}

// For the vague ones ('general'): the conversation as it really went, numbered, to put beside the question
// so the model answers from it (and says it doesn't remember when it isn't there).
export function transcriptNote(history, summary = '', max = 16) {
  const recent = history.slice(0, -1).slice(-max).filter((m) => typeof m?.content === 'string');
  if (!recent.length && !summary) return '';
  const said = recent.map((m, i) => `${i + 1}. ${m.role === 'user' ? 'USER' : 'YOU'}: "${cut(m.content, 160)}"`).join('\n');
  return [
    'The user is asking about this conversation. Here is what REALLY was said, oldest first (the examples above your conversation are not part of it):',
    said,
    summary ? `Rough summary of earlier messages: ${cut(summary, 400)}` : '',
    'Answer only from this. If it is not here, say you don\'t remember: never invent.',
  ].filter(Boolean).join('\n');
}

// The true facts a recall question is about (verbatim, trimmed), for the model to put in her own words.
export function recallFacts(intent, history) {
  const list = pairs(history);
  if (!intent || intent.kind === 'general') return [];
  if (intent.kind === 'lastUser') return list.length ? [cut(list.at(-1).q, 160)] : [];
  if (intent.kind === 'lastHer') { const l = [...list].reverse().find((p) => p.a); return l ? [cut(l.a, 160)] : []; }
  if (intent.kind === 'firstUser') return list.length ? [cut(list[0].q, 160)] : [];
  return list.slice(-5).map((p) => cut(p.q, 60)); // topics
}

// The note that goes beside the question: the model answers in character, from these facts only.
export function factsNote(intent, facts) {
  const quoted = facts.map((f, i) => `${i + 1}. “${f}”`).join('\n');
  const what = { lastUser: 'what the user asked just before this message', lastHer: 'what you (Capri) said just before this message',
    firstUser: 'the first thing the user said in this chat', topics: 'the latest things the user said in this chat, oldest first' }[intent.kind];
  return `TRUE FACTS, ${what} (verbatim, copied from the real log):\n${quoted}\nAnswer in your own voice as Capri, in 1-2 short sentences, and quote ${facts.length > 1 ? 'each of these, in order,' : 'this'} exactly between “ ”. Never change, add or invent anything about the conversation.`;
}

// Did the answer really carry the facts (not a made-up story)? Compared loosely: spaces, punctuation and case ignored.
export function verifyRecall(answer, facts) {
  if (!facts.length) return false;
  const norm = (s) => String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  const a = norm(answer);
  const hit = facts.filter((f) => { const k = norm(f).slice(0, facts.length > 1 ? 5 : 8); return k && a.includes(k); }).length;
  return hit >= Math.ceil(facts.length / 2) && (facts.length > 1 || hit === 1);
}