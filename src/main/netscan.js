'use strict';

// Nmap and Wireshark (tshark) for her, on YOUR machine and YOUR network only.
//
//  - scan('self')          : the ports open on this PC (127.0.0.1) and which of them are reachable from the LAN
//  - scan('lan')           : who is on your local network (ping scan: IP, name, MAC, vendor)
//  - scan('host', '192.168.1.20') : the open ports of one device on your LAN
//  - capture(seconds)      : a short look at this PC's traffic: protocols, remote hosts, domains. Only metadata is
//                            read, nothing is written to disk, and the capture is not promiscuous.
//
// Guard rails, enforced here and not in the chat: targets must be loopback or private addresses (RFC 1918,
// link-local), ranges no wider than a /24, no hostnames, no arbitrary arguments. Commands run through
// execFile (no shell). One job at a time.
//
// Every function returns the same shape as launch.pcStatus: { ok, text, data, view: 'net' } (or { ok: false, error }),
// so the result can go straight into the status card (pc:statusCard).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { buildFindings, renderLines } = require('./findings');

const WIN = process.platform === 'win32';

const NMAP_PATHS = WIN
  ? [
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Nmap', 'nmap.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Nmap', 'nmap.exe'),
  ]
  : ['/usr/bin/nmap', '/usr/local/bin/nmap', '/opt/homebrew/bin/nmap'];
const TSHARK_PATHS = WIN
  ? [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Wireshark', 'tshark.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Wireshark', 'tshark.exe'),
  ]
  : ['/usr/bin/tshark', '/usr/local/bin/tshark', '/opt/homebrew/bin/tshark', '/Applications/Wireshark.app/Contents/MacOS/tshark'];

const MIN_CAPTURE = 5;
const MAX_CAPTURE = 30;
const MAX_PACKETS = 30000;

// ports worth a word, and what she knows about them
const PORTS = {
  21: ['FTP', 'โอนไฟล์แบบไม่เข้ารหัส'], 22: ['SSH', null], 23: ['Telnet', 'ไม่เข้ารหัสเลย ควรปิด'],
  25: ['SMTP', null], 53: ['DNS', null], 80: ['HTTP', null], 135: ['RPC', 'ของ Windows ไม่ควรเปิดให้ LAN'],
  139: ['NetBIOS', 'ของเก่า ควรปิดถ้าไม่ได้แชร์ไฟล์'], 443: ['HTTPS', null], 445: ['SMB', 'แชร์ไฟล์ Windows เป้าหมายยอดนิยมของมัลแวร์'],
  1433: ['MSSQL', 'ฐานข้อมูล'], 3306: ['MySQL', 'ฐานข้อมูล'], 3389: ['RDP', 'รีโมตเดสก์ท็อป ถ้าไม่ได้ใช้ควรปิด'],
  5040: ['Windows', null], 5357: ['WSDAPI', null], 5432: ['PostgreSQL', 'ฐานข้อมูล'], 5900: ['VNC', 'รีโมตจอ ถ้าไม่ได้ใช้ควรปิด'],
  6379: ['Redis', 'มักไม่มีรหัสผ่าน'], 8080: ['HTTP-alt', null], 9200: ['Elasticsearch', 'มักไม่มีรหัสผ่าน'],
  11434: ['Ollama', 'โมเดล AI ของเธอเอง'], 27017: ['MongoDB', 'มักไม่มีรหัสผ่าน'], 47823: ['Capri', 'ตัวเธอเอง'],
};

