'use strict';

// Opening things when you ask her to (chat.js): an app from the Start menu (Store apps like Spotify
// included), a Steam or Epic game, your music (the media keys: pause, next…, so it works with
// Spotify and most players), a Spotify search, or a website. Windows only.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { app, shell } = require('electron');
const { powershell } = require('./apps');

const WIN = process.platform === 'win32';
// not things to open from a chat: uninstallers, help pages and the like
const SKIP = /uninstall|désinstaller|desinstalar|deinstall|ถอนการติดตั้ง|readme|documentation|release notes|support center|website|manual|คู่มือ|เอกสาร/i;
const STEAM_SKIP = /redistributable|dedicated server|steamworks/i;
// words that don't tell apps apart ("Roblox Player" is "roblox", "AM Music" is "am")
const FILLER = new Set(['player', 'launcher', 'app', 'the', 'for', 'windows', 'desktop', 'client', 'x64', 'x86', 'beta', 'music', 'musique', 'media', 'audio', 'video', 'videos', 'โปรแกรม', 'แอป', 'ตัวเล่น']);
const CACHE_MS = 10 * 60 * 1000; // installed apps hardly change

let cache = null; // { at, items }

const plain = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
// keep Thai/combining marks with their letters (vowels, tones); split only on real separators
const words = (text) => (plain(text).match(/[\p{L}\p{M}\p{N}.]+/gu) || []).filter((w) => w.length >= 2);

// Everything she can open: [{ name, kind: 'app' | 'steam' | 'epic', id }]
async function launchables() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.items;
  if (!WIN) return [];
  const items = [];
  const seen = new Set();
  const add = (item) => {
    const key = words(item.name).join(' ');
    if (!key || seen.has(key) || SKIP.test(item.name)) return;
    seen.add(key);
    items.push(item);
  };
  // games first: a game's own entry wins over a shortcut to it
  for (const game of [...steamGames(await steamRoot()), ...epicGames()]) add(game);
  // the Start menu's list is slow the first time (PowerShell starting cold): main.js asks for it early
  const out = await powershell('Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress', 45000).catch(() => null);
  for (const { Name, AppID } of [].concat(out ? JSON.parse(out) : [])) {
    if (Name && AppID && !/^https?:/i.test(AppID)) add({ name: Name, kind: 'app', id: AppID });
  }
  if (out !== null) cache = { at: Date.now(), items }; // a list that failed isn't kept: next time, again
  return items;
}

function steamRoot() {
  return new Promise((resolve) => {
    execFile('reg.exe', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true, timeout: 5000 }, (err, out) => {
      const found = !err && /SteamPath\s+REG_SZ\s+(.+)/.exec(String(out))?.[1].trim();
      resolve(found ? path.normalize(found) : null);
    });
  });
}

// Steam's games, from the manifests in each of its libraries
function steamGames(root) {
  if (!root) return [];
  const libraries = new Set([root]);
  try {
    const vdf = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libraries.add(path.normalize(m[1].replace(/\\\\/g, '\\')));
  } catch {
    // one library, the main one
  }
  const games = [];
  for (const library of libraries) {
    let files = [];
    try {
      files = fs.readdirSync(path.join(library, 'steamapps')).filter((f) => /^appmanifest_\d+\.acf$/.test(f));
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const acf = fs.readFileSync(path.join(library, 'steamapps', file), 'utf8');
        const id = /"appid"\s+"(\d+)"/.exec(acf)?.[1];
        const name = /"name"\s+"([^"]+)"/.exec(acf)?.[1];
        if (id && name && !STEAM_SKIP.test(name)) games.push({ name, kind: 'steam', id });
      } catch {
        // a manifest being written: skip it
      }
    }
  }
  return games;
}

// Epic's games, from its launcher's manifests (not the Unreal Engine plugins it also keeps there)
function epicGames() {
  const dir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.item'));
  } catch {
    return [];
  }
  const games = [];
  for (const file of files) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (m.bIsIncompleteInstall || m.CatalogNamespace === 'ue' || !m.DisplayName || !m.AppName) continue;
      games.push({ name: m.DisplayName, kind: 'epic', id: `${m.CatalogNamespace}:${m.CatalogItemId}:${m.AppName}` });
    } catch {
      // not one of its manifests
    }
  }
  return games;
}

// The one of `items` named in `text` (your message, or the name in her tag): all the words of its
// name in it, else at least half of them; the closest wins. null if nothing fits well enough.
// Also handles continuous scripts (Thai, etc.) via full-string inclusion of the plain name.
function match(items, text) {
  const plainText = plain(text);
  const said = new Set(words(text));
  const joined = words(text).join('');
  let best = null;
  for (const item of items) {
    const all = words(item.name);
    const key = all.filter((w) => !FILLER.has(w));
    if (!key.length) key.push(...all); // a name made only of those ("Media Player"): all of it
    if (!key.length) continue;
    const plainName = plain(item.name);
    // full name appears inside the query (helps Thai / continuous scripts and exact phrases)
    if (plainName.length >= 3 && plainText.includes(plainName)) {
      const rank = 12 + plainName.length / 10;
      if (!best || rank > best.rank) best = { item, rank };
      continue;
    }
    const hits = key.filter((w) => said.has(w) || (w.length >= 5 && joined.includes(w)));
    // a word of 3 letters or more, or all of a short name ("am" for AM Music)
    if (!(hits.some((w) => w.length >= 3) || hits.length === key.length) || hits.length / key.length < 0.5) continue;
    const rank = (hits.length / key.length) * 10 + hits.join('').length / 10;
    if (!best || rank > best.rank) best = { item, rank };
  }
  return best?.item || null;
}

