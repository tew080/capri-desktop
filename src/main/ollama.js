'use strict';

// Talking to her: a local model through Ollama (https://ollama.com). Done from here, not from
// the overlay's page, which can't reach other local ports. Everything stays on this machine
// unless OLLAMA_HOST points somewhere else, or you pick one of Ollama's cloud models ("beam:cloud"):
// those run on its servers, with the account you're signed in with in Ollama.

const { execFile } = require('node:child_process');

function base() {
  let host = process.env.OLLAMA_HOST || '127.0.0.1:11434';
  if (!/^https?:\/\//.test(host)) host = `http://${host}`;
  return host.replace('://0.0.0.0', '://127.0.0.1').replace(/\/+$/, '');
}

// Ollama's errors come as {"error": "..."}. A cloud model can also say you're signed out (401) or
// out of free use for now (429): her chat moves on to another model then (main.js).
async function failure(res) {
  const body = await res.text().catch(() => '');
  let message = body || `Ollama answered ${res.status}`;
  try {
    message = JSON.parse(body).error || message;
  } catch {
    // not JSON: the body says it
  }
  const code = res.status === 429 || res.status === 503 ? 'busy'
    : res.status === 401 ? 'signin'
      : [402, 403, 404].includes(res.status) ? 'gone' : null;
  return Object.assign(new Error(message), { status: res.status, code });
}

// --- Presets (her menu: AI model > Tuning) -------------------------------------------------------
// Low temperature and a light repeat penalty keep a 7B model in character and in Thai: Thai has no
// spaces and repeats its particles (ค่ะ, นะ, ที่, เป็น) all the time, so a strong penalty pushes the
// model to odd words, and a high temperature makes it forget who she is.
// The prompt itself (persona + examples + history) is about 3-4k tokens, so no preset goes below 4096:
// below that Ollama cuts the start of the prompt, and her persona is the start.
// num_ctx 'auto' = the biggest context whose KV cache still fits in VRAM (autoCtx below).
const PRESETS = {
  fast: {
    label: 'เร็ว · ตอบสั้น (ctx 4096)',
    options: { num_ctx: 4096, temperature: 0.5, top_p: 0.85, top_k: 30, repeat_penalty: 1.05, repeat_last_n: 64, num_predict: 100, num_batch: 512 },
  },
  balanced: {
    label: 'สมดุล · แนะนำ (ctx 6144)',
    options: { num_ctx: 6144, temperature: 0.55, top_p: 0.9, top_k: 40, repeat_penalty: 1.08, repeat_last_n: 64, num_predict: 160, num_batch: 512 },
  },
  quality: {
    label: 'คงคาแรคเตอร์ · คุณภาพ (ctx 8192)',
    options: { num_ctx: 8192, temperature: 0.45, top_p: 0.85, top_k: 30, repeat_penalty: 1.08, repeat_last_n: 96, num_predict: 200, num_batch: 512 },
  },
  max: {
    label: 'เต็ม VRAM · ทุก layer บน GPU + ctx สูงสุดที่ใส่ได้',
    gpu: true,
    options: { num_ctx: 'auto', temperature: 0.5, top_p: 0.9, top_k: 40, repeat_penalty: 1.08, repeat_last_n: 64, num_predict: 200, num_batch: 1024 },
  },
};

// cfg.ollamaPreset: a key of PRESETS. cfg.ollamaOptions: anything to override, as Ollama's own option
// names ({ temperature: 0.4 }). cfg.ollamaReserveMB: VRAM left free by 'max' (default 1024).
let tuning = { preset: 'balanced', extra: {}, reserveMB: 1024 };
const resolved = new Map(); // `${preset}:${model}` -> options (worked out once: a new num_ctx reloads the model)
function configure(cfg = {}) {
  const preset = PRESETS[cfg.ollamaPreset] ? cfg.ollamaPreset : 'balanced';
  const next = { preset, extra: cfg.ollamaOptions || {}, reserveMB: Number(cfg.ollamaReserveMB) || 1024 };
  if (JSON.stringify(next) !== JSON.stringify(tuning)) resolved.clear();
  tuning = next;
}

// What Ollama said about each model it lists: { cloud, thinking, size }
const known = new Map();

// The models installed, by name ("llama3.2:latest", "beam:cloud"...).
async function models() {
  const res = await fetch(`${base()}/api/tags`, { signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw await failure(res);
  const { models: list = [] } = await res.json();
  for (const m of list) {
    known.set(m.name, { cloud: Boolean(m.remote_host), thinking: Boolean(m.capabilities?.includes('thinking')), size: m.size || 0 });
  }
  return list.map((m) => m.name);
}

// Run on Ollama's servers rather than this PC
const isCloud = (model) => known.get(model)?.cloud ?? /[:-]cloud$/.test(model || '');

// Your Ollama account, when you're signed in to it on this PC: { name, plan }. Signed out: { signin },
// the page that links this PC to an account. null when Ollama can't tell (asleep, cloud turned off).
async function account() {
  const res = await fetch(`${base()}/api/me`, { method: 'POST', signal: AbortSignal.timeout(6000) }).catch(() => null);
  if (!res) return null;
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.name) return { name: body.name, plan: body.plan || '' };
  const url = String(body.signin_url || '');
  return url.startsWith('https://ollama.com/') ? { signin: url } : null;
}

// The cloud models you can use for free ("beam:cloud"). There's no API for prices: this reads the
// "free" badges on Ollama's list of cloud models, a few times a day at most.
let free = { at: 0, names: [] };
async function freeModels() {
  if (Date.now() - free.at < 6 * 3600e3) return free.names;
  const res = await fetch('https://ollama.com/search?c=cloud', { signal: AbortSignal.timeout(8000) }).catch(() => null);
  const page = res?.ok ? await res.text().catch(() => '') : '';
  if (!page) return free.names;
  const names = [];
  for (const [card] of page.matchAll(/<li\b[\s\S]*?<\/li>/g)) {
    const slug = /href="\/library\/([\w.-]+)/.exec(card)?.[1];
    if (slug && />\s*free\s*</i.test(card)) names.push(`${slug}:cloud`);
  }
  free = { at: Date.now(), names: [...new Set(names)] };
  return free.names;
}

// --- VRAM and context ----------------------------------------------------------------------------
// NVIDIA only (nvidia-smi). Without it: null, and 'auto' falls back to 8192.
function gpuMemory() {
  return new Promise((resolve) => {
    execFile('nvidia-smi', ['--query-gpu=memory.total,memory.used', '--format=csv,noheader,nounits'],
      { timeout: 3000, windowsHide: true }, (err, out) => {
        if (err) return resolve(null);
        const [total, used] = String(out).split('\n')[0].split(',').map(Number);
        resolve(total ? { total: total * 2 ** 20, used: used * 2 ** 20 } : null);
      });
  });
}

async function show(model) {
  const res = await fetch(`${base()}/api/show`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  return res?.ok ? res.json().catch(() => ({})) : {};
}

// The model as it runs now: how much of it sits in VRAM, and with what context. null: not loaded.
async function placement(model) {
  const res = await fetch(`${base()}/api/ps`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
  const { models: list = [] } = res?.ok ? await res.json().catch(() => ({})) : {};
  const m = list.find((x) => x.name === model || x.model === model);
  if (!m) return null;
  return { size: m.size, vram: m.size_vram, gpuPercent: m.size ? Math.round((m.size_vram / m.size) * 100) : 0, ctx: m.context_length || null };
}

const MIN_CTX = 6144;

// The biggest context whose KV cache still fits in what VRAM has left, with the reserve (a compute
// buffer, the desktop) kept free. { ctx, fits }.
async function autoCtx(model) {
  const gpu = await gpuMemory();
  if (!gpu) return null;
  const mi = (await show(model)).model_info || {};
  const arch = mi['general.architecture'];
  const g = (k) => mi[`${arch}.${k}`];
  const layers = g('block_count');
  const heads = g('attention.head_count');
  const kvHeads = g('attention.head_count_kv') || heads;
  const headDim = g('attention.key_length') || (g('embedding_length') / heads);
  if (![layers, kvHeads, headDim].every(Number.isFinite)) return null;
  const kvType = process.env.OLLAMA_KV_CACHE_TYPE; // set on the server side: f16 (default) | q8_0 | q4_0
  const perToken = 2 * layers * kvHeads * headDim * (kvType === 'q4_0' ? 0.5 : kvType === 'q8_0' ? 1 : 2);
  const loaded = (await placement(model))?.vram || 0; // already in VRAM: its own use counts as free space
  const budget = gpu.total - (gpu.used - loaded) - (known.get(model)?.size || 0) - tuning.reserveMB * 2 ** 20;
  const fit = Math.floor(budget / perToken / 1024) * 1024;
  const limit = Math.min(g('context_length') || 32768, 32768); // more does nothing for a chat of a few lines
  // never under MIN_CTX: her prompt (persona, examples, a screen picture) is bigger than that, and Ollama
  // cuts its start, her persona, or refuses. fits false = the model's weights alone don't fit in VRAM
  return { ctx: Math.max(MIN_CTX, Math.min(fit, limit)), fits: fit >= MIN_CTX };
}

// Options for this model, worked out once and kept: changing num_ctx between messages would make
// Ollama load the model again.
async function optionsFor(model) {
  const key = `${tuning.preset}:${model}`;
  if (resolved.has(key)) return resolved.get(key);
  const preset = PRESETS[tuning.preset];
  const options = { ...preset.options };
  let fits = true;
  if (options.num_ctx === 'auto') {
    const auto = await autoCtx(model);
    options.num_ctx = auto?.ctx || 8192;
    fits = auto ? auto.fits : true;
  }
  // every layer on the GPU. Only if the model really fits: forced past VRAM, Windows spills into shared
  // memory and it gets slower than leaving a few layers on the CPU
  if (preset.gpu && fits) options.num_gpu = 999;
  Object.assign(options, tuning.extra); // num_thread is left to Ollama: it knows the physical cores
  resolved.set(key, options);
  return options;
}

// Loads the model into memory ahead of the first message, with the same options as the chat (another
// num_ctx would load it twice). Nothing to load for a cloud model.
async function warm(model) {
  if (isCloud(model)) return;
  const { num_ctx, num_gpu } = await optionsFor(model).catch(() => ({}));
  if (!num_ctx) return;
  fetch(`${base()}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, keep_alive: '30m', options: { num_ctx, ...(num_gpu && { num_gpu }) } }),
  }).catch(() => {});
}

// A small model stuck repeating itself: the same 24 characters, three times over.
function looping(text) {
  if (text.length < 80) return false;
  const tail = text.slice(-24);
  let n = 0;
  for (let i = text.indexOf(tail); i >= 0; i = text.indexOf(tail, i + 1)) n++;
  return n >= 3;
}

// Cut by num_predict mid-sentence: back to the last Thai particle or punctuation, if that keeps most of it.
function trimToSentence(text) {
  const m = /^[\s\S]*(?:ค่ะ|คะ|นะ|จ้ะ|จ๊ะ|เลย|555|[.!?…~])/.exec(text);
  return m && m[0].length > text.length * 0.5 ? m[0] : text;
}

// The context a request needs, rounded up with room for her answer: kept for this model from now on.
function raiseCtx(model, tokens) {
  const options = resolved.get(`${tuning.preset}:${model}`);
  if (!options || options.num_ctx >= 32768) return false;
  const next = Math.min(32768, Math.max(MIN_CTX, Math.ceil((tokens + 1500) / 1024) * 1024)); // room to grow: each change reloads the model
  if (next <= options.num_ctx) return false;
  options.num_ctx = next;
  return true;
}

// Her answer, streamed: onDelta(piece) as it comes, resolves with all of it. If the prompt doesn't fit the
// context ("exceeds the available context size"), the context is raised and it's asked again.
async function chat(request, onDelta, signal) {
  let streamed = false;
  const send = (piece) => { streamed = true; onDelta(piece); };
  for (let attempt = 0; ; attempt++) {
    try {
      return await chatOnce(request, send, signal);
    } catch (err) {
      const needed = /request \((\d+) tokens\) exceeds/.exec(err.message)?.[1];
      if (!needed || streamed || attempt > 1 || !raiseCtx(request.model, Number(needed))) throw err;
    }
  }
}

async function chatOnce({ model, messages }, onDelta, signal) {
  // cloud models think before they answer, and that counts in num_predict: kept short, with room for it
  const thinks = isCloud(model) && known.get(model)?.thinking;
  const options = isCloud(model) ? { num_predict: 120 } : await optionsFor(model);
  const res = await fetch(`${base()}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      keep_alive: '30m', // she stays loaded while you chat
      ...(thinks && { think: 'low' }),
      options: {
        ...options,
        stop: ['\ncapri:', '\nCapri:', '\nUser:'], // she never writes the next turn herself
        ...(thinks && { num_predict: 1200 }),
      },
    }),
    signal,
  });
  if (!res.ok) throw await failure(res);
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.error) throw new Error(msg.error);
      const piece = msg.message?.content || ''; // a thinking model's reasoning comes apart, and is left out
      if (piece) {
        text += piece;
        onDelta(piece);
        if (looping(text)) return text; // leaving the loop closes the stream: Ollama stops generating
      }
      if (msg.done) {
        // the prompt filled the whole context: Ollama cut its start (her persona). Bigger, from the next message on
        if (msg.prompt_eval_count >= (options.num_ctx || 0) - 32) raiseCtx(model, msg.prompt_eval_count);
        return msg.done_reason === 'length' ? trimToSentence(text) : text;
      }
    }
  }
  return text;
}

// Whether a model can look at pictures (gemma3 can, llama3.2 can't). Can't tell: yes, try it.
async function canSee(model) {
  const info = await show(model);
  return !Array.isArray(info.capabilities) || info.capabilities.includes('vision');
}

// One line for her menu: where the model runs now, e.g. { gpuPercent: 100, ctx: 8192 }. null: not loaded.
async function status(model) {
  const [where, gpu] = await Promise.all([placement(model), gpuMemory()]);
  return where && { ...where, gpuTotal: gpu?.total || 0, gpuUsed: gpu?.used || 0 };
}

module.exports = { base, models, isCloud, account, freeModels, warm, chat, canSee, configure, status, PRESETS };