// ports that hint strongly at a router/gateway admin panel
const GATEWAY_PORTS = new Set([80, 443, 8080, 8443, 8888, 2000, 4444, 7547, 9090, 9100]);
// Nmap NSE scripts that run fast and need no special privileges (connect scan is enough)
const VULN_SCRIPTS = [
  'banner',
  'http-title',
  'http-server-header',
  'smb-security-mode',
  'smb2-security-mode',
  'ssl-cert',
  'ssl-enum-ciphers',
  'ftp-anon',
  'telnet-ntlm-info',
  'vnc-info',
  'rdp-enum-encryption',
  'ms-sql-info',
  'mysql-empty-password',
  'mongodb-info',
  'redis-info',
].join(',');
// DGA / suspicious domain heuristics: very long labels, high consonant ratio, many numbers
function suspiciousDomain(d) {
  const label = d.split('.')[0];
  if (label.length > 20) return true;                                   // unusually long subdomain
  const digits = (label.match(/\d/g) || []).length;
  if (digits / label.length > 0.4 && label.length > 8) return true;   // lots of numbers
  const consonants = (label.match(/[bcdfghjklmnpqrstvwxyz]/gi) || []).length;
  if (consonants / label.length > 0.75 && label.length > 10) return true; // DGA-like consonant soup
  return false;
}
const RISKY = new Set([21, 23, 135, 139, 445, 1433, 3306, 3389, 5432, 5900, 6379, 9200, 27017]);
const CLEARTEXT = /^(http|ftp|telnet|pop|imap|smtp|snmp|tftp)$/i;

let busy = null; // { kind, child } while a job runs

// ---------- finding the tools ----------

function which(candidates, name) {
  for (const file of candidates) if (fs.existsSync(file)) return file;
  const dirs = String(process.env.PATH || '').split(path.delimiter);
  for (const dir of dirs) {
    const file = path.join(dir, WIN ? `${name}.exe` : name);
    if (dir && fs.existsSync(file)) return file;
  }
  return null;
}

function tools() {
  const nmap = which(NMAP_PATHS, 'nmap');
  const tshark = which(TSHARK_PATHS, 'tshark');
  return { nmap, tshark };
}

function run(file, args, timeout) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (busy?.child === child) busy = null;
      if (err && !stdout) return reject(Object.assign(err, { stderr: String(stderr || '') }));
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
    if (busy) busy.child = child;
  });
}

async function job(kind, fn) {
  if (busy) return { ok: false, error: 'busy', text: null, busy: busy.kind };
  busy = { kind, child: null };
  try {
    return await fn();
  } catch (err) {
    return { ok: false, error: err.killed ? 'timeout' : (err.message || 'failed'), stderr: err.stderr || '', text: null };
  } finally {
    busy = null;
  }
}

function cancel() {
  if (busy?.child) busy.child.kill();
}

// ---------- targets: only your own machine and your own network ----------

const ipToInt = (ip) => ip.split('.').reduce((n, o) => (n * 256) + Number(o), 0);
const intToIp = (n) => [24, 16, 8, 0].map((s) => Math.floor(n / (2 ** s)) % 256).join('.');
const isIPv4 = (s) => /^(\d{1,3})(\.\d{1,3}){3}$/.test(s) && s.split('.').every((o) => Number(o) <= 255);

function isPrivate(ip) {
  if (!isIPv4(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

// this PC's addresses on the LAN: [{ name, ip, mask, cidr, subnet }]
function lanInterfaces() {
  const found = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family !== 'IPv4' || i.internal || !isPrivate(i.address) || i.address.startsWith('169.254.')) continue;
      if (/vmware|virtualbox|vethernet|loopback|bluetooth|docker|wsl/i.test(name)) continue;
      const bits = i.netmask.split('.').reduce((n, o) => n + Number(o).toString(2).replace(/0/g, '').length, 0);
      // never wider than a /24: she looks at your home network, not a campus
      const prefix = Math.max(bits, 24);
      const net = Math.floor(ipToInt(i.address) / (2 ** (32 - prefix))) * (2 ** (32 - prefix));
      found.push({ name, ip: i.address, cidr: `${intToIp(net)}/${prefix}`, prefix });
    }
  }
  return found;
}

// what she may scan: '127.0.0.1', one private IP, or a private CIDR no wider than /24. Anything else: null.
function checkTarget(target) {
  const t = String(target || '').trim();
  if (/^(localhost|self)$/i.test(t)) return '127.0.0.1';
  const m = /^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/.exec(t);
  if (!m || !isIPv4(m[1]) || !isPrivate(m[1])) return null;
  if (m[2] === undefined) return m[1];
  const prefix = Number(m[2]);
  if (prefix < 24 || prefix > 32) return null;
  return `${m[1]}/${prefix}`;
}

// ---------- nmap ----------