// What's on your desktop (yours and the shared one): files, folders and shortcuts, by name.
function desktopItems() {
  const dirs = [app.getPath('desktop'), path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop')];
  const items = [];
  for (const dir of dirs) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || /^desktop\.ini$/i.test(e.name)) continue;
      const folder = e.isDirectory();
      items.push({ name: folder ? e.name : e.name.replace(/\.[^.]+$/, ''), kind: folder ? 'folder' : 'file', id: path.join(dir, e.name) });
    }
  }
  return items;
}

// files that run something: never opened without a click, even named by you
const RUNS = /\.(exe|bat|cmd|ps1|vbs|vbe|js|jse|wsf|wsh|msi|msp|reg|scr|com|jar|hta|cpl|pif)$/i;
const risky = (item) => item?.kind === 'file' && RUNS.test(item.id);

// Folders asked for by what they are ("ouvre mes téléchargements", "open the file explorer", "เปิดดาวน์โหลด").
const FOLDERS = [
  ['explorer', /explorateur|file explorer|\bexplorer\b|ce pc|this pc|explorador|проводник|ไฟล์เอ็กซ์พลอเรอร์|เอ็กซ์พลอเรอร์|สำรวจไฟล์|คอมพิวเตอร์นี้/i],
  ['recycle', /corbeille|recycle bin|\btrash\b|papelera|lixeira|корзин|ถังขยะ|รีไซเคิล/i],
  ['downloads', /t[ée]l[ée]chargements?|downloads?|descargas|transfer[êe]ncias|загрузк|ดาวน์โหลด|ดาวน์โหลดส์/i],
  ['desktop', /\bbureau\b|\bdesktop\b|escritorio|[áa]rea de trabalho|рабоч\S* стол|เดสก์ท็อป|หน้าจอ|พื้นโต๊ะ/i],
  ['documents', /\bdocuments?\b|documentos|документ|เอกสาร|เอกสารของฉัน/i],
  ['pictures', /\bimages\b|\bphotos\b|\bpictures\b|im[áa]genes|\bfotos\b|imagens|изображени|фото|รูปภาพ|ภาพถ่าย|รูป/i],
  ['music', /dossier (de )?musique|music folder|carpeta de m[úu]sica|pasta de m[úu]sica|папк\S* (с )?музык|เพลง|โฟลเดอร์เพลง|ดนตรี/i],
  ['videos', /\bvid[ée]os\b|v[íi]deos|видео|วิดีโอ|วีดีโอ|คลิป/i],
];

function knownFolder(text) {
  const hit = FOLDERS.find(([, re]) => re.test(text));
  return hit ? { name: hit[0], kind: 'known', id: hit[0] } : null;
}

