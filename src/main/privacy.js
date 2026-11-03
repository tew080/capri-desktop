'use strict';

// privacy.js — ONE place that decides whether anything about this PC (scan results, ports, IPs, the fix log...)
// may be shown to her model. Used by main.js; the overlay (chat.js) is never trusted to decide this.
//
// Rule: only a model that runs ON THIS PC, reached through a loopback address, may read it.
//   - an API key provider, an online provider, an Ollama cloud model, Claude Code, a remote Ollama / custom URL: never.
//   - everything else is refused by default (a provider is only allowed if it is listed below).

const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|::1|0\.0\.0\.0)$/i;

// providers whose server is, by design, on this PC. Empty on purpose: add a key of llm.js PROVIDERS here only
// after checking that it really talks to a loopback address.
// checked in llm.js PROVIDERS: both have a fixed http://127.0.0.1 address (the user's customUrl is not used for them).
const EXTRA_LOCAL_PROVIDERS = new Set(['lmstudio', 'llamacpp']);

function hostOf(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return null;
  }
}
const isLoopbackHost = (h) => Boolean(h) && LOOPBACK.test(h);

// OLLAMA_HOST: "", "127.0.0.1:11434", ":11434", "0.0.0.0", "http://host:port"
function ollamaHostIsLocal() {
  const raw = String(process.env.OLLAMA_HOST || '').trim();
  if (!raw) return true;
  return isLoopbackHost(hostOf(raw.startsWith(':') ? `127.0.0.1${raw}` : raw));
}

/**
 * @returns {{ ok: boolean, why: string }}  why: 'ok' | 'off' | 'agent' | 'nomodel' | 'online' | 'cloud' | 'remote-host'
 */
function canShare(cfg, model, { llm, ollama, ignoreSwitch = false } = {}) {
  try {
    if (!cfg || (cfg.netAI === false && !ignoreSwitch)) return { ok: false, why: 'off' };
    if (cfg.provider === 'claude') return { ok: false, why: 'agent' };
    if (!model) return { ok: false, why: 'nomodel' };
    if (!llm || !llm.isLocal(cfg.provider, cfg, model)) return { ok: false, why: 'online' };
    if (cfg.provider === 'ollama') {
      if (ollama?.isCloud?.(model)) return { ok: false, why: 'cloud' };
      return ollamaHostIsLocal() ? { ok: true, why: 'ok' } : { ok: false, why: 'remote-host' };
    }
    if (cfg.provider === 'custom') {
      return isLoopbackHost(hostOf(cfg.customUrl)) ? { ok: true, why: 'ok' } : { ok: false, why: 'remote-host' };
    }
    if (EXTRA_LOCAL_PROVIDERS.has(cfg.provider)) return { ok: true, why: 'ok' };
    return { ok: false, why: 'online' };
  } catch {
    return { ok: false, why: 'online' }; // any doubt: no
  }
}

// Second line of defence for messages saved before the `private` flag existed, or ones the overlay forgot to flag:
// a scan block, a private IP or a MAC address inside the text.
const INTERNAL = /\b(?:NMAP|TSHARK)\s+[A-Z]+\b|\b(?:10|127|192\.168|172\.(?:1[6-9]|2\d|3[01])|169\.254)\.\d{1,3}\.\d{1,3}(?:\.\d{1,3})?\b|\b[0-9a-f]{2}(?:[:-][0-9a-f]{2}){5}\b/i;
const looksInternal = (m) => typeof m?.content === 'string' && INTERNAL.test(m.content);

/** the messages a model may get: flagged / internal-looking ones are dropped unless `share`; the flag itself never leaves. */
function scrub(messages, share) {
  const list = Array.isArray(messages) ? messages : [];
  const out = [];
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    const internal = m.private === true || (m.role !== 'system' && looksInternal(m));
    if (internal && !share) continue;
    if ('private' in m) { const { private: _drop, ...rest } = m; out.push(rest); } else out.push(m);
  }
  return out;
}

module.exports = { canShare, scrub, looksInternal, isLoopbackHost, hostOf };
