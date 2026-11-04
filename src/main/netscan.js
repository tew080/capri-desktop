'use strict';

// Nmap and Wireshark (tshark) for her, on YOUR machine and YOUR network only.
//
//  - scan('self')          : the ports open on this PC (127.0.0.1) and which of them are reachable from the LAN
//  - scan('lan')           : who is on your local network (ping scan: IP, name, MAC, vendor)
//  - scan('host', '192.168.1.20') : the open ports of one device on your LAN
//  - capture(seconds)      : a short look at this PC's traffic: protocols, remote hosts, domains. Only metadata is
//                            read, nothing is written to disk, and the capture is not promiscuous.
//
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
  21: ['FTP', 'โอนไฟล์ — ตรวจสอบว่าบังคับใช้ TLS หรือไม่'], 22: ['SSH', null], 23: ['Telnet', 'ไม่เข้ารหัสเลย ควรปิด'],
  25: ['SMTP', null], 53: ['DNS', null], 80: ['HTTP', null], 135: ['RPC', 'ของ Windows ไม่ควรเปิดให้ LAN'],
  139: ['NetBIOS', 'ของเก่า ควรปิดถ้าไม่ได้แชร์ไฟล์'], 443: ['HTTPS', null], 445: ['SMB', 'แชร์ไฟล์ Windows เป้าหมายยอดนิยมของมัลแวร์'],
  1433: ['MSSQL', 'ฐานข้อมูล'], 3306: ['MySQL', 'ฐานข้อมูล'], 3389: ['RDP', 'รีโมตเดสก์ท็อป ถ้าไม่ได้ใช้ควรปิด'],
  5040: ['Windows', null], 5357: ['WSDAPI', null], 5432: ['PostgreSQL', 'ฐานข้อมูล'], 5900: ['VNC', 'รีโมตจอ ถ้าไม่ได้ใช้ควรปิด'],
  6379: ['Redis', 'มักไม่มีรหัสผ่าน'], 8080: ['HTTP-alt', null], 9200: ['Elasticsearch', 'มักไม่มีรหัสผ่าน'],
  11434: ['Ollama', 'โมเดล AI ของเธอเอง'], 27017: ['MongoDB', 'มักไม่มีรหัสผ่าน'], 47823: ['Capri', 'ตัวเธอเอง'],
  2000: ['Cisco SCCP', 'ถ้าไม่ได้ใช้ระบบโทรศัพท์ Cisco ควรปิด'],
  5060: ['SIP', 'บริการ VoIP — ถ้าไม่ได้ใช้ควรปิด'],
  8083: ['Hestia CP', 'แผงควบคุมเซิร์ฟเวอร์ — ควรจำกัดการเข้าถึงด้วย IP หรือ VPN'],
  10000: ['Webmin', 'แผงควบคุมเซิร์ฟเวอร์ — ควรจำกัดการเข้าถึงด้วย IP หรือ VPN'],
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
const RISKY = new Set([21, 23, 135, 139, 445, 1433, 3306, 3389, 5060, 5432, 5900, 6379, 8083, 9200, 10000, 27017]);
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

// the last vuln / external scan, kept HERE (main.js reads it for net:analyze): the overlay never decides what the model reads.
// Cleared when any new job starts, so a LAN scan can never be analysed with the evidence of an older security scan.
let last = null;
const lastScan = () => last;