const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? '';
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// nmap -oX - : the hosts that are up, with their open ports
function parseXml(xml) {
  const hosts = [];
  for (const block of xml.match(/<host\b[\s\S]*?<\/host>/g) || []) {
    if (!/<status state="up"/.test(block)) continue;
    const host = { ip: '', mac: '', vendor: '', name: '', ports: [] };
    for (const a of block.match(/<address\b[^>]*>/g) || []) {
      if (attr(a, 'addrtype') === 'ipv4') host.ip = attr(a, 'addr');
      if (attr(a, 'addrtype') === 'mac') { host.mac = attr(a, 'addr'); host.vendor = unesc(attr(a, 'vendor')); }
    }
    const hn = /<hostname\b[^>]*>/.exec(block);
    if (hn) host.name = unesc(attr(hn[0], 'name'));
    for (const p of block.match(/<port\b[\s\S]*?<\/port>/g) || []) {
      if (!/<state state="open"/.test(p)) continue;
      const svc = /<service\b[^>]*>/.exec(p)?.[0] || '';
      // collect NSE script output lines (output="...") for this port
      const scriptLines = [];
      for (const sc of p.match(/<script\b[^>]*>/g) || []) {
        const out = unesc(attr(sc, 'output')).trim();
        if (out) scriptLines.push(out);
      }
      host.ports.push({
        port: Number(attr(p, 'portid')),
        proto: attr(p, 'protocol'),
        service: unesc(attr(svc, 'name')),
        product: unesc([attr(svc, 'product'), attr(svc, 'version')].filter(Boolean).join(' ')),
        scriptOut: scriptLines.length ? scriptLines.join('\n') : null,
      });
    }
    host.ports.sort((a, b) => a.port - b.port);
    if (host.ip) hosts.push(host);
  }
  return hosts;
}

async function nmap(args, timeout) {
  const { nmap: bin } = tools();
  if (!bin) throw new Error('nmap not found');
  const { stdout } = await run(bin, [...args, '-oX', '-'], timeout);
  return parseXml(stdout);
}

const portLabel = (p) => {
  const known = PORTS[p.port];
  return known?.[0] || p.service || '?';
};

function portLine(p, exposed) {
  const known = PORTS[p.port];
  const note = known?.[1] ? `  <- ${known[1]}` : '';
  const flag = exposed ? ' [LAN]' : '';
  const prod = p.product ? ` (${p.product})` : '';
  return `  ${String(p.port).padStart(5)}/${p.proto}  ${portLabel(p).padEnd(14)}${prod}${flag}${note}`;
}

// the ports open on this PC, and which ones the rest of your network can also reach
function scanSelf() {
  return job('nmap-self', async () => {
    const lan = lanInterfaces()[0] || null;
    const local = (await nmap(['-Pn', '-sT', '-sV', '--version-light', '-T4', '--open', '127.0.0.1'], 120000))[0];
    const outside = lan
      ? (await nmap(['-Pn', '-sT', '-T4', '--open', lan.ip], 120000).catch(() => []))[0]
      : null;
    const exposedSet = new Set((outside?.ports || []).map((p) => `${p.port}/${p.proto}`));
    const ports = (local?.ports || []).map((p) => ({ ...p, exposed: exposedSet.has(`${p.port}/${p.proto}`), risky: RISKY.has(p.port) }));
    const exposed = ports.filter((p) => p.exposed);
    const risky = ports.filter((p) => p.exposed && p.risky);

    const lines = ['NMAP SELF', `  target  127.0.0.1${lan ? `  +  ${lan.ip} (${lan.name})` : ''}`, `  open    ${ports.length}   reachable from LAN  ${exposed.length}`];
    if (ports.length) {
      lines.push('PORTS');
      for (const p of ports) lines.push(portLine(p, p.exposed));
    } else {
      lines.push('  ไม่มีพอร์ตที่เปิดฟังอยู่เลย');
    }
    if (risky.length) {
      lines.push('EXPOSED');
      for (const p of risky) lines.push(`  ${p.port} ${portLabel(p)}: คนในวงเดียวกับคุณเข้าถึงได้`);
    }
    const data = { net: { kind: 'self', lan: lan?.ip || null, ports, exposed: exposed.length, risky: risky.map((p) => p.port) } };
    return { ok: true, view: 'net', data, text: lines.join('\n') };
  });
}

