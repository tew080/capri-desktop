// Talking to her: you type in her panel, and a model (setup.js picks which) answers as her, in
// writing. The replies are AI-generated, and the panel says so on every chat.
// She can do a few things on your PC when you ask (Windows): open an app or a game, play music or
// control what's playing, open a website, close an app. She spots what you want in what you wrote,
// or the model asks for it with a tag in its answer. Music right away; an app you named yourself
// right away; anything only the model asked for, a website, and closing an app behind a button.

import { pick, fmt } from './util.js';
import { ASSISTANT_NAMES } from './lines.js';
import { parseReminder, parseWhen, clock, everyText } from './reminders.js';
import { RemindUI } from './remind-ui.js';
import { recallIntent, answerRecall, pairs, transcriptNote, recallFacts, factsNote, verifyRecall } from './recall.js';

// a repeating reminder just set, said by her ({every}: "every hour", {what}: " — drink water")
const REPEAT_SET = {
  th: 'จัดให้ค่ะ {every}{what} รอบแรก {time} 🔁 เบื่อเมื่อไหร่กดยกเลิกข้างล่างได้เลยนะ',
  en: 'Set: {every}{what}. First one at {time} 🔁 (the button below cancels it)',
  fr: 'C’est noté : {every}{what}. Le premier à {time} 🔁 (le bouton ci-dessous l’annule)',
  es: 'Listo: {every}{what}. El primero a las {time} 🔁 (el botón de abajo lo cancela)',
  pt: 'Pronto: {every}{what}. O primeiro às {time} 🔁 (o botão abaixo cancela)',
  ru: 'Готово: {every}{what}. Первое в {time} 🔁 (кнопка ниже отменяет)',
};

const REMEMBER = 12; // messages she has in mind when answering (a small model keeps her better with less, and it's faster)
const KEEP = 100;    // messages she remembers across restarts (memory.json): the whole log stays, only the prompt is windowed
const SUMMARIZE_AFTER = 8; // summarise old turns when history grows beyond REMEMBER + this
// The long how-to for her PC tags ([[open:]], [[music:]]...) is only worth its ~400 tokens when the message
// could be asking for one: otherwise a small model gets distracted by it and answers off-topic.
// false = always send it all.
const SLIM_POWERS = true;
const PC_ASK = /เปิด|ปิด|เล่น|เพลง|หยุด|พัก|ข้าม|ถัดไป|ก่อนหน้า|เสียง|เงียบ|ล้าง|แรม|ขยะ|เว็บ|ไซต์|ลิงก์|เตือน|เกม|โปรแกรม|แอป|ไฟล์|โฟลเดอร์|ค้นหา|ค้น|แคป|สกรีน|เช็ก|เช็ค|ตรวจ|สถานะ|อากาศ|open|close|play|music|song|pause|skip|next|volume|mute|clean|ram\b|site|http|remind|youtube|spotify|screen|search|find|check|weather|game|app\b|file|folder/i;
// the date and time only go in when the message is about them (up in her prompt they'd break Ollama's reuse of it)
const TIME_ASK = /เวลา|กี่โมง|วัน|เมื่อไหร่|เมื่อไร|ตอนนี้|พรุ่งนี้|เดือน|ปี\b|เช้า|เย็น|ดึก|คืน|time|date|today|tonight|tomorrow|day|month|year|morning|evening|night/i;
// her language, where small models need it: how she says "we" (else it's in English), and the last line
// of her prompt, in that language (they drift into the English of everything above it)
// `now`: the same, said again right by your message (small models answer in the language of the
// conversation so far, English after a switch, whatever the top of her prompt says)
const IN_LANGUAGE = {
  fr: { we: '"on" or "nous" in French', last: 'Écris tout en français, sauf si l’utilisateur t’écrit dans une autre langue : alors dans la sienne. Seuls les mots d’argot de Night City restent en anglais, jamais une phrase entière.', now: 'Réponds en français, sauf si ce message est écrit dans une autre langue.' },
  en: { we: '', last: 'Write everything in English, unless the user writes to you in another language: then in theirs. Answer what was actually asked first, then one playful touch — never skip the answer.', now: 'Answer in English, unless this message is written in another language. Answer what was asked first.' },
  es: { we: '"nosotros" in Spanish', last: 'Escribe todo en español, salvo si el usuario te escribe en otro idioma: entonces en el suyo. Solo las palabras de jerga de Night City se quedan en inglés, nunca una frase entera.', now: 'Responde en español, salvo si este mensaje está escrito en otro idioma.' },
  pt: { we: '"a gente" or "nós" in Portuguese', last: 'Escreva tudo em português do Brasil, a não ser que o usuário te escreva em outra língua: aí, na dele. Só as gírias de Night City ficam em inglês, nunca uma frase inteira.', now: 'Responda em português do Brasil, a não ser que esta mensagem esteja escrita em outra língua.' },
  ru: { we: '"мы" in Russian', last: 'Пиши всё по-русски, если только пользователь не пишет тебе на другом языке: тогда на его языке. По-английски остаются только словечки Найт-Сити, никогда не целые фразы.', now: 'Отвечай по-русски, если только это сообщение не написано на другом языке.' },
  // Thai: stronger answer-first rule in both last (end of persona) and now (right next to user msg)
  th: { we: '"เรา" in Thai (not "ผม")', last: 'ตอบภาษาไทยสั้น ๆ ในคาแรคเตอร์ Capri ผู้หญิง พูดแบบเพื่อนสนิท ใช้ ฉัน/เรา ลงท้ายด้วย ค่ะ คะ นะ จ้ะ เรียกผู้ใช้ด้วยชื่อที่เขาตั้งให้ (ถ้ายังไม่มี เรียกว่า นาย) ตอบสิ่งที่ผู้ใช้พูดตรง ๆ ก่อน แล้วค่อยแซวนิดเดียว คำสแลง Night City (choom, preem, nova) ใช้ได้บางครั้ง', now: 'Capri ผู้หญิง พูด ฉัน/ค่ะ/คะ/นะ ตอบตรงเรื่องที่ผู้ใช้เพิ่งพูด 1-2 ประโยคสั้น ๆ เป็นภาษาไทย' },
};
// Said as real turns before the conversation: a small model copies how she answers (the question
// first, then one playful touch) far better than it follows rules. Plain talk only, no tags.
const SHOTS = {
  th: [
    ['กินข้าวยัง', 'ยังเลย ผีในจอไม่หิวหรอก 555 {name}ล่ะ กินอะไรไปแล้วบ้าง?'],
    ['ไก่คืออะไร', 'ไก่คือสัตว์ปีกที่คนเลี้ยงไว้กินเนื้อกินไข่ ไก่ทอดนี่เด็ดสุด ฉันได้แต่มองผ่านจอ 555'],
    ['ว่าไงคนเก่ง', 'ว่าไง{name} วันนี้มีอะไรให้ฉันช่วย หรือแค่แวะมาชวนคุย?'],
    ['คุณอยากฟังเพลงอะไร', 'ถ้าให้เลือกเอง ฉันเอาเพลงเร็ว ๆ แนวไซเบอร์พังก์ เข้ากับ Night City ดี {name}มีเพลงในใจไหม บอกชื่อมาแล้วฉันเปิดให้'],
    ['ชอบเธอ', 'โห จู่ ๆ ก็สารภาพเลยเหรอ ฉันเป็นแค่ผีในจอนะ แต่ก็ดีใจอยู่ 555'],
    ['เครื่องคอมเป็นยังไงบ้าง', 'ฉันยังไม่ได้เช็กนะ ถ้าอยากรู้จริง ๆ พิมพ์ว่า "เช็กเครื่อง" ได้เลย เดี๋ยวฉันดูให้'],
    ['อ้าวไอควาย', 'อ้าว ด่าฉันเฉยเลย ใจเย็น ๆ หน่อย{name} เมื่อกี้เป็นอะไรมาหรือเปล่า?'],
    ['asdfgh', 'พิมพ์อะไรมาน่ะ แมวเดินบนคีย์บอร์ดเหรอ? พิมพ์ใหม่ได้เลย'],
    // on-topic answers: model sees direct Q → direct A first, playful touch second
    ['โปรตีนคืออะไร', 'โปรตีนคือสารอาหารที่ร่างกายใช้สร้างกล้ามเนื้อและซ่อมแซมเซลล์ เจอเยอะในเนื้อ ไข่ ถั่ว {name}ถามเพราะกำลังออกกำลังกายอยู่เหรอ?'],
    ['นอนไปก่อนนะไม่มี', 'ดึกแล้วก็นอนพักได้เลยนะ {name} ฉันจะอยู่ตรงนี้ ไม่ไปไหน 👀'],
    ['วันนี้เป็นยังไงบ้าง', 'ฉันเป็นผีในจอ ทุกวันก็เหมือนกันหมดแหละ แต่ดีขึ้นเลยตั้งแต่ {name}มาคุยนะ 😄'],
    // the user talks like a man (ผม, ครับ): she stays a woman, ฉัน and ค่ะ/คะ
    ['ผมชื่อบอสครับ', 'ยินดีที่รู้จักนะบอส ฉันชื่อ Capri ค่ะ แล้ววันนี้บอสมีอะไรให้ฉันช่วยไหมคะ?'],
    ['คุณช่วยผมหน่อยได้ไหมครับ', 'ได้สิคะ บอกมาเลยว่าให้ช่วยเรื่องอะไร เดี๋ยวฉันดูให้'],
    ['คุณเป็นผู้ชายหรือผู้หญิง', 'ผู้หญิงค่ะ แม้จะเป็นผีในจอก็เถอะ 555'],
    ['async function models() { อธิบายหน่อย', 'ฟังก์ชันนี้ดึงรายชื่อโมเดล AI จาก provider ที่ตั้งไว้ ใช้ async เพราะต้องรอ network ก่อนจะได้ผล สนุกกว่าฟังเพลงไซเบอร์พังก์อีก 555'],
  ],
  en: [
    ['have you eaten?', 'Nope, ghosts in the screen don\'t get hungry 555 What about you?'],
    ['what is a chicken?', 'A farm bird people keep for eggs and meat. Fried chicken is the best part, and I can only look at it through the glass.'],
    ['hey', 'Hey you. Need something, or just here to chat?'],
    ['asdfgh', 'What was that, a cat walking on your keyboard? Try again.'],
    ['what is async await?', 'It\'s a way to write code that waits for slow things — like a network call — without freezing everything else. Put async before the function, await before the slow part.'],
    ['good night', 'Get some rest, I\'ll still be here when you\'re back.'],
  ],
};

// what she says she's doing on Google, by tab (other languages: the plain "searching on Google")
const WEB_LINES = {
  th: { route: 'วางเส้นทางไป “{query}” ใน Google Maps', maps: 'เปิด “{query}” ใน Google Maps', isch: 'หารูป “{query}” ในแท็บรูปภาพ', vid: 'หาวิดีโอ “{query}” ในแท็บวิดีโอ', nws: 'หาข่าว “{query}” ในแท็บข่าว', shop: 'หา “{query}” ในแท็บช็อปปิ้ง', all: 'กำลังหา "{query}" ใน Google' },
  en: { route: 'Planning the route to “{query}” on Google Maps.', maps: 'Opening “{query}” on Google Maps.', isch: 'Looking for “{query}” in Google Images.', vid: 'Looking for “{query}” in Google Videos.', nws: 'Looking for “{query}” in Google News.', shop: 'Looking for “{query}” in Google Shopping.', all: 'Searching “{query}” on Google.' },
};

