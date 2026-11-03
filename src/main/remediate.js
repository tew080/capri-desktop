'use strict';

// remediate.js — the ONLY place that changes this PC for security, and the only place that writes the fix log.
//
// Guard rails (all enforced here, not in the chat):
//  1. Whitelist. Only the actions in ACTIONS exist. Their parameters are validated (integers, fixed name lists) and
//     the PowerShell is built from them; nothing from a model, a scan or the overlay is ever pasted into a command.
//  2. Proposals. A fix can only be applied if THIS process proposed it (register(), from a real scan, < 30 min ago).
//     The overlay sends opaque fixIds, never commands or parameters.
//  3. Reason. A fix without a real reason (why / evidence / effect) is refused.
//  4. Consent. confirmed must be true (the overlay sets it only after the person pressed the button), and Windows
//     asks for administrator rights itself (UAC) on every batch.
//  5. Log. Before anything runs a 'plan' entry is written (fsync); afterwards a 'result' entry with the state before
//     and after. The log is append-only, hash-chained (editing or deleting a line is detected), mirrored in a second
//     file, in a folder only your Windows account can open. Undo rebuilds the command from the validated state in the
//     log, never from a stored command line.
//  6. Nothing is deleted, killed or uninstalled. Firewall rule added / profile switched on / service startup type changed.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, execFileSync } = require('node:child_process');
const { app } = require('electron');
const { BLOCKABLE } = require('./findings');

const WIN = process.platform === 'win32';
const GENESIS = '0'.repeat(64);
const PROFILES = new Set(['Domain', 'Private', 'Public']);
const SERVICES = new Set(['TlntSvr', 'FTPSVC', 'SNMP', 'simptcp', 'SSDPSRV', 'upnphost']);
const FW_STATES = new Set(['True', 'False', 'NotConfigured']);
const START_MODES = new Set(['Auto', 'Manual', 'Disabled']);
const MAX_BATCH = 6;
const PROPOSAL_TTL = 30 * 60 * 1000;