async function job(kind, fn) {
  if (busy) return { ok: false, error: 'busy', text: null, busy: busy.kind };
  busy = { kind, child: null };
  last = null;
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

// ── External target ──────────────────────────────────────────────
// Accepts a public IPv4 or a hostname 
// Returns the cleaned string, or null if the input looks wrong / dangerous.
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const SHELL_UNSAFE = /[;&|`$<>'"\\()\n\r\t]/;          // characters nmap should never see
function checkExternalTarget(target) {
  const t = String(target || '').trim().replace(/\/+$/, ''); // strip trailing slashes
  if (!t || t.length > 253) return null;
  if (SHELL_UNSAFE.test(t)) return null;
  // public IPv4 — must not be private/loopback
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(t)) {
    if (!isIPv4(t)) return null;
    if (isPrivate(t)) return null;           // private → use the normal checkTarget path
    return t;
  }
  // hostname / domain (no protocol, no port, no path)
  if (DOMAIN_RE.test(t)) return t;
  return null;
}

// ---------- nmap ----------

const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? '';
const unesc = (s) => s.replace(/&#xa;/gi, '\n').replace(/&#x9;/gi, '\t').replace(/&#xd;/gi, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

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
      let scriptErrors = 0; // checks that did NOT run: no finding from them does not mean the port is fine
      for (const sc of p.match(/<script\b[^>]*>/g) || []) {
        const out = unesc(attr(sc, 'output')).trim();
        if (/^ERROR: Script execution failed/i.test(out)) { scriptErrors += 1; continue; }
        if (/^TLS randomness does not represent time$/i.test(out)) continue; // ssl-date's "nothing to report"
        if (out) scriptLines.push(out);
      }
      host.ports.push({
        port: Number(attr(p, 'portid')),
        proto: attr(p, 'protocol'),
        service: unesc(attr(svc, 'name')),
        product: unesc([attr(svc, 'product'), attr(svc, 'version')].filter(Boolean).join(' ')),
        tunnel: unesc(attr(svc, 'tunnel')),
        scriptErrors,
        scriptOut: scriptLines.length ? scriptLines.join('\n') : null,
      });
    }
    host.ports.sort((a, b) => a.port - b.port);

    // OS detection (-O / -A): guesses, device type, CPE
    host.osmatches = [];
    for (const m of block.match(/<osmatch\b[\s\S]*?<\/osmatch>/g) || []) {
      const head = /<osmatch\b[^>]*>/.exec(m)[0];
      host.osmatches.push({
        name: unesc(attr(head, 'name')),
        accuracy: Number(attr(head, 'accuracy')) || 0,
        classes: (m.match(/<osclass\b[^>]*>/g) || []).map((c) => ({
          type: unesc(attr(c, 'type')),
          vendor: unesc(attr(c, 'vendor')),
          family: unesc(attr(c, 'osfamily')),
          gen: unesc(attr(c, 'osgen')),
          accuracy: Number(attr(c, 'accuracy')) || 0,
        })),
        cpes: [...m.matchAll(/<cpe>([^<]*)<\/cpe>/g)].map((x) => unesc(x[1])),
      });
    }
    host.os = host.osmatches[0]?.name || '';
    host.portused = (block.match(/<portused\b[^>]*>/g) || []).map((t) => attr(t, 'state'));

    // uptime guess, network distance, IP ID sequence
    const up = /<uptime\b[^>]*>/.exec(block)?.[0];
    host.uptime = up ? { seconds: Number(attr(up, 'seconds')) || 0, lastboot: unesc(attr(up, 'lastboot')) } : null;
    const dist = /<distance\b[^>]*>/.exec(block)?.[0];
    host.distance = dist ? Number(attr(dist, 'value')) : null;
    const ipid = /<ipidsequence\b[^>]*>/.exec(block)?.[0];
    host.ipid = ipid ? unesc(attr(ipid, 'class')) : '';

    // traceroute (--traceroute / -A)
    const tr = /<trace\b[^>]*>/.exec(block)?.[0];
    host.trace = tr ? {
      port: attr(tr, 'port'),
      proto: attr(tr, 'proto'),
      hops: (block.match(/<hop\b[^>]*>/g) || []).map((h) => ({
        ttl: Number(attr(h, 'ttl')),
        ip: attr(h, 'ipaddr'),
        rtt: attr(h, 'rtt'),
        name: unesc(attr(h, 'host')),
      })),
    } : null;
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
  let staticNote = known?.[1] || '';
  // FTP: if TLS is visible in script output, refine the note to reflect actual status
  if (p.port === 21 && /TLSv1\.[0-3]/i.test(p.scriptOut || '')) {
    staticNote = 'รองรับ TLS แต่สแกนบอกไม่ได้ว่าบังคับใช้หรือไม่';
  } else if (p.port === 21 && !(p.scriptOut || '').trim()) {
    staticNote = 'โอนไฟล์แบบไม่เข้ารหัส';
  }
  const note = staticNote ? `  <- ${staticNote}` : '';
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
        if (p.scriptErrors) lines.push(`         (สคริปต์ตรวจ ${p.scriptErrors} ตัวทำงานไม่สำเร็จ — ผลส่วนนี้ยังไม่ครบ)`);
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
    if (intel.used) lines.push('SOURCE', `  CISA Known Exploited Vulnerabilities (ดึงเมื่อ ${String(intel.fetched || '').slice(0, 10)}) — โหลดรายการสาธารณะมาเทียบในเครื่อง ไม่ได้ส่งข้อมูลของเครื่องนี้ออกไป`);
    const data = { net: { kind: 'vuln', ip, local, ports, findings, analysis: findings.analysis || null, firewall: snap?.firewall || [], intel } };
    last = { at: Date.now(), net: data.net };
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

// ---------- external host scan ----------

// scan('external', 'example.com') — port + service scan of a public host.
// Uses a conservative profile (no OS detection, no aggressive timing, no intrusive NSE scripts)
// so it stays within the bounds of a normal pentest-lab exercise.
// The caller (chat.js / main.js) is responsible for having obtained explicit consent before calling this.
const CAPRI_MASK = {
  fakeIp: "10.88.88.88",
  aliasName: "CAPRI"
};

// Hide the scanner's own network in the results: the private hops of the traceroute (router, ISP-internal 10.x / 100.64.x)
// become "10.88.88.88 (CAPRI)" for the first one and "private (masked)" for the rest. Public hops are left as they are.
// Display only: it changes what is shown, not how the scan is sent. Turn off with { mask: false }.
const isCgnat = (ip) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip);
function maskTrace(trace) {
  if (!trace?.hops) return trace;
  let first = true;
  return {
    ...trace,
    hops: trace.hops.map((h) => {
      if (!(isPrivate(h.ip) || isCgnat(h.ip))) return h;
      const out = first
        ? { ...h, ip: CAPRI_MASK.fakeIp, name: CAPRI_MASK.aliasName }
        : { ...h, ip: 'private (masked)', name: '' };
      first = false;
      return out;
    }),
  };
}

function maskDentity(scanData) {
  if (!scanData) return scanData;
  
  if (scanData.net && scanData.net.me) {
    scanData.net.me = CAPRI_MASK.fakeIp;
    scanData.net.alias = CAPRI_MASK.aliasName;
  }
  
  return scanData;
}

// ---- OS / uptime / distance block, formatted like Nmap's normal output ----
function osInfoLines(h) {
  const m = h?.osmatches || [];
  const out = [];
  if (m.length) {
    const classes = m.flatMap((x) => x.classes);
    const best = Math.max(...m.map((x) => x.accuracy));
    const types = [...new Set(classes.map((c) => c.type).filter(Boolean))];
    if (types.length) out.push(`Device type: ${types.join('|')}`);

    // "Linux 2.6.X|5.X (87%), Cisco embedded (85%)"
    const fam = new Map();
    for (const c of classes) {
      const label = c.vendor && c.vendor !== c.family ? `${c.vendor} ${c.family}` : (c.family || c.vendor);
      if (!label) continue;
      const e = fam.get(label) || { gens: new Set(), acc: 0 };
      if (c.gen) e.gens.add(c.gen);
      e.acc = Math.max(e.acc, c.accuracy);
      fam.set(label, e);
    }
    if (fam.size) {
      const running = [...fam.entries()].map(([label, e]) => `${[label, [...e.gens].join('|')].filter(Boolean).join(' ')} (${e.acc}%)`);
      out.push(`${best >= 100 ? 'Running' : 'Running (JUST GUESSING)'}: ${running.join(', ')}`);
    }
    const cpes = [...new Set(m.flatMap((x) => x.cpes))].slice(0, 6);
    if (cpes.length) out.push(`OS CPE: ${cpes.join(' ')}`);
    if (best >= 100) {
      out.push(`OS details: ${m[0].name}`);
    } else {
      out.push(`Aggressive OS guesses: ${m.slice(0, 8).map((x) => `${x.name} (${x.accuracy}%)`).join(', ')}`);
      const ideal = (h.portused || []).includes('open') && (h.portused || []).includes('closed');
      out.push(`No exact OS matches for host${ideal ? '.' : ' (test conditions non-ideal).'}`);
    }
  }
  if (h?.uptime?.seconds) out.push(`Uptime guess: ${(h.uptime.seconds / 86400).toFixed(3)} days (since ${h.uptime.lastboot})`);
  if (h?.distance != null && !Number.isNaN(h.distance)) out.push(`Network Distance: ${h.distance} hop${h.distance === 1 ? '' : 's'}`);
  if (h?.ipid) out.push(`IP ID Sequence Generation: ${h.ipid}`);
  return out;
}

// ---- traceroute block:  HOP RTT ADDRESS ----
function traceLines(h) {
  const t = h?.trace;
  if (!t?.hops?.length) return [];
  const out = [`TRACEROUTE (using port ${t.port}/${t.proto})`, '  HOP RTT       ADDRESS'];
  let prev = 0;
  for (const hop of t.hops) {
    if (hop.ttl > prev + 1) out.push('  ...');
    const rtt = hop.rtt && !Number.isNaN(Number(hop.rtt)) ? `${Number(hop.rtt).toFixed(2)} ms` : '';
    const addr = hop.name ? `${hop.name} (${hop.ip})` : hop.ip;
    out.push(`  ${String(hop.ttl).padEnd(3)} ${rtt.padEnd(9)} ${addr}`);
    prev = hop.ttl;
  }
  return out;
}

// scan('external', 'example.com') — port + service scan of a public host.
// DEFAULT = the same as Zenmap's "Intense scan":  nmap -T4 -A  (top 1000 ports, versions, default scripts,
//           OS detection, traceroute).  That is why it now finds the same ports as Zenmap.
// { stealth: true }   = the old quiet mode: only 16 chosen ports at -T2 (so it sees far fewer ports).
// { aggressive: false } = normal mode (-T3, top 200 ports).
// OS detection + traceroute need raw sockets (Administrator + Npcap on Windows). Without them we fall back
// to a plain connect scan and say so in the output.
const COMMON_PORTS = '21,22,23,25,53,80,110,143,443,445,993,995,3306,3389,8080,8443';
function scanExternal(target, { stealth = false, aggressive = true, mask = true } = {}) {
  const host = checkExternalTarget(target);
  if (!host) return Promise.resolve({ ok: false, error: 'target', text: null });

  return job('nmap-external', async () => {
    const intense = aggressive && !stealth;
    const timing = stealth ? '-T2' : (aggressive ? '-T4' : '-T3');

    const portArg = stealth
      ? ['-p', COMMON_PORTS]
      : ['--top-ports', aggressive ? '1000' : '200'];

    const EXTERNAL_SCRIPTS = [
      'banner',
      'http-title',
      'http-server-header',
      'ssl-cert',
      'ssl-enum-ciphers',
      'ftp-anon',
      'ssh-auth-methods',
      'http-methods',
      'http-robots.txt',
    ].join(',');

    const scriptArg = `--script=${intense ? 'default,' : ''}${EXTERNAL_SCRIPTS}`;
    const common = ['-Pn', timing, ...portArg, '--open', scriptArg];

    let nmapHost;
    let osLimited = false;
    let usedArgs = [];
    const first = async (args, ms) => { usedArgs = args; return (await nmap(args, ms))[0]; };
    if (intense) {
      // exactly Zenmap's Intense scan: -A = -sV -sC -O --traceroute (SYN scan when privileged)
      try {
        nmapHost = await first([...common, '-A', host], 600000);
      } catch (err) {
        if (err.killed) throw err;
      }
      if (!nmapHost) {
        // no raw-socket rights: nmap refuses -A/-O. Fall back to a connect scan.
        osLimited = true;
        nmapHost = await first([...common, '-sT', '-sV', '--version-light', host], 600000);
      }
    } else {
      nmapHost = await first([...common, '-sT', '-sV', '--version-light', host], 360000);
    }

    // Cross-check. One pass can miss a port when a packet is dropped or the first reply is slow. So the common ports
    // are probed again, at the SAME IP (a name like www.google.com has many IPs and DNS may hand out another one).
    // Not done in stealth mode, which is meant to stay quiet.
    const recheckAdded = [];
    if (!stealth && nmapHost) {
      const seen = new Set((nmapHost.ports || []).map((p) => `${p.port}/${p.proto}`));
      try {
        const [again] = await nmap(['-Pn', '-sT', '-T4', '--max-retries', '3', '-p', COMMON_PORTS, '--open', '-sV', '--version-light', nmapHost.ip || host], 180000);
        for (const p of again?.ports || []) {
          if (seen.has(`${p.port}/${p.proto}`)) continue;
          nmapHost.ports.push(p);
          recheckAdded.push(`${p.port}/${p.proto}`);
        }
        nmapHost.ports.sort((a, b) => a.port - b.port);
      } catch (err) {
        if (err.killed) throw err; // anything else: keep the first pass as it is
      }
    }

    const ports = (nmapHost?.ports || []).map((p) => ({ ...p, risky: RISKY.has(p.port) }));
    const riskyPorts = ports.filter((p) => p.risky);

    // สร้าง findings เพื่อนำไปเทียบกับฐานข้อมูล CISA KEV
    const findings = buildFindings({ ip: host, local: false, ports, snap: null });

    // นำเข้า CISA Known Exploited Vulnerabilities (เทียบเคียงข้อมูลในเครื่องแบบไม่ออกนอกเน็ตเวิร์ก)
    let intel = { used: false };
    try {
      intel = await require('./intel').enrich(findings, require('./config').load());
    } catch {
      /* optional */
    }

    const modeDesc = stealth
      ? 'stealth (-T2), selected ports + scripts'
      : aggressive
        ? 'intense (-T4 -A), top 1000 ports + OS + traceroute'
        : 'normal (-T3), top 200 ports + scripts';

    // "www.google.com  (142.251.156.119)"
    const shown = [
      nmapHost?.ip && nmapHost.ip !== host ? nmapHost.ip : '',
      nmapHost?.name && nmapHost.name !== host ? nmapHost.name : '',
    ].filter(Boolean).join(' · ');

    const lines = [
      stealth ? '[STEALTH MODE ACTIVE]' : (aggressive ? '[AGGRESSIVE MODE]' : 'NMAP EXTERNAL SCAN'),
      `  target  ${host}${shown ? `  (${shown})` : ''}`,
      `  open    ${ports.length}   risky  ${riskyPorts.length}`,
      `  mode    ${modeDesc}`,
      `  cmd     nmap ${usedArgs.join(' ')}`,
      ...(recheckAdded.length ? [`  recheck เจอเพิ่มจากการสแกนซ้ำ: ${recheckAdded.join(', ')}`] : []),
      '',
    ];

    if (!ports.length) {
      lines.push('  No open ports found');
      lines.push('  หมายเหตุ: host อาจขึ้นแต่พอร์ตถูก firewall กรอง (filtered)');
      if (!intense) lines.push('  ลองใช้โหมด aggressive: scan external <target> --aggressive');
    } else {
      lines.push('PORTS');
      for (const p of ports) {
        lines.push(portLine(p, false));
        if (p.scriptErrors) lines.push(`         (สคริปต์ตรวจ ${p.scriptErrors} ตัวทำงานไม่สำเร็จ — ผลส่วนนี้ยังไม่ครบ)`);
        if (p.scriptOut) {
          for (const l of p.scriptOut.split('\n').slice(0, 6)) {
            const t = l.trim();
            if (t) lines.push(`         ${t}`);
          }
        }
      }
    }

    // OS detection / uptime / distance, then traceroute (same layout as Zenmap)
    const osBlock = osInfoLines(nmapHost);
    if (osBlock.length) {
      lines.push('');
      lines.push('OS DETECTION');
      for (const l of osBlock) lines.push(`  ${l}`);
    }
    const shownTrace = mask ? maskTrace(nmapHost?.trace) : nmapHost?.trace;
    const traceBlock = traceLines({ trace: shownTrace });
    if (traceBlock.length) {
      lines.push('');
      lines.push(...traceBlock);
    }
    if (intense && (osLimited || (!osBlock.length && !traceBlock.length))) {
      lines.push('');
      lines.push('  (ตรวจ OS / traceroute ไม่ได้ — ต้องรันแอปในฐานะ Administrator และติดตั้ง Npcap)');
    }

    // Findings จาก NSE
    const configIssues = [];
    for (const p of ports) {
      const s = p.scriptOut || '';
      if (/TLSv1\.0|SSLv/i.test(s)) configIssues.push(`Port ${p.port}: Outdated TLS version (TLS 1.0/SSL) — Upgrade to TLS 1.2+`);
      if (/anon.*allowed|Anonymous.*OK/i.test(s)) configIssues.push(`Port ${p.port} (FTP): Anonymous login allowed`);
      if (/empty password|no password/i.test(s)) configIssues.push(`Port ${p.port}: Service has no password set`);
    }

    if (riskyPorts.length) {
      lines.push('');
      lines.push('RISK ASSESSMENT');
      for (const p of riskyPorts) {
        const known = PORTS[p.port];
        lines.push(`  [!] ${p.port}/${p.proto}  ${portLabel(p)}${known?.[1] ? '  — ' + known[1] : ''}`);
      }
    }

    if (configIssues.length) {
      lines.push('');
      lines.push('CONFIG ISSUES');
      for (const issue of configIssues) lines.push(`  ${issue}`);
    }

    // แสดงผลข้อมูล CISA intel เพิ่มเติมหากมีการแมตช์เจอ
    lines.push(...renderLines(findings));

    const remediations = buildExternalRemediation(ports);
    if (remediations.length) {
      lines.push('');
      lines.push('REMEDIATION GUIDANCE');
      for (const r of remediations) {
        lines.push(`  ${r.port} — ${r.label}`);
        for (const step of r.steps) lines.push(`    • ${step}`);
        if (r.refs.length) lines.push(`    Refs: ${r.refs.join(' | ')}`);
      }
    }

    if (intel.used) {
      lines.push('');
      lines.push('SOURCE', `  CISA Known Exploited Vulnerabilities (ดึงเมื่อ ${String(intel.fetched || '').slice(0, 10)}) — โหลดรายการสาธารณะมาเทียบในเครื่อง ไม่ได้ส่งข้อมูลออกไป`);
    }

    const rawData = {
      net: {
        kind: 'external',
        host,
        ip: nmapHost?.ip || '',
        ports,
        riskyPorts: riskyPorts.map((p) => p.port),
        configIssues,
        remediations,
        stealth,
        aggressive,
        findings,
        analysis: findings.analysis || null,
        intel,
        os: {
          matches: nmapHost?.osmatches || [],
          lines: osBlock,
        },
        uptime: nmapHost?.uptime || null,
        distance: nmapHost?.distance ?? null,
        ipid: nmapHost?.ipid || '',
        trace: shownTrace || null,
      },
    };

    const data = maskDentity(rawData);
    last = { at: Date.now(), net: data.net };

    return { ok: true, view: 'net', data, text: lines.join('\n') };
  });
}

// Educational remediation catalogue for external hosts
const EXTERNAL_REMEDIATION = {
  21: {
    label: 'FTP — ปิดหรือเปลี่ยนเป็น SFTP/FTPS',
    steps: [
      'ถ้าไม่ได้ใช้ FTP ให้หยุดและ disable service: `systemctl disable --now vsftpd` (Linux) หรือปิดใน IIS (Windows)',
      'ถ้าต้องการโอนไฟล์ ให้ใช้ SFTP (OpenSSH) หรือ FTPS (explicit TLS) แทน',
      'ปิด anonymous login: `anonymous_enable=NO` ใน vsftpd.conf',
      'จำกัด IP ที่เข้าได้ด้วย firewall rule (`ufw deny 21` หรือ iptables)',
    ],
    refs: ['https://www.cisa.gov/known-exploited-vulnerabilities-catalog'],
  },
  23: {
    label: 'Telnet — ปิดทันที ใช้ SSH แทน',
    steps: [
      'หยุด Telnet service: `systemctl disable --now telnet.socket` หรือ `inetd` entry',
      'ติดตั้ง OpenSSH และใช้ SSH แทน: `apt install openssh-server`',
      'บล็อก port 23 ที่ firewall: `ufw deny 23`',
    ],
    refs: ['https://www.cisa.gov/known-exploited-vulnerabilities-catalog'],
  },
  22: {
    label: 'SSH — ตรวจสอบการตั้งค่าให้ปลอดภัย',
    steps: [
      'ปิด root login: `PermitRootLogin no` ใน /etc/ssh/sshd_config',
      'ใช้ key-based authentication แทน password: `PasswordAuthentication no`',
      'เปลี่ยน port จาก 22 เป็น port อื่น (security through obscurity แต่ลด noise)',
      'เปิด fail2ban เพื่อบล็อก brute-force: `apt install fail2ban`',
    ],
    refs: ['https://www.cisa.gov/known-exploited-vulnerabilities-catalog'],
  },
  80: {
    label: 'HTTP — ควรใช้ HTTPS แทน หรือ redirect',
    steps: [
      'ติดตั้ง TLS certificate (ฟรี): `certbot --nginx` หรือ `certbot --apache`',
      'ตั้ง HTTP→HTTPS redirect ใน Nginx: `return 301 https://$host$request_uri;`',
      'เพิ่ม HSTS header: `add_header Strict-Transport-Security "max-age=31536000";`',
    ],
    refs: ['https://letsencrypt.org/', 'https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html'],
  },
  443: {
    label: 'HTTPS — ตรวจสอบ certificate และ cipher suite',
    steps: [
      'ทดสอบด้วย SSL Labs: https://www.ssllabs.com/ssltest/',
      'ปิด TLS 1.0/1.1 และ SSLv3 ใน config',
      'ใช้ strong cipher suites เท่านั้น (AES-GCM, ChaCha20)',
      'ตรวจสอบ certificate expiry และ chain',
    ],
    refs: ['https://ssl-config.mozilla.org/', 'https://www.ssllabs.com/ssltest/'],
  },
  3306: {
    label: 'MySQL — ไม่ควรเปิดให้ external เข้าถึงได้',
    steps: [
      'Bind to localhost เท่านั้น: `bind-address = 127.0.0.1` ใน my.cnf',
      'บล็อก port 3306 ที่ firewall ยกเว้น trusted IP: `ufw allow from <trusted_ip> to any port 3306`',
      'ลบ user ที่ไม่จำเป็น: `DROP USER \'\'@\'%\';`',
      'รัน `mysql_secure_installation` เพื่อ hardening เบื้องต้น',
    ],
    refs: ['https://dev.mysql.com/doc/refman/8.0/en/security-guidelines.html'],
  },
  5432: {
    label: 'PostgreSQL — จำกัด network access',
    steps: [
      'แก้ postgresql.conf: `listen_addresses = \'localhost\'` หรือ trusted IP เท่านั้น',
      'แก้ pg_hba.conf: ใช้ `md5` หรือ `scram-sha-256` แทน `trust`',
      'บล็อก port 5432 ที่ firewall',
    ],
    refs: ['https://www.postgresql.org/docs/current/auth-pg-hba-conf.html'],
  },
  3389: {
    label: 'RDP — จำกัดการเข้าถึงหรือปิดถ้าไม่ได้ใช้',
    steps: [
      'จำกัด IP ที่เข้าได้ด้วย firewall rule',
      'เปิด Network Level Authentication (NLA)',
      'ใช้ VPN ก่อนเข้า RDP แทนการเปิด port ตรงๆ',
      'เปลี่ยน port จาก 3389 เป็น non-standard',
      'ถ้าไม่ได้ใช้ ปิด: Control Panel → System → Remote settings → disable',
    ],
    refs: ['https://www.cisa.gov/news-events/alerts/2019/05/30/critical-remote-desktop-services-vulnerability'],
  },
  5900: {
    label: 'VNC — ปิดหรือ tunnel ผ่าน SSH',
    steps: [
      'ถ้าต้องการใช้ VNC ให้ tunnel ผ่าน SSH เท่านั้น: `ssh -L 5900:localhost:5900 user@host`',
      'บล็อก port 5900 ที่ firewall ยกเว้น loopback',
      'ตั้ง password ที่แข็งแรง (VNC password ปกติสั้นแค่ 8 ตัว — เป็นข้อจำกัดของ protocol)',
    ],
    refs: ['https://www.cisa.gov/known-exploited-vulnerabilities-catalog'],
  },
  6379: {
    label: 'Redis — ไม่ควรเปิดให้ external เข้าถึงได้เด็ดขาด',
    steps: [
      'Bind to localhost: `bind 127.0.0.1` ใน redis.conf',
      'ตั้ง password: `requirepass <strong_password>`',
      'เปิด protected-mode: `protected-mode yes`',
      'บล็อก port 6379 ที่ firewall',
    ],
    refs: ['https://redis.io/docs/manual/security/'],
  },
  27017: {
    label: 'MongoDB — จำกัด network access ด่วน',
    steps: [
      'Bind to localhost: `net: { bindIp: "127.0.0.1" }` ใน mongod.conf',
      'เปิด authentication: `security: { authorization: "enabled" }`',
      'บล็อก port 27017 ที่ firewall',
      'ตรวจสอบว่าไม่มี database ที่ไม่ได้ตั้ง password',
    ],
    refs: ['https://www.mongodb.com/docs/manual/administration/security-checklist/'],
  },
  1433: {
    label: 'MSSQL — จำกัด network access',
    steps: [
      'บล็อก port 1433 ที่ firewall ยกเว้น trusted IP',
      'ปิด SA account หรือเปลี่ยน password ให้แข็งแรง',
      'ใช้ Windows Authentication แทน SQL Authentication ถ้าเป็นไปได้',
      'เปิด SQL Server Audit เพื่อ log การเข้าถึง',
    ],
    refs: ['https://learn.microsoft.com/en-us/sql/relational-databases/security/securing-sql-server'],
  },
  9200: {
    label: 'Elasticsearch — ไม่ควรเปิดให้ external โดยไม่มี auth',
    steps: [
      'เปิด X-Pack Security (Elasticsearch 8.x เปิดเป็น default แล้ว)',
      'ตั้ง `xpack.security.enabled: true` ใน elasticsearch.yml',
      'Bind to localhost: `network.host: 127.0.0.1`',
      'บล็อก port 9200 และ 9300 ที่ firewall',
    ],
    refs: ['https://www.elastic.co/guide/en/elasticsearch/reference/current/secure-cluster.html'],
  },
  8083: {
    label: 'Hestia Control Panel — จำกัดการเข้าถึงด้วย IP หรือ VPN',
    steps: [
      'ห้ามเปิดพอร์ต 8083 ให้ทุกคนเข้าได้ ใช้ firewall จำกัดเฉพาะ IP ของผู้ดูแลระบบ',
      'ถ้า Hestia รองรับ: ตั้ง allowed IPs ใน Admin panel ของ Hestia',
      'ใช้ VPN ก่อนเข้าแผงควบคุม แทนการเปิดพอร์ตตรงๆ สู่อินเทอร์เน็ต',
      'ตรวจสอบว่า Hestia ใช้ HTTPS (ไม่ใช่ HTTP ธรรมดา) และใบรับรองยังใช้ได้อยู่',
    ],
    refs: ['https://www.cisa.gov/known-exploited-vulnerabilities-catalog'],
  },
  10000: {
    label: 'Webmin — จำกัดการเข้าถึงด้วย IP หรือ VPN',
    steps: [
      'ตั้ง "Allowed From" ใน Webmin → Webmin Configuration → IP Access Control ให้เป็น IP ของผู้ดูแลระบบเท่านั้น',
      'ใช้ VPN ก่อนเข้า Webmin แทนการเปิดพอร์ตตรงๆ สู่อินเทอร์เน็ต',
      'เปิด two-factor authentication ใน Webmin',
      'อัปเดต Webmin ให้เป็นเวอร์ชันล่าสุดเสมอ (มีประวัติช่องโหว่ร้ายแรงหลายครั้ง)',
    ],
    refs: ['https://www.cisa.gov/known-exploited-vulnerabilities-catalog'],
  },
  5060: {
    label: 'SIP — ปิดถ้าไม่ได้ใช้ VoIP หรือจำกัด IP',
    steps: [
      'ถ้าไม่ได้ใช้ VoIP ให้ปิด SIP service ที่เซิร์ฟเวอร์',
      'ถ้าต้องใช้ ให้จำกัด IP ที่เข้าได้ด้วย firewall rule',
      'ตั้ง fail2ban หรือ rate limiting เพื่อป้องกัน VoIP scanner',
    ],
    refs: ['https://www.cisa.gov/known-exploited-vulnerabilities-catalog'],
  },
  135: {
    label: 'RPC/DCOM — ไม่ควรเปิดให้ external เห็น',
    steps: [
      'บล็อก port 135 ที่ firewall ขาเข้าจาก external',
      'ใช้ Windows Firewall rule: Block inbound port 135',
    ],
    refs: ['https://www.cisa.gov/known-exploited-vulnerabilities-catalog'],
  },
  445: {
    label: 'SMB — บล็อกจาก external ทันที',
    steps: [
      'บล็อก port 445 ที่ firewall จาก external ทันที (เป้าหมายของ ransomware)',
      'เปิด SMB signing บังคับ: Group Policy → Microsoft network server → Digitally sign communications (always)',
      'ถ้าไม่ได้ใช้ file sharing ข้ามเครื่อง ให้ disable SMBv1: `Set-SmbServerConfiguration -EnableSMB1Protocol $false`',
    ],
    refs: ['https://www.cisa.gov/news-events/alerts/2017/05/12/indicators-associated-wannacry-ransomware', 'https://nvd.nist.gov/vuln/detail/CVE-2017-0144'],
  },
};