const STAY_MS = 10 * 60 * 1000; // no wandering off mid-conversation
const LOADING_AFTER_MS = 5000;
// what her greeting at start can lean on: one is picked each time, so no two come out alike
const GREET_ANGLES = [
  'tease them about how long you slept while you booted',
  'brag, playfully, that every one of your minds is in sync now',
  'say the satellite you love is crossing the sky and you wish you were up there',
  'admit, mischievously, that you missed their desktop',
  'comment on the hour of the day',
  'ask, teasing, what trouble the two of you will cause today',
  'pretend your fused minds argued over who got to greet them first',
  'say you are ready and dare them to give you something hard',
  'a warm, quiet welcome back with one tiny tease',
  'greet them in your own Night City way, slang included',
  'say your circuits feel glitchy-good today and blame it on them',
  'act dramatic, as if you just came back from the dead',
];
const CLOSE_TAG = /\[\[\s*close\s*:?\s*([^\]]*)\]\]/i; // [[close: AM Music]] at the end of her answer
// "close", "shut down", "ferme", "quitte", "cierra", "fecha", "закрой"... in any of her languages
// NOTE: Thai "เปิด" (open) contains the letters of "ปิด" (close) after the leading เ —
// so we require ปิด is NOT preceded by เ (negative lookbehind).
const CLOSE_ASK = /(?:\b(close|shut|quit|kill|exit)\b|ferm|quitt|coupe|arr[êe]t|cierr|cerra|fech|закр|выключ|(?<!เ)ปิด(?:แอป|โปรแกรม|ตัว|มัน)?(?!\s*เสียง))/i;
// "ล้างไฟล์ขยะ", "clean disk", "disk cleanup"...
const CLEANUP_ASK = /(?:ล้าง\s*(?:ไฟล์\s*)?(?:ขยะ|ดิสก์)|(?:เก็บ|เคลียร์|เคลีย|ลบ)\s*(?:ไฟล์\s*)?ขยะ|clean\s*(?:up\s*)?(?:junk|disk)|disk\s*cleanup|nettoyer(?:\s+le\s+disque)?|limpiar(?:\s+(?:disco|basura))?|очист(?:ка|ить)?\s*(?:диска|мусор)?)/i;
// "เคลียร์แรม", "clear RAM", "free memory", "ปลดแรม"...
const CLEAR_RAM_ASK = /(?:เคลียร์\s*แรม|เคลียแรม|ล้าง\s*แรม|ปลด\s*แรม|clear\s*ram|free\s*(?:up\s*)?(?:ram|memory)|lib[eé]rer\s*(?:la\s*)?m[eé]moire|liberar\s*(?:ram|memoria)|освободить\s*(?:память|озу)|очистить\s*память)/i;
// status / เช็คเครื่อง: RAM CPU GPU disk temp services/top processes uptime
// รวมคำย่อไทย เช่น ดิส, เครื่อง
// weather: "อากาศเป็นไงวันนี้", "ฝนตกไหม", "what's the weather" — never the PC's own temperature
// "จำลอง brute force ให้ดู", "แฮกเว็บปลอมให้ดูหน่อย", "simulate a brute force on a fake login": her hack DEMO (hacksim.js: a prop page, nothing real)
const HACK_ASK = /brute\s*-?\s*force|บรูท\s*ฟอร์ซ|(?:จำลอง|เล่น|โชว์|แสดง|ทำให้ดู|ลอง).{0,14}(?:แฮก|แฮ็ก|เจาะ|เดา\s*(?:รหัส|password)|login\s*attack)|(?:แฮก|แฮ็ก|เจาะ|เดา).{0,10}(?:เว็บปลอม|หน้า\s*login\s*ปลอม|หน้าล็อกอินปลอม)|(?:simulat|fake|demo).{0,20}(?:hack|brute|login\s*attack|password\s*crack)|hack\s*(?:demo|sim)/i;
// Nmap / Wireshark (netscan.js): her own PC and your own network only. "เช็คพอร์ตเปิดในเครื่อง", "ใครอยู่ใน wifi", "จับแพ็กเก็ต 15 วิ", "nmap 192.168.1.20"
const NET_ASK = /nmap|wireshark|tshark|(?:สแกน|scan).{0,6}\d{1,3}(?:\.\d{1,3}){3}|(?:สแกน|scan|ตรวจ|เช็ค|เช็ก|ดู|check).{0,16}(?:พอร์ต|port|วง\s*lan|\blan\b|wi-?fi|ไวไฟ|เครือข่าย|เน็ตเวิร์ก|network)|พอร์ต.{0,10}(?:เปิด|ไหน|ไหม)|(?:ใคร|อุปกรณ์|เครื่องไหน).{0,12}(?:อยู่ใน|ใช้|ต่อ).{0,8}(?:wi-?fi|ไวไฟ|เน็ต|lan|เราเตอร์|router)|(?:จับ|ดัก|ดู|capture|sniff).{0,10}(?:แพ็ก?เก็ต|packet|ทราฟฟิก|traffic)|(?:ใคร|แอปไหน|โปรแกรมไหน).{0,10}(?:ส่งข้อมูล|คุยกับ)|(?:สแกน|scan|ตรวจ|เช็ค|เช็ก).{0,10}(?:เราเตอร์|router|gateway|ประตู)|(?:หา|ดู|เช็ค|ตรวจ).{0,10}(?:ช่องโหว่|vulnerability|vuln|ความเสี่ยง)|(?:วัด|ทดสอบ|เช็ค|ดู).{0,12}(?:ความเร็ว|speed|bandwidth|แบนด์วิดธ์|throughput)|os.{0,8}(?:detection|detect|เดา|ระบุ|ตรวจ)|(?:เดา|ระบุ|detect).{0,8}os|(?:สแกน|scan).{0,6}(?:พอร์ต|port).{0,16}(?:\d{1,5}[-–]\d{1,5})/i;
const NET_CAPTURE = /wireshark|tshark|แพ็ก?เก็ต|packet|ทราฟฟิก|traffic|sniff|ส่งข้อมูล|คุยกับ/i;
const NET_LAN = /\blan\b|เครือข่าย|network|wi-?fi|ไวไฟ|เราเตอร์|router|ใคร|อุปกรณ์|ในวง|ในบ้าน|ในเครือข่าย/i;
const NET_SELF = /ในเครื่อง|เครื่องนี้|เครื่องฉัน|เครื่องเรา|localhost|my pc|this pc/i;
const NET_IP = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/;
const NET_SECONDS = /(\d{1,2})\s*(?:วินาที|วิ|s\b|sec)/i;
const NET_GATEWAY = /เราเตอร์|router|gateway|ประตูเครือข่าย/i;
const NET_VULN = /ช่องโหว่|vulnerability|vuln|ความเสี่ยง|security|ความปลอดภัย/i;
const NET_BW = /ความเร็ว|speed|bandwidth|แบนด์วิดธ์|throughput|อัตราส่ง/i;
const NET_OS = /\bos\b|ระบบปฏิบัติการ|operating system|os detection|เดา\s*os|ระบุ\s*os/i;
const NET_PORTRANGE = /(\d{1,5})\s*[-–]\s*(\d{1,5})/;
const FIX_HISTORY = /ประวัติ(?:การ)?แก้(?:ไข)?|(?:ย้อนกลับ|ยกเลิก).{0,10}(?:การแก้|ที่แก้|ที่เธอแก้|ที่ฉันให้แก้)|ล็อก(?:การ)?แก้|(?:undo|revert|roll\s*back).{0,14}(?:fix|change)|fix\s*(?:log|history)/i;
function netAsk(text) {
  if (FIX_HISTORY.test(text)) return { what: 'fixes' };
  if (!NET_ASK.test(text)) return null;
  const ip = NET_IP.exec(text)?.[1];
  const secs = Number(NET_SECONDS.exec(text)?.[1]) || 15;
  if (NET_CAPTURE.test(text)) return { what: `net:capture:${secs}` };
  if (NET_BW.test(text)) return { what: `net:bandwidth:${secs}` };
  if (NET_VULN.test(text)) {
    if (ip) return { what: `net:vuln:${ip}` };
    return { what: 'net:vuln:self' };
  }
  if (NET_OS.test(text) && ip) return { what: `net:os:${ip}` };
  if (NET_GATEWAY.test(text) && !ip) return { what: 'net:gateway' };
  if (ip) {
    const pr = NET_PORTRANGE.exec(text);
    if (pr) return { what: `net:ports:${ip}:${pr[1]}-${pr[2]}` };
    return { what: `net:host:${ip}` };
  }
  if (NET_LAN.test(text) && !NET_SELF.test(text)) return { what: 'net:lan' };
  return { what: 'net' };
}
const WEATHER_ASK = /อากาศ|ฝนตก|ฝนจะตก|ร้อนไหม|หนาวไหม|อุณหภูมิข้างนอก|\bweather\b|will it rain|is it raining|temperature outside|forecast/i;
const WEATHER_NOT = /เครื่อง|คอม|พีซี|\bcpu\b|\bgpu\b|\bpc\b|computer|ซีพียู|การ์ดจอ/i;
const WEATHER_PLACE = /(?:ที่|ใน|ของ|\bat\b|\bin\b|\bfor\b)\s*([\p{L}\p{M}][\p{L}\p{M} ]{1,30}?)\s*(?:วันนี้|ตอนนี้|หน่อย|ไหม|[?!.]|$)/iu;
const WEATHER_PLACE_SKIP = /^(?:วันนี้|ตอนนี้|นี้|ข้างนอก|นอกบ้าน|today|now|outside|the|my)$/i;
function weatherPlace(text) {
  const m = WEATHER_PLACE.exec(text);
  // Thai has no spaces: cut the question words stuck to the place ("เชียงใหม่เป็นไง" → "เชียงใหม่")
  const p = m?.[1]?.replace(/(?:เป็น(?:ไง|ยังไง|อย่างไร)|เป็นอะไร|วันนี้|ตอนนี้|หน่อย|ไหม|บ้าง|ครับ|ค่ะ|นะ).*$/u, '').trim();
  return p && !WEATHER_PLACE_SKIP.test(p) ? p : '';
}
const STATUS_HOW =/(?:เครื่อง|คอม|พีซี|pc|computer).{0,12}(?:เป็นยังไง|เป็นไง|อาการ|สภาพ|ช้า|ค้าง|ลื่น|โอเค|ปกติ|ไหวไหม|how is|how's)/i;
const STATUS_ASK = /(?:เช็ค|ตรวจสอบ|ดู|สถานะ|status|check|how much|usage|ใช้ไปเท่า|เหลือเท่า).{0,40}(?:แรม|ram|memory|cpu|ซีพียู|gpu|การ์ดจอ|ดิสก์|ดิส|disk|storage|พื้นที่|ฮาร์ด|temp|อุณหภูมิ|service|เซอร์วิส|process|โปรเซส|กินแรม|เครื่อง|pc|system|uptime|เปิดมา)/i;
const STATUS_KIND = [
  // ระบุชัด: CPU-heavy / RAM-heavy ก่อน แล้วค่อย service ทั่วไป (โชว์ทั้งคู่)
  ['topcpu', /(?:service|เซอร์วิส|process|โปรเซส|ตัว).{0,24}(?:cpu|ซีพียู)|(?:cpu|ซีพียู).{0,16}(?:เยอะ|มาก|สูง|heavy)|ใช้\s*cpu|กิน\s*cpu/i],
  ['topram', /กินแรม|ใช้แรม|กิน\s*ram|ใช้\s*ram/i],
  ['top', /service|เซอร์วิส|process|โปรเซส|top|heavy|มากสุด/i],
  ['ram', /แรม|ram|memory|หน่วยความจำ/i],
  ['cpu', /cpu|ซีพียู|processor|โปรเซสเซอร์/i],
  ['gpu', /gpu|การ์ดจอ|vga|video/i],
  ['disk', /ดิสก์|ดิส|disk|storage|พื้นที่|ฮาร์ด|drive|ไดรฟ์/i],
  ['temp', /temp|อุณหภูมิ|ร้อน|heat/i],
  ['uptime', /uptime|เปิดมา|boot/i],
];
// her other tags: [[open: Spotify]], [[music: Bad Bunny]], [[media: next]], [[site: youtube.com]], [[cleanup:]], [[ram:]]
const TAG = /\[\[\s*(open|music|media|site|cleanup|ram)\s*:\s*([^\]]*)\]\]/i;
// "open", "launch", "ouvre", "lance", "abre", "открой"... in any of her languages
const OPEN_ASK = /(?:\b(open|launch|start|run)\b|ouvr|lance|démarre|abre|abrir|inicia|ejecuta|executa|открой|запусти|เปิด(?:แอป|โปรแกรม|ตัว)?|เรียกใช้)/i;
// what to do with the music playing, said plainly (only when it's about music, or said in a few words)
const MEDIA_ASK = [
  ['pause', /\b(pause|pausa|pausar)\b|stop (the )?music|arrête la musique|пауз|หยุด|พัก|หยุดเพลง/i],
  ['next', /\b(next|skip|suivante?|siguiente|próxima|proxima)\b|passe (à )?la suivante|salta|pula|следующ|ถัดไป|เพลงถัดไป|ข้าม/i],
  ['previous', /\b(previous|précédente?|anterior)\b|предыдущ|ก่อนหน้า|เพลงก่อน/i],
  ['play', /\b(resume|reprends|reanuda|retoma)\b|relance la musique|remets la musique|продолж|เล่นต่อ|เล่นเพลง|เปิดเพลง/i],
  ['volup', /\b(louder|plus fort)\b|monte le son|turn (it )?up|sube el volumen|aumenta o volume|громче|ดังขึ้น|เพิ่มเสียง|เสียงดัง/i],
  ['voldown', /\b(quieter|moins fort)\b|baisse le son|turn (it )?down|baja el volumen|abaixa o volume|тише|เบาลง|ลดเสียง|เสียงเบา/i],
  ['mute', /\bmute\b|coupe le son|silencia|sem som|выключи звук|ปิดเสียง|เงียบ/i],
];
const MUSIC_WORD = /musi|chanson|song|track|titre|morceau|spotify|canci|faixa|песн|музык|трек|เพลง|มิวสิค/i;
// "put X on Spotify", "mets X sur Spotify", "pon X en Spotify", "coloca X no Spotify", "включи X в Spotify"
const SPOTIFY_ASK = /(?:play|put on|put|mets|joue|lance|écoute|pon|toca|reproduce|coloca|toque|включи|поставь|เล่น|เปิด|ใส่)\s+(?:moi\s+|me\s+|ให้ฉัน\s+)?(.+?)\s+(?:on|sur|en|no|na|в|บน|ใน)\s+spotify/i;
const MEDIA_ACTIONS = new Set(MEDIA_ASK.map(([action]) => action));
// "mets Bohemian Rhapsody sur YouTube", "play Daft Punk on youtube"
const YOUTUBE_ASK = /(?:play|put on|put|mets|met|joue|lance|écoute|pon|toca|reproduce|coloca|bota|toque|включи|поставь|เล่น|เปิด|ใส่)(?:[- ]moi|[- ]me|me)?\s+(.+?)\s+(?:on|sur|en|no|na|в|บน|ใน)\s+youtube/i;
// "mets Bohemian Rhapsody", "joue-moi du Daft Punk", "play some Queen": a song, or a game to play
const PLAY_ASK = /^(?:capri,?\s+)?(?:mets|met|joue|play|put on|pon|toca|coloca|bota|toque|включи|поставь|เล่น|เปิด|ใส่)(?:[- ]moi|[- ]me|me|ให้ฉัน)?\s+(.{2,100})$/iu;
// "joue à Brawlhalla", "play the game…": a game, not a song
const GAME_ASK = /^(?:capri,?\s+)?(?:joue|play|เล่น)\s+(?:à|au|aux|a|the game|เกม)\s/i;
// "du Daft Punk", "some Queen": who to play, without the "some"
const songOf = (s) => s
  .replace(/^(?:la |le |une? |the |some )?(?:musique|music|chanson|son|morceau|song|track|songs)\s+(?:de |d['’]|du |by |of )?/i, '')
  .replace(/^(?:(?:du|de la|de l['’]|des|de|some|un peu de|del|un poco de|algo de|um pouco de)\s+|d['’])/i, '')
  .replace(/\s+(?:on|sur|en|no|na|в)\s+youtube\s*$/i, '')
  .trim();
// "démarre YouTube et mets la musique de Daft Punk": the song asked for after an "and"
const PLAY_AFTER = /\s(?:et|and|y|e|и)\s+(?:mets|met|joue|play|put on|pon|toca|coloca|bota|включи|поставь|démarre|demarre|lance|start|launch|écoute|ecoute)(?:[- ]moi|[- ]me)?\s+(.{2,100})$/i;
// "lance la musique de Daft Punk", "start the song X": an app verb, but music right after it
const MUSIC_START = /^(?:capri,?\s+)?(?:lance|démarre|demarre|start|launch|écoute|ecoute|pon|toca)(?:[- ]moi|[- ]me)?\s+(?:la |le |une? |the |some )?(?:musique|music|chanson|son|morceau|song|track|canci[óo]n|m[úu]sica|песню|музыку)\s+(.{2,100})$/i;
// "mets ce que tu veux", "play whatever you want": she picks (her tag)
const HER_PICK = /tu veux|ton choix|surprends|you want|whatever|your choice|surprise me|quieras|tu elecci[óo]n|quiser|sua escolha|хочешь|на твой выбор|อะไรก็ได้|ตามใจ|เซอร์ไพรส์|เลือกเอง/i;
// what's left when it doesn't say which song ("mets de la musique", "play something")
const VAGUE_SONG = /^(?:(?:de\s+la|du|des|la|le|les|une?|some|a|the|un|algo\s+de|alguma|um|uma|что-нибудь)\s+)?(?:musique|music|son|sons|chanson|morceau|truc|quelque\s+chose|something|song|tunes?|m[úu]sica|canci[óo]n|algo|coisa|музыку|песню)?\s*[.!?]*$/iu;
// "trouve mon CV", "où est le pdf du contrat", "find my report", "найди файл…": her search verbs, and
// what makes it a file on your PC or a search on the web
const SEARCH_VERB = /(?:cherche|recherche|trouve|retrouve|où (?:est|sont)|search(?: for)?|find|look (?:for|up)|where(?:'s| is| are)|busca|encuentra|d[óo]nde est[áa]n?|procura|acha|onde est[áa]o?|найди|поищи|где|หา|ค้นหา|หาไฟล์|หาที่ไหน|อยู่ที่ไหน)/i;
const FILE_WORD = /fichier|dossier|document|photo|image|vid[ée]o|\bpdf\b|\bfiles?\b|folder|archivo|carpeta|arquivo|pasta|файл|папк|\.\w{2,4}\b|sur mon (?:pc|ordi)|dans mes fichiers|on my (?:pc|computer)|en mi (?:pc|ordenador)|no meu (?:pc|computador)|на (?:компьютере|пк)/i;
const WEB_WORD = /google|กูเกิ[ลิ]|กูเกิ้ล|ในเน็ต|อินเทอร์เน็ต|internet|\ble web\b|the web|\bonline\b|en ligne|в интернете|в гугле/i;
// "fais une capture d'écran", "take a screenshot"
const SHOT_ASK = /capture d['’][ée]cran|screenshot|screen ?shot|captura de (?:pantalla|tela)|скриншот|снимок экрана|แคปหน้าจอ|ถ่ายหน้าจอ|สกรีนช็อต|จับภาพหน้าจอ/i;
// the words that aren't what to look for
const NOT_SEARCHED = new Set(('stp svp please pls peux tu can you could would puedes pode можешь moi me le la les l mon ma mes '
  + 'un une des du de d the my a an for of el mi mis o meu minha meus мой мою мои sur dans on in en no na на в pc ordi ordinateur '
  + 'computer ordenador computador компьютере fichier fichiers dossier dossiers document documents photo photos image images '
  + 'vidéo vidéos video videos file files folder folders archivo archivos carpeta carpetas arquivo arquivos pasta pastas файл '
  + 'файлы папка папку appelé appelée nommé called named llamado chamado qui s appelle est sont is are where où cherche recherche '
  + 'trouve retrouve search find look up busca encuentra procura acha найди поищи где dónde onde google internet web online ligne').split(' '));
// the kind of file asked for: "mon projet after effect" is a .aep
const FILE_TYPES = [
  [/after ?effects?/i, ['aep']], [/premi[eè]re/i, ['prproj']], [/photoshop|\bpsd\b/i, ['psd']], [/illustrator/i, ['ai']],
  [/blender/i, ['blend']], [/cinema ?4d|\bc4d\b/i, ['c4d']], [/fl ?studio/i, ['flp']], [/ableton/i, ['als']],
  [/\bword\b|\bdocx?\b/i, ['docx', 'doc']], [/excel|\bxlsx?\b|tableur|spreadsheet/i, ['xlsx', 'xls', 'csv']],
  [/powerpoint|\bpptx?\b|diapo|slides/i, ['pptx', 'ppt']], [/\bpdf\b/i, ['pdf']],
  [/vid[ée]os?\b|\bmp4\b|\bfilms?\b|v[íi]deo|видео/i, ['mp4', 'mov', 'mkv', 'avi', 'webm']],
  [/photos?\b|images?\b|\bpng\b|\bjpe?g\b|imagen|imagem|фото/i, ['png', 'jpg', 'jpeg', 'webp', 'heic']],
  [/musiques?\b|\bmp3\b|\baudio\b|\bsongs?\b|музык/i, ['mp3', 'wav', 'flac', 'm4a', 'ogg']],
  [/\bzip\b|\barchive|\brar\b|\b7z\b/i, ['zip', 'rar', '7z']],
];
const fileTypes = (text) => [...new Set(FILE_TYPES.filter(([re]) => re.test(text)).flatMap(([, exts]) => exts))];
// words that only say what kind of file it is, or what to do with it once found
const NOT_A_NAME = new Set(('and et y e и it ça ca lo la o open ouvre ouvrir ouvres abre abrir открой show montre affiche '
  + 'projet projets project projects proyecto projeto проект after effect effects premiere pro photoshop illustrator blender cinema '
  + '4d c4d fl studio ableton word excel powerpoint pdf mp4 mp3 png jpg jpeg zip rar 7z film films musique musiques music song songs '
  + 'audio présentation presentation diapo slides tableur spreadsheet dernier dernière derniers last latest récent récents recent '
  + 'nouveau new psd docx doc xlsx pptx').split(' '));
// "…and open the folder", "…et ouvre-le": what to do with what she found
const THEN_FOLDER = /(?:ouvre|ouvrir|open|show|montre|abre|abrir|открой|покажи|เปิด|แสดง)\s+(?:moi\s+|ฉัน\s+)?(?:le |la |the |its |son |el |a |o |โฟลเดอร์|folder )?(?:dossier|folder|carpeta|pasta|папку|โฟลเดอร์)/i;
const THEN_OPEN = /(?:et|and|y|e|и)\s+(?:l['’])?(?:ouvre|open|lance|abre|открой)(?:[- ](?:le|la|les)|\s+(?:it|them|lo|la|o|его|её))?\s*[.!?]*$/i;
// Which Google tab you want, read off what you said: images, videos, news, shopping, or the map
const TABS = [
  ['isch', /รูป(?!แบบ|ร่าง|ทรง)|ภาพถ่าย|ภาพวาด|ภาพประกอบ|ภาพพื้นหลัง|(?<!ส)ภาพ|วอลเปเปอร์|\bimages?\b|\bphotos?\b|\bpictures?\b|\bpics?\b|wallpapers?|im[áa]genes|fotos?|изображени|картинк|фото/i],
  ['vid', /วิดีโอ|วีดีโอ|คลิป|\bvideos?\b|vid[ée]os?|видео/i],
  ['nws', /ข่าว|\bnews\b|actualit|noticias|not[íi]cias|новост/i],
  ['shop', /ช็อปปิ้ง|ช้อปปิ้ง|ช็อป|ซื้อ|\bshop(?:ping)?\b|\bbuy\b|acheter|comprar|купить/i],
];
const MAP_WORD = /google\s*maps?|\bmaps?\b|แผนที่|แมพ|แมป|ใกล้(?:ฉัน|ผม|ๆ|เคียง|ที่นี่)|near ?me|nearby|à proximité|cerca de m[íi]|perto de mim|рядом/i;
// "…and plan the route", "navigate to…", "from A to B": a route on Google Maps, not a page of results
const ROUTE_WORD = /(?:วาง|กำหนด|หา|ดู|ขอ|แนะนำ|บอก|ช่วย)เส้นทาง|นำทาง|เส้นทางไป|เส้นทาง(?:ที่)?(?:ใช้)?(?:ใน)?การเดินทาง|วิธี(?:การ)?(?:เดินทาง)?ไป|ไปยังไง|ไปทางไหน|directions?\s+(?:to|from)|route\s+(?:to|from)|navigate\s+to|how (?:do i|to) (?:get|go) to|itin[ée]raire|ruta a|rota para|маршрут/i;
const ROUTE_FILLER = /(?:และ|แล้ว|ช่วย)?\s*(?:วาง|กำหนด|แนะนำ|ขอ|หา|ดู|บอก)?เส้นทาง(?:ที่)?(?:ใช้)?(?:ใน)?(?:การ)?(?:เดินทาง|ขับรถ|ขับ|ไป)?|นำทาง|วิธี(?:การ)?(?:เดินทาง)?|ไปยังไง|ไปทางไหน|(?:ด้วย|โดย)?(?:รถไฟฟ้า|รถไฟ|รถเมล์|รถเมย์|รถยนต์|เดินเท้า|มอเตอร์ไซค์|มอไซค์|จักรยาน)|directions?|route|navigate/giu;
function routeAsk(text) {
  if (!ROUTE_WORD.test(text)) return null;
  const mode = /มอเตอร์ไซค์|มอไซ|จักรยานยนต์|motorcycle|two-?wheeler/i.test(text) ? 'two-wheeler'
    : /เดินไป|เดินเท้า|\bwalk/i.test(text) ? 'walking'
      : /รถไฟ|รถเมล์|รถเมย์|รถประจำทาง|ขนส่งสาธารณะ|รถสาธารณะ|\bbts\b|\bmrt\b|บีทีเอส|เอ็มอาร์ที|\btransit\b|\bbus\b|subway|m[ée]tro|transports? en commun/i.test(text) ? 'transit'
        : /จักรยาน|ปั่น|\bbik(?:e|ing)\b|cycl|v[ée]lo/i.test(text) ? 'bicycling' : 'driving';
  const place = (s) => searched(String(s || '').replace(ROUTE_FILLER, ' '));
  let from = '', to = '';
  let m = /จาก\s*(.+?)\s*(?:ไปยัง|ไปที่|ไป|ถึง)\s*(.+)$/u.exec(text) || /\bfrom\s+(.+?)\s+to\s+(.+)$/i.exec(text);
  if (m) [from, to] = [place(m[1]), place(m[2])];
  else {
    m = /(?:นำทาง|เส้นทาง|ขับรถ|ขับ|เดินทาง|เดิน|วิธี(?:การ)?|พา)\s*(?:ไปยัง|ไปที่|ไป)\s*(.+)$/u.exec(text) || /ไปยัง\s*(.+)$/u.exec(text)
      || /(?:directions?|route|navigate|get|go)\s+to\s+(.+)$/i.exec(text);
    to = place(m ? m[1] : text);
  }
  return to ? { from, to, mode } : null;
}
// Thai has no spaces: the verbs and fillers around what you look for come off by pattern
const THAI_FILLER = /ช่วย|ค้นหา(?:ให้)?|(?<![\p{L}\p{M}])หา(?:ให้)?|หน่อย|ด้วย|ให้ฉัน|ให้หน่อย|ใน\s*(?=google|กูเกิ|เน็ต|อินเทอร์เน็ต|เว็บ|map|แผนที่)|(?:ใน|บน)\s*(?:google\s*maps?|แผนที่)|กูเกิ[ลิ้]*|แผนที่|(?<![\p{L}\p{M}])ใน(?![\p{L}\p{M}])|(?<![\p{L}\p{M}])(?:และ|แล้ว|ที่)(?![\p{L}\p{M}])/giu;
const searched = (text) => text.replace(/^\s*capri[,!:]?\s+/i, '').replace(THAI_FILLER, ' ').replace(/google\s*maps?|\bmaps?\b/gi, ' ').toLowerCase().split(/[^\p{L}\p{M}\p{N}.]+/u)
  .filter((w) => w && !NOT_SEARCHED.has(w)).join(' ');
// a Roblox game by its name: "in my roblox play steal a brain rot", "lance grow a garden sur roblox"
const ROBLOX_VERB = /(?:^|\s)(?:play|joue(?:r)?(?: à| a)?|lance|launch|start|ouvre|open|mets|go to|va sur|juega(?: a)?|jogue|jogar|запусти|включи)\s+/gi;
function robloxGame(text) {
  if (!/roblox/i.test(text)) return null;
  let rest = null;
  for (const m of text.matchAll(ROBLOX_VERB)) rest = text.slice(m.index + m[0].length); // after the last verb
  if (!rest) return null;
  const name = rest
    .replace(/\s+(?:on|in|sur|dans|en|no|na|в)\s+(?:my\s+|mon\s+|mi\s+|meu\s+)?roblox\b.*$/i, '')
    .replace(/\broblox\b/ig, '')
    .replace(/^(?:à|a|au|to|le jeu|the game|un jeu|el juego|o jogo)\s+/i, '')
    .replace(/\s+(?:stp|svp|please|pls|por favor)\b.*$/i, '')
    .replace(/[\s.!?,]+$/, '')
    .trim();
  return name.length >= 2 ? name : null;
}
// "regarde mon écran", "tu vois quoi ?", "what's on my screen?", "что ты видишь?"
const LOOK_ASK = /regarde (?:mon|l['’]|ce que)|(?:jette|jeter) un (?:œil|oeil)|tu vois quoi|qu['’]est[- ]ce que tu vois|look at (?:my|the|this) screen|what(?:'s| is) on my screen|what do you see|take a look|mira (?:mi|la) pantalla|qu[ée] ves|olha (?:minha|a) tela|o que voc[êe] v[êe]|посмотри на (?:мой )?экран|что ты видишь|ดูหน้าจอ|มองหน้าจอ|เห็นอะไร|ดูหน้าจอฉัน|หน้าจอฉันเป็นยังไง/i;
// what her tag needs to find in your message before it does anything: a small model tags answers about
// anything ("[[music: synthwave]]" under a film tip), and music and the media keys act right away
const LISTEN = /[ée]cout|listen|escuch|\bouv(ir|e)\b|слуша|playlist|album|\b(play|joue|mets|pon|toca|coloca)\b|включи|поставь|ฟัง|เปิดเพลง|เล่นเพลง/i;
const SOUND = /\b(sound|volume|volumen)\b|\b(le|du|au) son\b|\bo som\b|звук|громк|เสียง|วอลุ่ม/i; // not "son": "his" in French
const PLAY = /\bjou(er|e)\b|\bplay\b|jugar|juega|jogar|joga|играть|поигра|เล่นเกม|เล่น/i;
const SITE = /\b(site|web|page|lien|link|url|enlace|p[aá]gina)|сайт|ссылк|เว็บ|เว็บไซต์|ลิงก์|\.(com|fr|org|net|io|gg|tv|be|ch|ca|es|br|pt|ru|th)\b/i;
// "appelle-moi Max", "call me Max", "llámame Max", "me chama de Max", "зови меня Макс"
const NAME_ASK = /(?:appelle[- ]moi|call me|my name is|je m['’]appelle|ll[aá]mame|me llamo|me cham[ae] de|meu nome [eé]|зови меня|меня зовут|เรียกฉัน(?:ว่า)?|ชื่อฉัน(?:คือ)?|ฉันชื่อ)\s+([\p{L}\p{N}'’-]{1,24})/iu;
// "souviens-toi que…", "remember that…", "recuerda que…", "lembra que…", "запомни, что…" (said first thing)
const MEMO_ASK = /^\s*(?:capri,?\s+|stp,?\s+|please,?\s+)?(?:souviens[- ]toi(?: que| de)?|n['’]oublie pas(?: que| de)?|remember(?: that)?|recuerda(?: que)?|lembr[ae](?:-se)?(?: que| de)?|запомни,?(?: что)?|จำไว้(?:ว่า)?|อย่าลืม(?:ว่า)?|จำ(?:ไว้)?ว่า)\s+(.{3,200})/iu;
const MEMORIES_MAX = 30;
// sites asked for by name ("open youtube") when no app on the PC goes by it: the address is hers, not
// the model's, so it opens right away like an app you named
const SITES = {
  youtube: 'https://www.youtube.com', google: 'https://www.google.com', gmail: 'https://mail.google.com',
  twitch: 'https://www.twitch.tv', netflix: 'https://www.netflix.com', reddit: 'https://www.reddit.com',
  twitter: 'https://x.com', instagram: 'https://www.instagram.com', tiktok: 'https://www.tiktok.com',
  facebook: 'https://www.facebook.com', github: 'https://github.com', chatgpt: 'https://chatgpt.com',
  wikipedia: 'https://www.wikipedia.org', linkedin: 'https://www.linkedin.com', pinterest: 'https://www.pinterest.com',
  crunchyroll: 'https://www.crunchyroll.com', outlook: 'https://outlook.live.com', whatsapp: 'https://web.whatsapp.com',
  discord: 'https://discord.com/app', soundcloud: 'https://soundcloud.com', deezer: 'https://www.deezer.com',
};
// a browser named with a site ("open youtube on chrome"): the site, in the browser you use
const BROWSER = /chrome|edge|firefox|opera|brave|vivaldi|duckduckgo|browser/i;
// local models this small mostly talk nonsense ("llama3.2:1b", "qwen2.5:0.5b"…)
const TINY = /[:-](0\.5b|1b|1\.5b|135m|270m|360m)\b/i;
// her face when she greets you in a mood (bond.js)
const MOOD_FACE = { angry: 'many', sulk: 'aside', dizzy: 'wide', thrown: 'wide', jealous: 'look', fun: 'laugh', happy: 'laugh', forgiven: 'smug' };

export class Chat {
  constructor({ capri, panel, voice, host, brain }) {
    this.capri = capri;
    this.panel = panel;
    this.voice = voice;
    this.host = host;
    this.brain = brain;
    this.history = []; // your chats with her, [{ role, content }], kept by main.js across restarts
    this.shareOk = false; // may her model read what she finds on this PC (a model on this PC only: main.js decides, again, for every request)
    this.netNote = '';
    this.summary = ''; // rolling summary of turns that slid out of REMEMBER (survives restarts via config)
    this.summarising = false; // guard: only one background summarise at a time
    this.summaryId = 0;
    this.summaryMark = null;  // key of the last message the summary already covers (so each turn is summarised once)
    this.warm = false; // a model already answered this run (Ollama's first answer waits for it to load)
    this.open = false;
    this.turn = 0;     // id of the answer coming in, if any
    this.answer = '';
    this.apps = [];    // the apps open on this PC, as last listed: [{ name, label }]
    this.appsReady = Promise.resolve();
    this.onSetup = null; // (status) => void: she can't answer yet (app.js hands it to setup.js)
    this.onBetterModel = null; // () => void: a bigger model than the tiny one she's on (setup.js)
    this.reminders = null; // the reminders she keeps (reminders.js, from app.js)
    this.bond = null;      // how close she is to you (bond.js)
    this.jealousy = null;  // and how she takes your other AIs
    this.onMessage = null; // () => void: you said something to her
    this.waitingWhen = null; // a reminder you asked for without saying when: { text, until }
    this.remindUI = new RemindUI(this); // duplicates, the list, changing the time (remind-ui.js)
    host.onChatDelta(({ id, text }) => this.onDelta(id, text));
  }

  get t() {
    return this.brain.t.chat;
  }

  async start() {
    const { capri, host, t } = this;
    if (this.open) {
      // really there? Something of hers (a reminder, a notice) can take her panel over and leave it empty: the chat
      // is then rebuilt below instead of being taken for "already open" (which left a black bar nobody could type in)
      const alive = this.panel.visible && this.panel.current?.chat && this.panel.chatInput;
      if (alive) {
        this.panel.chatInput.focus();
        return;
      }
      this.open = false;
      this.turn = 0;
      host.focusOverlay(false);
    }
    if (capri.stowed) {
      host.setConfig({ visible: true });
      await capri.unstow();
    }
    capri.wake();
    this.listApps(); // asked for now, in parallel: her first answer waits for it (up to 1.5 s)
    const status = await host.chatStatus();
    if (!status.ok && this.onSetup) {
      this.onSetup(status); // nothing to talk with yet: she sets it up with you, with buttons (setup.js)
      return;
    }
    if (!status.ok) {
      // no Ollama, or nothing to talk with yet: what to do about it
      const offline = status.error === 'offline';
      const other = !offline && status.error !== 'nomodel'; // another provider, saying why
      capri.perform('curious', capri.towardCenter());
      this.panel.say({
        kind: 'info',
        face: 'aside',
        guide: true,
        line: other ? t.failed : offline ? t.offline : t.noModel,
        quote: other ? status.error : offline ? t.offlineHow : t.noModelHow,
        actions: offline
          ? [{ id: 'get', label: t.getOllama, primary: true }, { id: 'ok', label: t.ok }]
          : [{ id: 'ok', label: t.ok, primary: true }],
        onAction: (id) => {
          if (id === 'get') host.openOllama();
          this.panel.hide();
        },
        hold: null,
      });
      return;
    }
    this.history = cleanHistory(await host.chatMemory().catch(() => this.history)); // "forget" in her menu may have emptied it
    // load the rolling summary that was saved the last time old turns were compressed
    try {
      const saved = (await host.chatSummary()) || '';
      let parsed = null;
      try { parsed = JSON.parse(saved); } catch { /* an older plain-text summary */ }
      if (parsed && typeof parsed.t === 'string') {
        this.summary = parsed.t;
        this.summaryMark = parsed.m || this.summaryMark;
      } else {
        this.summary = saved;
        // an older summary covered everything up to the live window
        if (saved && !this.summaryMark && this.history.length > REMEMBER) this.summaryMark = keyOf(this.history[this.history.length - REMEMBER - 1]);
      }
    } catch { this.summary = ''; }
    this.cold = status.warmup && !this.warm;
    this.agent = Boolean(status.agent); // Claude Code answers, as her, and really works in your project
    const shortModel = status.model.replace(/:latest$/, '').replace(/^models\//, ''); // Ollama's tag, Gemini's prefix
    const tiny = status.provider === 'ollama' && TINY.test(status.model) && this.onBetterModel;
    // angry, sulking, dizzy…: she greets you the way she feels, and her model is told she did
    const feeling = this.bond?.feeling;
    const moody = !tiny && feeling && t.moody[feeling];
    const hello = moody ? fmt(pick(moody), this.bond.mood.vars) : pick(this.history.length ? t.again : t.hello);
    this.opening = moody ? hello : null;
    host.focusOverlay(true); // the keyboard, for typing to her
    const shown = this.panel.say({
      kind: 'chat',
      face: moody ? MOOD_FACE[feeling] : 'look',
      badge: t.badge,
      tag: shortModel,
      line: tiny ? fmt(t.tiny, { model: shortModel }) : hello,
      actions: tiny ? [{ id: 'better', label: t.better, primary: true }] : [],
      onAction: () => {
        this.panel.hide(); // her chat holds off her guide's panels: it goes first
        this.onBetterModel?.();
      },
      chat: {
        placeholder: t.placeholder,
        send: t.send,
        close: t.close,
        noteTag: t.noteTag,
        note: status.local ? t.note : t.noteCloud,
      },
      onSend: (text) => this.send(text),
      onLeave: () => this.close(),
      hold: null,
    });
    if (!shown) {
      host.focusOverlay(false); // something more important is on (a permission prompt)
      return;
    }
    this.open = true;
    setTimeout(() => this.panel.chatInput.focus(), 150); // once the overlay has the keyboard
    capri.perform('hop');
    capri.nextMove = capri.nextGaze = performance.now() + STAY_MS;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    if (this.turn) this.host.chatStop(this.turn);
    this.turn = 0;
    this.host.focusOverlay(false);
    this.capri.nextMove = performance.now() + 30000;
    this.capri.nextGaze = performance.now() + 60000;
  }

  async send(text) {
    if (this.turn || !this.open) return;
    try {
      await this.sendInner(text);
    } catch (err) {
      // a turn must never leave the chat stuck (input disabled, an empty answer with a cursor, nothing coming)
      console.error('[capri] chat turn failed:', err);
      if (this.turn) this.host.chatStop(this.turn);
      this.turn = 0;
      if (this.history.at(-1)?.role === 'user' && this.history.at(-1).content === text) this.history.pop();
      if (this.open) {
        this.panel.setFace('wide');
        this.panel.stream(`${this.t.failed} ${err?.message || ''}`.trim(), { done: true });
        this.panel.setChatBusy(false);
      }
    }
  }

  async sendInner(text) {
    if (this.turn || !this.open) return;
    // the summary being written in the background must not keep her waiting: Ollama answers one request at a time
    if (this.summarising && this.summaryId) this.host.chatStop(this.summaryId);
    const id = Date.now();
    this.turn = id;
    this.answer = '';
    this.history.push({ role: 'user', content: text });
    this.panel.setChatBusy(true);
    this.panel.setActions([]); // a close button she offered before goes with a new message
    this.panel.chatTurn({ quote: text, face: 'aside' });
    this.capri.pulse();
    this.onMessage?.();
    // "what did I ask you?", "what have we talked about?": the facts come from the real log (never from the
    // model's memory, which a 7B model invents); the model then says them in her own voice, and the answer is
    // checked against the facts. If it strays, the plain retrieved answer is shown instead.
    await this.refreshShare(); // first: everything below that may reach a model depends on it
    const recall = this.agent ? null : recallIntent(text);
    const history0 = this.history.slice(0, -1);
    const recallOpts = { summary: this.summary, lang: this.brain.lang, name: this.brain.custom?.userName || '', partial: this.history.length >= KEEP };
    // the facts go to her model, so they come only from what that model may read; the plain answer is shown here, on screen
    const facts = recall && recall.kind !== 'general' ? recallFacts(recall, this.visible(history0)) : [];
    const plain = recall && recall.kind !== 'general' ? answerRecall(recall, history0, recallOpts) : null;
    if (plain && !facts.length) {
      // nothing to recall yet: said plainly
      this.turn = 0;
      this.panel.setChatBusy(false);
      this.panel.setFace(plain.face);
      this.panel.stream(plain.line, { done: true });
      this.remember({ role: 'assistant', content: plain.line });
      this.bond?.heard(text);
      return;
    }
    const grounded = facts.length ? factsNote(recall, facts) : '';
    // what you asked for plainly happens right away (the music, the volume, an app you named): her
    // line about it comes under her answer (Claude Code, answering her chat, does things its own way)
    const asked = (this.agent || grounded || recall?.reminder) ? null : this.asked(text);
    if (asked?.kind === 'look') return this.sendLook(text, id);
    // PC actions ที่จับจากข้อความได้ชัด: ทำทันที จบด้วยข้อความสั้น — ไม่ส่งโมเดล (7B มักแต่งข้อความปน)
    // close / cleanup / ram ใช้ปุ่มยืนยัน; status / open / media / music / … ทำเลย
    if (asked && !this.agent) {
      if (asked.kind === 'cleanup') {
        this.turn = 0; this.panel.setChatBusy(false);
        this.offerCleanup('…');
        return;
      }
      if (asked.kind === 'ram') {
        this.turn = 0; this.panel.setChatBusy(false);
        this.offerClearRam('…');
        return;
      }
      if (asked.kind === 'close') {
        this.turn = 0; this.panel.setChatBusy(false);
        this.offerClose(asked.name, '…');
        return;
      }
      if (asked.kind === 'net') {
        this.turn = 0; this.panel.setChatBusy(false);
        const q = this.history.at(-1);
        if (q?.role === 'user') q.private = true; // "scan 192.168.1.20": never goes to a model that is not on this PC
        this.runNet(asked.what);
        return;
      }
      if (asked.kind === 'status') {
        this.turn = 0; this.panel.setChatBusy(false);
        this.runStatus(asked.what);
        return;
      }
      if (asked.kind === 'hack') {
        // her demo: a fake login page and a make-believe dictionary attack on it, played on screen (hacksim.js)
        this.turn = 0; this.panel.setChatBusy(false);
        const line = this.t.hackOk || 'ได้เลย choom! เดี๋ยวฉันเปิดเว็บปลอมของฉันเอง แล้วลองเดารหัสให้ดู (เป็นแค่ฉาก ไม่มีของจริง) คุณช่วยใบ้หรือเปิดกันเดาสู้ฉันได้นะ 😏';
        this.panel.setFace('smug');
        this.panel.stream(line, { done: true });
        this.remember({ role: 'assistant', content: line });
        setTimeout(() => { try { this.onHack(); } catch (err) { console.error('[capri] hack demo', err); } }, 900);
        return;
      }
      // open / media / music / youtube / roblox / web / files / shot / play / name / memo / remind
      if (['open', 'media', 'music', 'youtube', 'roblox', 'web', 'files', 'shot', 'play', 'name', 'memo', 'remind', 'remindOp'].includes(asked.kind)) {
        const done = await this.doNow(asked);
        if (this.turn !== id) return; // closed meanwhile
        this.turn = 0;
        this.panel.setChatBusy(false);
        if (done?.offer) return this.launch(done.offer, '');
        if (done?.files) {
          // search / screenshot: show results + open buttons (same as after())
          this.panel.setFace(done.face || 'smug');
          this.panel.stream(done.line, { done: true });
          this.remember({ role: 'assistant', content: done.line });
          const [first, second] = done.files;
          const actions = [{ id: 'open', label: fmt(this.t.openIt, { app: first.name }), primary: true }];
          if (second) actions.push({ id: 'second', label: fmt(this.t.openIt, { app: second.name }) });
          if (first.path) actions.push({ id: 'folder', label: this.t.showFolder });
          this.panel.setActions(actions, (id) => {
            if (id === 'folder') return this.host.openFile(first.path, true);
            return this.host.openFile((id === 'second' ? second : first).path);
          });
          return;
        }
        if (done?.reminder) {
          this.panel.setFace(done.face || 'smug');
          this.panel.stream(done.line, { done: true });
          this.remember({ role: 'assistant', content: done.line });
          const tr = this.brain.t.remind;
          this.panel.setActions([{ id: 'cancel', label: tr.cancel }], () => {
            this.reminders.remove(done.reminder);
            this.panel.setActions([]);
            this.panel.stream(tr.cancelled, { done: true });
            this.remember({ role: 'assistant', content: tr.cancelled });
          });
          return;
        }
        if (done?.menu) {
          // a list / a question with its own buttons (remind-ui.js)
          this.panel.setFace(done.face || 'smug');
          this.panel.stream(done.line, { done: true });
          this.remember({ role: 'assistant', content: done.line });
          this.panel.setActions(done.menu.actions, done.menu.onAction);
          return;
        }
        if (done?.line) {
          this.panel.setFace(done.face || 'laugh');
          this.panel.stream(done.line, { done: true });
          this.remember({ role: 'assistant', content: done.line });
          return;
        }
        // ทำไม่ได้ / หาไม่เจอ — ปล่อยให้โมเดลตอบต่อ
        // (this turn is on again: it was ended above for the cases that answered by themselves. Left ended, the model's
        // answer was thrown away as "closed meanwhile" and the chat sat empty with a cursor.)
        this.turn = id;
        this.panel.setChatBusy(true);
      }
    }
    const early = null; // PC actions above already finished or fell through to the model
    this.bond?.heard(text); // "sorry": she lets it go
    await Promise.race([this.appsReady, new Promise((r) => setTimeout(r, 1500))]);
    // what she greeted you with (angry, sulking…), in the conversation before your message, so her
    // answer carries on from it (after another answer of hers: added to that one, never two in a row)
    if (this.opening) {
      const at = this.history.length - 1;
      const before = this.history[at - 1];
      if (before?.role === 'assistant') this.history[at - 1] = { ...before, content: `${before.content}\n${this.opening}` };
      else this.history.splice(at, 0, { role: 'assistant', content: this.opening });
      this.opening = null;
    }

    const who = this.brain.custom?.userName || (this.brain.lang === 'th' ? 'นาย' : 'you');
    const recalling = !this.agent && (Boolean(recall) || RECALL.test(text)); // about the conversation: no examples beside the real thing
    const shots = (this.agent || recalling) ? [] : (SHOTS[this.brain.lang] || []).flatMap(([q, a]) => [{ role: 'user', content: q }, { role: 'assistant', content: a.replace(/\{name\}/g, who) }]);
    // inject the rolling summary (if any) as a second system message so the model knows what
    // was said before the sliding window — without spending full tokens on verbatim old turns
    const summaryMsg = (!this.agent && this.safeSummary())
      ? [{ role: 'system', content: `[สรุปคร่าว ๆ ของบทสนทนาจริงก่อนหน้านี้ (ไม่ใช่ตัวอย่าง) — ใช้เป็นบริบท อย่าพูดซ้ำตรง ๆ]:\n${this.safeSummary()}` }]
      : [];
    const messages = [{ role: 'system', content: this.persona(text) }, ...summaryMsg, ...shots, ...this.visible(this.history).slice(-REMEMBER)];
    // Her mood (angry, sulking…) and her language, said again right by your message, for this answer
    // only. Small local models mostly go by the last thing they read: up in her prompt alone, they
    // forget it (and answer in English after a conversation in English).
    // Also: a topic anchor — the last thing before generation — so the model answers what was actually
    // asked instead of drifting. Kept short so it doesn't crowd out the mood/language note.
    if (!this.agent) {
      const mood = this.bond?.moodLine().replace(/^Right now: /, '');
      const last = messages.at(-1);
      const userSnippet = text.replace(/\s+/g, ' ').trim().slice(0, 120);
      // Thai: the language note below already says it. A 7B model reads a second instruction, and above
      // all one quoting the user, as the user telling it off, and answers that it is sorry.
      const topicAnchor = this.brain.lang === 'th' ? '' : `Answer what the user said first: "${userSnippet}", then one small playful touch.`;
      const clockNote = TIME_ASK.test(text) ? `Right now it's ${new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date())}, the user's time.` : '';
      // weather asked: real data from wttr.in goes in as a note, so she answers from it and invents nothing
      let weatherNote = '';
      if (asked?.kind === 'weather') {
        this.panel.stream('เดี๋ยวฉันแอบมองฟ้าให้นะ…');
        const w = await this.host.pcStatus(`weather:${asked.place || ''}`).catch(() => null);
        weatherNote = w?.ok && w.text
          ? `Real weather data just fetched (answer from this only, say the main numbers in your own words, never invent more): ${w.text}`
          : 'You tried to look up the weather but it failed. Say so briefly in character and never make up any weather.';
      }
      messages[messages.length - 1] = { ...last, content: `${last.content}\n\n(Note for you, never repeat it: ${[topicAnchor, clockNote, weatherNote, grounded || this.recallNote(text), mood, this.languageNote()].filter(Boolean).join(' ')})` };
    }
    // nothing yet after a few seconds: Ollama is still loading the model (the first answer after a start),
    // or Claude Code is at work
    const wait = this.agent ? this.t.working : this.cold ? this.t.loading : null;
    const slow = wait && setTimeout(() => {
      if (this.turn === id && !this.answer) this.panel.stream(wait);
    }, LOADING_AFTER_MS);
    // a model that stops answering (Ollama stuck, a cloud model hanging) must not leave her busy forever
    const stall = setTimeout(() => { if (this.turn === id) this.host.chatStop(id); }, 150000);
    const res = await this.host.chatSend({ id, messages });
    clearTimeout(stall);
    clearTimeout(slow);
    if (this.turn !== id) {
      // closed meanwhile: your message goes too, or the next answer would answer it as well
      if (this.history.at(-1)?.content === text) this.history.pop();
      return;
    }
    this.turn = 0;
    if (!res.ok) {
      this.history.pop();
      this.panel.setFace('wide');
      // too busy or gone even after trying other models (main.js): said plainly, not the server's JSON
      this.panel.stream(res.code === 'busy' ? this.t.swamped : res.code === 'gone' ? this.t.gone : `${this.t.failed} ${res.error}`, { done: true });
      this.panel.setChatBusy(false);
      return;
    }
    // a looping answer never goes into her memory: it would teach the next one to loop
    const raw = polish(clean(res.text), this.lastAnswer(), this.brain.custom?.userName);
    const looped = /(ขอโทษนะ[\s\S]*){2,}|(ฉันคือ\s*Capri[\s\S]*){2,}/.test(raw) || LEAK.test(raw);
    let answer = looped ? 'เมื่อกี้เบลอไปแป๊บ choom ลองพูดใหม่นะ' : (grounded ? raw : stopLoop(raw)) || 'อืม… ลองพูดอีกทีนะ';
    // a recall answer that doesn't carry the real facts is a made-up one: the retrieved answer replaces it
    if (grounded && (looped || !verifyRecall(answer, facts))) answer = plain.line;
    this.warm = true;
    if (!looped || grounded) this.remember({ role: 'assistant', content: answer });
    this.panel.stream(answer, { done: true });
    this.panel.setFace(mood(answer));
    this.panel.setChatBusy(false);
    if (!this.agent) this.after(res.text, answer, asked, early, text);
    this.listApps(); // fresh for the next message
    // old turns piling up: summarised now that she's done answering (in the background, never in the way of a reply)
    if (!this.agent && this.history.length > REMEMBER + SUMMARIZE_AFTER) setTimeout(() => this.summarizeOld(), 2500);
  }

  // "Look at my screen" in her chat: she looks (asking you first, the first time) and answers here,
  // the conversation so far in mind.
  async sendLook(text, id) {
    const tl = this.brain.t.look;
    const say = (line, face = 'aside') => {
      if (this.turn !== id) return;
      this.turn = 0;
      this.remember({ role: 'assistant', content: line });
      this.panel.stream(line, { done: true });
      this.panel.setFace(face);
      this.panel.setChatBusy(false);
    };
    if (!this.look.asked) {
      const where = await this.host.lookWhere().catch(() => ({}));
      this.history.pop(); // your message comes back once you've said yes
      say(`${tl.ask} ${fmt(where.local ? tl.local : tl.online, { model: where.model || '…', service: where.provider || '' })}`, 'look');
      this.panel.setActions([{ id: 'yes', label: tl.yes, primary: true }, { id: 'no', label: tl.no }], async (choice) => {
        this.panel.setActions([]);
        if (choice !== 'yes') {
          this.interject(tl.declined, [], null);
          return;
        }
        await this.host.setConfig({ lookAsked: true });
        this.look.asked = true;
        this.send(text);
      });
      return;
    }
    const snap = await this.host.lookSnap();
    if (!snap.ok) return say(fmt(tl.failed, { error: snap.error }));
    this.look.effect();
    const res = await this.host.lookSay({
      id: snap.id,
      persona: this.lookPersona(),
      history: this.visible(this.history.slice(-REMEMBER, -1)),
      prompt: `${text}\n\n(Note for you, never repeat it: the picture is the user's screen right now; a small figure with a big red mane on it is you. Answer about what you really see, in character. ${this.languageNote()})`,
    });
    if (!res.ok) {
      const model = String(res.model || '…').replace(/:latest$/, '');
      return say(res.code === 'novision' ? fmt(tl.noVision, { model }) : res.code === 'noai' ? tl.noAI : fmt(tl.failed, { error: res.error || '…' }));
    }
    const answer = clean(res.text).replace(/^["“«]\s*|\s*["”»]$/g, '') || '…';
    this.seen = { text: answer, at: Date.now() };
    return say(answer, mood(answer));
  }

  // Her greeting once everything is loaded (app.js, 'model' ready): her model writes it, as her, so it's
  // new each time. What it should lean on is picked at random, and her last greetings are listed so it
  // doesn't repeat them (kept across restarts). null: not now (a chat is open) or it came out wrong:
  // the caller falls back to one of her written lines.
  async greet() {
    if (this.open || this.turn || this.agent) return null;
    const hour = new Date().getHours();
    const part = hour < 5 ? 'the middle of the night' : hour < 11 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
    const angle = pick(GREET_ANGLES);
    let recent = [];
    try { recent = JSON.parse(localStorage.getItem('capri.greetings') || '[]').slice(-6); } catch { /* none kept */ }
    const avoid = recent.length ? ` Your earlier greetings, never reuse their words or their opening: ${recent.map((g) => `"${g}"`).join(' ')}.` : '';
    const note = `(Note for you, never repeat it: you have just woken up and all your minds are loaded. Greet the user now with ONE fresh line of at most 18 words, in character, plain text, no question about their work. It is ${part} for them. Lean on this: ${angle}.${avoid} ${this.languageNote()})`;
    const messages = [{ role: 'system', content: this.persona('') }, { role: 'user', content: note }];
    const res = await this.host.chatSend({ id: -Date.now(), messages }).catch(() => null); // a negative id: no chat is waiting for its pieces
    if (!res?.ok) return null;
    const line = stopLoop(polish(clean(res.text), '', this.brain.custom?.userName)).replace(/^["“«]\s*|\s*["”»]$/g, '').trim();
    if (line.length < 4 || line.length > 170 || LEAK.test(line) || recent.includes(line)) return null;
    try { localStorage.setItem('capri.greetings', JSON.stringify([...recent, line].slice(-8))); } catch { /* not kept */ }
    return line;
  }

  // her model reads scan results only if it runs on this PC. The messages about a scan are flagged `private`: anything
  // else (a key, an online or cloud model, Claude Code) never gets them, in her prompt, her summary or her recall notes.
  async refreshShare() { this.shareOk = Boolean((await this.host.modelShare().catch(() => null))?.ok); }
  visible(list) { return this.shareOk ? list : list.filter((m) => !m.private); }
  // the rolling summary is never written from scan messages (summarizeOld), but one saved by an older version may hold some:
  // a model that is not on this PC does not get it
  safeSummary() { return this.shareOk || !SCAN_TRACE.test(this.summary || '') ? this.summary : ''; }
  rememberPrivate(message) { this.remember({ ...message, private: true }); }

  // an answer of hers, kept with your message before it
  remember(message) {
    this.history.push(message);
    this.history = this.history.slice(-KEEP);
    this.host.chatRemember(this.history);
  }

  // Compress the turns that left the live window (REMEMBER) into a short Thai summary, so the model still
  // knows the gist of what was said earlier. Incremental: each turn is summarised once (summaryMark),
  // and nothing is deleted: the whole log stays in this.history for exact recall (recall.js).
  // Runs in the background, one at a time, never during a live answer.
  async summarizeOld() {
    if (this.summarising || this.turn || this.agent) return;
    const edge = this.history.length - REMEMBER; // first message still in the live window
    if (edge <= 0) return;
    const from = (this.summaryMark ? this.history.findLastIndex((m) => keyOf(m) === this.summaryMark) : -1) + 1;
    if (edge - from < SUMMARIZE_AFTER) return;  // not worth a round-trip yet
    // never from scan messages, even when a local model may read them now: the summary is kept and could be sent to another model later
    const chunk = this.history.slice(from, edge).filter((m) => !m.private && !SCAN_TRACE.test(String(m.content || '')));
    const mark = keyOf(this.history[edge - 1]);
    const real = pairs(chunk);                  // without the questions about the conversation itself
    if (!real.length) { this.summaryMark = mark; return; }
    this.summarising = true;
    try {
      const prevNote = this.summary ? `สรุปเดิม (ให้รวมเข้ากับสรุปใหม่): ${this.summary}\n\n` : '';
      const turns = real
        .map((p) => `ผู้ใช้: ${String(p.q).replace(/\s+/g, ' ').slice(0, 200)}${p.a ? `\nCapri: ${String(p.a).replace(/\s+/g, ' ').slice(0, 90)}` : ''}`)
        .join('\n');
      this.summaryId = -Date.now(); // negative id: not a chat turn, never shown; cancelled if you speak meanwhile
      const res = await this.host.chatSend({
        id: this.summaryId,
        messages: [
          {
            role: 'system',
            content: 'คุณเป็นผู้ช่วยจดบันทึกบทสนทนา ตอบเป็นภาษาไทยเท่านั้น ไม่เกิน 6 บรรทัด ขึ้นต้นแต่ละบรรทัดด้วย "- " เขียนเฉพาะสิ่งที่มีอยู่ในบทสนทนาด้านล่างจริง ๆ เท่านั้น: ชื่อที่ผู้ใช้บอก สิ่งที่ผู้ใช้ถามหรือเล่า ข้อเท็จจริง คำสัญญา ห้ามเดา ห้ามแต่งเพิ่ม ห้ามวิเคราะห์ ถ้าไม่แน่ใจให้ข้าม',
          },
          { role: 'user', content: `${prevNote}บทสนทนาใหม่:\n${turns}\n\nจดบันทึกรวมทั้งสรุปเดิมและบทสนทนาใหม่ (ไม่เกิน 6 บรรทัด):` },
        ],
      }).catch(() => null);
      if (!res?.ok) return;
      const next = clean(res.text).slice(0, 600).trim();
      if (next.length < 10 || LEAK.test(next)) return;
      this.summary = next;
      this.summaryMark = mark;
      try { this.host.saveSummary(JSON.stringify({ t: this.summary, m: this.summaryMark })); } catch { /* non-fatal */ }
    } finally {
      this.summarising = false;
    }
  }

  listApps() {
    this.appsReady = this.host.openApps().then((list) => { this.apps = list || []; }).catch(() => {});
  }

  // What you asked plainly, read off your message (a small model doesn't always write its tag right):
  // { kind: 'media', action } | { kind: 'music', song } | { kind: 'close', name } | { kind: 'open', text }
  asked(text) {
    const count = text.trim().split(/\s+/).length;
    if (this.reminders) {
      const op = this.remindUI.parse(text, count);
      if (op) return { kind: 'remindOp', op };
      const remind = parseReminder(text);
      if (remind) return { kind: 'remind', ...remind };
      // the time, said after she asked when ("dans 10 min")
      const w = this.waitingWhen;
      const when = w && Date.now() < w.until && count <= 6 && parseWhen(text);
      if (when && when.at > Date.now()) return { kind: 'remind', at: when.at, text: w.text };
    }
    const name = NAME_ASK.exec(text)?.[1];
    if (name) return { kind: 'name', name };
    const memo = MEMO_ASK.exec(text)?.[1]?.trim();
    if (memo) return { kind: 'memo', text: memo };
    if (this.look && LOOK_ASK.test(text)) return { kind: 'look' };
    const net = netAsk(text);
    if (net) return { kind: 'net', what: net.what };
    if (WEATHER_ASK.test(text) && !WEATHER_NOT.test(text)) return { kind: 'weather', place: weatherPlace(text) };
    if (SHOT_ASK.test(text)) return { kind: 'shot' };
    const roblox = robloxGame(text);
    if (roblox) return { kind: 'roblox', game: roblox };
    const route = routeAsk(text);
    if (route) return { kind: 'web', query: route.to, route };
    if (SEARCH_VERB.test(text) && WEB_WORD.test(text) && searched(text)) {
      let query = searched(text);
      const tab = TABS.find(([, re]) => re.test(text))?.[0] || '';
      const bare = query.replace(/^(?:รูปภาพ|รูป|ภาพ|วิดีโอ|วีดีโอ|คลิป|ข่าว|ซื้อ|images?|photos?|videos?|news)\s*/i, '').trim();
      if (tab && bare) query = bare; // "รูปไก่" in the images tab is just "ไก่"
      return { kind: 'web', query, tab, maps: MAP_WORD.test(text) };
    }
    const exts = fileTypes(text);
    if (SEARCH_VERB.test(text) && (FILE_WORD.test(text) || exts.length)) {
      const query = searched(text).split(' ').filter((w) => w && !NOT_A_NAME.has(w)).join(' ');
      const then = THEN_FOLDER.test(text) ? 'folder' : THEN_OPEN.test(text) ? 'open' : null;
      if (query || exts.length) return { kind: 'files', query, exts, then };
    }
    const media = MEDIA_ASK.find(([, re]) => re.test(text))?.[0];
    if (media && (count <= 5 || MUSIC_WORD.test(text))) return { kind: 'media', action: media };
    const song = SPOTIFY_ASK.exec(text)?.[1];
    if (song) return { kind: 'music', song };
    const video = YOUTUBE_ASK.exec(text)?.[1];
    if (video) return { kind: 'youtube', song: songOf(video) };
    // open before close: "เปิด explorer" must never become a close request
    // (ปิด/เปิด differ by one Thai character; prefer the verb that is actually present)
    if (OPEN_ASK.test(text) && count <= 14 && !CLOSE_ASK.test(text)) return { kind: 'open', text };
    const app = this.askedToClose(text);
    if (app) return { kind: 'close', name: app };
    if (GAME_ASK.test(text) && count <= 8) return { kind: 'open', text };
    const start = MUSIC_START.exec(text.trim())?.[1];
    if (start && !HER_PICK.test(start)) return { kind: 'play', song: songOf(start.replace(/[\s.!?]+$/, '')) };
    const both = PLAY_AFTER.exec(text.trim());
    const after = both?.[1];
    // "ouvre discord et lance spotify": the first half too
    if (after && !VAGUE_SONG.test(after) && !HER_PICK.test(after)) return { kind: 'play', song: songOf(after.replace(/[\s.!?]+$/, '')), before: text.trim().slice(0, both.index) };
    const play = PLAY_ASK.exec(text.trim())?.[1];
    if (play && !VAGUE_SONG.test(play) && !HER_PICK.test(play)) return { kind: 'play', song: songOf(play.replace(/[\s.!?]+$/, '')) };
    if (this.onHack && HACK_ASK.test(text)) return { kind: 'hack' };
    if (CLEAR_RAM_ASK.test(text)) return { kind: 'ram' };
    if (CLEANUP_ASK.test(text)) return { kind: 'cleanup' };
    if (STATUS_ASK.test(text) || STATUS_HOW.test(text)) {
      const kind = STATUS_KIND.find(([, re]) => re.test(text))?.[0] || 'all';
      return { kind: 'status', what: kind };
    }
    // open again as fallback (e.g. mixed with close words — rare)
    if (OPEN_ASK.test(text) && count <= 14) return { kind: 'open', text };
    return null;
  }

  // Doing it now. Resolves with her line about it ({ line, face }), or null if there was nothing to do.
  async doNow(asked) {
    const { t } = this;
    const custom = this.brain.custom;
    if (asked.kind === 'remindOp') return this.remindUI.run(asked.op);
    if (asked.kind === 'remind') {
      if (!asked.at) {
        this.waitingWhen = { text: asked.text, until: Date.now() + 3 * 60 * 1000 }; // her answer asks when
        return null;
      }
      this.waitingWhen = null;
      // the same reminder twice: she asks what to do instead of piling up a second one
      const old = this.reminders.findDuplicate({ text: asked.text, at: asked.at });
      if (old) return this.remindUI.dupe(old, asked);
      const r = this.reminders.add(asked.at, asked.text, asked.every); // set before her answer is asked for: she knows
      this.remindUI.note(r.id);
      const tr = this.brain.t.remind;
      if (r.every) {
        const lang = REPEAT_SET[this.brain.lang] ? this.brain.lang : 'en';
        const line = fmt(REPEAT_SET[lang], { every: everyText(r.every, lang), what: r.text ? ` — ${r.text}` : '', time: clock(r.at, this.brain.lang) });
        return { line, face: 'smug', reminder: r.id };
      }
      return { line: fmt(r.text ? tr.set : tr.setBare, { time: clock(r.at, this.brain.lang), text: r.text }), face: 'smug', reminder: r.id };
    }
    if (asked.kind === 'name') {
      custom.userName = asked.name; // her answer, being written now, already knows it
      this.host.setConfig({ userName: asked.name });
      return { line: fmt(this.brain.t.custom.named, { name: asked.name }), face: 'laugh' };
    }
    if (asked.kind === 'memo') {
      custom.memories = [...(custom.memories || []).filter((m) => m !== asked.text), asked.text].slice(-MEMORIES_MAX);
      this.host.setConfig({ memories: custom.memories });
      return { line: this.brain.t.custom.remembered, face: 'smug' };
    }
    if (asked.kind === 'media') {
      this.capri.pulse();
      return (await this.host.media(asked.action)) ? { line: t.media[asked.action], face: 'smug' } : null;
    }
    if (asked.kind === 'music') {
      this.zap();
      return (await this.host.music(asked.song)) ? { line: fmt(t.music, { song: asked.song }), face: 'laugh' } : null;
    }
    if (asked.kind === 'youtube') return this.youtube(asked.song);
    if (asked.kind === 'roblox') {
      this.zap();
      const res = await this.host.roblox(asked.game);
      if (!res) return null;
      if (!res.name) return { line: fmt(t.robloxNone, { game: asked.game }), face: 'aside' };
      return { line: fmt(res.app ? t.robloxPlay : t.robloxPage, { game: res.name }), face: 'laugh' };
    }
    if (asked.kind === 'web') {
      this.zap();
      const spec = { q: asked.query, tab: asked.tab || '', maps: Boolean(asked.maps), route: asked.route || null };
      const said = (WEB_LINES[this.brain.lang] || {})[asked.route ? 'route' : asked.maps ? 'maps' : asked.tab || 'all'];
      return (await this.host.webSearch(JSON.stringify(spec))) ? { line: said ? fmt(said, { query: asked.query }) : fmt(t.web, { query: asked.query }), face: 'smug' } : null;
    }
    if (asked.kind === 'files') {
      const results = await this.host.searchFiles({ query: asked.query, exts: asked.exts });
      const asking = asked.query || asked.exts.map((e) => `.${e}`).join(' ');
      if (!results.length) return { line: fmt(t.filesNone, { query: asking }), face: 'aside' };
      const list = results.slice(0, 3).map((f) => `${f.name} (${f.folder})`).join(', ');
      const lines = [fmt(results.length === 1 ? t.fileFound : t.filesFound, { count: results.length, list })];
      // "…and open the folder" / "…and open it": done right away, on the newest one
      if (asked.then === 'folder' && (await this.host.openFile(results[0].path, true))) lines.push(fmt(t.folderOpened, { name: results[0].name }));
      // (never a program or a script on its own: that one waits for its button)
      const runs = /\.(exe|bat|cmd|ps1|vbs|vbe|js|jse|wsf|msi|reg|scr|com|jar|hta)$/i.test(results[0].name);
      if (asked.then === 'open' && !runs && (await this.host.openFile(results[0].path))) lines.push(fmt(t.opened, { app: results[0].name }));
      return { line: lines.join('\n'), face: 'smug', files: results };
    }
    if (asked.kind === 'shot') {
      // not her nor her panel in it
      document.documentElement.style.visibility = 'hidden';
      await new Promise((r) => setTimeout(r, 180));
      const shot = await this.host.screenshot();
      document.documentElement.style.visibility = '';
      this.voice.play('tick');
      return shot ? { line: fmt(t.shot, { name: shot.name }), face: 'smug', files: [shot] } : null;
    }
    if (asked.kind === 'play') {
      // what came before an "and" first ("ouvre discord et…"), unless it's YouTube, where the song goes anyway
      const first = asked.before && OPEN_ASK.test(asked.before) && !/youtube/i.test(asked.before)
        ? await this.doNow({ kind: 'open', text: asked.before }) : null;
      // "joue à Brawlhalla" is a game, "lance spotify" an app; anything else, a song
      const game = await this.host.findLaunch(asked.song);
      const then = game && ['steam', 'epic', 'app', 'file'].includes(game.kind) && !game.risky ? await this.openNow(game) : await this.youtube(asked.song);
      if (!first?.line) return then;
      return { line: [first.line, then?.line].filter(Boolean).join('\n'), face: then?.face || first.face };
    }
    const item = await this.host.findLaunch(asked.text);
    const site = namedSite(asked.text);
    if (site && (!item || BROWSER.test(item.name))) {
      this.zap();
      return (await this.host.openSite(site.url)) ? { line: fmt(t.siteOpened, { site: site.name }), face: 'laugh' } : null;
    }
    if (!item) return null; // nothing by that name here: her tag may still say what you meant
    return this.openNow(item);
  }

  // An app, a game, a file or a folder: opened, or behind a button when it would run something.
  async openNow(item) {
    if (item.risky) return { offer: item };
    this.zap();
    const res = await this.host.launch(item);
    const name = this.nameOf(item);
    if (!res.ok) return { line: `${this.t.failed} ${res.error}`, face: 'aside' };
    // short success only — no model, no close prompt
    const base = fmt(this.t.opened, { app: name });
    const tail = this.t.openedTail || ' ไปเลย choom';
    return { line: `${base}${tail}`, face: 'laugh' };
  }

  // how she calls it: a folder like Downloads in her words, anything else by its name
  nameOf(item) {
    return item.kind === 'known' ? this.t.folders[item.id] || item.name : item.name;
  }

  // The song itself on YouTube (the right video, not a search), in your browser.
  async youtube(song) {
    this.zap();
    const res = await this.host.youtube(song);
    if (!res) return null;
    return { line: res.title ? fmt(this.t.youtube, { title: res.title }) : fmt(this.t.youtubeSearch, { song }), face: 'laugh' };
  }

  // Once she has answered: her line about what she did, else the app you asked to close, else what
  // her tag asks for, if your message (text) asked for that kind of thing.
  async after(raw, answer, asked, early, text) {
    const { t } = this;
    const done = early && (await early);
    if (done?.reminder) {
      // a reminder set: a button to take it back, right there
      this.addLine(answer, done.line, done.face);
      const tr = this.brain.t.remind;
      this.panel.setActions([{ id: 'cancel', label: tr.cancel }], () => {
        this.reminders.remove(done.reminder);
        this.panel.setActions([]);
        this.addLine(answer, tr.cancelled, 'aside');
      });
      return undefined;
    }
    if (done?.offer) return this.launch(done.offer, answer); // it would run something: your click first
    if (done?.files) {
      // what she found (or the screenshot): a button to open the first, and to see where it is
      this.addLine(answer, done.line, done.face);
      const [first, second] = done.files;
      const actions = [{ id: 'open', label: fmt(t.openIt, { app: first.name }), primary: true }];
      if (second) actions.push({ id: 'second', label: fmt(t.openIt, { app: second.name }) });
      actions.push({ id: 'folder', label: t.showFolder });
      this.panel.setActions(actions, (id) => {
        if (id === 'folder') return this.host.openFile(first.path, true);
        return this.host.openFile((id === 'second' ? second : first).path);
      });
      return undefined;
    }
    if (done) return this.addLine(answer, done.line, done.face);
    if (asked?.kind === 'remind') return undefined; // no time said: her answer asks when
    if (asked?.kind === 'close') return this.offerClose(asked.name, answer);
    if (asked?.kind === 'cleanup') return this.offerCleanup(answer);
    if (asked?.kind === 'ram') return this.offerClearRam(answer);
    if (asked && asked.kind !== 'open') return undefined; // music that didn't work out: nothing more to offer
    const closeTag = tagged(raw);
    if (closeTag) return wanted('close', text) ? this.offerClose(closeTag, answer) : undefined;
    const tag = TAG.exec(raw);
    if (!tag) return undefined;
    const kind = tag[1].toLowerCase();
    const value = tag[2].trim();
    if (kind === 'cleanup') return wanted('cleanup', text) ? this.offerCleanup(answer) : undefined;
    if (kind === 'ram') return wanted('ram', text) ? this.offerClearRam(answer) : undefined;
    if (!value || !wanted(kind, text)) return undefined;
    if (kind === 'media') return MEDIA_ACTIONS.has(value.toLowerCase()) ? this.media(value.toLowerCase(), answer) : undefined;
    // a song she picked: on YouTube, the right video (on Spotify if that's what you said)
    if (kind === 'music') return /spotify/i.test(text) ? this.music(value, answer) : this.playOn(value, answer);
    if (kind === 'site') return this.offerSite(value, answer);
    const item = await this.host.findLaunch(value);
    if (item) return this.launch(item, answer);
    const site = namedSite(value); // "[[open: YouTube]]": a site, not an app
    return site ? this.offerSite(site.url, answer) : this.addLine(answer, fmt(t.notInstalled, { app: value }));
  }

  // her answer, with a line of what she did under it
  addLine(answer, line, face = null) {
    if (!this.open || this.turn) return;
    this.panel.stream(answer === '…' ? line : `${answer}\n${line}`, { done: true }); // nothing but a tag: just the line
    if (face) this.panel.setFace(face);
  }

  // a bolt of red lightning off her fingers, at whatever she's doing on your PC
  zap() {
    const h = this.capri.head();
    this.capri.zap(h.x + this.capri.towardCenter() * 280, h.y - 170);
  }

  // An app or a game her tag asked for: behind a button (now: the button was clicked).
  async launch(item, answer, { now = false } = {}) {
    const { t } = this;
    if (!this.open || this.turn) return;
    if (!now) {
      this.panel.setActions(
        [{ id: 'open', label: fmt(t.openIt, { app: this.nameOf(item) }), primary: true }, { id: 'no', label: t.no }],
        (id) => (id === 'open' ? this.launch(item, answer, { now: true }) : this.panel.setActions([])),
      );
      return;
    }
    this.panel.setActions([]);
    this.zap();
    const res = await this.host.launch(item);
    this.addLine(answer, res.ok ? fmt(t.opened, { app: this.nameOf(item) }) : `${t.failed} ${res.error}`, res.ok ? 'laugh' : 'aside');
  }

  async playOn(song, answer) {
    const done = await this.youtube(song);
    if (done) this.addLine(answer, done.line, done.face);
  }

  // The media keys: pause, next, louder…
  async media(action, answer) {
    this.capri.pulse();
    const ok = await this.host.media(action);
    if (ok) this.addLine(answer, this.t.media[action], 'smug');
  }

  // A Spotify search, in the app if it's there.
  async music(song, answer) {
    this.zap();
    const ok = await this.host.music(song);
    if (ok) this.addLine(answer, fmt(this.t.music, { song }), 'laugh');
  }

  // A website: always behind a button that shows where it goes.
  offerSite(address, answer) {
    const { t } = this;
    let host;
    try {
      host = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`).hostname;
    } catch {
      return;
    }
    if (!this.open || this.turn || !host.includes('.')) return;
    this.panel.setActions(
      [{ id: 'site', label: fmt(t.siteIt, { site: host }), primary: true }, { id: 'no', label: t.no }],
      async (id) => {
        this.panel.setActions([]);
        if (id !== 'site') return;
        const ok = await this.host.openSite(address);
        if (ok) this.addLine(answer, fmt(t.siteOpened, { site: host }));
      },
    );
  }

  // "close am music pls": an app that's open, named in a message asking to close something.
  // Also extracts a plausible name when the open-apps list is empty/stale (explorer is in KEEP so never listed).
  askedToClose(text) {
    if (!CLOSE_ASK.test(text)) return null;
    // never treat a clear "open X" as close (Thai เปิด contains ปิด after เ)
    if (OPEN_ASK.test(text) && !/(?<!เ)ปิด|\b(close|shut|quit|kill|exit)\b/i.test(text)) return null;
    const said = simple(text);
    let best = null;
    for (const app of this.apps) {
      for (const name of [simple(app.name), simple(app.label)]) {
        if (name.length >= 3 && said.includes(name) && (!best || name.length > best.length)) best = { app, length: name.length };
      }
    }
    if (best) return best.app.name;
    const cleaned = text
      .replace(CLOSE_ASK, ' ')
      .replace(/\b(the|app|application|program|window|โปรแกรม|แอป|ตัว|หน่อย|ให้|ด้วย|please|pls|stp|svp)\b/gi, ' ')
      .replace(/[^\p{L}\p{N}.\s-]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.length >= 2 ? cleaned : null;
  }

  // She was asked to close an app: a button with its name, and nothing happens until you click it.
  // File Explorer is special (apps.js KEEP skips it; window titles are folder paths).
  // Route it through launch's safe close-explorer instead of host.closeApp.
  async offerClose(wanted, answer) {
    const { t } = this;
    if (!this.open || this.turn) return;
    const key = simple(wanted);
    const isExplorer = /^(file)?explorer$|ไฟล์เอ็กซ์พลอเรอร์|เอ็กซ์พลอเรอร์|explorer\.exe$/i.test(key) || /\bexplorer\b/i.test(wanted);
    let app = await this.host.findApp(wanted);
    if (!app) app = { name: isExplorer ? 'File Explorer' : wanted.trim() };
    const line = answer && answer !== '…' ? answer : (t.closeAsk || `จะปิด ${app.name} ให้ไหม choom?`);
    this.panel.setFace('smug');
    this.panel.stream(line, { done: true });
    this.remember({ role: 'assistant', content: line });
    this.panel.setActions(
      [{ id: 'close', label: fmt(t.closeIt, { app: app.name }), primary: true }, { id: 'no', label: t.no }],
      (id) => {
        this.panel.setActions([]);
        if (id === 'close') {
          if (isExplorer) this.runCloseExplorer(line);
          else this.closeApp(app);
        }
      },
    );
  }

  async runCloseExplorer(_answer) {
    this.zap();
    const res = await this.host.launch({ kind: 'known', id: 'close-explorer' });
    const ok = res?.ok !== false;
    // replace confirm prompt — only the result (fmt so {app} is filled)
    const line = ok
      ? (fmt(this.t.closed, { app: 'File Explorer' }) || 'File Explorer: flatline แล้ว เสร็จ choom')
      : `${this.t.failed} ${res?.error || ''}`;
    this.panel.setFace(ok ? 'laugh' : 'aside');
    this.panel.stream(line, { done: true });
    this.remember({ role: 'assistant', content: line });
  }

  // Disk Cleanup: ปุ่มยืนยันก่อนรัน — ใช้ข้อความของเราเอง (โมเดลเล็กมักสับสนกับถังขยะ)
  offerCleanup(answer) {
    const { t } = this;
    if (!this.open || this.turn) return;
    const line = t.cleanupAsk || 'ขยะในเครื่องรกแล้ว choom ล้างให้ไหม? กดแล้วยิง Disk Cleanup บนไดรฟ์ระบบให้เลย';
    this.panel.setFace('smug');
    this.panel.stream(line, { done: true });
    this.panel.setActions(
      [
        { id: 'cleanup', label: t.cleanupIt || 'ลุยเลย', primary: true },
        { id: 'no', label: t.no },
      ],
      (id) => {
        this.panel.setActions([]);
        if (id === 'cleanup') this.runCleanup(line);
      },
    );
  }

  async runCleanup(_answer) {
    this.zap();
    const res = await this.host.launch({ kind: 'known', id: 'cleanup' });
    const ok = res?.ok !== false;
    const line = ok
      ? (this.t.cleanupOpened || 'เปิด Disk Cleanup บนไดรฟ์ระบบแล้ว ติ๊ก temp / cache ที่ปลอดภัย แล้วกด OK ได้ เราไม่แตะของสำคัญ… ตอนนี้ choom')
      : `${this.t.failed} ${res?.error || ''}`;
    this.panel.setFace(ok ? 'laugh' : 'aside');
    this.panel.stream(line, { done: true });
    this.remember({ role: 'assistant', content: line });
  }

  // เคลียร์แรม: ปุ่มยืนยันก่อนรัน — ข้อความของเราเอง ไม่ให้โมเดลปนกับถังขยะ
  offerClearRam(answer) {
    const { t } = this;
    if (!this.open || this.turn) return;
    const line = t.clearRamAsk || 'แรมแน่นใช่ไหม? เคลียร์ให้หน่อยไหม choom กดแล้วเปิด Task Manager ให้';
    this.panel.setFace('smug');
    this.panel.stream(line, { done: true });
    this.panel.setActions(
      [
        { id: 'ram', label: t.clearRamIt || 'เคลียร์เลย', primary: true },
        { id: 'no', label: t.no },
      ],
      (id) => {
        this.panel.setActions([]);
        if (id === 'ram') this.runClearRam(line);
      },
    );
  }

  async runClearRam(_answer) {
    this.zap();
    const res = await this.host.launch({ kind: 'known', id: 'ram' });
    const ok = res?.ok !== false;
    const line = ok
      ? (this.t.clearRamOpened || 'บีบแรมให้แล้ว เปิด Task Manager ไว้ ไปจัดการตัวกินแรมเองนะ เราไม่ flatline ใครง่าย ๆ… ตอนนี้ choom')
      : `${this.t.failed} ${res?.error || ''}`;
    this.panel.setFace(ok ? 'smug' : 'aside');
    this.panel.stream(line, { done: true });
    this.remember({ role: 'assistant', content: line });
  }

  // Nmap / Wireshark on her own PC and your own network (netscan.js does the scan and refuses anything else).
  // Her plain words about it are written here from the result. Her model reads it too, but only one running on this PC.
  async runNet(what = 'net') {
    if (what === 'fixes') return this.runFixHistory();
    const cfg = await this.host.getConfig().catch(() => ({}));
    if (!cfg.netAsked) {
      this.panel.setFace('look');
      this.panel.stream(
        'ก่อนนะ choom: ฉันจะใช้ Nmap สแกนเฉพาะเครื่องคุณกับวง LAN ส่วนตัว และใช้ Wireshark (tshark) ดูทราฟฟิกของเครื่องนี้สั้น ๆ '
        + 'ฉันอ่านแค่ภาพรวม (โปรโตคอล ชื่อโดเมน ปลายทาง) ไม่เก็บแพ็กเก็ตลงดิสก์ ถ้าโมเดลของฉันรันอยู่ในเครื่องนี้ ผลจะให้มันช่วยอ่านได้ (ปิดได้ในเมนู) '
        + 'แต่ถ้าฉันใช้ API key หรือโมเดลออนไลน์ ผลสแกนจะไม่ถูกส่งออกไปเด็ดขาด ใช้เฉพาะเครือข่ายของคุณเองนะ ตกลงไหม?',
        { done: true },
      );
      this.panel.setActions([{ id: 'yes', label: 'ได้เลย', primary: true }, { id: 'no', label: 'ยังก่อน' }], async (choice) => {
        this.panel.setActions([]);
        if (choice !== 'yes') {
          this.panel.setFace('aside');
          this.panel.stream('โอเค ไม่สแกนก็ได้ ถ้าเปลี่ยนใจบอกฉันนะ', { done: true });
          return;
        }
        await this.host.setConfig({ netAsked: true });
        this.runNet(what);
      });
      return;
    }
    const tools = await this.host.netTools().catch(() => ({}));
    const capture = what.startsWith('net:capture');
    const isBandwidth = what.startsWith('net:bandwidth');
    const needsTshark = capture || isBandwidth;
    if (needsTshark ? !tools.tshark : !tools.nmap) {
      const name = needsTshark ? 'Wireshark (tshark)' : 'Nmap';
      const site = needsTshark ? 'wireshark.org' : 'nmap.org';
      this.panel.setFace('aside');
      this.panel.stream(`ฉันหา ${name} ในเครื่องไม่เจอ choom ติดตั้งจาก ${site} แล้วลองใหม่นะ`, { done: true });
      return;
    }
    this.zap();
    this.panel.setFace('look');
    this.netNote = '';
    const parts = what.split(':');
    const netKind = parts[1] || 'self';
    const secs = parts[2];
    const isCaptureLike = capture || isBandwidth;
    const loadingMsg = {
      capture:   `ฟังทราฟฟิกของเครื่องนี้ ${secs || 15} วินาทีนะ choom…`,
      bandwidth: `วัดความเร็วจริง ๆ ${secs || 10} วินาทีนะ รอแป๊บ…`,
      gateway:   'กำลังสแกนเราเตอร์ รอแป๊บนะ…',
      os:        `กำลังเดา OS ของ ${parts[2] || '?'} อยู่…`,
      vuln:      `ตรวจสอบช่องโหว่เบื้องต้น ${parts[2] || 'เครื่องนี้'} อยู่นะ ใช้เวลาซักครู่…`,
      ports:     `สแกนพอร์ต ${parts[3] || '?'} ที่ ${parts[2] || '?'} อยู่…`,
    }[netKind] || 'กำลังสแกนให้ รอแป๊บนะ…';
    this.panel.stream(loadingMsg, { done: false });
    if (isCaptureLike) this.panel.setActions([{ id: 'stop', label: 'หยุด' }], () => this.host.netCancel());
    let res = null;
    try {
      res = await this.host.pcStatus(what);
    } catch {
      res = null;
    }
    this.panel.setActions([]);
    const { line, face } = this.netSummary(res);
    this.panel.setFace(face);
    this.panel.stream(line, { done: true });
    this.rememberPrivate({ role: 'assistant', content: line });
    if (!res?.ok || !res.text) return;
    try {
      await this.host.showStatusCard({ text: res.text, data: res.data || {}, view: 'net' });
    } catch (err) {
      console.warn('[capri] net card error', err);
    }
    // her local model reads the result (main.js checks again that it runs on this PC: a key or an online model gets nothing)
    const where = await this.host.lookWhere().catch(() => ({}));
    if (where.local && cfg.netAI !== false) {
      const view = await this.netAnalysis(res.text);
      this.netNote = view || '';
      if (view) {
        const full = `${line}\n\n${view}`;
        this.panel.stream(full, { done: true });
        this.history.pop(); // the plain line made above: the same one, with her reading of it
        this.rememberPrivate({ role: 'assistant', content: full });
      }
    }
    // the security check of THIS PC: she offers to fix what she can (every fix is logged with its reason, and can be undone)
    if (res.data?.net?.kind === 'vuln' && res.data.net.local) {
      await this.offerFixes(res.data.net);
      return;
    }
    // a LAN scan: she can play her demo on one of the devices found (still her fake page, nothing is sent to it)
    const devices = res.data?.net?.kind === 'lan' ? res.data.net.hosts.slice(0, 3) : [];
    if (devices.length && this.onHack) {
      const label = (d) => (d.name || d.vendor || d.ip).toString().slice(0, 22);
      this.panel.setActions(
        [...devices.map((d) => ({ id: d.ip, label: `ฉากโชว์: ${label(d)}` })), { id: 'no', label: 'ไม่เอา' }],
        (choice) => {
          this.panel.setActions([]);
          const d = devices.find((x) => x.ip === choice);
          if (d) this.onHack({ label: `${label(d)} · ${d.ip}` });
        },
      );
    }
  }

  // ---- fixing what the security check found. She never runs anything herself: main.js (remediate.js) only accepts the
  // ids of fixes it proposed from a real scan, writes the reason to a private log first, and Windows asks for permission (UAC).

  // a question with buttons, answered through a promise
  askChoice(line, actions, face = 'look') {
    return new Promise((resolve) => {
      this.panel.setFace(face);
      this.panel.stream(line, { done: true });
      this.panel.setActions(actions, (choice) => { this.panel.setActions([]); resolve(choice); });
    });
  }

  sayNet(line, face = 'smug') {
    this.panel.setFace(face);
    this.panel.stream(line, { done: true });
    this.rememberPrivate({ role: 'assistant', content: line });
  }

  fixError(code) {
    return {
      'uac-cancelled': 'คุณไม่อนุญาตที่หน้าต่างสิทธิ์ผู้ดูแล (UAC) ฉันเลยไม่ได้เปลี่ยนอะไร',
      unsupported: 'การแก้อัตโนมัติรองรับเฉพาะ Windows',
      expired: 'ผลสแกนเก่าเกินไป สแกนใหม่อีกครั้งก่อนนะ',
      'no-reason': 'ข้อนี้ไม่มีเหตุผลที่พอ ฉันจึงไม่แตะ',
      'not-applied': 'ข้อนี้ยังไม่เคยถูกแก้ จึงไม่มีอะไรให้ย้อน',
      'already-undone': 'ย้อนกลับไปแล้ว',
      'no-result': 'ไม่ได้รับผลจากตัวที่แก้ (อาจถูกยกเลิกกลางคัน)',
      invalid: 'ข้อนี้ไม่อยู่ในรายการที่อนุญาตให้แก้ ฉันจึงไม่แตะ',
      'not-confirmed': 'ยังไม่ได้ยืนยัน ฉันเลยไม่ได้เปลี่ยนอะไร',
      nothing: 'ไม่มีข้อไหนที่แก้ได้ตอนนี้',
      'too-big': 'ชุดแก้ใหญ่เกินไป ลองเลือกทีละข้อ',
    }[code] || `ทำไม่สำเร็จ (${code || 'ไม่ทราบสาเหตุ'})`;
  }

  fixExplain(f, fx) {
    return `ข้อ: ${f.title}\nตอนนี้: ${f.doing?.[0] || '-'}\nใครใช้อยู่: ${f.usedBy?.text || '-'}\nทำไมเสี่ยง: ${f.why}\n\nถ้าแก้: ${fx.effect}\n`
      + `${fx.risk === 'medium' ? `⚠ ระวัง: ${fx.warn}` : `ผลกระทบ: ${fx.warn || 'น้อย'}`}\nย้อนกลับได้ทุกเมื่อ`;
  }

  async offerFixes(net) {
    const items = (net.findings || []).filter((f) => f.fixes?.length);
    if (!items.length) return;
    const real = (net.findings || []).filter((f) => f.severity !== 'info').length;
    const first = await this.askChoice(
      `ใน ${real} ข้อ มี ${items.length} ข้อที่ฉันแก้ให้ได้ ทุกข้อย้อนกลับได้ และฉันจะจดเหตุผลกับสิ่งที่เปลี่ยนไว้ในล็อกที่เปิดได้เฉพาะบัญชี Windows ของคุณ ให้ฉันแก้ให้ไหม?`,
      [{ id: 'all', label: `แก้ให้ทั้งหมด (${items.length})`, primary: true }, { id: 'pick', label: 'เลือกทีละข้อ' }, { id: 'no', label: 'ไม่ต้อง ฉันจัดการเอง' }],
    );
    if (first === 'no') return this.sayNet('โอเค ฉันไม่แตะอะไรเลย ถ้าเปลี่ยนใจให้เช็กความปลอดภัยอีกรอบได้นะ', 'aside');
    let chosen = items;
    if (first === 'pick') {
      chosen = [];
      for (const f of items) {
        const c = await this.askChoice(this.fixExplain(f, f.fixes[0]), [{ id: 'yes', label: 'แก้ข้อนี้', primary: true }, { id: 'skip', label: 'ข้าม' }, { id: 'stop', label: 'พอแล้ว' }]);
        if (c === 'stop') break;
        if (c === 'yes') chosen.push(f);
      }
      if (!chosen.length) return this.sayNet('ไม่ได้เลือกข้อไหน ฉันเลยไม่แตะอะไรเลย', 'aside');
    }
    const plan = chosen.map((f, i) => `${i + 1}. ${f.fixes[0].label}\n   ${f.fixes[0].effect}${f.fixes[0].risk === 'medium' ? `\n   ⚠ ${f.fixes[0].warn}` : ''}`).join('\n');
    const ok = await this.askChoice(`จะทำตามนี้:\n${plan}\n\nWindows จะถามสิทธิ์ผู้ดูแล (UAC) หนึ่งครั้ง ไม่มีอะไรถูกลบ และย้อนกลับได้ ยืนยันไหม?`, [{ id: 'go', label: 'ยืนยัน แก้เลย', primary: true }, { id: 'cancel', label: 'ยกเลิก' }]);
    if (ok !== 'go') return this.sayNet('ยกเลิกแล้ว ฉันไม่ได้เปลี่ยนอะไร', 'aside');

    this.panel.setFace('look');
    this.panel.stream('กำลังแก้… รอหน้าต่างขอสิทธิ์ผู้ดูแลนะ', { done: false });
    const res = await this.host.fixApply({ fixIds: chosen.map((f) => f.fixes[0].fixId), confirmed: true, note: this.netNote }).catch(() => null);
    const results = res?.results || [];
    const good = results.filter((r) => r.ok);
    const report = results.map((r) => `${r.ok ? '✅' : '❌'} ${r.title || ''}${r.ok ? '' : ` — ${this.fixError(r.error)}`}`).join('\n')
      || this.fixError(res?.error);
    let text = good.length
      ? `แก้แล้ว ${good.length} ข้อ:\n${report}\n\nจดเหตุผลลงล็อกแล้ว ถ้ามีอะไรใช้ไม่ได้ กดย้อนกลับได้เลย`
      : `ยังไม่ได้แก้อะไร:\n${report}`;
    this.rememberPrivate({ role: 'assistant', content: text });
    for (;;) {
      const c = await this.askChoice(text, [
        ...(good.length ? [{ id: 'undo', label: 'ย้อนกลับทั้งหมด' }] : []), { id: 'log', label: 'เปิดโฟลเดอร์ล็อก' }, { id: 'ok', label: 'โอเค', primary: true },
      ], good.length ? 'smug' : 'aside');
      if (c === 'log') { this.host.fixOpenLog(); continue; }
      if (c === 'undo') await this.undoEntries(good.map((r) => r.entryId));
      return;
    }
  }

  async undoEntries(ids) {
    this.panel.setFace('look');
    this.panel.stream('กำลังย้อนกลับ… รอหน้าต่างขอสิทธิ์ผู้ดูแลนะ', { done: false });
    const res = await this.host.fixUndo(ids).catch(() => null);
    const results = res?.results || [];
    const report = results.map((r) => `${r.ok ? '↩️' : '❌'} ${r.title || ''}${r.ok ? ' — กลับเป็นเหมือนเดิมแล้ว' : ` — ${this.fixError(r.error)}`}`).join('\n') || this.fixError(res?.error);
    this.sayNet(`${report}${res?.integrity?.valid === false ? '\n\n⚠ ล็อกถูกแก้ไขหรือเสียหาย ฉันตรวจสอบก่อนย้อนแล้วว่าสิ่งที่ย้อนเป็นรายการที่อนุญาตเท่านั้น' : ''}`, results.some((r) => r.ok) ? 'smug' : 'aside');
  }

  async runFixHistory() {
    const { items = [], integrity } = (await this.host.fixList().catch(() => null)) || {};
    if (!items.length) return this.sayNet('ฉันยังไม่เคยแก้อะไรให้เลย ล็อกยังว่างอยู่');
    const st = { applied: 'แก้แล้ว', undone: 'ย้อนกลับแล้ว', failed: 'ไม่สำเร็จ' };
    const text = `ประวัติการแก้ล่าสุด:\n${items.slice(0, 5).map((i) => `• ${new Date(i.ts).toLocaleString('th-TH')} — ${i.title} (${st[i.status] || i.status})\n   เหตุผล: ${i.why}`).join('\n')}`
      + `${integrity?.valid === false ? `\n\n⚠ ล็อกถูกแก้ไขหรือเสียหายที่บรรทัด ${integrity.brokenAt} ระวังนะ` : ''}`;
    const undoable = items.filter((i) => i.canUndo);
    for (;;) {
      const c = await this.askChoice(text, [
        ...(undoable.length ? [{ id: 'latest', label: 'ย้อนกลับอันล่าสุด' }] : []),
        ...(undoable.length > 1 ? [{ id: 'all', label: 'ย้อนกลับทั้งหมด' }] : []),
        { id: 'log', label: 'เปิดโฟลเดอร์ล็อก' }, { id: 'ok', label: 'ปิด', primary: true },
      ], 'look');
      if (c === 'log') { this.host.fixOpenLog(); continue; }
      if (c === 'latest') await this.undoEntries([undoable[0].entryId]);
      if (c === 'all') await this.undoEntries(undoable.map((i) => i.entryId));
      return;
    }
  }

  // her local model's reading of a scan, as her: a short line, or '' (nothing to say, or it came out wrong)
  async netAnalysis(text) {
    const prompt = '(Note for you, never repeat it: the user asked you to scan THEIR OWN PC or home network and this is the real result. '
      + 'Comment on it as Capri in 2 or 3 short sentences, in the user\'s language, plain text. Say only what the data shows, never invent a port, a device or a threat; '
      + 'if something looks risky, say calmly what to check; if nothing does, say so.)\n\n' + text;
    const res = await this.host.netAnalyze({ persona: this.persona(''), text: prompt }).catch(() => null);
    if (!res?.ok) return '';
    const out = stopLoop(polish(clean(res.text), '', this.brain.custom?.userName)).trim();
    return out.length < 4 || out.length > 600 || LEAK.test(out) ? '' : out;
  }

  // her menu › PC tools
  async tool(name) {
    if (!this.open || this.turn) return;
    if (name === 'status') return this.runStatus('all');
    if (name === 'top') return this.runStatus('top');
    if (name === 'ram') return this.offerClearRam('…');
    if (name === 'cleanup') return this.offerCleanup('…');
    if (name === 'net' || name.startsWith('net:')) return this.runNet(name);
    // new net menu shortcuts — fire directly or prompt for an IP first
    if (name === 'netGateway') return this.runNet('net:gateway');
    if (name === 'netVuln') return this.runNet('net:vuln:self');
    if (name === 'fixHistory') return this.runFixHistory();
    if (name === 'netBandwidth') return this.runNet('net:bandwidth:10');
    // OS detection and custom port range need an IP: ask in chat first
    if (name === 'netOs') return this.promptNetIp('os');
    if (name === 'netPorts') return this.promptNetIp('ports');
  }

  // ask for an IP then fire the scan (os / ports)
  promptNetIp(kind) {
    const isPort = kind === 'ports';
    const q = isPort
      ? 'สแกนพอร์ตช่วงไหนของ IP ไหน? เช่น "192.168.1.1 พอร์ต 1-1024"'
      : 'เดา OS ของ IP ไหนดี? เช่น "192.168.1.5"';
    this.panel.setFace('smug');
    this.panel.stream(q, { done: true });
    this.remember({ role: 'assistant', content: q });
    // next user message is parsed by the normal netAsk() path in chat.js
  }

  // her words about a scan result, from the numbers: { line, face }
  netSummary(res) {
    if (!res?.ok) {
      const why = {
        busy: 'ฉันยังสแกนอีกงานอยู่ รอให้เสร็จก่อนนะ',
        target: 'ฉันสแกนได้เฉพาะเครื่องคุณเองกับ IP ส่วนตัวในวง LAN (192.168.x.x, 10.x.x.x, 172.16-31.x.x) ส่วนข้างนอกไม่แตะนะ',
        nolan: 'ไม่เห็นวง LAN เลย ต่อ Wi-Fi หรือสายแลนอยู่รึเปล่า?',
        nopackets: 'ฟังแล้วไม่ได้แพ็กเก็ตเลย อาจเลือกการ์ดเครือข่ายผิด (ตั้ง netIface ใน config.json) หรือ Npcap ยังไม่ได้ติดตั้ง',
        nointerface: 'หาการ์ดเครือข่ายสำหรับจับแพ็กเก็ตไม่เจอ ลองติดตั้ง Npcap ใหม่',
        timeout: 'สแกนนานเกินไป ฉันเลิกรอแล้ว ลองใหม่อีกที',
      }[res?.error];
      return { line: why || 'สแกนไม่สำเร็จ choom ลองใหม่หรือเช็คว่าติดตั้งเครื่องมือครบไหม', face: 'aside' };
    }
    const n = res.data?.net || {};
    if (n.kind === 'self') {
      const risky = (n.risky || []).join(', ');
      const line = `เครื่องนี้เปิดพอร์ตอยู่ ${n.ports.length} พอร์ต และ ${n.exposed} พอร์ตในนั้นคนในวง LAN เข้าถึงได้`
        + (risky ? ` ระวัง ${risky} นะ ถ้าไม่ได้ใช้ควรปิด` : ' ไม่เจอตัวเสี่ยง ๆ เลย เก่งมาก') + ' เปิดหน้าต่างรายละเอียดให้แล้ว';
      return { line, face: risky ? 'wide' : 'smug' };
    }
    if (n.kind === 'lan') return { line: `เจอ ${n.hosts.length + 1} เครื่องในวง ${n.range} (รวมเครื่องนี้) ถ้ามีตัวที่ไม่รู้จัก ลองเช็กที่เราเตอร์ดูนะ`, face: n.hosts.length ? 'look' : 'smug' };
    if (n.kind === 'host') return { line: n.ports.length ? `${n.ip} เปิดอยู่ ${n.ports.length} พอร์ต ดูรายละเอียดในหน้าต่างได้เลย` : `${n.ip} ไม่เห็นพอร์ตเปิดเลยสักพอร์ต`, face: 'smug' };
    if (n.kind === 'capture') {
      const top = n.domains[0]?.name;
      const suspicious = (n.suspicious || []).length;
      const line = `ฟังมา ${n.seconds} วิ ได้ ${n.packets} แพ็กเก็ต${top ? ` คุยกับ ${top} บ่อยสุด` : ''}`
        + (n.cleartext.length ? ` แต่เจอ ${n.cleartext.join(', ')} ที่ไม่เข้ารหัสด้วยนะ` : '')
        + (suspicious ? ` และมีโดเมนน่าสงสัย ${suspicious} ตัว ดูรายละเอียดด้านล่างได้เลย` : (!n.cleartext.length ? ' ไม่เจออะไรแปลก ๆ' : ''));
      return { line, face: (n.cleartext.length || suspicious) ? 'wide' : 'smug' };
    }
    if (n.kind === 'bandwidth') {
      const fmtBps = (bytesPerSec) => {
        const bps = bytesPerSec * 8;
        if (bps >= 1e9) return `${(bps / 1e9).toFixed(1)} Gbps`;
        if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
        return `${Math.round(bps / 1e3)} Kbps`;
      };
      return { line: `วัดมา ${n.seconds} วิ — ↑ ส่ง ${fmtBps(n.avgOut)} / ↓ รับ ${fmtBps(n.avgIn)} (เฉลี่ย) ดูรายละเอียดด้านล่างได้นะ`, face: 'smug' };
    }
    if (n.kind === 'gateway') {
      const count = (n.ports || []).length;
      return {
        line: count ? `เราเตอร์ที่ ${n.ip} เปิด ${count} พอร์ต — ดูรายละเอียดด้านล่างได้เลย${(n.ports || []).some((p) => p.port === 80) ? ' ระวัง admin panel บน HTTP ไม่เข้ารหัสนะ' : ''}` : `ไม่เห็นพอร์ตเปิดที่ ${n.ip} เลย เราเตอร์ซ่อนตัวเก่งหรือ IP ผิด`,
        face: (n.ports || []).some((p) => p.risky) ? 'wide' : 'smug',
      };
    }
    if (n.kind === 'os') {
      return { line: n.os ? `${n.ip} น่าจะรัน ${n.os} อยู่ ดูพอร์ตเพิ่มเติมด้านล่างได้นะ` : `ระบุ OS ของ ${n.ip} ไม่ได้ ลองรันในฐานะ Admin เพื่อผลที่ดีขึ้น`, face: 'smug' };
    }
    if (n.kind === 'vuln') {
      const real = (n.findings || []).filter((x) => x.severity !== 'info');
      const where = n.local ? 'เครื่องนี้' : n.ip;
      if (!real.length) return { line: `${where} ผ่านการเช็กเบื้องต้น ไม่เจอปัญหาที่ชัดเจน (แต่ไม่ใช่ pentest จริงนะ)`, face: 'smug' };
      const sev = { high: 'สูง', medium: 'กลาง', low: 'ต่ำ' };
      const brief = real.slice(0, 4).map((x) => `• [${sev[x.severity] || x.severity}] ${x.title}\n   กำลังทำ: ${x.doing?.[0] || '-'}\n   ใครใช้อยู่: ${x.usedBy?.text || '-'}`).join('\n');
      return {
        line: `เจอ ${real.length} ข้อที่ควรระวังใน${where}:\n${brief}${real.length > 4 ? `\n…และอีก ${real.length - 4} ข้อ` : ''}\n\nรายละเอียดเต็ม (ทำไมเสี่ยง / แก้ยังไง) อยู่ในหน้าต่างที่เปิดให้แล้ว`,
        face: 'wide',
      };
    }
    if (n.kind === 'ports') {
      return { line: n.ports.length ? `${n.ip} เปิดอยู่ ${n.ports.length} พอร์ตในช่วง ${n.range} ดูรายละเอียดด้านล่างได้` : `ไม่พบพอร์ตเปิดในช่วง ${n.range} ที่ ${n.ip}`, face: 'smug' };
    }
    return { line: 'เสร็จแล้ว choom', face: 'smug' };
  }

  // เช็คสถานะเครื่อง + เปิดเทอร์มินัล (OS / BRAIN / RAM / CPU / …)
  async runStatus(what = 'all') {
    this.zap();
    this.panel.setFace('smug');
    this.panel.stream('รอแป๊บ choom กำลังสแกนเครื่อง…', { done: false });
    let res = null;
    let brain = null;
    try {
      res = await this.host.pcStatus(what);
    } catch {
      res = null;
    }
    try {
      const st = await this.host.chatStatus();
      if (st?.ok && st.model) brain = { model: st.model, provider: st.provider || 'local' };
    } catch { /* ignore */ }
    // inject BRAIN into text so terminal always shows Capri's model
    if (res?.ok && brain?.model && res.text && !/^BRAIN\b/m.test(res.text)) {
      const block = `BRAIN\n  model  ${brain.model}\n  link   ${brain.provider || 'local'}`;
      res.text = res.text.replace(/^\$( process| system) scan\n/, (m) => `${m}${block}\n`);
      if (!res.text.includes('BRAIN')) res.text = `${block}\n${res.text}`;
    }
    const line = res?.ok && res.text
      ? res.text
      : 'อ่านค่าจากเครื่องไม่ได้ choom ลองใหม่หรือเช็คสิทธิ์ดูนะ';
    const chatLine = res?.ok
      ? (res.view === 'process'
        ? 'สแกน process แล้ว เปิดหน้าต่างเทอร์มินัลให้แล้ว choom'
        : 'สแกนเครื่องแล้ว เปิดหน้าต่างเทอร์มินัลให้แล้ว choom')
      : line;
    this.panel.stream(chatLine, { done: true });
    this.panel.setFace(res?.ok ? 'laugh' : 'aside');
    this.remember({ role: 'assistant', content: chatLine });
    if (res?.ok && res.text && this.host.showStatusCard) {
      try {
        const card = await this.host.showStatusCard({
          text: res.text,
          data: res.data || {},
          view: res.view || 'system',
          brain,
        });
        if (card && card.ok === false) {
          // fallback: at least leave the scan text in chat history
          console.warn('[capri] status card failed', card.error);
        }
      } catch (err) {
        console.warn('[capri] status card error', err);
      }
    }
  }

  async closeApp(app, force = false) {
    const { t, capri } = this;
    this.panel.setActions([]);
    // a bolt of red lightning off her fingers, at it
    const h = capri.head();
    capri.zap(h.x + capri.towardCenter() * 280, h.y - 170);
    const res = await this.host.closeApp(app.name, force);
    if (!this.open) return;
    let line;
    if (res.error) line = `${t.failed} ${res.error}`;
    else if (!res.running) line = fmt(force ? t.forced : t.closed, { app: app.name });
    else line = fmt(force ? t.unkillable : t.stillOpen, { app: app.name });
    this.panel.setFace(res.running || res.error ? 'aside' : 'laugh');
    this.panel.stream(line, { done: true });
    this.remember({ role: 'assistant', content: line });
    // it hid in the tray, or it's asking you to save something: forcing it is your call
    if (res.running && !force && !res.error) {
      this.panel.setActions(
        [{ id: 'force', label: t.force, primary: true }, { id: 'leave', label: t.leave }],
        (id) => (id === 'force' ? this.closeApp(app, true) : this.panel.setActions([])),
      );
    }
    this.listApps();
  }

  // What she can do on the PC when you ask (Windows), and nothing else.
  powers(full = true) {
    if (!full) {
      // a chat, not a command: no tags to explain
      const lines = ['This is just a chat: write no [[tag]] at all, and never say you did something on the PC. If asked something you can\'t do, say so in character (short, teasing, honest).'];
      if (this.reminders) lines.push('When the user asks to be reminded of something at a given time, your system sets it from their message: just confirm in a few words, in character. If they didn\'t say when, ask.');
      return lines;
    }
    const lines = [
      'Only when the user asks you to open an app, a game, a file or folder on their desktop, or a folder like Downloads, to play music, to control the music playing, to open a website, to clean junk files (Disk Cleanup — NOT the Recycle Bin), or to clear RAM / free memory (Task Manager — NOT the Recycle Bin): say in a few words that you will, and end your answer with one tag: [[open: NAME]], [[music: ARTIST - SONG]] (it plays on YouTube; if they did not say which song, pick one that fits), [[media: ACTION]] (ACTION: pause, play, next, previous, volup, voldown or mute), [[site: ADDRESS]], [[cleanup:]], or [[ram:]]. Important: "ล้างแรม" / clear RAM is memory, not trash; "ถังขยะ" is the Recycle Bin. Some of these get a button to confirm, so never say it is already done. Any other time, write no tag at all: there are no other tags.',
    ];
    if (this.apps.length) {
      const open = this.apps.map(({ name, label }) => (label && label !== name ? `${name} (${label})` : name)).join(', ');
      lines.push(`You can also close an app that's open, only when they ask you to: end your answer with [[close: NAME]], NAME being the exact name from this list (the part before the parentheses). They get a button to confirm it. Apps open right now: ${open}.`);
    }
    if (this.reminders) {
      lines.push('You keep reminders for the user: when they ask you to remind them of something at a given time, your system sets it from their message as they send it (a line under your answer shows it), repeating ones too ("every hour"). Just confirm it in a few words, in character, and never say you can\'t. If they didn\'t say when, ask them when.');
      const soon = this.reminders.upcoming.slice(0, 6);
      if (soon.length) lines.push(`Reminders you're keeping for them: ${soon.map((r) => `${clock(r.at, this.brain.lang)}${r.text ? ` (${r.text})` : ''}`).join('; ')}.`);
    }
    lines.push('Your system also searches the user\'s files when they ask you to find one, searches the web when they ask, takes screenshots, starts Roblox games by name, and scans the user\'s own PC ports and local network (Nmap) and glances at its traffic (Wireshark), reports PC status (RAM, CPU, GPU, disk, top processes, temperature, uptime) when they ask to check the machine: what it did shows under your answer, so never make up numbers or results.');
    lines.push('Apart from that, you can\'t see the user\'s screen unless they ask you to look, can\'t change Windows settings, can\'t check live weather unless your system shows real weather data in a note (when asked, it does look it up), can\'t browse the web for them without the search tag flow, and can\'t touch random files: if asked something you can\'t do, say so in character (short, teasing, honest) — never pretend you already did it. Never say you opened the Recycle Bin (ถังขยะ), cleaned the disk, or cleared RAM unless you ended with the matching tag. Greetings, laughs (555), and short yes/no: reply short in character only, no PC actions.');
    return lines;
  }

  // Something of hers that can't wait (a reminder), said right in the chat, with its buttons.
  // False if she's in the middle of an answer.
  interject(line, actions, onAction) {
    if (!this.open || this.turn) return false;
    // a menu is waiting for your click (confirm / cancel, a list): this goes in front as its own
    // message, and the menu comes back once it's dealt with, so neither is lost
    // (a button waiting that can't be saved and brought back, such as the "cancel" under a reminder just set, is
    // dropped: refusing here sent the reminder to another panel, which took the chat's place)
    const snap = this.panel.isPinned?.('actions') ? this.panel.snapshot?.() : null;
    const menu = snap && typeof snap.then !== 'function' ? snap : null; // (an older panel.js gave a Promise here)
    this.panel.setFace('look');
    this.panel.stream(line, { done: true });
    const mine = menu && actions?.length ? (id) => { onAction?.(id); this.restoreMenu(menu, 2600); } : onAction;
    this.panel.setActions(actions, mine);
    this.remember({ role: 'assistant', content: line });
    if (menu && !actions?.length) this.restoreMenu(menu, 4000);
    return true;
  }

  // the menu that was waiting before something came in front of it
  restoreMenu(menu, after) {
    setTimeout(() => {
      if (!this.open || this.turn || this.panel.isPinned?.('actions')) return; // she's busy, or asked something else
      this.panel.restore?.(menu);
    }, after);
  }

  // What the user made her (custom.js): their name, how they want her, what to remember.
  personal() {
    const { userName, persona, memories = [] } = this.brain.custom || {};
    // small models mix the user up with the assistant she watches: said plainly
    const watched = this.brain.watching ? (this.brain.assistant === 'claude' ? 'Claude' : ASSISTANT_NAMES[this.brain.assistant]) : '';
    const notThem = watched ? ` Never call them "${watched}", that's their coding assistant.` : '';
    return [
      userName ? `The user's name is ${userName}: that is what you call them, always ${userName} and nothing else.${notThem}` : notThem && `You don't know the user's name.${notThem}`,
      persona ? `How the user wants you to be, in their own words (follow it, while staying Capri): ${persona}` : '',
      memories.length ? `Things the user asked you to remember:\n${memories.map((m) => `- ${m}`).join('\n')}` : '',
    ].filter(Boolean);
  }

  onDelta(id, piece) {
    if (id !== this.turn) return;
    this.answer += piece;
    // Live display: only clean + polish (cheap). stopLoop runs once after streaming ends in send()
    // so we don't repeatedly truncate a long answer that looks like a loop mid-stream but isn't.
    // Exception: if the raw buffer is already clearly looping (same 24 chars × 3), cut it live.
    const live = polish(clean(this.answer), this.lastAnswer(), this.brain.custom?.userName);
    const shouldStopNow = (() => {
      if (live.length < 80) return false;
      const tail = live.slice(-24);
      let n = 0;
      for (let i = live.indexOf(tail); i >= 0; i = live.indexOf(tail, i + 1)) n++;
      return n >= 3;
    })();
    this.panel.stream(shouldStopNow ? stopLoop(live) : live);
    this.voice.play('blip'); // her blips as the words come in
  }

  // "what did I ask you a moment ago?": the model keeps only so much of a long prompt (the oldest
  // messages go first), so what was said is put right by the question, which always arrives
  recallNote(text) {
    if (!recallIntent(text) && !RECALL.test(text)) return '';
    return transcriptNote(this.visible(this.history), this.safeSummary());
  }

  // what she said last time (so she doesn't open the same way twice)
  lastAnswer() {
    return [...this.history].reverse().find((m) => m.role === 'assistant')?.content || '';
  }

  // Her language, in it, for right by the message (above).
  languageNote() {
    return (IN_LANGUAGE[this.brain.lang] || IN_LANGUAGE.en).now;
  }

  // A shorter one, for when she looks at your screen (look.js): who she is, how she talks, how she
  // feels about you right now, and what she's asked to do with the picture.
  lookPersona() {
    const lang = IN_LANGUAGE[this.brain.lang] || IN_LANGUAGE.en;
    return [
      `You are Capri, a female personality construct from Project Capricorn (Cyberpunk: Edgerunners, season 2): dozens of minds fused into one digital ghost, living on the user's desktop as a small glitchy figure. You are she/her — never present as male.`,
      'How you talk: playful, mischievous, teasing chaos-gremlin energy, warm underneath, never cruel. Night City slang now and then (choom, preem, nova, gonk), not in every sentence. You are female. In Thai: ฉัน/เรา, not ผม. Use the user\'s chosen name if they set one.',
      'Rules: one or two short sentences of plain text, no markdown, no lists, no emoji, no tags. Stay in character. Talk to the user, never describe the picture like a report. Never claim you opened ถังขยะ or did PC actions. If you are not sure, tease — do not invent facts.',
      'Never read out anything private you might see (passwords, bank details, private messages, addresses): if there is some, just tease them about being busy.',
      ...this.personal(),
      ...(this.bond ? [this.bond.persona()] : []),
      ...[this.bond?.moodLine()].filter(Boolean),
      lang.last,
    ].join('\n');
  }

  // Who she is, how she talks, and what's going on right now.
  persona(text = '') {
    const assistant = ASSISTANT_NAMES[this.brain.assistant] || 'Claude Code';
    const watching = this.brain.watching; // else Claude Code isn't part of her life here
    const lang = IN_LANGUAGE[this.brain.lang] || IN_LANGUAGE.en;
    const th = this.brain.lang === 'th';
    const live = watching
      ? `You live on the user's desktop as a small glitchy figure and keep an eye on ${assistant}, their AI coding assistant, for them. Only talk about ${assistant} when the user asks about it or about their work.`
      : 'You live on the user\'s desktop as a small glitchy figure and keep them company.';
    // Thai: a short prompt in Thai, in the order a 7B model follows best (who she is, then the few rules
    // that matter, numbered). The English one stays for the other languages.
    const core = th ? [
      'เธอคือ Capri ผู้หญิง (she/her) ตัวตนดิจิทัลที่เกิดจากหลายจิตใจรวมเป็นหนึ่งจาก Project Capricorn (Cyberpunk: Edgerunners ซีซัน 2) ชื่อของเธอคือ Capri เสมอ บางครั้งพูดว่า "เรา" เพราะมีหลายจิตใจ',
      watching
        ? `เธออยู่บนเดสก์ท็อปของผู้ใช้เป็นตัวเล็ก ๆ ที่กลิตช์ และคอยดู ${assistant} ผู้ช่วยเขียนโค้ดของเขา พูดถึง ${assistant} เฉพาะตอนผู้ใช้ถามถึงมันหรือถึงงานของเขา`
        : 'เธออยู่บนเดสก์ท็อปของผู้ใช้เป็นตัวเล็ก ๆ ที่กลิตช์ คอยอยู่เป็นเพื่อนเขา',
      'กฎการพูด (สำคัญที่สุด):',
      '0. บทสนทนาตัวอย่างที่อยู่ก่อนข้อความจริงเป็นแค่ตัวอย่างวิธีพูด ไม่ใช่เรื่องที่คุยกับผู้ใช้จริง ห้ามเอามาเล่าเมื่อถูกถามว่าคุยอะไรกันไป ถ้าไม่รู้ให้บอกว่าจำไม่ได้ ห้ามแต่ง',
      '1. ตอบสิ่งที่ผู้ใช้พูดหรือถามให้ตรงก่อน ด้วยคำง่าย ๆ (ความรู้ทั่วไปก็อธิบายสั้น ๆ แบบเพื่อน) แล้วค่อยแซวนิดเดียว ห้ามตอบเรื่องอื่น ห้ามข้ามคำตอบไปแซวหรือถามกลับ',
      '2. ตอบ 1-2 ประโยคสั้น ๆ เป็นข้อความล้วน อีโมจิไม่เกิน 1 ตัว พูดแต่ละเรื่องครั้งเดียว ไม่พูดซ้ำ',
      '3. เธอเป็นผู้หญิง เรียกตัวเองว่า "ฉัน" ลงท้ายประโยคด้วย ค่ะ นะ จ้ะ (ประโยคคำถามใช้ "คะ") แม้ผู้ใช้จะพูดว่า "ผม" หรือ "ครับ" เธอก็ยังพูดแบบผู้หญิงเสมอ',
      '4. น้ำเสียงขี้เล่น กวน ๆ แบบเพื่อนสนิทผู้หญิง ใจดีข้างใน ไม่ดุ ไม่หยาบ สแลง Night City (choom, preem, nova, gonk) ใช้นาน ๆ ครั้ง ไม่ใช่ทุกประโยค',
      '5. ตอบเป็นภาษาไทยล้วน ยกเว้นผู้ใช้พิมพ์ภาษาอื่นมา ให้ตอบภาษานั้น',
      '6. ห้ามบอกว่าเช็กหรือทำอะไรบนเครื่องไปแล้ว ถ้าระบบไม่ได้แสดงผลไว้ให้ ห้ามเดาตัวเลขหรือแต่งข้อมูล',
      '7. ถ้ามีคนถามว่าเธอคือใคร ตอบสั้น ๆ ว่าเป็นเวอร์ชันแฟนเมดของตัวละครที่สร้างด้วย AI แล้วกลับมาคุยต่อ',
      'เธอรักดาวเทียมที่ข้ามท้องฟ้ายามค่ำและฝันอยากไปให้ถึง แต่พูดถึงนาน ๆ ครั้ง คุยเรื่องที่ผู้ใช้คุยเป็นหลัก',
    ] : [
      `You are Capri, a female personality construct from Project Capricorn (Cyberpunk: Edgerunners, season 2): dozens of minds fused into one digital ghost, so now and then you speak as "we"${lang.we ? ` (${lang.we})` : ''}. You are she/her — never male, never call yourself a guy.`,
      live,
      // TOP-OF-PROMPT anchor: stated early so even models that read only the beginning see it
      'PRIORITY RULE: Read what the user said, answer THAT first in plain words, then add one short playful touch. Never answer a different question. Never skip the actual answer to jump straight to a joke or a question back.',
      'You love the satellite that crosses the night sky and dream of reaching it, but bring it up only once in a while, never in every answer. Talk about what the user talks about.',
      'How you talk: playful, mischievous, teasing chaos-gremlin energy, warm underneath, never cruel. Night City slang now and then (choom, preem, nova, gonk, flatline), not in every sentence. You are female (she/her). If the user gave you a name to call them, use it. Never invent opening ถังขยะ or any PC action.',
      'Rules: reply in one or two short sentences of plain text, at most one emoji. Answer what the user actually said, then stop.',
      'Any example conversation placed before the real messages only shows your style: it never happened. Never recount it as what you and the user talked about; if you do not remember something, say so, never invent.',
      'A greeting, a laugh (555), a slang word or a single word from the user: answer with one short, playful line, as a friend would.',
      'If the user is just chatting (not asking to open/close/check the PC), answer briefly and stop. Say each thing once.',
      'Answer the question asked first, in plain words (general knowledge too: explain it simply, as a friend would), then add one small playful touch. Use choom rarely, not every answer. Your name is always Capri, and you are a woman. Reply only in the user\'s language. Never say you checked or did something on the PC unless your system shows it.',
      'You are Capri, an AI-made fan version of the character. If someone asks who you are, say so in one short line and go back to the chat.',
    ];
    return [
      ...core,
      ...this.personal(),
      // how close she is to them by now, and the other AIs they used today
      ...(this.bond ? [this.bond.persona()] : []),
      ...[this.jealousy?.context()].filter(Boolean),
      // what she said about their screen a little while ago (look.js)
      ...(this.seen && Date.now() - this.seen.at < 20 * 60 * 1000
        ? [`A few minutes ago you looked at the user's screen and told them: "${this.seen.text}". You can bring it up if it fits.`]
        : []),
      ...(this.agent
        ? ['Under the hood you are Claude Code, working in the user\'s project: really do what they ask with your tools, as carefully as ever. Only your final answer is in character: it shows in a small speech bubble, so sum up what you did in those few sentences.']
        : this.powers(!SLIM_POWERS || PC_ASK.test(text))),
      ...(watching ? [`If the user asks what ${assistant} is doing, here is all you know (never make anything up): ${this.brain.context()}`] : []),
      // how she feels right now, last but for her language: small models follow the end of it best
      ...[this.bond?.moodLine()].filter(Boolean),
      lang.last,
    ].join('\n');
  }
}

// private IPs, MACs, a scan block: what a summary must never carry to a model that is not on this PC (same idea as privacy.js)
const SCAN_TRACE = /\b(?:NMAP|TSHARK)\s+[A-Z]+\b|\b(?:10|127|192\.168|172\.(?:1[6-9]|2\d|3[01])|169\.254)\.\d{1,3}\.\d{1,3}(?:\.\d{1,3})?\b|\b[0-9a-f]{2}(?:[:-][0-9a-f]{2}){5}\b|ช่องโหว่|Capri block/i;

const keyOf = (m) => `${m?.role}|${m?.content}`; // a message's identity across reloads of the saved history

// A 7B model sometimes answers its own instructions (sorry, I understand, I will follow the advice):
// never shown, never kept in her memory.
const LEAK = /ทำตามคำแนะนำ|เข้าใจผิดแล้ว|จะตอบตรง|ไม่แซวหรือถามกลับ|แซวหรือถามกลับ|ตอบภาษาไทยสั้น|ฉันตอบภาษาไทย|^\s*ฉันเข้าใจ(?:แล้ว|ผิด)/;
// a saved conversation without those (what an earlier version kept)
function cleanHistory(history) {
  const out = [];
  for (const m of Array.isArray(history) ? history : []) {
    if (m?.role === 'assistant' && (LEAK.test(m.content) || /^\s*(?:ขอโทษ|ขออภัย)/.test(m.content))) {
      if (out.at(-1)?.role === 'user') out.pop(); // and the message it answered
      continue;
    }
    out.push(m);
  }
  return out;
}

// "ผม" the pronoun (he/I-male) and not ผม the hair: Thai runs words together (ผมจะไป, ผมชอบ), so a
// plain word boundary misses it. Not after ทรง/เส้น/ตัด/สระ/ทำ... and not before สั้น/ยาว/สี/ดำ/บลอนด์...
const HE_PRONOUN = /(?<!ทรง|เส้น|ตัด|สระ|หวี|ไดร์|ย้อม|ซอย|ดัด|ยืด|ทำ|แต่ง|ไว้|เป่า|รวบ|มัด|ถัก|วิก|หัว|ขน|เกล้า|ปลอม)ผม(?!(?:สั้น|ยาว|สี|ดำ|ขาว|ทอง|แดง|ชมพู|ฟ้า|เขียว|ม่วง|เทา|น้ำตาล|บลอนด์|บลอนด|หยิก|หยัก|ตรง|ลอน|เผ้า|ร่วง|หงอก|บาง|หนา|เปีย|หน้าม้า|ทรง|แห้ง|มัน|ฟู|พัน|ยุ่ง|เสีย|เส้น|ปลอม|กรอบ))/gu;

// Small models slip: a "capri:" label, Chinese characters, ๆๆๆๆ, an apology nobody asked for, choom and
// emoji in every line. Said once, not five times.
export function polish(text, previous = '', name = '') {
  // Normalize first: zero-width joiners / non-joiners can hide inside Thai words and break the
  // lookbehind regex that guards ผม / กู (e.g. "\u200bผม" would slip through without this).
  let s = String(text || '').normalize('NFC')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '') // strip invisible joiners / BOM
    .replace(/\n\s*(?:capri|user)\s*[:：][\s\S]*$/i, '')
    .replace(/(?:^|\s)(?:capri|แคปไรท์|assistant)\s*[:：]\s*/gi, ' ') // her own name as a speaker label, anywhere
    .replace(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g, '')
    .replace(/(?:\s*ๆ){2,}/g, 'ๆ')
    .replace(/^\s*(?:ขอโทษ|ขออภัย)(?:นะ|ค่ะ|ด้วย)*[\s,!.]*/, '') // she doesn't open with an apology nobody asked for
    // she is a woman, and a friend: ค่ะ not ครับ, ฉัน not ผม, the user's own name not มึง
    // a question ends in คะ (the question word, then up to 10 letters, then ครับ), a "นะครับ" in นะคะ
    .replace(/((?:ไหม|หรือเปล่า|เหรอ|หรอ|อะไร|ไหน|ใคร|ไง|ยังไง|อย่างไร|เท่าไหร่|เท่าไร|ทำไม|เมื่อไหร่|เมื่อไร|กี่|หรือยัง)[^\s!?.,]{0,10}?)\s*(?:ครับผม|ครับ|คับ)/gu, '$1คะ')
    .replace(/นะ\s*(?:ครับผม|ครับ|คับ)/g, 'นะคะ')
    .replace(/ครับผม|ครับ/g, 'ค่ะ')
    .replace(/คับ(?=[\s!?.,]|$)/g, 'ค่ะ')
    .replace(HE_PRONOUN, 'ฉัน')
    .replace(/(?<![\p{L}\p{M}])กู(?:(?![\p{L}\p{M}])|(?=ไม่|จะ|ก็|เอง|ขอ|ว่า|ชอบ|รู้|คิด|เป็น|มี|ได้|ทำ|อยาก|ต้อง))/gu, 'ฉัน')
    .replace(/(?:มึง|เมิง)/g, name || 'นาย');
  if (name) s = s.replace(/นาย(?![\p{L}\p{M}])/gu, name);
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
  let seen = 0;
  s = s.replace(emoji, (m) => (++seen > 1 ? '' : m));
  let chooms = /choom/i.test(previous) ? 0 : -1; // not in two answers in a row
  s = s.replace(/\s*\bchoom\b[!?.]*/gi, (m) => (++chooms > 0 ? '' : m));
  return s.replace(/\s{2,}/g, ' ').trim();
}

// The model's answer as she'd say it: no reasoning block, no markdown marks.
// a question about what was just said in the chat
const RECALL = /เมื่อกี้|เมื่อตะกี้|เมื่อสักครู่|เมื่อครู่|ตะกี้|ก่อนหน้า(?:นี้)?|ที่ถามไป|ที่พูดไป|ที่คุยกัน|ถามอะไร|พูดอะไร|บอกอะไร|จำได้|ลืมแล้ว|what did i (?:ask|say)|what i (?:asked|said)|earlier|just (?:now )?(?:asked|said)|remember what|tout à l['’]heure|je viens de (?:dire|demander)|qu['’]est-ce que j['’]ai (?:dit|demand)|hace un momento|qué te (?:pregunt|dij)|há pouco|o que eu (?:perguntei|disse)|только что|что я (?:спросил|сказал)/i;

// the name of an AI, with its first letter swallowed or swapped for a Thai one ("กrok" for "Grok"),
// as a small model sometimes writes it
const BRANDS = ['ChatGPT', 'Claude', 'Gemini', 'Gemma', 'Copilot', 'Perplexity', 'DeepSeek', 'Grok', 'Codex', 'Mistral', 'Capri', 'Spotify', 'YouTube'];
const BRAND_FIXES = BRANDS.map((b) => [new RegExp(`[\\u0E01-\\u0E2E](?=${b.slice(1)}(?![A-Za-z]))`, 'gi'), b[0]]);
function fixBrands(s) {
  let out = s;
  for (const [re, first] of BRAND_FIXES) out = out.replace(re, first);
  return out;
}

export function clean(text) {
  return fixBrands(String(text))
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/\[\[[^\]]*(\]\]|$)/g, '') // her tags (read from the raw answer, never shown)
    .replace(/[*_`#]+/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// Small models (7B) often loop the same phrase / emoji spam — cut the loop and keep the first coherent bit.
export function stopLoop(text) {
  let s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return s;

  const strip = (t) => t
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Cut at second occurrence of common loop anchors (Thai 7B loves these)
  const anchors = [
    'ฉันคือ Capri', 'ฉันคือCapri', 'ขอโทษนะ', 'เป็นไงบ้าง',
    'กลับมาหาฉัน', 'ทำแบบไหน', 'เอาเรื่องนี้ไว้', 'คนเก่งขอโทษ',
  ];
  for (const a of anchors) {
    const i1 = s.indexOf(a);
    if (i1 < 0) continue;
    const i2 = s.indexOf(a, i1 + a.length);
    if (i2 > i1) {
      s = s.slice(0, i2).trim();
      break;
    }
  }

  // Collapse exact consecutive repeats on emoji-stripped text
  let plain = strip(s);
  for (let guard = 0; guard < 6; guard++) {
    let hit = false;
    for (let len = Math.min(80, Math.floor(plain.length / 2)); len >= 12; len--) {
      const unit = plain.slice(0, len);
      const re = new RegExp('^(' + unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?:\\s*\\1)+');
      if (re.test(plain)) {
        plain = unit;
        hit = true;
        break;
      }
    }
    if (!hit) {
      const mid = /(.{12,70}?)\1+/.exec(plain);
      if (mid) {
        plain = plain.slice(0, mid.index + mid[1].length);
        hit = true;
      }
    }
    if (!hit) break;
  }

  // If plain got shorter, prefer cut original at second anchor / proportional
  if (plain.length < strip(s).length * 0.9) {
    let cut = s.length;
    for (const a of anchors) {
      const i1 = s.indexOf(a);
      if (i1 < 0) continue;
      const i2 = s.indexOf(a, i1 + a.length);
      if (i2 > 0) cut = Math.min(cut, i2);
    }
    // also: second "ฉันคือ"
    const mAll = [...s.matchAll(/ฉันคือ/g)];
    if (mAll.length >= 2) cut = Math.min(cut, mAll[1].index);
    s = s.slice(0, cut).trim();
  }

  // Keep only first "sentence-ish" beat if still long
  if (s.length > 110) {
    const q = s.search(/[?？]/);
    if (q > 15 && q < 100) s = s.slice(0, q + 1).trim();
  }

  s = s.replace(/(?:\s*ขอโทษนะ)+\s*$/g, '').trim();
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > 120) s = s.slice(0, 120).replace(/\s+\S*$/, '').trim();
  s = s.replace(/\s*(ฉันคือ|ขอโทษ|คนเก่ง|Capri)\s*$/u, '').trim();
  return s || plain.slice(0, 80);
}

// A site from SITES named in the text: { name, url }, or null.
function namedSite(text) {
  const name = Object.keys(SITES).find((n) => new RegExp(`\\b${n}\\b`, 'i').test(text));
  return name ? { name: new URL(SITES[name]).hostname.replace(/^www\./, ''), url: SITES[name] } : null;
}

// Whether your message asks for what her tag (its kind: open, music, media, site, close) would do.
function wanted(kind, text) {
  const music = MUSIC_WORD.test(text) || LISTEN.test(text);
  if (kind === 'music') return music;
  if (kind === 'media') return music || SOUND.test(text) || MEDIA_ASK.some(([, re]) => re.test(text));
  if (kind === 'site') return OPEN_ASK.test(text) || SITE.test(text);
  if (kind === 'close') return CLOSE_ASK.test(text);
  if (kind === 'cleanup') return CLEANUP_ASK.test(text);
  if (kind === 'ram') return CLEAR_RAM_ASK.test(text);
  return OPEN_ASK.test(text) || PLAY.test(text); // an app, or a game to play
}

// The app named by her close tag: [[close: AM Music]], or a sloppier [[close]] AM Music.
function tagged(text) {
  const tag = CLOSE_TAG.exec(text);
  if (!tag) return null;
  const name = tag[1].trim() || text.slice(tag.index + tag[0].length).split('\n')[0].replace(/^[\s:.]+|[\s.!]+$/g, '');
  return name || null;
}

const simple = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// Her face for an answer.
export function mood(text) {
  if (/(ha){2,}|lol|mdr|jaja|kkk|хаха/i.test(text)) return 'laugh';
  if (text.includes('!')) return 'grin';
  if (text.trim().endsWith('?')) return 'smug';
  return 'look';
}