'use strict';
// The numbers she can read off your PC when you hover her (her menu › "ข้อมูลที่โชว์"). Main process only.
// Everything is best-effort: a number that can't be read (no NVIDIA card, not Windows...) comes back as null
// and is simply left out of her line. Reads are cached for a couple of seconds, so hovering never piles up work.
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');

// keys the menu offers, in the order they're shown. bat / net are read in the overlay itself (it has the browser APIs).
const KEYS = ['cpu', 'ram', 'gpu0', 'gpu1', 'vram0', 'vram1', 'diskio', 'disk', 'uptime', 'bat', 'net'];
const DEFAULT_KEYS = ['cpu', 'bat', 'net'];

const run = (cmd, args, timeout) => new Promise((resolve) => {
  try {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout || '')));
  } catch {
    resolve(null);
  }
});

let lastCpu = null;
function cpuLoad() {
  const sum = os.cpus().reduce((a, c) => {
    const t = c.times;
    return { idle: a.idle + t.idle, total: a.total + t.user + t.nice + t.sys + t.idle + t.irq };
  }, { idle: 0, total: 0 });
  const prev = lastCpu;
  lastCpu = sum;
  if (!prev) return null; // the first read has nothing to compare with
  const total = sum.total - prev.total;
  return total > 0 ? Math.round((1 - (sum.idle - prev.idle) / total) * 100) : null;
}

let gpuCache = { at: 0, rows: [] };
async function gpus() {
  if (Date.now() - gpuCache.at < 1500) return gpuCache.rows;
  const out = await run('nvidia-smi', ['--query-gpu=utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'], 2500);
  const rows = (out || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [load, used, total] = l.split(',').map((x) => Number(x.trim()));
    return { load, used, total };
  }).filter((r) => Number.isFinite(r.load));
  gpuCache = { at: Date.now(), rows };
  return rows;
}

let ioCache = { at: 0, io: null };
async function diskIo() {
  if (process.platform !== 'win32') return null;
  if (Date.now() - ioCache.at < 2500) return ioCache.io;
  ioCache.at = Date.now(); // one at a time: a slow read isn't started again
  // the WMI class is the same on every Windows language (typeperf / Get-Counter names are translated)
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "$d = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -Filter \"Name='_Total'\"; \"$($d.DiskReadBytesPerSec),$($d.DiskWriteBytesPerSec)\""], 5000);
  const [r, w] = String(out || '').trim().split(',').map(Number);
  ioCache.io = Number.isFinite(r) && Number.isFinite(w) ? { read: r, write: w } : null;
  return ioCache.io;
}

async function diskFree() {
  try {
    const root = process.platform === 'win32' ? (process.env.SystemDrive || 'C:') + '\\' : '/';
    const s = await fs.promises.statfs(root);
    const total = s.blocks * s.bsize;
    return total ? { used: Math.round((1 - (s.bavail * s.bsize) / total) * 100), free: s.bavail * s.bsize } : null;
  } catch {
    return null;
  }
}

const mb = (n) => (n >= 1024 * 1024 * 1024 ? `${(n / 1024 / 1024 / 1024).toFixed(1)}G` : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}M` : `${Math.round(n / 1024)}K`);

/** keys → { key: { value: '17%', ... } | null } (null: unreadable here) */
async function read(keys = DEFAULT_KEYS) {
  const want = new Set((Array.isArray(keys) ? keys : DEFAULT_KEYS).filter((k) => KEYS.includes(k)));
  const out = {};
  if (want.has('cpu')) {
    let load = cpuLoad();
    if (load === null) { await new Promise((r) => setTimeout(r, 400)); load = cpuLoad(); } // first read: a short sample
    out.cpu = load === null ? null : `${load}%`;
  }
  if (want.has('ram')) {
    const total = os.totalmem();
    out.ram = `${Math.round((1 - os.freemem() / total) * 100)}% (${((total - os.freemem()) / 1024 ** 3).toFixed(1)}/${(total / 1024 ** 3).toFixed(0)}G)`;
  }
  const needGpu = ['gpu0', 'gpu1', 'vram0', 'vram1'].some((k) => want.has(k));
  const g = needGpu ? await gpus() : [];
  for (const i of [0, 1]) {
    if (want.has(`gpu${i}`)) out[`gpu${i}`] = g[i] ? `${Math.round(g[i].load)}%` : null;
    if (want.has(`vram${i}`)) out[`vram${i}`] = g[i] && g[i].total ? `${Math.round((g[i].used / g[i].total) * 100)}% (${(g[i].used / 1024).toFixed(1)}/${(g[i].total / 1024).toFixed(0)}G)` : null;
  }
  if (want.has('diskio')) {
    const io = await diskIo();
    out.diskio = io ? `R ${mb(io.read)}/s W ${mb(io.write)}/s` : null;
  }
  if (want.has('disk')) {
    const d = await diskFree();
    out.disk = d ? `${d.used}% (${(d.free / 1024 ** 3).toFixed(0)}G ว่าง)` : null;
  }
  if (want.has('uptime')) {
    const s = Math.floor(os.uptime());
    out.uptime = s >= 86400 ? `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  }
  return out;
}

module.exports = { KEYS, DEFAULT_KEYS, read };