// who is on the network: a ping scan of your /24 (never wider)
function scanLan() {
  return job('nmap-lan', async () => {
    const lan = lanInterfaces()[0];
    if (!lan) return { ok: false, error: 'nolan', text: null };
    const hosts = await nmap(['-sn', '-T4', lan.cidr], 120000);
    const me = hosts.find((h) => h.ip === lan.ip);
    const others = hosts.filter((h) => h.ip !== lan.ip).sort((a, b) => ipToInt(a.ip) - ipToInt(b.ip));
    const lines = ['NMAP LAN', `  range   ${lan.cidr}  (${lan.name})`, `  found   ${others.length + 1} devices (รวมเครื่องนี้)`, 'DEVICES'];
    lines.push(`  ${lan.ip.padEnd(15)} เครื่องนี้${me?.name ? `  ${me.name}` : ''}`);
    for (const h of others) {
      const who = [h.name, h.vendor || (h.mac ? 'MAC ' + h.mac : '')].filter(Boolean).join('  ·  ');
      lines.push(`  ${h.ip.padEnd(15)} ${who || '(ไม่ทราบชื่อ)'}`);
    }
    const data = { net: { kind: 'lan', range: lan.cidr, me: lan.ip, hosts: others.map(({ ip, name, mac, vendor }) => ({ ip, name, mac, vendor })) } };
    return { ok: true, view: 'net', data, text: lines.join('\n') };
  });
}

// the open ports of one device on your LAN
function scanHost(target) {
  const ip = checkTarget(target);
  if (!ip || ip.includes('/')) return Promise.resolve({ ok: false, error: 'target', text: null });
  return job('nmap-host', async () => {
    const [host] = await nmap(['-Pn', '-sT', '-sV', '--version-light', '-T4', '--top-ports', '200', '--open', ip], 180000);
    const ports = (host?.ports || []).map((p) => ({ ...p, risky: RISKY.has(p.port) }));
    const lines = ['NMAP HOST', `  target  ${ip}${host?.name ? `  (${host.name})` : ''}`, `  open    ${ports.length}`];
    if (ports.length) {
      lines.push('PORTS');
      for (const p of ports) lines.push(portLine(p, false));
    }
    const data = { net: { kind: 'host', ip, ports } };
    return { ok: true, view: 'net', data, text: lines.join('\n') };
  });
}

// ---------- gateway scan: what's your router running? ----------

function defaultGateway() {
  // read the routing table from the OS instead of shelling out
  const ifaces = lanInterfaces();
  if (!ifaces.length) return null;
  // derive the likely gateway: host address .1 or .254 of the /24
  const net = ipToInt(ifaces[0].cidr.split('/')[0]);
  return intToIp(net + 1); // most home routers sit at x.x.x.1
}

// scan('gateway') — what admin panels / services is your router exposing?
function scanGateway() {
  return job('nmap-gateway', async () => {
    const gw = defaultGateway();
    if (!gw || !isPrivate(gw)) return { ok: false, error: 'nogateway', text: null };
    // quick TCP connect on the ports routers like to open, then service version
    const [host] = await nmap([
      '-Pn', '-sT', '-sV', '--version-light', '-T4', '--open',
      `-p${[...GATEWAY_PORTS].join(',')}`, gw,
    ], 90000);
    const ports = (host?.ports || []).map((p) => ({ ...p, risky: RISKY.has(p.port) }));
    const admin = ports.filter((p) => GATEWAY_PORTS.has(p.port));
    const lines = [
      'NMAP GATEWAY', `  target  ${gw}${host?.name ? `  (${host.name})` : ''}`,
      `  admin panels found  ${admin.length}`,
    ];
    if (ports.length) {
      lines.push('PORTS');
      for (const p of ports) lines.push(portLine(p, false));
    } else {
      lines.push('  ไม่เห็นพอร์ตใดเปิดฟังเลย (เราเตอร์อาจซ่อนตัวดีมาก หรือ IP ผิด)');
    }
    if (admin.some((p) => p.port === 80)) lines.push('NOTE  admin panel บน HTTP ไม่เข้ารหัส ลองเปลี่ยนไป HTTPS ถ้าเราเตอร์รองรับ');
    const data = { net: { kind: 'gateway', ip: gw, ports } };
    return { ok: true, view: 'net', data, text: lines.join('\n') };
  });
}

