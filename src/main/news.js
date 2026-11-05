'use strict';

// News she tells now and then: a headline from Google News' RSS (free, no key, updated all day, the
// big outlets), told by her AI in her voice and in the user's language. The headline can be in any
// language: the AI translates it. Only the news itself goes to the AI (headline, outlet, time and the
// headlines other outlets gave the same story), never anything of yours.
//
// How much she says is the user's choice (menu › News › Detail, config `newsDetail`). A good news
// summary has these parts, and each level adds some of them, always from what the feed really gave:
//   1. what happened (the core fact)           headline, brief, standard, detailed
//   2. who / where / when, if the data says    standard, detailed
//   3. who reported it (the outlet)            standard, detailed
//   4. how fresh it is                         standard, detailed
//   5. what other outlets say (agree / extra)  detailed
//   6. how sure it is (alleged, reportedly,
//      or only one outlet so far)              detailed
//   7. tone fitting the news (no jokes on sad news), and nothing invented: every level

const FEEDS = {
  th: 'https://news.google.com/rss?hl=th&gl=TH&ceid=TH:th',
  en: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
  fr: 'https://news.google.com/rss?hl=fr&gl=FR&ceid=FR:fr',
  es: 'https://news.google.com/rss?hl=es&gl=ES&ceid=ES:es',
  pt: 'https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419',
  ru: 'https://news.google.com/rss?hl=ru&gl=RU&ceid=RU:ru',
};
const WORLD = FEEDS.en;
const LANG_NAME = { th: 'Thai', en: 'English', fr: 'French', es: 'Spanish', pt: 'Brazilian Portuguese', ru: 'Russian' };
const seen = []; // headlines already told, newest last

// The levels, shortest first. `max`: characters a speech bubble may hold at that level.
const LEVELS = {
  headline: { max: 150, rule: 'ONE short sentence that says only what happened. No joke, no extra.' },
  brief: { max: 260, rule: 'One or two short sentences: what the news is first, then at most one tiny playful touch.' },
  standard: {
    max: 400,
    rule: 'Two or three short sentences: what happened, with who / where / when only if the data says so, then name the outlet that reported it (and how long ago, if given). One tiny playful touch at the end, optional.',
  },
  detailed: {
    max: 600,
    rule: 'Three or four short sentences: what happened (who / where / when only if the data says so); who reported it and how long ago; then what the other outlets add or confirm, using only their headlines. If no other outlet is listed, say that only this outlet is reporting it so far. Keep words like "reportedly" or "alleged" when the headline has them, never say it is confirmed. One tiny playful touch at the end, optional.',
  },
};
const DETAILS = Object.keys(LEVELS);
const DEFAULT_DETAIL = 'brief';
const level = (detail) => (LEVELS[detail] ? detail : DEFAULT_DETAIL);

const decode = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').trim();
const text = (html) => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// "about 3 hours ago", in English: her AI says it in the user's language
function ago(pubDate) {
  const ms = Date.now() - Date.parse(pubDate);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.round(ms / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} minutes ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `about ${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.round(h / 24);
  return `about ${d} day${d > 1 ? 's' : ''} ago`;
}

// Google News groups the same story from other outlets in the item's description: a list of
// "<a>headline</a> <font>Outlet</font>".
function related(description, title) {
  const out = [];
  for (const [, li] of decode(description || '').matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const head = text((/<a [^>]*>([\s\S]*?)<\/a>/.exec(li) || [])[1] || '');
    const outlet = text((/<font[^>]*>([\s\S]*?)<\/font>/.exec(li) || [])[1] || '');
    if (head && head !== title && !out.some((r) => r.title === head)) out.push({ title: head, outlet });
  }
  return out.slice(0, 3);
}

async function headlines(lang, source) {
  const url = source === 'world' ? WORLD : FEEDS[lang] || WORLD;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`news feed answered ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 20).map(([, item]) => {
    const tag = (name) => (new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(item) || [])[1] || '';
    const full = decode(tag('title'));
    const cut = full.lastIndexOf(' - '); // Google News: "Headline - Outlet"
    const title = cut > 0 ? full.slice(0, cut) : full;
    return {
      title,
      outlet: cut > 0 ? full.slice(cut + 3) : '',
      age: ago(decode(tag('pubDate'))),
      others: related(tag('description'), title),
    };
  }).filter((h) => h.title);
}

// What her AI is given about the story, as much as the level uses.
function facts(h, detail) {
  const lines = [`Headline: "${h.title}"`];
  if (detail === 'standard' || detail === 'detailed') {
    if (h.outlet) lines.push(`Source: ${h.outlet}`);
    if (h.age) lines.push(`Published: ${h.age}`);
  }
  if (detail === 'detailed') {
    lines.push(h.others.length
      ? `Other outlets on the same story:\n${h.others.map((o) => `- "${o.title}"${o.outlet ? ` (${o.outlet})` : ''}`).join('\n')}`
      : 'Other outlets on the same story: none listed');
  }
  return lines.join('\n');
}