async function openKnown(id) {
  if (id === 'explorer') return spawn('explorer.exe', [], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  if (id === 'recycle') return spawn('explorer.exe', ['shell:RecycleBinFolder'], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  // cleanup = Disk Cleanup (หน้าต่าง, ไดรฟ์ระบบ) | ram = Task Manager + บีบ working set
  if (id === 'cleanup') return diskCleanupSafe();
  if (id === 'ram') return clearRamSafe();
  // close explorer windows only (Shell.Application.Quit) — does NOT kill the desktop shell
  if (id === 'close-explorer') return closeExplorerSafe();
  return shell.openPath(app.getPath(id));
}

// ปิดหน้าต่าง File Explorer ทั้งหมดแบบปลอดภัย (ไม่ฆ่า explorer.exe / ไม่ทำให้ taskbar หาย)
async function closeExplorerSafe() {
  await powershell(
    [
      '$shell = New-Object -ComObject Shell.Application',
      'foreach ($w in @($shell.Windows())) {',
      '  try {',
      '    if ($w -and $w.FullName -match "explorer\\.exe$") { $w.Quit() }',
      '  } catch {}',
      '}',
    ].join('; '),
    8000,
  ).catch(() => null);
  return undefined;
}

// เคลียร์แรม: เปิด Task Manager (หน้าต่างค้างหลังปิดแชต) + พยายามบีบ working set
async function clearRamSafe() {
  const child = spawn('taskmgr.exe', [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.on('error', () => {}).unref();
  child.unref();
  // best-effort: ไม่ต้อง admin, ข้ามโปรเซสระบบ/Capri
  powershell(
    "Get-Process | Where-Object { $_.WorkingSet64 -gt 80MB -and $_.ProcessName -notmatch '^(explorer|dwm|csrss|winlogon|services|lsass|System|Idle|Capri|electron)$' } | ForEach-Object { try { $_.MinWorkingSet = [IntPtr]1048576 } catch {} }",
    10000,
  ).catch(() => null);
  return undefined;
}

// ล้างไฟล์ขยะแบบ B: เปิดหน้าต่าง Disk Cleanup ให้เห็น
// - ไดรฟ์เริ่มต้น = ไดรฟ์ที่ OS อยู่ (SystemDrive)
// - แยก process ชัดเจน ปิดแชตแล้วหน้าต่างยังอยู่
// - ลบ user temp ขนานไป (ไม่บล็อกการเปิดหน้าต่าง)
async function diskCleanupSafe() {
  const drive = (process.env.SystemDrive || 'C:').replace(/\\$/, '');
  const letter = drive.replace(':', '');

  // เปิด Disk Cleanup ก่อนทันที — มีหน้าต่างให้ติ๊ก/กด OK
  const child = spawn('cleanmgr.exe', ['/d', letter], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.on('error', () => {
    spawn('cleanmgr.exe', [], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  });
  child.unref();

  // ลบ user temp ขนาน (ไม่ต้องรอ) — ปลอดภัย ไม่ต้อง admin
  powershell(
    [
      "$temps = @($env:TEMP, $env:TMP, (Join-Path $env:LOCALAPPDATA 'Temp'))",
      'foreach ($t in $temps) {',
      '  if (-not $t -or -not (Test-Path $t)) { continue }',
      '  Get-ChildItem -LiteralPath $t -Force -ErrorAction SilentlyContinue | ForEach-Object {',
      '    Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue',
      '  }',
      '}',
    ].join('; '),
    15000,
  ).catch(() => null);

  return undefined;
}

// What you asked to open: an app or a game, something on your desktop, else a folder by what it is.
async function find(text) {
  return match([...desktopItems(), ...(await launchables())], text) || knownFolder(text);
}

// Opens one of them (only something she listed herself): a Start menu app through its AppsFolder
// entry (desktop and Store apps alike), a game through its launcher's link, a file or folder from
// your desktop, a folder by what it is.
async function launch({ kind, id } = {}) {
  if (kind === 'known') {
    const knownIds = new Set([...FOLDERS.map(([key]) => key), 'cleanup', 'ram', 'close-explorer']);
    if (!knownIds.has(id)) throw new Error('not found');
    await openKnown(id);
    return undefined;
  }
  if (kind === 'file' || kind === 'folder') {
    if (!desktopItems().some((i) => i.id === id)) throw new Error('not found');
    const err = await shell.openPath(id);
    if (err) throw new Error(err);
    return undefined;
  }
  const item = (await launchables()).find((i) => i.kind === kind && i.id === id);
  if (!item) throw new Error('not found');
  if (kind === 'steam') return shell.openExternal(`steam://rungameid/${id}`);
  if (kind === 'epic') return shell.openExternal(`com.epicgames.launcher://apps/${encodeURIComponent(id)}?action=launch&silent=true`);
  spawn('explorer.exe', [`shell:AppsFolder\\${id}`], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  return undefined;
}

// The media keys, as if pressed on the keyboard: whatever plays music (Spotify, a browser…) reacts.
// Play and pause are the same key; the volume moves a few steps at a time. Sent as keys (their virtual
// key codes), not typed: typed, they come out as "³" or "°" on a German keyboard.
const MEDIA = { pause: [0xb3, 1], play: [0xb3, 1], next: [0xb0, 1], previous: [0xb1, 1], volup: [0xaf, 5], voldown: [0xae, 5], mute: [0xad, 1] };
const KEY_DOWN = 1; // KEYEVENTF_EXTENDEDKEY
const KEY_UP = 3;   // ...and KEYEVENTF_KEYUP

async function media(action) {
  if (!WIN || !MEDIA[action]) return false;
  const [key, times] = MEDIA[action];
  return powershell(
    'Add-Type -Namespace Capri -Name Keys -MemberDefinition \'[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, System.UIntPtr extra);\'; '
    + `1..${times} | ForEach-Object { [Capri.Keys]::keybd_event(${key}, 0, ${KEY_DOWN}, [UIntPtr]::Zero); [Capri.Keys]::keybd_event(${key}, 0, ${KEY_UP}, [UIntPtr]::Zero) }`,
  ).then(() => true, () => false);
}

// A Spotify search for it: in the app if it's installed, else on the web.
async function music(query) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) return false;
  try {
    await shell.openExternal(`spotify:search:${encodeURIComponent(q)}`);
  } catch {
    await shell.openExternal(`https://open.spotify.com/search/${encodeURIComponent(q)}`);
  }
  return true;
}

// A song on YouTube, the exact video: the first result of a search (no key needed), opened in your
// browser. { title } of what it found, or { title: null } when it could only open the search.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const VIDEO = /"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/;

async function youtube(query) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) return null;
  const search = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  let video = null;
  try {
    const res = await fetch(search, {
      // the consent cookie skips Europe's cookie page, which would hide the results
      headers: { 'user-agent': UA, 'accept-language': 'en', cookie: 'CONSENT=YES+1; SOCS=CAI' },
      signal: AbortSignal.timeout(8000),
    });
    const m = VIDEO.exec(await res.text());
    if (m) video = { id: m[1], title: JSON.parse(`"${m[2]}"`) };
  } catch {
    // offline or YouTube changed its page: the search still opens
  }
  await shell.openExternal(video ? `https://www.youtube.com/watch?v=${video.id}` : search);
  return { title: video?.title || null };
}

// A Roblox game by its name ("steal a brain rot"): the first one Roblox's own search gives, started
// straight in the Roblox app through its roblox:// link, or its page in the browser without the app.
// { name, app } of what it started, { name: null } if Roblox found nothing.
async function roblox(query) {
  const q = String(query || '').trim().slice(0, 100);
  if (!q) return null;
  let game = null;
  try {
    const url = `https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(q)}&pageType=all&sessionId=${randomUUID()}`;
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    const body = await res.json();
    game = (body.searchResults || []).filter((r) => r.contentGroupType === 'Game').flatMap((r) => r.contents || [])[0] || null;
  } catch {
    return null;
  }
  if (!game?.rootPlaceId) return { name: null };
  const installed = Boolean(app.getApplicationNameForProtocol('roblox://'));
  await shell.openExternal(installed ? `roblox://experiences/start?placeId=${game.rootPlaceId}` : `https://www.roblox.com/games/${game.rootPlaceId}`);
  // "[💀] Steal a Brainrot" is "Steal a Brainrot"
  const name = String(game.name).replace(/\[[^\]]*\]\s*/g, '').replace(/[\p{Extended_Pictographic}️]/gu, '').trim();
  return { name: name || game.name, app: installed };
}

// A website: http or https, with a real host name.
function siteUrl(address) {
  try {
    const url = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.') ? url : null;
  } catch {
    return null;
  }
}

async function site(address) {
  const url = siteUrl(String(address || '').trim());
  if (!url) return false;
  await shell.openExternal(url.toString());
  return true;
}

// --- PC status (RAM / CPU / GPU / disk / top processes / uptime) via PowerShell ---
// Returns { ok, text } ready for Capri to speak. Safe, no admin required for most.
function fmtBytes(n) {
  const v = Number(n) || 0;
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)} TB`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)} GB`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)} MB`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)} KB`;
  return `${v} B`;
}