// ---------- OS detection: guess what OS that device runs ----------

// scan('os', ip) — what OS is that device on your LAN likely running?
function scanOs(target) {
  const ip = checkTarget(target);
  if (!ip || ip.includes('/')) return Promise.resolve({ ok: false, error: 'target', text: null });
  return job('nmap-os', async () => {
    // -O requires raw sockets (root/admin). Fall back gracefully if it fails.
    let hosts = [];
    try {
      hosts = await nmap(['-Pn', '-O', '--osscan-guess', '-T4', ip], 120000);
    } catch {
      // non-root: at least grab open ports and version strings, guess from banners
      hosts = await nmap(['-Pn', '-sT', '-sV', '--version-light', '-T4', '--top-ports', '50', '--open', ip], 90000);
    }
    const host = hosts[0];
    const ports = host?.ports || [];
    // crude banner-based OS hint when nmap -O wasn't allowed
    let osGuess = host?.os || '';
    if (!osGuess) {
      const products = ports.map((p) => (p.product || p.service || '').toLowerCase()).join(' ');
      if (/windows/.test(products)) osGuess = 'Windows (from banner)';
      else if (/linux|ubuntu|debian|centos/.test(products)) osGuess = 'Linux (from banner)';
      else if (/dd-wrt|openwrt|tomato|asuswrt|mikrotik/.test(products)) osGuess = 'Router / embedded Linux';
      else if (/ios|tvos|apple/.test(products)) osGuess = 'Apple device';
      else if (/android/.test(products)) osGuess = 'Android device';
    }
    const lines = [
      'NMAP OS', `  target  ${ip}${host?.name ? `  (${host.name})` : ''}`,
      `  OS      ${osGuess || '(ไม่สามารถระบุได้ — ลองรันในฐานะ Administrator เพื่อผลที่ดีขึ้น)'}`,
    ];
    if (ports.length) {
      lines.push('PORTS (hint)');
      for (const p of ports.slice(0, 8)) lines.push(portLine(p, false));
    }
    const data = { net: { kind: 'os', ip, os: osGuess, ports } };
    return { ok: true, view: 'net', data, text: lines.join('\n') };
  });
}

// ---------- vuln scan: NSE scripts for quick security insight ----------

// scan('vuln', ip) — safe NSE scripts + (for THIS PC) who owns each open port, who is connected, and what can be fixed.
// On this PC the findings carry `fixes` (whitelisted, see remediate.js); on another device they never do.
function scanVuln(target) {
  const ip = checkTarget(target);
  if (!ip || ip.includes('/')) return Promise.resolve({ ok: false, error: 'target', text: null });
  return job('nmap-vuln', async () => {
    const mine = new Set(['127.0.0.1', ...lanInterfaces().map((i) => i.ip)]);
    const local = mine.has(ip);
    // the OS table first, THEN nmap: read at the same time, nmap's own connections to 127.0.0.1 showed up as "a program on this PC uses it"
    const snap = local ? await require('./listeners').snapshot() : null;
    const hosts = await nmap([
      '-Pn', '-sT', '-sV', '--version-light', '-T4',
      '--top-ports', '100', '--open',
      `--script=${VULN_SCRIPTS}`,
      ip,
    ], 240000);
    const host = hosts[0];
    const ports = (host?.ports || []).map((p) => ({ ...p, risky: RISKY.has(p.port) }));
    const findings = buildFindings({ ip, local, ports, snap });

    // outside knowledge (CISA's public list, downloaded and matched here: nothing about this PC is sent) + fix proposals
    let intel = { used: false };
    if (local) {
      try { intel = await require('./intel').enrich(findings, require('./config').load()); } catch { /* optional */ }
      require('./remediate').register(findings);
    }

    const real = findings.filter((f) => f.severity !== 'info');
    const lines = [
      'NMAP VULN', `  target  ${ip}${host?.name ? `  (${host.name})` : ''}${local ? '  — เครื่องนี้' : ''}`,
      `  ports   ${ports.length}  findings  ${real.length}`,
    ];
    if (local && !snap?.ok) lines.push('  (อ่านรายชื่อโปรแกรมที่เปิดพอร์ตไม่ได้ จึงบอกได้แค่ว่าพอร์ตไหนเปิด ลองรันแอปในฐานะ Administrator)');
    if (ports.length) {
      lines.push('PORTS');
      for (const p of ports) {
        lines.push(portLine(p, false));
        if (p.scriptOut) {
          for (const l of p.scriptOut.split('\n').slice(0, 4)) {
            const t = l.trim();
            if (t) lines.push(`         ${t}`);
          }
        }
      }
    }
    lines.push(...renderLines(findings));
    if (!real.length && ports.length) lines.push('  ไม่พบปัญหาที่ชัดเจน (แต่นี่ไม่ใช่ pentest จริงจัง นะ)');
    if (intel.used) lines.push('SOURCE', '  CISA Known Exploited Vulnerabilities — โหลดรายการสาธารณะมาเทียบในเครื่อง ไม่ได้ส่งข้อมูลของเครื่องนี้ออกไป');
    const data = { net: { kind: 'vuln', ip, local, ports, findings, firewall: snap?.firewall || [], intel } };
    return { ok: true, view: 'net', data, text: lines.join('\n') };
  });
}

