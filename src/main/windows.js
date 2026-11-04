'use strict';

// Feeds the overlay with the position of the other windows (Windows only), so Capri can
// sit on them. A small PowerShell helper does the Win32 calls; we turn its physical pixels
// into the overlay's coordinates. It also says when the window in front is another AI (ChatGPT,
// Gemini…: `ai`, the names it matched), for her jealousy, and never passes on a title; which game
// is in front, if one (`game`, its folder in Steam's library or another launcher's); and the USB
// sticks plugged in (`usb`, drive letters), and the last device plugged in or out (`plug`).

const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { screen } = require('electron');

// in the installed app it sits next to the app archive (asarUnpack), where PowerShell can read it
const SCRIPT = path.join(__dirname, 'windows.ps1').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

// ignore: () => [hwnd, ...] of our own windows that must not count (her full-screen menu): they are not
// ledges, nor the window in front, or opening the menu looks to her like a new maximized app.
function startWindowWatch({ overlay, onUpdate, ignore = () => [] }) {
  if (process.platform !== 'win32') return { stop() {}, refresh() {} };

  let child = null;
  let stopped = false;
  let restarts = 0;
  let last = null; // the helper's last snapshot: it only speaks when something changes
  let lastFg = 0;  // the last window in front that wasn't one of ours

  const handle = overlay.getNativeWindowHandle();
  const self = handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));

  const toOverlay = (win, bounds) => {
    const dip = screen.screenToDipRect(null, { x: win.x, y: win.y, width: win.w, height: win.h });
    return {
      id: win.id,
      x: dip.x - bounds.x, y: dip.y - bounds.y, w: dip.width, h: dip.height,
      max: win.max,
      proc: win.proc || null,
    };
  };

  // the snapshot as seen from her window, wherever it is now
  // Inside try: a screen being plugged in or out, or a half-formed snapshot, throws here, and from a
  // readline callback that is an uncaught exception for the whole app.
  const send = () => {
    try {
      if (!last || overlay.isDestroyed()) return;
      const bounds = overlay.getBounds();
      const own = new Set(ignore().map(Number));
      const fg = own.has(Number(last.fg)) ? lastFg : last.fg;
      if (!own.has(Number(last.fg))) lastFg = last.fg;
      const wins = (Array.isArray(last.wins) ? last.wins : [])
        .filter((w) => !own.has(Number(w.id)))
        .map((w) => toOverlay(w, bounds))
        // only what overlaps Capri's screen
        .filter((w) => w.x < bounds.width && w.x + w.w > 0 && w.y < bounds.height && w.y + w.h > 0);
      onUpdate({
        fg, taskbar: Boolean(last.taskbar), ai: Array.isArray(last.ai) ? last.ai : [],
        game: last.game || null, proc: last.proc || null,
        media: last.media || null,
        usb: Array.isArray(last.usb) ? last.usb : [], plug: last.plug || null, wins,
      });
    } catch (err) {
      console.error('[capri] window watch send:', err.message);
    }
  };

  // Dragging a window makes the helper speak on every move: passed on at most every 60 ms (the last
  // snapshot always goes), she draws 12 frames a second anyway.
  let sendTimer = 0;
  let lastSent = 0;
  const sendSoon = () => {
    if (sendTimer) return;
    const wait = Math.max(0, 60 - (Date.now() - lastSent));
    sendTimer = setTimeout(() => {
      sendTimer = 0;
      lastSent = Date.now();
      send();
    }, wait);
  };

  const start = () => {
    const startedAt = Date.now();
    child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', SCRIPT, String(self), String(process.pid),
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      try {
        last = JSON.parse(line);
      } catch {
        return;
      }
      sendSoon();
    });
    child.stdout.on('error', () => {});
    child.stderr.on('data', (d) => console.error('[capri] window watch:', String(d).trim()));
    // without this, powershell.exe missing or blocked is an unhandled 'error' event: the app dies
    child.on('error', (err) => console.error('[capri] window watch:', err.message));
    child.on('exit', () => {
      lines.close();
      child = null;
      if (stopped) return;
      // the helper lived a while: it was fine, so the count of quick failures starts over. Before,
      // 3 restarts in the whole life of the app (a sleep, a logoff) left her blind to windows for good.
      if (Date.now() - startedAt > 60000) restarts = 0;
      if (restarts++ < 5) setTimeout(start, Math.min(30000, 3000 * restarts));
    });
  };

  start();
  return {
    stop() {
      stopped = true;
      clearTimeout(sendTimer);
      child?.kill();
    },
    // her window moved (another screen, the taskbar in it or not): the same windows, from there
    refresh: send,
  };
}

module.exports = { startWindowWatch };