// Linux-console style for chat (line-by-line, ASCII bars)
function bar(pct, width = 10) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const filled = Math.round((p / 100) * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}] ${p}%`;
}
function termBar(ratio, width = 8) {
  const r = Math.max(0, Math.min(1, Number(ratio) || 0));
  const filled = Math.max(0, Math.round(r * width));
  return '#'.repeat(filled) + '-'.repeat(width - filled);
}
function padName(name, len = 16) {
  const s = String(name || '').slice(0, len);
  return s + ' '.repeat(Math.max(0, len - s.length));
}

async function statusRam() {
  const out = await powershell(
    [
      '$os = Get-CimInstance Win32_OperatingSystem',
      '$total = [int64]$os.TotalVisibleMemorySize * 1KB',
      '$free = [int64]$os.FreePhysicalMemory * 1KB',
      '$used = $total - $free',
      '$pct = [math]::Round(($used / $total) * 100)',
      'Write-Output ("TOTAL=" + $total)',
      'Write-Output ("USED=" + $used)',
      'Write-Output ("FREE=" + $free)',
      'Write-Output ("PCT=" + $pct)',
    ].join('; '),
    8000,
  ).catch(() => null);
  if (!out) return { ok: false, text: null };
  const m = Object.fromEntries(
    String(out).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf('=');
      return i > 0 ? [l.slice(0, i), l.slice(i + 1)] : null;
    }).filter(Boolean),
  );
  const total = Number(m.TOTAL), used = Number(m.USED), free = Number(m.FREE), pct = Number(m.PCT);
  return {
    ok: true,
    data: { ram: { used, total, free, pct } },
    text: `RAM  ${bar(pct)}\n     ${fmtBytes(used)} / ${fmtBytes(total)}  free ${fmtBytes(free)}`,
  };
}

async function statusCpu() {
  const out = await powershell(
    [
      '$c = Get-CimInstance Win32_Processor | Select-Object -First 1',
      '$load = $c.LoadPercentage',
      'if ($null -eq $load) { $load = (Get-Counter "\\Processor(_Total)\\% Processor Time" -ErrorAction SilentlyContinue).CounterSamples.CookedValue }',
      'Write-Output ("NAME=" + $c.Name)',
      'Write-Output ("CORES=" + $c.NumberOfLogicalProcessors)',
      'Write-Output ("LOAD=" + [math]::Round($load))',
    ].join('; '),
    10000,
  ).catch(() => null);
  if (!out) return { ok: false, text: null };
  const m = Object.fromEntries(
    String(out).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf('=');
      return i > 0 ? [l.slice(0, i), l.slice(i + 1)] : null;
    }).filter(Boolean),
  );
  const load = Number(m.LOAD);
  const name = (m.NAME || 'CPU').replace(/\s+/g, ' ').trim();
  const cores = Number(m.CORES) || null;
  const short = name.length > 42 ? `${name.slice(0, 40)}…` : name;
  return {
    ok: true,
    data: { cpu: { name, cores, load: Number.isFinite(load) ? load : 0 } },
    text: `CPU  ${bar(Number.isFinite(load) ? load : 0)}\n     ${short}\n     ${cores || '?'} threads`,
  };
}

async function statusGpu() {
  const out = await powershell(
    'Get-CimInstance Win32_VideoController | ForEach-Object { $ram = if ($_.AdapterRAM -and $_.AdapterRAM -gt 0) { [math]::Round($_.AdapterRAM / 1GB, 1).ToString() + " GB" } else { "n/a" }; Write-Output ($_.Name + "\t" + $ram + "\t" + $_.DriverVersion) }',
    10000,
  ).catch(() => null);
  if (!out) return { ok: false, text: null };
  const rows = String(out).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 3)
    .map((l) => {
      const [name, vram, ver] = l.split('\t');
      return { name: (name || '').replace(/\s+/g, ' ').trim(), vram: vram || 'n/a', ver: ver || '' };
    });
  if (!rows.length) return { ok: false, text: null };
  const body = rows.map((r) => {
    const short = r.name.length > 40 ? `${r.name.slice(0, 38)}…` : r.name;
    return `   ${short}\n   VRAM ${r.vram}${r.ver ? `  ·  driver ${r.ver}` : ''}`;
  }).join('\n');
  return { ok: true, data: { gpu: rows }, text: `GPU\n${body}` };
}

async function statusDisk() {
  const out = await powershell(
    'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { $free = [math]::Round($_.FreeSpace / 1GB, 1); $total = [math]::Round($_.Size / 1GB, 1); $pct = if ($_.Size -gt 0) { [math]::Round((($_.Size - $_.FreeSpace) / $_.Size) * 100) } else { 0 }; Write-Output ($_.DeviceID + "\t" + $free + "\t" + $total + "\t" + $pct) }',
    10000,
  ).catch(() => null);
  if (!out) return { ok: false, text: null };
  const rows = String(out).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [id, free, total, pct] = l.split('\t');
    return { id: id || '?', free: Number(free), total: Number(total), pct: Number(pct) };
  }).filter((r) => r.total > 0);
  if (!rows.length) return { ok: false, text: null };
  const body = rows.map((r) => `   ${r.id}  ${bar(r.pct, 10)}\n      ${r.free} GB free / ${r.total} GB`).join('\n');
  return { ok: true, data: { disk: rows }, text: `DISK\n${body}` };
}

async function statusTop(limit = 6) {
  const n = Math.min(10, Math.max(3, limit | 0));
  const out = await powershell(
    `Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First ${n} | ForEach-Object { $mb = [math]::Round($_.WorkingSet64 / 1MB); Write-Output ($_.ProcessName + '\t' + $mb) }`,
    12000,
  ).catch(() => null);
  if (!out) return { ok: false, text: null };
  const rows = String(out).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, mb] = l.split('\t');
    return { name: name || '?', mb: Number(mb) || 0 };
  }).filter((r) => r.mb > 0);
  if (!rows.length) return { ok: false, text: null };
  const max = rows[0].mb || 1;
  const lines = rows.map((r, i) => {
    const b = termBar(r.mb / max, 8);
    return `  ${String(i + 1).padStart(2, ' ')}. ${padName(r.name)} ${b}  ${r.mb} MB`;
  });
  return { ok: true, data: { topRam: rows }, text: `TOP RAM\n${lines.join('\n')}` };
}

// Top processes by CPU — sample twice (~0.8s) for a meaningful delta
async function statusTopCpu(limit = 6) {
  const n = Math.min(10, Math.max(3, limit | 0));
  const out = await powershell(
    [
      '$p1 = @{}; Get-Process | ForEach-Object { $p1[$_.Id] = $_.CPU }',
      'Start-Sleep -Milliseconds 800',
      `$list = Get-Process | ForEach-Object { $d = ($_.CPU - $p1[$_.Id]); if ($null -eq $d) { $d = 0 }; [pscustomobject]@{ Name = $_.ProcessName; Delta = [double]$d } } | Sort-Object Delta -Descending | Select-Object -First ${n}`,
      'foreach ($x in $list) { Write-Output ($x.Name + "`t" + [math]::Round($x.Delta, 1)) }',
    ].join('; '),
    15000,
  ).catch(() => null);
  if (!out) return { ok: false, text: null };
  const rows = String(out).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, delta] = l.split('\t');
    return { name: name || '?', delta: Number(delta) || 0 };
  }).filter((r) => r.delta > 0);
  if (!rows.length) return { ok: false, text: null };
  const max = rows[0].delta || 1;
  const lines = rows.map((r, i) => {
    const b = termBar(r.delta / max, 8);
    return `  ${String(i + 1).padStart(2, ' ')}. ${padName(r.name)} ${b}  ${r.delta.toFixed(1)}s`;
  });
  return { ok: true, data: { topCpu: rows }, text: `TOP CPU\n${lines.join('\n')}` };
}