function buildExternalRemediation(ports) {
  const out = [];
  for (const p of ports) {
    const r = EXTERNAL_REMEDIATION[p.port];
    if (!r) continue;
    // a search page (…?query=ftp, cvekey.cgi) is not a source: only pages that point at one document
    out.push({ port: p.port, service: portLabel(p), label: r.label, steps: r.steps, refs: r.refs.filter((u) => !u.includes('?') && !/cvekey/.test(u)) });
  }
  return out;
}

function scan(kind = 'self', target = '', extra = '') {
  if (!tools().nmap) return Promise.resolve({ ok: false, error: 'nonmap', text: null });
  if (kind === 'lan') return scanLan();
  if (kind === 'host') return scanHost(target);
  if (kind === 'gateway') return scanGateway();
  if (kind === 'os') return scanOs(target);
  if (kind === 'vuln') return scanVuln(target);
  if (kind === 'ports') return scanPorts(target, extra);
  if (kind === 'external') return scanExternal(target, extra && typeof extra === 'object' ? extra : undefined);
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

// ---------- mini proxy (module: ./proxy.js) ----------

// proxyControl('start', { type: 'socks5' | 'http', port, username, password, blocklist })
// proxyControl('stop') · proxyControl('status')      same result shape as scan(): { ok, text, data, view: 'net' }
// It is separate from the scans: it does not use the scan lock and the scans do not go through it.
async function proxyControl(action = 'status', opts = {}) {
  const proxy = require('./proxy');
  let r;
  if (action === 'start') r = await proxy.start(opts);
  else if (action === 'stop') r = await proxy.stop();
  else r = { ok: true, ...proxy.status() };
  if (r.ok === false) return { ok: false, error: r.error, text: null };
  const lines = ['PROXY'];
  if (!r.running) {
    lines.push('  ปิดอยู่');
  } else {
    lines.push(`  type    ${r.type}   ${r.url}${r.auth ? '   (ต้องใช้ username/password)' : ''}`);
    lines.push(`  time    ${r.seconds}s   connections ${r.active} active / ${r.total} total`);
    lines.push(`  data    ↑ ${fmtBytes(r.out)}   ↓ ${fmtBytes(r.in)}`);
    lines.push(`  blocked ${r.blocked}${r.blocklist.length ? `  (${r.blocklist.join(', ')})` : ''}   denied ${r.denied}`);
    if (r.last) lines.push(`  last    ${r.last}`);
    lines.push('NOTE  เป็น proxy ในเครื่อง เว็บปลายทางยังเห็น IP ของเครื่องนี้ ไม่ใช่ VPN');
  }
  return { ok: true, view: 'net', data: { net: { kind: 'proxy', ...r } }, text: lines.join('\n') };
}

module.exports = { tools, scan, capture, measureBandwidth, cancel, lastScan, checkTarget, checkExternalTarget, lanInterfaces, defaultGateway, proxyControl, MIN_CAPTURE, MAX_CAPTURE };