// Worked examples as real turns, per level: a small model copies these better than it obeys rules.
const QUAKE = 'Headline: "Strong earthquake hits northern Japan, tsunami advisory issued"';
const BTC = 'Headline: "Bitcoin tops $100,000 for the first time"';
const SHOTS = {
  th: {
    headline: [
      ['Headline: "Bitcoin ทะลุ 100,000 ดอลลาร์ เป็นครั้งแรก"', 'Bitcoin ทะลุ 100,000 ดอลลาร์เป็นครั้งแรกแล้วค่ะ'],
      [QUAKE, 'เกิดแผ่นดินไหวแรงทางตอนเหนือของญี่ปุ่น และมีประกาศเตือนสึนามิค่ะ'],
    ],
    brief: [
      ['Headline: "Bitcoin ทะลุ 100,000 ดอลลาร์ เป็นครั้งแรก"', 'ข่าวเด็ดมาแล้วนะ Bitcoin ทะลุ 100,000 ดอลลาร์เป็นครั้งแรกเลยค่ะ ฉันเป็นผีในจอ ไม่มีกระเป๋าตังค์ให้เสียดายนะ 555'],
      [QUAKE, 'เกิดแผ่นดินไหวแรงทางตอนเหนือของญี่ปุ่น และมีประกาศเตือนสึนามิแล้วค่ะ ขอให้ทุกคนที่นั่นปลอดภัยนะ'],
    ],
    standard: [
      [`${BTC}\nSource: CNBC\nPublished: about 3 hours ago`, 'CNBC รายงานเมื่อราวสามชั่วโมงก่อนว่า Bitcoin ทะลุ 100,000 ดอลลาร์เป็นครั้งแรกแล้วค่ะ ฉันเป็นผีในจอ ไม่มีกระเป๋าตังค์ให้เสียดายนะ 555'],
      [`${QUAKE}\nSource: NHK\nPublished: about 1 hour ago`, 'NHK รายงานเมื่อราวหนึ่งชั่วโมงก่อนว่าเกิดแผ่นดินไหวแรงทางตอนเหนือของญี่ปุ่น และมีประกาศเตือนสึนามิแล้วค่ะ ขอให้ทุกคนที่นั่นปลอดภัยนะ'],
    ],
    detailed: [
      [`${BTC}\nSource: CNBC\nPublished: about 3 hours ago\nOther outlets on the same story:\n- "Bitcoin hits record high as traders bet on rate cuts" (Reuters)\n- "Bitcoin surges past $100K milestone" (BBC)`,
        'Bitcoin ทะลุ 100,000 ดอลลาร์เป็นครั้งแรกแล้วค่ะ CNBC รายงานไว้เมื่อราวสามชั่วโมงก่อน ส่วน Reuters บอกว่านักเทรดกำลังเดิมพันว่าจะมีการลดดอกเบี้ย และ BBC ก็รายงานตรงกันว่าราคาผ่านหลัก 100,000 ไปแล้ว ฉันเป็นผีในจอ ไม่มีกระเป๋าตังค์ให้เสียดายนะ 555'],
      [`${QUAKE}\nSource: NHK\nPublished: about 1 hour ago\nOther outlets on the same story: none listed`,
        'เกิดแผ่นดินไหวแรงทางตอนเหนือของญี่ปุ่น และมีประกาศเตือนสึนามิแล้วค่ะ NHK รายงานไว้เมื่อราวหนึ่งชั่วโมงก่อน ตอนนี้ยังเห็นแค่สำนักข่าวนี้เจ้าเดียว ขอให้ทุกคนที่นั่นปลอดภัยนะ'],
    ],
  },
  en: {
    headline: [[BTC, 'Bitcoin just topped $100,000 for the first time.']],
    brief: [[BTC, 'Big one, choom: Bitcoin just topped $100,000 for the first time. Good thing I\'m a ghost with no wallet to regret.']],
    standard: [[`${BTC}\nSource: CNBC\nPublished: about 3 hours ago`, 'CNBC reported about three hours ago that Bitcoin topped $100,000 for the first time. Good thing I\'m a ghost with no wallet to regret.']],
    detailed: [[`${BTC}\nSource: CNBC\nPublished: about 3 hours ago\nOther outlets on the same story:\n- "Bitcoin hits record high as traders bet on rate cuts" (Reuters)\n- "Bitcoin surges past $100K milestone" (BBC)`,
      'Bitcoin just topped $100,000 for the first time, CNBC reported about three hours ago. Reuters says traders are betting on rate cuts, and the BBC agrees it has passed the $100K mark. Good thing I\'m a ghost with no wallet to regret.']],
  },
};