async function statusUptime() {
  const out = await powershell(
    [
      '$os = Get-CimInstance Win32_OperatingSystem',
      '$uptime = (Get-Date) - $os.LastBootUpTime',
      'Write-Output ("DAYS=" + [int]$uptime.TotalDays)',
      'Write-Output ("HOURS=" + $uptime.Hours)',
      'Write-Output ("MINS=" + $uptime.Minutes)',
    ].join('; '),
    5000,
  ).catch(() => null);
  if (!out) return { ok: false, text: null };
  const m = Object.fromEntries(
    String(out).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf('=');
      return i > 0 ? [l.slice(0, i), l.slice(i + 1)] : null;
    }).filter(Boolean),
  );
  const parts = [];
  if (Number(m.DAYS) > 0) parts.push(`${m.DAYS}d`);
  parts.push(`${m.HOURS || 0}h`);
  parts.push(`${m.MINS || 0}m`);
  return { ok: true, text: `UPTIME  ${parts.join(' ')}` };
}

async function statusTemp() {
  // MSAcpi thermal zone (often needs elevated / may return nothing on many machines)
  const out = await powershell(
    [
      'try {',
      '  $t = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop | Select-Object -First 1',
      '  if ($t) { $c = [math]::Round(($t.CurrentTemperature / 10) - 273.15, 1); Write-Output ("TEMP=" + $c) }',
      '} catch { Write-Output "TEMP=" }',
    ].join(' '),
    6000,
  ).catch(() => null);
  const m = /TEMP=([\d.]+)/.exec(String(out || ''));
  if (m) return { ok: true, text: `อุณหภูมิโซนประมาณ ${m[1]}°C (ค่าจากเซ็นเซอร์ระบบ อาจไม่ตรง GPU)` };
  return { ok: true, text: 'อ่านอุณหภูมิไม่ได้จากเครื่องนี้ (หลายเครื่องต้องใช้เครื่องมืออย่าง HWiNFO / ไม่มี WMI thermal)' };
}

