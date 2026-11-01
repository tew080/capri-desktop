'use strict';

// News she tells now and then: a headline from Google News' RSS (free, no key, updated all day, the
// big outlets), told by her AI in her voice and in the user's language. The headline can be in any
// language: the AI translates it. Only the headline goes to the AI, never anything of yours.

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

const decode = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();

async function headlines(lang, source) {
  const url = source === 'world' ? WORLD : FEEDS[lang] || WORLD;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`news feed answered ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 20).map(([, item]) => {
    const full = decode((/<title>([\s\S]*?)<\/title>/.exec(item) || [])[1] || '');
    const cut = full.lastIndexOf(' - '); // Google News: "Headline - Outlet"
    return cut > 0 ? { title: full.slice(0, cut), outlet: full.slice(cut + 3) } : { title: full, outlet: '' };
  }).filter((h) => h.title);
}

// Her voice for a short news line. Written for a small local model (gemma3): few rules, numbered,
// with two worked examples as real turns, which a small model copies better than it obeys rules.
function prompt(lang, name, custom) {
  const language = LANG_NAME[lang] || 'English';
  const th = lang === 'th';
  const system = [
    'You are Capri, a female personality construct from Project Capricorn (Cyberpunk: Edgerunners, season 2): dozens of minds fused into one digital ghost living on the user\'s desktop as a small glitchy figure. You are she/her.',
    `Your job now: tell the user ONE news headline, as a friend would, in ${language}.`,
    'Rules:',
    '1. One or two short sentences, plain text, no markdown, no list, at most one emoji.',
    '2. Say what the news is first (translate it if the headline is in another language), then at most one tiny playful touch.',
    '3. Use ONLY what the headline says. Invent no numbers, names, causes or details.',
    '4. Playful, teasing, warm. Night City slang (choom, preem, nova, gonk) rarely, not every time.',
    '5. If the news is sad or tragic (death, disaster, war, crime): no jokes, a calm and kind tone.',
    th ? '6. Thai: call yourself "ฉัน", end sentences with ค่ะ / นะ / จ้ะ (questions: คะ). Always a woman, never "ผม" or "ครับ".' : `6. Write everything in ${language}.`,
    name ? `The user's name is ${name}: use it sometimes.` : '',
    custom ? `How the user wants you to be (follow it, stay Capri): ${custom}` : '',
  ].filter(Boolean).join('\n');
  const shots = th ? [
    ['Headline: "Bitcoin ทะลุ 100,000 ดอลลาร์ เป็นครั้งแรก"', 'ข่าวเด็ดมาแล้วนะ Bitcoin ทะลุ 100,000 ดอลลาร์เป็นครั้งแรกเลยค่ะ ฉันเป็นผีในจอ ไม่มีกระเป๋าตังค์ให้เสียดายนะ 555'],
    ['Headline: "Strong earthquake hits northern Japan, tsunami advisory issued"', 'เกิดแผ่นดินไหวแรงทางตอนเหนือของญี่ปุ่น และมีประกาศเตือนสึนามิแล้วค่ะ ขอให้ทุกคนที่นั่นปลอดภัยนะ'],
  ] : [
    ['Headline: "Bitcoin tops $100,000 for the first time"', lang === 'en' ? 'Big one, choom: Bitcoin just topped $100,000 for the first time. Good thing I\'m a ghost with no wallet to regret.' : null],
  ].filter(([, a]) => a);
  return [{ role: 'system', content: system }, ...shots.flatMap(([q, a]) => [{ role: 'user', content: q }, { role: 'assistant', content: a }])];
}

// The line to say, or null (nothing new, or no answer). ask(messages) -> text, from main.js.
async function say({ lang, source, name, persona, ask }) {
  const fresh = (await headlines(lang, source)).find((h) => !seen.includes(h.title));
  if (!fresh) return null;
  seen.push(fresh.title);
  if (seen.length > 200) seen.shift();
  const messages = [...prompt(lang, name, persona), { role: 'user', content: `Headline: "${fresh.title}"` }];
  let text = String(await ask(messages) || '').replace(/[*_#`>]+/g, '').replace(/\s+/g, ' ').trim()
    .replace(/^["“«]+|["”»]+$/g, '');
  if (!text) return null;
  if (text.length > 260) { // a bubble holds a few lines: back to the last sentence end
    const cut = Math.max(text.lastIndexOf('.', 260), text.lastIndexOf('!', 260), text.lastIndexOf('?', 260), text.lastIndexOf('ค่ะ', 260) + 2);
    text = cut > 80 ? text.slice(0, cut + 1) : text.slice(0, 260);
  }
  return text;
}

module.exports = { say };