const psq = (s) => String(s).replace(/'/g, "''");
const dir = () => path.join(app.getPath('userData'), 'security');
const LOG = () => path.join(dir(), 'fix-log.jsonl');
const MIRROR = () => path.join(dir(), 'fix-log.mirror.jsonl');

// ---------- the whitelist ----------

const ACTIONS = {
  'firewall-block-port': {
    valid: (p) => Boolean(p) && Number.isInteger(p.port) && BLOCKABLE.has(p.port) && p.proto === 'tcp',
    validBefore: (b) => typeof b?.existed === 'boolean',
    rule: (p) => `Capri block TCP ${p.port}`,
    apply(p) {
      return [
        `$n='${psq(this.rule(p))}'`,
        '$existed = [bool](Get-NetFirewallRule -DisplayName $n -ErrorAction SilentlyContinue)',
        `if (-not $existed) { New-NetFirewallRule -DisplayName $n -Description 'Created by Capri security check. Delete this rule to undo.' -Direction Inbound -Action Block -Protocol TCP -LocalPort ${p.port} -Profile Any | Out-Null }`,
        '$before = @{ existed = $existed }',
        '$after = @{ present = [bool](Get-NetFirewallRule -DisplayName $n -ErrorAction SilentlyContinue) }',
        "if (-not $after.present) { throw 'firewall rule was not created' }",
      ].join('\n');
    },
    undo(p, b) {
      return [
        `$n='${psq(this.rule(p))}'`,
        '$before = @{ present = [bool](Get-NetFirewallRule -DisplayName $n -ErrorAction SilentlyContinue) }',
        b.existed ? '' : 'Get-NetFirewallRule -DisplayName $n -ErrorAction SilentlyContinue | Remove-NetFirewallRule',
        '$after = @{ present = [bool](Get-NetFirewallRule -DisplayName $n -ErrorAction SilentlyContinue) }',
      ].join('\n');
    },
  },

  'firewall-enable-profile': {
    valid: (p) => Boolean(p) && PROFILES.has(p.profile),
    validBefore: (b) => FW_STATES.has(b?.enabled),
    apply(p) {
      return [
        `$before = @{ enabled = [string](Get-NetFirewallProfile -Name '${p.profile}').Enabled }`,
        `Set-NetFirewallProfile -Name '${p.profile}' -Enabled True`,
        `$after = @{ enabled = [string](Get-NetFirewallProfile -Name '${p.profile}').Enabled }`,
        "if ($after.enabled -ne 'True') { throw 'firewall profile is still off' }",
      ].join('\n');
    },
    undo(p, b) {
      return [
        `$before = @{ enabled = [string](Get-NetFirewallProfile -Name '${p.profile}').Enabled }`,
        b.enabled === 'True' ? '' : `Set-NetFirewallProfile -Name '${p.profile}' -Enabled ${b.enabled}`,
        `$after = @{ enabled = [string](Get-NetFirewallProfile -Name '${p.profile}').Enabled }`,
      ].join('\n');
    },
  },

  'service-disable': {
    valid: (p) => Boolean(p) && SERVICES.has(p.name),
    validBefore: (b) => START_MODES.has(b?.mode) && typeof b?.delayed === 'boolean' && typeof b?.running === 'boolean',
    apply(p) {
      return [
        `$s = Get-CimInstance Win32_Service -Filter "Name='${p.name}'"`,
        "if (-not $s) { throw 'service not found' }",
        "$before = @{ mode = [string]$s.StartMode; delayed = [bool]$s.DelayedAutoStart; running = ([string]$s.State -eq 'Running') }",
        `sc.exe config ${p.name} start= disabled | Out-Null`,
        `if ($before.running) { Stop-Service -Name '${p.name}' -ErrorAction Stop }`,
        `$t = Get-CimInstance Win32_Service -Filter "Name='${p.name}'"`,
        "$after = @{ mode = [string]$t.StartMode; running = ([string]$t.State -eq 'Running') }",
        "if ($after.mode -ne 'Disabled') { throw 'service was not disabled' }",
      ].join('\n');
    },
    undo(p, b) {
      const start = b.mode === 'Auto' ? (b.delayed ? 'delayed-auto' : 'auto') : b.mode === 'Manual' ? 'demand' : 'disabled';
      return [
        `$s = Get-CimInstance Win32_Service -Filter "Name='${p.name}'"`,
        "$before = @{ mode = [string]$s.StartMode; running = ([string]$s.State -eq 'Running') }",
        `sc.exe config ${p.name} start= ${start} | Out-Null`,
        b.running ? `Start-Service -Name '${p.name}' -ErrorAction SilentlyContinue` : '',
        `$t = Get-CimInstance Win32_Service -Filter "Name='${p.name}'"`,
        "$after = @{ mode = [string]$t.StartMode; running = ([string]$t.State -eq 'Running') }",
      ].join('\n');
    },
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function wrap(id, body) {
  if (!UUID.test(id)) throw new Error('bad id');
  return `try {\n${body}\n$res += @{ id='${id}'; ok=$true; before=$before; after=$after }\n} catch { $res += @{ id='${id}'; ok=$false; error=[string]$_.Exception.Message } }`;
}

// ---------- the log: append-only, hash-chained, mirrored, private to your account ----------

let secured = false;
let lastHash = null;
let seq = 0;

function ensureDir() {
  const d = dir();
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  if (!secured) {
    secured = true;
    try {
      if (WIN) {
        const who = `${process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\` : ''}${os.userInfo().username}`;
        execFileSync('icacls.exe', [d, '/inheritance:r', '/grant:r', `${who}:(OI)(CI)F`, '/grant:r', '*S-1-5-18:(OI)(CI)F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 });
      } else fs.chmodSync(d, 0o700);
    } catch (err) {
      console.error('[capri] could not restrict the security folder:', err.message);
    }
  }
  return d;
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function readLines(file) {
  try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean); } catch { return []; }
}
function readAll() {
  const out = [];
  for (const line of readLines(LOG())) { try { out.push(JSON.parse(line)); } catch { /* shown by verify() */ } }
  return out;
}

function append(entry) {
  ensureDir();
  if (lastHash === null) {
    const tail = readAll().at(-1);
    lastHash = tail?.hash || GENESIS;
    seq = tail?.seq || 0;
  }
  const body = { seq: seq + 1, ts: new Date().toISOString(), ...entry, prev: lastHash };
  const hash = sha(JSON.stringify(body));
  const line = `${JSON.stringify({ ...body, hash })}\n`;
  for (const file of [LOG(), MIRROR()]) {
    const fd = fs.openSync(file, 'a', 0o600);
    try { fs.writeSync(fd, line); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  seq += 1; lastHash = hash;
  return { ...body, hash };
}

function logEvent(info) {
  try { return append({ ...info, type: info.type || 'event' }); } catch (err) { console.error('[capri] log:', err.message); return null; }
}

/** { valid, count, brokenAt, mirrorOk } */
function verify() {
  const lines = readLines(LOG());
  let prev = GENESIS;
  for (let i = 0; i < lines.length; i++) {
    let e;
    try { e = JSON.parse(lines[i]); } catch { return { valid: false, count: lines.length, brokenAt: i + 1, mirrorOk: false }; }
    const { hash, ...body } = e;
    if (e.prev !== prev || sha(JSON.stringify(body)) !== hash) return { valid: false, count: lines.length, brokenAt: i + 1, mirrorOk: false };
    prev = hash;
  }
  const m = readLines(MIRROR());
  return { valid: true, count: lines.length, brokenAt: null, mirrorOk: m.length === lines.length && m.at(-1) === lines.at(-1) };
}

// ---------- proposals (what a scan offered), each with its reason ----------

const proposals = new Map();

function buildReason(f, fx) {
  return {
    finding: f.title, severity: f.severity, why: f.why,
    evidence: [...(f.doing || []), f.usedBy?.text].filter(Boolean).slice(0, 8),
    effect: fx.effect, risk: fx.risk, warn: fx.warn || '', reversible: true,
    sources: (f.refs || []).slice(0, 3).map((r) => ({ title: r.title, url: r.url })),
    external: f.intel ? { source: f.intel.source, fetched: f.intel.fetched, note: f.intel.text } : null,
  };
}
const reasonOk = (r) => Boolean(r) && typeof r.why === 'string' && r.why.length >= 15
  && Array.isArray(r.evidence) && r.evidence.length >= 1 && typeof r.effect === 'string' && r.effect.length >= 10;

/** gives every fix of every finding an opaque fixId; call it on the findings of a real scan, before they leave main.js */
function register(findings) {
  const now = Date.now();
  for (const [id, p] of proposals) if (now - p.at > PROPOSAL_TTL) proposals.delete(id);
  for (const f of findings) {
    for (const fx of f.fixes || []) {
      const act = ACTIONS[fx.action];
      if (!act || !act.valid(fx.params)) { fx.invalid = true; continue; }
      fx.fixId = crypto.randomUUID();
      proposals.set(fx.fixId, { at: now, title: fx.label, fix: { action: fx.action, params: { ...fx.params } }, reason: buildReason(f, fx) });
    }
    f.fixes = (f.fixes || []).filter((fx) => !fx.invalid);
  }
  return findings;
}

// ---------- running as administrator ----------

function runElevated(body) {
  return new Promise((resolve) => {
    const d = ensureDir();
    const file = path.join(d, `run-${crypto.randomUUID()}.json`);
    const script = `$ErrorActionPreference='Stop'\n$res=@()\n${body}\nConvertTo-Json -InputObject @($res) -Depth 5 -Compress | Out-File -LiteralPath '${psq(file)}' -Encoding utf8`;
    const b64 = Buffer.from(script, 'utf16le').toString('base64');
    if (b64.length > 24000) return resolve({ ok: false, error: 'too-big' });
    const outer = `try { Start-Process -FilePath powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ErrorAction Stop -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${b64}' } catch { exit 3 }`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', outer], { timeout: 180000, windowsHide: true }, (err) => {
      let results = null;
      try { results = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { /* none */ }
      try { fs.unlinkSync(file); } catch { /* none */ }
      if (!results) return resolve({ ok: false, error: err?.code === 3 ? 'uac-cancelled' : 'no-result' });
      resolve({ ok: true, results: Array.isArray(results) ? results : [results] });
    });
  });
}

const cleanNote = (n) => String(n || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 400);

// ---------- apply / list / undo ----------

async function apply({ fixIds, confirmed, note } = {}) {
  if (confirmed !== true) return { ok: false, error: 'not-confirmed', results: [] };
  if (!WIN) return { ok: false, error: 'unsupported', results: [] };
  const ids = [...new Set(Array.isArray(fixIds) ? fixIds.map(String) : [])].slice(0, MAX_BATCH);
  const results = []; const jobs = [];
  for (const fixId of ids) {
    const prop = proposals.get(fixId);
    if (!prop || Date.now() - prop.at > PROPOSAL_TTL) { results.push({ fixId, ok: false, error: 'expired' }); continue; }
    const act = ACTIONS[prop.fix.action];
    if (!act || !act.valid(prop.fix.params)) { results.push({ fixId, title: prop.title, ok: false, error: 'invalid' }); continue; }
    if (!reasonOk(prop.reason)) { results.push({ fixId, title: prop.title, ok: false, error: 'no-reason' }); continue; }
    const entryId = crypto.randomUUID();
    append({ type: 'plan', id: entryId, action: prop.fix.action, params: prop.fix.params, title: prop.title, reason: prop.reason, modelNote: cleanNote(note) || null, via: 'chat-button', confirmedByUser: true });
    jobs.push({ fixId, entryId, act, prop });
  }
  if (!jobs.length) return { ok: false, error: results[0]?.error || 'nothing', results };

  const run = await runElevated(jobs.map((j) => wrap(j.entryId, j.act.apply(j.prop.fix.params))).join('\n'));
  for (const j of jobs) {
    const r = run.ok ? run.results.find((x) => x.id === j.entryId) : null;
    const ok = Boolean(r?.ok);
    const error = ok ? null : (run.ok ? (r?.error || 'no-result') : run.error);
    append({ type: 'result', id: j.entryId, ok, error, before: r?.before ?? null, after: r?.after ?? null });
    if (ok) proposals.delete(j.fixId);
    results.push({ fixId: j.fixId, entryId: j.entryId, title: j.prop.title, ok, error });
  }
  return { ok: results.some((r) => r.ok), results, error: run.ok ? null : run.error };
}

function index() {
  const plans = new Map(); const results = new Map(); const undone = new Map(); const undoFail = new Map();
  for (const e of readAll()) {
    if (e.type === 'plan') plans.set(e.id, e);
    else if (e.type === 'result') results.set(e.id, e);
    else if (e.type === 'undo-result') (e.ok ? undone : undoFail).set(e.of, e);
  }
  return { plans, results, undone, undoFail };
}

/** newest first: [{ entryId, ts, title, action, why, status: 'applied'|'failed'|'undone', canUndo }] */
function list(limit = 10) {
  const { plans, results, undone } = index();
  return [...plans.values()].reverse().slice(0, Math.max(1, Math.min(50, limit))).map((p) => {
    const r = results.get(p.id);
    const status = undone.has(p.id) ? 'undone' : r?.ok ? 'applied' : 'failed';
    return { entryId: p.id, ts: p.ts, title: p.title, action: p.action, why: p.reason?.why || '', status, error: r?.error || null, canUndo: status === 'applied' && WIN };
  });
}

async function undo({ entryIds } = {}) {
  if (!WIN) return { ok: false, error: 'unsupported', results: [] };
  const integrity = verify();
  const { plans, results: res, undone } = index();
  const ids = [...new Set(Array.isArray(entryIds) ? entryIds.map(String) : [])].filter((i) => UUID.test(i)).slice(0, MAX_BATCH);
  const out = []; const jobs = [];
  for (const id of ids) {
    const p = plans.get(id); const r = res.get(id);
    if (!p || !r?.ok) { out.push({ entryId: id, ok: false, error: 'not-applied' }); continue; }
    if (undone.has(id)) { out.push({ entryId: id, title: p.title, ok: false, error: 'already-undone' }); continue; }
    const act = ACTIONS[p.action];
    if (!act || !act.valid(p.params) || !act.validBefore(r.before)) { out.push({ entryId: id, title: p.title, ok: false, error: 'invalid' }); continue; }
    const undoId = crypto.randomUUID();
    append({ type: 'undo-plan', id: undoId, of: id, title: p.title, reason: { userRequested: true, original: p.reason?.finding || null }, logIntegrity: integrity.valid });
    jobs.push({ id, undoId, act, p, before: r.before });
  }
  if (!jobs.length) return { ok: false, error: out[0]?.error || 'nothing', results: out, integrity };
  const run = await runElevated(jobs.map((j) => wrap(j.undoId, j.act.undo(j.p.params, j.before))).join('\n'));
  for (const j of jobs) {
    const r = run.ok ? run.results.find((x) => x.id === j.undoId) : null;
    const ok = Boolean(r?.ok);
    const error = ok ? null : (run.ok ? (r?.error || 'no-result') : run.error);
    append({ type: 'undo-result', id: j.undoId, of: j.id, ok, error, before: r?.before ?? null, after: r?.after ?? null });
    out.push({ entryId: j.id, title: j.p.title, ok, error });
  }
  return { ok: out.some((r) => r.ok), results: out, integrity, error: run.ok ? null : run.error };
}

const logPath = () => LOG();

module.exports = { register, apply, list, undo, verify, logEvent, logPath, __test: { ACTIONS, wrap, append, readAll, proposals, reasonOk } };
