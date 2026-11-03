'use strict';

// listeners.js — what is listening on THIS PC, who owns it, and who is connected to it right now.
// Read-only. Fixed scripts only (nothing from the user or a scan is ever put inside a command).
//   snapshot() → { ok, listeners: [{ port, binds, pid, name, path, started, services }],
//                  established: [{ lp, ra, rp, pid, name }], firewall: [{ name, enabled }], blocked: [port] }  (blocked: ports with a "Capri block TCP n" rule on)
//   usage(snap, port) → { listener, lan, remotes: [{ ip, n }], localCount }

const fs = require('node:fs');
const { execFile } = require('node:child_process');

const WIN = process.platform === 'win32';

const PS = [
  "$ErrorActionPreference='SilentlyContinue'",
  '$procs=@{}; Get-CimInstance Win32_Process | ForEach-Object { $procs[[int]$_.ProcessId]=$_ }',
  '$svcs=@{}; Get-CimInstance Win32_Service | Where-Object { $_.ProcessId -gt 0 } | ForEach-Object {',
  '  $k=[int]$_.ProcessId; if(-not $svcs.ContainsKey($k)){ $svcs[$k]=@() }',
  '  $svcs[$k]+= [pscustomobject]@{ name=$_.Name; display=$_.DisplayName; mode=[string]$_.StartMode; state=[string]$_.State } }',
  '$conns = foreach($c in (Get-NetTCPConnection | Where-Object { $_.State -in "Listen","Established" })) {',
  '  $p=$procs[[int]$c.OwningProcess]',
  '  $started=$null; if($p -and $p.CreationDate){ $started=$p.CreationDate.ToString("yyyy-MM-ddTHH:mm:ss") }',
  '  [pscustomobject]@{ la=[string]$c.LocalAddress; lp=[int]$c.LocalPort; ra=[string]$c.RemoteAddress; rp=[int]$c.RemotePort;',
  '    st=[string]$c.State; pid=[int]$c.OwningProcess; name=[string]$p.Name; path=[string]$p.ExecutablePath; started=$started; svc=$svcs[[int]$c.OwningProcess] } }',
  '$fw = Get-NetFirewallProfile | ForEach-Object { [pscustomobject]@{ name=[string]$_.Name; enabled=[string]$_.Enabled } }',
  // the rules Capri itself made (remediate.js): an enabled inbound Block on a port. A scan from this PC never sees them work (own traffic skips the inbound filter)
  "$blocks = @(Get-NetFirewallRule -DisplayName 'Capri block TCP *' -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' } | ForEach-Object { [string]$_.DisplayName })",
  'ConvertTo-Json -InputObject ([pscustomobject]@{ conns=@($conns); fw=@($fw); blocks=@($blocks) }) -Depth 5 -Compress',
].join('\n');

const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const isLoop = (a) => /^(127\.|::1$|\[::1\]$)/.test(String(a || ''));
const isAny = (a) => a === '0.0.0.0' || a === '::' || a === '[::]' || a === '*';

function exec(file, args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) reject(err); else resolve(String(stdout || ''));
    });
  });
}

function fold(conns, firewall, blocked = []) {
  const byPort = new Map();
  const established = [];
  for (const c of conns) {
    if (c.st === 'Listen') {
      const cur = byPort.get(c.lp) || { port: c.lp, binds: [], pid: c.pid, name: c.name || '', path: c.path || '', started: c.started || null, services: [] };
      if (!cur.binds.includes(c.la)) cur.binds.push(c.la);
      if (!cur.services.length) cur.services = arr(c.svc);
      byPort.set(c.lp, cur);
    } else if (c.st === 'Established') {
      established.push({ lp: c.lp, ra: c.ra, rp: c.rp, pid: c.pid, name: c.name || '' });
    }
  }
  return { ok: true, listeners: [...byPort.values()].sort((a, b) => a.port - b.port), established, firewall, blocked };
}

async function winSnapshot() {
  const out = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS]);
  const raw = JSON.parse(out.trim());
  const firewall = arr(raw.fw).map((p) => ({ name: p.name, enabled: String(p.enabled) }));
  const blocked = arr(raw.blocks).map((n) => /^Capri block TCP (\d{1,5})$/.exec(String(n))?.[1]).filter(Boolean).map(Number);
  return fold(arr(raw.conns).filter((c) => c && typeof c === 'object'), firewall, blocked); // a PC with no connection at all gives [null]
}

async function linuxSnapshot() {
  const out = await exec('ss', ['-H', '-tnap']);
  const conns = [];
  for (const line of out.split('\n')) {
    const m = /^(\S+)\s+\d+\s+\d+\s+(\S+)\s+(\S+)\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const split = (s) => { const i = s.lastIndexOf(':'); return [s.slice(0, i).replace(/^\[|\]$/g, ''), Number(s.slice(i + 1)) || 0]; };
    const [la, lp] = split(m[2]); const [ra, rp] = split(m[3]);
    const pr = /\("([^"]+)",pid=(\d+)/.exec(m[4] || '');
    const pid = pr ? Number(pr[2]) : 0;
    let exe = '';
    if (pid) { try { exe = fs.readlinkSync(`/proc/${pid}/exe`); } catch { /* not ours */ } }
    conns.push({ st: m[1] === 'LISTEN' ? 'Listen' : m[1] === 'ESTAB' ? 'Established' : m[1], la: la === '*' ? '0.0.0.0' : la, lp, ra, rp, pid, name: pr?.[1] || '', path: exe, svc: [] });
  }
  return fold(conns, []);
}

async function snapshot() {
  try {
    if (WIN) return await winSnapshot();
    if (process.platform === 'linux') return await linuxSnapshot();
    return { ok: false, error: 'unsupported' };
  } catch (err) {
    return { ok: false, error: err.message || 'failed' };
  }
}

function usage(snap, port) {
  if (!snap?.ok) return null;
  const listener = snap.listeners.find((l) => l.port === port) || null;
  const est = snap.established.filter((e) => e.lp === port);
  const remoteMap = new Map();
  for (const e of est.filter((x) => !isLoop(x.ra))) remoteMap.set(e.ra, (remoteMap.get(e.ra) || 0) + 1);
  return {
    listener,
    lan: Boolean(listener && listener.binds.some((b) => isAny(b) || !isLoop(b))),
    remotes: [...remoteMap.entries()].map(([ip, n]) => ({ ip, n })),
    localCount: est.filter((x) => isLoop(x.ra)).length,
  };
}

module.exports = { snapshot, usage, isLoop, isAny };