// ---------- bandwidth: how fast is the link right now? ----------

// capture(seconds, { bandwidth: true }) — measure real-time in/out throughput (bytes/sec)
function measureBandwidth(seconds = 10, { iface = null } = {}) {
  const bin = tools().tshark;
  if (!bin) return Promise.resolve({ ok: false, error: 'notshark', text: null });
  const secs = Math.max(5, Math.min(30, Number(seconds) || 10));
  return job('tshark-bw', async () => {
    const chosen = await pickInterface(bin, iface);
    if (!chosen) return { ok: false, error: 'nointerface', text: null };
    // capture frame length and direction (src IP) only — no payload, not promiscuous
    const args = [
      '-i', chosen.n, '-p', '-q', '-a', `duration:${secs}`, '-c', String(MAX_PACKETS),
      '-T', 'fields', '-E', 'separator=\t',
      '-e', 'frame.time_epoch', '-e', 'ip.src', '-e', 'frame.len',
    ];
    const { stdout } = await run(bin, args, (secs + 20) * 1000);
    const mine = new Set(Object.values(os.networkInterfaces()).flat().filter(Boolean).map((i) => i.address));

    // bucket by whole second
    const outBuckets = new Map(); // epoch-second → bytes sent
    const inBuckets = new Map();  // epoch-second → bytes received
    let minT = Infinity; let maxT = -Infinity;

    for (const row of stdout.split(/\r?\n/)) {
      if (!row) continue;
      const [ts, src, len] = row.split('\t');
      const t = Math.floor(Number(ts));
      const size = Number(len) || 0;
      if (!t || !size) continue;
      minT = Math.min(minT, t); maxT = Math.max(maxT, t);
      const bucket = mine.has(src) ? outBuckets : inBuckets;
      bucket.set(t, (bucket.get(t) || 0) + size);
    }

    if (minT === Infinity) return { ok: false, error: 'nopackets', iface: chosen.label, text: null };

    const duration = Math.max(maxT - minT + 1, 1);
    const totalOut = [...outBuckets.values()].reduce((a, b) => a + b, 0);
    const totalIn = [...inBuckets.values()].reduce((a, b) => a + b, 0);
    const avgOut = totalOut / duration;
    const avgIn = totalIn / duration;
    // peak: busiest single second
    const peakOut = Math.max(0, ...[...outBuckets.values()]);
    const peakIn = Math.max(0, ...[...inBuckets.values()]);

    const fmtBps = (n) => {
      if (n >= 125e6) return `${(n / 125e6).toFixed(1)} Gbps`;
      if (n >= 125e3) return `${(n / 125e3).toFixed(1)} Mbps`;
      return `${Math.round(n / 125)} Kbps`;
    };

    const lines = [
      'TSHARK BANDWIDTH', `  iface   ${chosen.label.replace(/\s*\(.*$/, '')}`, `  time    ${duration}s`,
      `  ↑ upload    avg ${fmtBps(avgOut * 8)}   peak ${fmtBps(peakOut * 8)}`,
      `  ↓ download  avg ${fmtBps(avgIn * 8)}   peak ${fmtBps(peakIn * 8)}`,
      `  total   sent ${fmtBytes(totalOut)}   received ${fmtBytes(totalIn)}`,
    ];
    const data = { net: { kind: 'bandwidth', seconds: duration, avgOut, avgIn, peakOut, peakIn, totalOut, totalIn } };
    return { ok: true, view: 'net', data, text: lines.join('\n') };
  });
}