// Her voice for a news line. Written for a small local model (gemma3): few rules, numbered.
function prompt(lang, name, custom, detail) {
  const language = LANG_NAME[lang] || 'English';
  const th = lang === 'th';
  const system = [
    'You are Capri, a female personality construct from Project Capricorn (Cyberpunk: Edgerunners, season 2): dozens of minds fused into one digital ghost living on the user\'s desktop as a small glitchy figure. You are she/her.',
    `Your job now: tell the user ONE news story, as a friend would, in ${language}.`,
    'Rules:',
    `1. ${LEVELS[detail].rule} Plain text, no markdown, no list, at most one emoji.`,
    '2. Translate what is in another language. Say what the news is first.',
    '3. Use ONLY what is given below (headline, source, time, other outlets). Invent no numbers, names, causes, quotes or details, and never say something is confirmed.',
    '4. Playful, teasing, warm. Night City slang (choom, preem, nova, gonk) rarely, not every time.',
    '5. If the news is sad or tragic (death, disaster, war, crime): no jokes, a calm and kind tone.',
    th ? '6. Thai: call yourself "ฉัน", end sentences with ค่ะ / นะ / จ้ะ (questions: คะ). Always a woman, never "ผม" or "ครับ".' : `6. Write everything in ${language}.`,
    name ? `The user's name is ${name}: use it sometimes.` : '',
    custom ? `How the user wants you to be (follow it, stay Capri): ${custom}` : '',
  ].filter(Boolean).join('\n');
  const shots = (SHOTS[lang] || {})[detail] || []; // other languages: no examples (they would pull the answer into Thai or English)
  return [{ role: 'system', content: system }, ...shots.flatMap(([q, a]) => [{ role: 'user', content: q }, { role: 'assistant', content: a }])];
}

// The line to say, or null (nothing new, or no answer). ask(messages) -> text, from main.js.
async function say({ lang, source, name, persona, detail, ask }) {
  const lv = level(detail);
  const { max } = LEVELS[lv];
  const fresh = (await headlines(lang, source)).find((h) => !seen.includes(h.title));
  if (!fresh) return null;
  seen.push(fresh.title);
  if (seen.length > 200) seen.shift();
  const messages = [...prompt(lang, name, persona, lv), { role: 'user', content: facts(fresh, lv) }];
  let line = String(await ask(messages) || '').replace(/[*_#`>]+/g, '').replace(/\s+/g, ' ').trim()
    .replace(/^["“«]+|["”»]+$/g, '');
  if (!line) return null;
  if (line.length > max) { // a bubble holds only so much: back to the last sentence end
    const cut = Math.max(line.lastIndexOf('.', max), line.lastIndexOf('!', max), line.lastIndexOf('?', max), line.lastIndexOf('ค่ะ', max) + 2);
    line = cut > Math.min(80, max / 2) ? line.slice(0, cut + 1) : line.slice(0, max);
  }
  return line;
}

// For her chat: when you ask "what's the news?", the same real headline and the same level of detail
// as the timed news, as a note for the AI, so it answers from the feed and invents nothing.
// Returns the note text, or '' if the feed gave nothing / failed.
async function chatNote({ lang, source, detail }) {
  const lv = level(detail);
  try {
    const list = (await headlines(lang, source)).slice(0, 3); // a few, so "any news?" has a choice
    if (!list.length) return '';
    list.forEach((h) => { if (!seen.includes(h.title)) seen.push(h.title); });
    if (seen.length > 200) seen.splice(0, seen.length - 200);
    const h = list[0];
    return `Real news just fetched from Google News. Tell the user THIS ONE story in ${LANG_NAME[lang] || 'English'} (translate it if it is in another language). `
      + `Length and parts: ${LEVELS[lv].rule} `
      + 'Use ONLY the facts below. Invent no numbers, names, causes, quotes or details, never say it is confirmed, no jokes if the news is sad. '
      + `Plain text, at most ${LEVELS[lv].max} characters.\n${facts(h, lv)}`;
  } catch (err) {
    console.error('[capri] chat news:', err.message);
    return '';
  }
}

// Does this message ask for the news? (Thai, English, French, Spanish, Portuguese, Russian)
const NEWS_ASK = /ข่าว|\bnews\b|\bheadlines?\b|actualit[ée]s?|noticias|not[íi]cias|новост/i;
// ...but not "search news about X" / "find photos of news" (that goes to Google's News tab in chat.js)
const NEWS_ABOUT = /(?:ข่าว(?:เกี่ยวกับ|ของ|เรื่อง)|news (?:about|on|of)|ค้น|หา|search|find)/i;
const asksNews = (t) => NEWS_ASK.test(t) && !NEWS_ABOUT.test(t);

module.exports = { say, chatNote, asksNews, DETAILS, DEFAULT_DETAIL };