function mergeData(results) {
  const data = {};
  for (const r of results) {
    if (r && r.ok && r.data) Object.assign(data, r.data);
  }
  return data;
}

async function statusOs() {
  try {
    const hostname = os.hostname();
    const arch = os.arch();
    const release = os.release();
    let caption = '';
    if (process.platform === 'win32') {
      const out = await powershell(
        '(Get-CimInstance Win32_OperatingSystem | Select-Object -ExpandProperty Caption)',
        6000,
      ).catch(() => '');
      caption = String(out || '').trim();
    }
    const label = caption || `${process.platform} ${release}`;
    const text = `OS\n  ${label}\n  ${hostname} · ${arch} · kernel ${release}`;
    return { ok: true, data: { os: { label, hostname, arch, release } }, text };
  } catch {
    return { ok: false, text: null };
  }
}

// Weather from wttr.in (no key). `place` empty: wttr.in guesses from the IP. Returns { ok, text, data }
// where text is one plain line for the model to read, never shown raw.
async function weather(place = '') {
  const loc = encodeURIComponent(String(place || '').trim().slice(0, 80));
  try {
    const res = await fetch(`https://wttr.in/${loc}?format=j1&lang=th`, {
      headers: { 'user-agent': 'curl/8.0', accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, text: null };
    const j = await res.json();
    const cur = j.current_condition?.[0];
    if (!cur) return { ok: false, text: null };
    const area = j.nearest_area?.[0]?.areaName?.[0]?.value || String(place || '');
    const desc = cur.lang_th?.[0]?.value || cur.weatherDesc?.[0]?.value || '';
    const today = j.weather?.[0];
    const rain = Math.max(0, ...((today?.hourly || []).map((h) => Number(h.chanceofrain) || 0)));
    const data = {
      area, desc, tempC: Number(cur.temp_C), feelsC: Number(cur.FeelsLikeC), humidity: Number(cur.humidity),
      windKmh: Number(cur.windspeedKmph), maxC: Number(today?.maxtempC), minC: Number(today?.mintempC), rainChance: rain,
    };
    const text = `${area ? `${area}: ` : ''}${desc}, ${data.tempC}°C (feels like ${data.feelsC}°C), humidity ${data.humidity}%, wind ${data.windKmh} km/h; `
      + `today ${data.minC}–${data.maxC}°C, chance of rain up to ${rain}%.`;
    return { ok: true, data, text };
  } catch {
    return { ok: false, text: null };
  }
}

/** @param {string} what  ram|cpu|gpu|disk|storage|top|service|temp|uptime|os|weather[:place]|all */
async function pcStatus(what = 'all') {
  if (/^weather(:|$)/i.test(String(what))) return weather(String(what).slice(8));
  const w = String(what || 'all').toLowerCase();
  try {
    if (w === 'os' || w === 'system-os') return statusOs();
    if (w === 'ram' || w === 'memory') return statusRam();
    if (w === 'cpu') return statusCpu();
    if (w === 'gpu') return statusGpu();
    if (w === 'disk' || w === 'storage' || w === 'space') return statusDisk();
    if (w === 'topcpu' || w === 'top-cpu' || w === 'cpuproc') return statusTopCpu(6);
    if (w === 'topram' || w === 'top-ram') return statusTop(6);
    if (w === 'top' || w === 'service' || w === 'services' || w === 'process') {
      const results = await Promise.all([statusOs(), statusTop(6), statusTopCpu(6)]);
      const parts = results.filter((r) => r && r.ok && r.text).map((r) => r.text);
      if (!parts.length) return { ok: false, text: null, data: null };
      return { ok: true, data: mergeData(results), text: `$ process scan\n${parts.join('\n')}\n$`, view: 'process' };
    }
    if (w === 'temp' || w === 'temperature') return statusTemp();
    if (w === 'uptime') return statusUptime();
    // all / เช็คเครื่อง — include OS first
    const results = await Promise.all([
      statusOs(),
      statusRam(),
      statusCpu(),
      statusGpu(),
      statusDisk(),
      statusTop(5),
      statusTopCpu(5),
    ]);
    const parts = results.filter((r) => r && r.ok && r.text).map((r) => r.text);
    if (!parts.length) return { ok: false, text: null, data: null };
    return { ok: true, data: mergeData(results), text: `$ system scan\n${parts.join('\n')}\n$`, view: 'system' };
  } catch {
    return { ok: false, text: null, data: null };
  }
}

function statusDashboardHtml(payload = {}) {
  // Capri anime terminal — offline-safe (no external fonts/CDN)
  const view = payload.view === 'process' ? 'process' : 'system';
  const cmd = view === 'process' ? 'capri top' : 'capri status';
  const title = view === 'process' ? 'CAPRI.NET — PROCESS' : 'CAPRI.NET — SYSTEM';
  const jp = view === 'process' ? 'プロセス監視' : 'システム監視';
  const brain = payload.brain || null; // { model, provider }
  const raw = String(payload.text || '').replace(/\r\n/g, '\n').trim();
  let lines = raw.split('\n').filter((l) => {
    if (l.trim() === '$') return false;
    if (/^\$ (process|system) scan$/.test(l.trim())) return false;
    return true;
  });
  // inject BRAIN block at top if provided and not already present
  if (brain && brain.model && !lines.some((l) => /^BRAIN\b/.test(l))) {
    const brainLines = [
      'BRAIN',
      `  model  ${brain.model}`,
      `  link   ${brain.provider || 'local'}`,
    ];
    lines = brainLines.concat(lines);
  }
  const payloadJson = JSON.stringify({ cmd, lines, jp, view }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${title}</title>
<style>
  :root {
    --void: #07040f;
    --pink: #ff2d95;
    --pink2: #ff6bcb;
    --green: #39ff14;
    --cyan: #00f0ff;
    --fg: #f2eef8;
    --muted: #9b93b0;
    --panel: rgba(18, 8, 32, 0.94);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    background: var(--void);
    color: var(--fg);
    font: 13px/1.5 Consolas, "Cascadia Mono", "Courier New", monospace;
    overflow: auto;
  }
  .stage {
    min-height: 100%;
    padding: 14px;
    background:
      radial-gradient(ellipse 80% 50% at 100% 0%, rgba(255,45,149,0.22), transparent 55%),
      radial-gradient(ellipse 60% 40% at 0% 100%, rgba(57,255,20,0.1), transparent 50%),
      linear-gradient(180deg, #12061c 0%, var(--void) 45%, #0a0514 100%);
  }
  .hud {
    border: 1px solid rgba(255,45,149,0.45);
    box-shadow: 0 0 0 1px rgba(0,240,255,0.12), 0 0 24px rgba(255,45,149,0.18);
    background: var(--panel);
    border-radius: 4px;
    overflow: hidden;
    animation: bootIn 0.45s ease-out;
  }
  @keyframes bootIn {
    0% { opacity: 0; transform: scaleY(0.03); }
    40% { opacity: 1; transform: scaleY(1.02); }
    100% { transform: scaleY(1); }
  }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px;
    background: linear-gradient(90deg, rgba(255,45,149,0.35), rgba(12,6,24,0.9) 55%, rgba(0,240,255,0.12));
    border-bottom: 1px solid rgba(255,45,149,0.4);
  }
  .logo { display: flex; align-items: center; gap: 10px; }
  .eye {
    width: 14px; height: 14px; border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #fff, var(--cyan) 45%, #2563eb 75%, #000);
    box-shadow: 0 0 10px var(--cyan);
  }
  .logo h1 {
    font-size: 13px; letter-spacing: 0.2em; color: var(--green);
    text-shadow: 0 0 12px rgba(57,255,20,0.65);
  }
  .jp { font-size: 11px; color: var(--pink2); letter-spacing: 0.1em; margin-top: 2px; }
  .badge {
    font-size: 10px; letter-spacing: 0.16em; padding: 4px 10px;
    border: 1px solid var(--pink); color: var(--pink);
    background: rgba(255,45,149,0.1);
  }
  .content { padding: 12px 14px 14px; }
  .prompt { color: var(--green); }
  .path { color: var(--pink); }
  .sep { color: var(--muted); }
  .cmd { color: var(--cyan); }
  .sec { margin-top: 10px; color: var(--pink2); font-weight: 700; letter-spacing: 0.12em; }
  .sec::before { content: "▸ "; color: var(--cyan); }
  .line { color: var(--fg); white-space: pre; }
  .sub { color: var(--muted); white-space: pre; }
  .bar { color: var(--green); }
  .dim { color: #3d3550; }
  .num { color: var(--cyan); }
  .ok { color: var(--green); }
  .muted { color: var(--muted); }
  .cursor {
    display: inline-block; width: 8px; height: 14px;
    background: var(--green); vertical-align: -2px; margin-left: 2px;
    animation: blink 1s step-end infinite;
  }
  .cursor.hide { display: none; }
  @keyframes blink { 50% { opacity: 0; } }
  .footer-line {
    margin-top: 12px; padding-top: 8px;
    border-top: 1px dashed rgba(255,45,149,0.25); font-size: 12px;
  }
</style></head>
<body>
<div class="stage"><div class="hud">
  <div class="header">
    <div class="logo">
      <div class="eye"></div>
      <div><h1>CAPRI.NET</h1><div class="jp" id="jpLabel"></div></div>
    </div>
    <div class="badge" id="badge"></div>
  </div>
  <div class="content">
    <div id="boot"><span class="prompt">PS <span class="path">C:\\capri</span><span class="sep">&gt;</span></span> <span class="cmd" id="cmd"></span><span class="cursor" id="cmdCursor"></span></div>
    <div id="out"></div>
    <div id="done" class="footer-line" style="display:none">
      <div class="muted"><span class="ok">★</span> LINK STABLE · SCAN COMPLETE · 完了</div>
      <div style="margin-top:8px"><span class="prompt">PS <span class="path">C:\\capri</span><span class="sep">&gt;</span></span> <span class="cursor"></span></div>
    </div>
  </div>
</div></div>
<script>
const DATA = ${payloadJson};
document.getElementById('jpLabel').textContent = DATA.jp || '';
document.getElementById('badge').textContent = DATA.view === 'process' ? 'PROCESS' : 'SYSTEM';
const cmdEl = document.getElementById('cmd');
const cmdCursor = document.getElementById('cmdCursor');
const outEl = document.getElementById('out');
const doneEl = document.getElementById('done');
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function colorizeLine(l) {
  const e = l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  if (/^(RAM|CPU|GPU|DISK|TOP RAM|TOP CPU|UPTIME|OS|BRAIN)\\b/.test(l)) return '<div class="sec">' + e + '</div>';
  if (/^\\s+\\d+\\./.test(l) || /\\[#|\\[-/.test(l) || /\\]\\s*\\d+%/.test(l)) {
    const colored = e.replace(/(#+)/g,'<span class="bar">$1</span>').replace(/(-{2,})/g,'<span class="dim">$1</span>').replace(/(\\d+(?:\\.\\d+)?\\s*(?:MB|GB|s|%))/g,'<span class="num">$1</span>');
    return '<div class="line">' + colored + '</div>';
  }
  if (/VRAM|threads|free|driver|model|link|kernel/i.test(l)) return '<div class="sub">' + e + '</div>';
  return '<div class="line">' + e + '</div>';
}
async function typeText(el, text, cps) {
  const delay = Math.max(8, Math.floor(1000 / (cps || 55)));
  for (let i = 0; i < text.length; i++) {
    el.textContent += text[i];
    await sleep(Math.max(6, delay + Math.floor(Math.random() * 10) - 3));
  }
}
async function run() {
  try {
    await sleep(250);
    await typeText(cmdEl, DATA.cmd || 'capri status', 24);
    await sleep(180);
    cmdCursor.classList.add('hide');
    await sleep(120);
    const lines = DATA.lines || [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isSec = /^(RAM|CPU|GPU|DISK|TOP RAM|TOP CPU|UPTIME|OS|BRAIN)\\b/.test(line);
      if (isSec && i > 0) await sleep(90);
      const wrap = document.createElement('div');
      wrap.className = 'line';
      outEl.appendChild(wrap);
      await typeText(wrap, line, line.length > 40 ? 95 : (isSec ? 42 : 72));
      const tmp = document.createElement('div');
      tmp.innerHTML = colorizeLine(line);
      if (tmp.firstChild) wrap.replaceWith(tmp.firstChild);
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(isSec ? 45 : 22);
    }
    await sleep(140);
    doneEl.style.display = 'block';
    window.scrollTo(0, document.body.scrollHeight);
  } catch (err) {
    outEl.textContent = String(err && err.message || err);
    doneEl.style.display = 'block';
  }
}
run();
</script>
</body></html>`;
}

module.exports = {
  launchables, match, find, launch, media, music, youtube, roblox, site, siteUrl, risky,
  pcStatus, statusDashboardHtml,
};