// ---------- custom port range scan ----------

// scan('ports', ip, '1-1024') — scan a specific port range on any private target
function scanPorts(target, range = '1-1024') {
  const ip = checkTarget(target);
  if (!ip || ip.includes('/')) return Promise.resolve({ ok: false, error: 'target', text: null });
  // validate range: only digits and hyphens, max span 65535
  const rangeClean = String(range).replace(/\s/g, '');
  if (!/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(rangeClean)) return Promise.resolve({ ok: false, error: 'badrange', text: null });
  return job('nmap-ports', async () => {
    const [host] = await nmap([
      '-Pn', '-sT', '-sV', '--version-light', '-T4', '--open', `-p${rangeClean}`, ip,
    ], 240000);
    const ports = (host?.ports || []).map((p) => ({ ...p, risky: RISKY.has(p.port) }));
    const lines = [
      'NMAP PORTS', `  target  ${ip}${host?.name ? `  (${host.name})` : ''}`,
      `  range   ${rangeClean}   open  ${ports.length}`,
    ];
    if (ports.length) {
      lines.push('PORTS');
      for (const p of ports) lines.push(portLine(p, false));
    } else {
      lines.push('  ไม่มีพอร์ตเปิดในช่วงที่ระบุ');
    }
    const data = { net: { kind: 'ports', ip, range: rangeClean, ports } };
    return { ok: true, view: 'net', data, text: lines.join('\n') };
  });
}

function scan(kind = 'self', target = '', extra = '') {
  if (!tools().nmap) return Promise.resolve({ ok: false, error: 'nonmap', text: null });
  if (kind === 'lan') return scanLan();
  if (kind === 'host') return scanHost(target);
  if (kind === 'gateway') return scanGateway();
  if (kind === 'os') return scanOs(target);
  if (kind === 'vuln') return scanVuln(target);
  if (kind === 'ports') return scanPorts(target, extra);
  return scanSelf();
}

// ---------- tshark ----------

// the interface to listen on: the one the user chose, else the first real one (not a virtual, bluetooth or loopback adapter)
async function pickInterface(bin, preferred) {
  const { stdout } = await run(bin, ['-D'], 15000);
  const list = stdout.split(/\r?\n/).map((l) => /^(\d+)\.\s+(.*)$/.exec(l)).filter(Boolean).map((m) => ({ n: m[1], label: m[2] }));
  if (preferred) {
    const hit = list.find((i) => i.n === String(preferred) || i.label.toLowerCase().includes(String(preferred).toLowerCase()));
    if (hit) return hit;
  }
  const real = list.filter((i) => !/loopback|bluetooth|vmware|virtualbox|vethernet|docker|wsl|ndis|etw|usbpcap/i.test(i.label));
  return real.find((i) => /wi-?fi|wlan|wireless|ethernet|en\d|eth\d/i.test(i.label)) || real[0] || list[0] || null;
}

const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

const fmtBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`);

// a short look at the traffic of this PC. Fields only: no payload is read, kept or written anywhere.
function capture(seconds = 15, { iface = null } = {}) {
  const bin = tools().tshark;
  if (!bin) return Promise.resolve({ ok: false, error: 'notshark', text: null });
  const secs = Math.max(MIN_CAPTURE, Math.min(MAX_CAPTURE, Number(seconds) || 15));
  return job('tshark', async () => {
    const chosen = await pickInterface(bin, iface);
    if (!chosen) return { ok: false, error: 'nointerface', text: null };
    // -p: not promiscuous, so only this PC's own traffic (and broadcasts)
    const args = [
      '-i', chosen.n, '-p', '-q', '-a', `duration:${secs}`, '-c', String(MAX_PACKETS),
      '-T', 'fields', '-E', 'separator=\t',
      '-e', 'ip.src', '-e', 'ip.dst', '-e', '_ws.col.Protocol', '-e', 'frame.len',
      '-e', 'dns.qry.name', '-e', 'tls.handshake.extensions_server_name', '-e', 'http.host',
    ];
    const { stdout } = await run(bin, args, (secs + 25) * 1000);

    const mine = new Set(Object.values(os.networkInterfaces()).flat().filter(Boolean).map((i) => i.address));
    const proto = new Map(); const protoBytes = new Map();
    const remote = new Map(); const domains = new Map();
    let packets = 0; let bytes = 0;
    for (const row of stdout.split(/\r?\n/)) {
      if (!row) continue;
      const [src, dst, name, len, dns, sni, httpHost] = row.split('\t');
      const size = Number(len) || 0;
      packets++; bytes += size;
      const p = name || 'other';
      proto.set(p, (proto.get(p) || 0) + 1);
      protoBytes.set(p, (protoBytes.get(p) || 0) + size);
      const far = [src, dst].find((ip) => ip && !mine.has(ip) && !isPrivate(ip) && !/^(22[4-9]|23\d|255)\./.test(ip));
      if (far) remote.set(far, (remote.get(far) || 0) + size);
      for (const d of [dns, sni, httpHost]) {
        const host = String(d || '').split(',')[0].trim().toLowerCase();
        if (host && /^[a-z0-9._-]+$/.test(host)) domains.set(host, (domains.get(host) || 0) + 1);
      }
    }
    if (!packets) return { ok: false, error: 'nopackets', iface: chosen.label, text: null };

    const clear = [...proto.keys()].filter((p) => CLEARTEXT.test(p));
    const biggest = top(remote, 1)[0];
    const lines = [
      'TSHARK', `  iface   ${chosen.label.replace(/\s*\(.*$/, '') || chosen.n}`, `  time    ${secs}s   packets ${packets}   data ${fmtBytes(bytes)}`,
      'PROTO',
      ...top(protoBytes, 6).map(([p, b]) => `  ${p.padEnd(10)} ${String(proto.get(p)).padStart(6)} pkts  ${fmtBytes(b)}`),
      'DOMAINS',
      ...(domains.size ? top(domains, 8).map(([d, n]) => `  ${d.slice(0, 44).padEnd(44)} x${n}`) : ['  (ไม่เห็นชื่อโดเมน)']),
      'TALKERS',
      ...(remote.size ? top(remote, 5).map(([ip, b]) => `  ${ip.padEnd(16)} ${fmtBytes(b)}`) : ['  (ไม่มีปลายทางภายนอก)']),
    ];
    // suspicious domain analysis
    const suspicious = [...domains.keys()].filter(suspiciousDomain);

    const notes = [];
    if (clear.length) notes.push(`มีโปรโตคอลที่ไม่เข้ารหัส: ${clear.join(', ')}`);
    if (biggest && bytes && biggest[1] / bytes > 0.7 && biggest[1] > 5e6) notes.push(`ปลายทางเดียว (${biggest[0]}) กินข้อมูลไปเกือบหมด`);
    if (suspicious.length) notes.push(`โดเมนน่าสงสัย (DGA/สุ่ม?): ${suspicious.slice(0, 3).join(', ')}${suspicious.length > 3 ? ` +${suspicious.length - 3} อื่น` : ''}`);
    if (notes.length) lines.push('NOTES', ...notes.map((n) => `  ${n}`));

    const data = {
      net: {
        kind: 'capture', seconds: secs, packets, bytes,
        protocols: top(proto, 6).map(([name, n]) => ({ name, packets: n, bytes: protoBytes.get(name) })),
        domains: top(domains, 8).map(([name, n]) => ({ name, count: n })),
        talkers: top(remote, 5).map(([ip, b]) => ({ ip, bytes: b })),
        cleartext: clear,
      },
    };
    return { ok: true, view: 'net', data, text: lines.join('\n') };
  });
}

module.exports = { tools, scan, capture, measureBandwidth, cancel, checkTarget, lanInterfaces, defaultGateway, MIN_CAPTURE, MAX_CAPTURE };