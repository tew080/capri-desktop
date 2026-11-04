'use strict';

// intel.js — outside knowledge for her reasons, WITHOUT letting anything about this PC leave.
//
// How: she DOWNLOADS a public catalog and matches it LOCALLY. Nothing from the scan is put in any request:
//   - the only request is a fixed GET of CISA's public "Known Exploited Vulnerabilities" feed (no query string);
//   - every URL goes through guardUrl(): https only, host + path on an allowlist, no query, no credentials, no redirects;
//   - her model never writes a query. If a query is ever added, assertPublicText() refuses IPs, MACs, this PC's
//     name and user name, local paths and anything outside a short [a-z0-9 .+-] vocabulary.
// Off with config.intelOnline = false. Every fetch is written to the security log (what URL, when, how many items).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');

const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const ALLOW = [{ host: 'www.cisa.gov', prefix: '/sites/default/files/feeds/' }];
const TTL = 24 * 3600 * 1000;
const CACHE_V = 2;
const MAX_BYTES = 8 * 1024 * 1024;

// service key (findings.js CATALOG) → words in the public CVE title / description
const PATTERNS = {
  smb: /\bSMB\b|server message block/i, rdp: /remote desktop|\bRDP\b/i, telnet: /telnet/i, ftp: /\bFTP\b/i, vnc: /\bVNC\b/i,
  redis: /redis/i, mongodb: /mongo/i, elasticsearch: /elasticsearch/i, mysql: /mysql/i, postgres: /postgres/i,
  mssql: /sql server/i, rpc: /\bRPC\b|remote procedure call/i, netbios: /netbios/i,
};

function guardUrl(raw) {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw new Error('intel: url refused');
  if (!ALLOW.some((a) => u.hostname === a.host && u.pathname.startsWith(a.prefix))) throw new Error('intel: host not allowed');
  return u.href;
}

// for any text that could ever go into a request
function assertPublicText(text) {
  const s = String(text || '');
  const secret = [os.hostname(), os.userInfo().username].filter((x) => x && x.length >= 2);
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!/^[a-z0-9 .+-]{1,60}$/i.test(s)
    || /\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(s)
    || /[0-9a-f]{2}([:-])[0-9a-f]{2}(?:\1[0-9a-f]{2}){4}/i.test(s)
    || secret.some((x) => new RegExp(`(^|[^a-z0-9])${esc(x)}([^a-z0-9]|$)`, 'i').test(s))) throw new Error('intel: text refused');
  return s;
}

const dir = () => path.join(app.getPath('userData'), 'intel');
const cacheFile = () => path.join(dir(), 'kev.json');

function readCache() {
  try { return JSON.parse(fs.readFileSync(cacheFile(), 'utf8')); } catch { return null; }
}

async function loadKev() {
  const cached = readCache();
  if (cached && cached.v === CACHE_V && Date.now() - cached.at < TTL) return cached; // an older copy has no vendor / product fields: fetch again
  let record = null;
  try {
    const url = guardUrl(KEV_URL);
    const res = await fetch(url, { method: 'GET', redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'user-agent': 'Capri-SecurityCheck', accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('too big');
    const j = JSON.parse(buf.toString('utf8'));
    const items = (j.vulnerabilities || []).filter((v) => /^CVE-\d{4}-\d{4,7}$/.test(v.cveID)).map((v) => ({
      cve: v.cveID, name: String(v.vulnerabilityName || '').slice(0, 160), text: `${v.product || ''} ${v.shortDescription || ''}`.slice(0, 400), added: String(v.dateAdded || ''),
      vendor: String(v.vendorProject || '').slice(0, 60), product: String(v.product || '').slice(0, 80), ransomware: v.knownRansomwareCampaignUse === 'Known',
    }));
    record = { v: CACHE_V, at: Date.now(), version: j.catalogVersion || '', items };
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(cacheFile(), JSON.stringify(record));
    log({ ok: true, url, items: items.length });
  } catch (err) {
    log({ ok: false, url: KEV_URL, error: String(err.message || err).slice(0, 120) });
    record = cached; // offline: the last copy, however old
  }
  return record;
}

function log(info) {
  try { require('./remediate').logEvent({ type: 'intel-fetch', ...info }); } catch { /* the log is best effort here */ }
}

// the first word of what Nmap read ("vsftpd 2.0.8 or later" → "vsftpd"); '' when it read nothing useful
const GENERIC = new Set(['microsoft', 'apache', 'oracle', 'linux', 'windows', 'cisco', 'google', 'ibm', 'sun']);
const productToken = (p) => /^[a-z][a-z0-9._-]{2,}/i.exec(String(p || '').trim())?.[0].toLowerCase() || '';

// Only what an entry is ABOUT counts (vendor / product / title), never words inside its description: a MOVEit entry
// that mentions "MySQL" in its text is not a MySQL vulnerability.
//   product known  → the entry must be about THAT product (vsftpd is not Wing FTP): scope 'product'
//   product unknown → every entry of that kind of service: scope 'family', and it is said so
function match(items, key, product) {
  const re = PATTERNS[key];
  if (!re) return null;
  const token = productToken(product);
  const about = (v) => `${v.vendor || ''} ${v.product || ''} ${v.name}`;
  let hits;
  if (!token) hits = items.filter((v) => re.test(about(v)));
  else {
    // "vsftpd" does not match /\bFTP\b/ but IS the product: the name decides. A vendor word that covers hundreds of unrelated
    // entries (microsoft, apache, oracle…) must also fit the kind of service.
    hits = items.filter((v) => new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(about(v)));
    if (GENERIC.has(token)) hits = hits.filter((v) => re.test(about(v)));
  }
  hits.sort((a, b) => b.added.localeCompare(a.added));
  return hits.length
    ? { total: hits.length, ransomware: hits.filter((v) => v.ransomware).length, latest: hits.slice(0, 3), scope: token ? 'product' : 'family', token }
    : null;
}

/** adds f.intel and f.refs to findings that have an intelKey. Never throws; never sends anything about the findings. */
async function enrich(findings, cfg) {
  if (cfg?.intelOnline === false) return { used: false };
  const kev = await loadKev();
  if (!kev?.items?.length) return { used: false };
  for (const f of findings) {
    const m = f.intelKey ? match(kev.items, f.intelKey, f.product) : null;
    if (!m) continue;
    f.intel = {
      source: 'CISA KEV', total: m.total, ransomware: m.ransomware, latest: m.latest.map((x) => x.cve), fetched: new Date(kev.at).toISOString().slice(0, 10),
      text: m.scope === 'product'
        ? `CISA (หน่วยงานความมั่นคงไซเบอร์สหรัฐฯ) มีรายการช่องโหว่ของ ${m.token} ที่ถูกโจมตีจริง ${m.total} รายการ ล่าสุด ${m.latest[0].cve}${m.ransomware ? ` (ในนี้ ${m.ransomware} รายการมีรายงานว่าใช้ในแคมเปญแรนซัมแวร์)` : ''} — จับคู่จากชื่อโปรแกรมที่ Nmap อ่านได้ ยังไม่ได้ยืนยันเวอร์ชัน จึงไม่ได้แปลว่าเครื่องนี้มีช่องโหว่เหล่านั้น`
        : `CISA (หน่วยงานความมั่นคงไซเบอร์สหรัฐฯ) มีรายการช่องโหว่ของบริการประเภท ${f.what} ที่ถูกโจมตีจริง ${m.total} รายการ ล่าสุด ${m.latest[0].cve}${m.ransomware ? ` (ในนี้ ${m.ransomware} รายการมีรายงานว่าใช้ในแคมเปญแรนซัมแวร์)` : ''} — เป็นข้อมูลทั่วไปของบริการประเภทนี้ ไม่ทราบว่าเครื่องนี้ใช้โปรแกรมของยี่ห้อไหน รายการอาจเป็นของคนละยี่ห้อ และไม่ได้แปลว่าเครื่องนี้มีช่องโหว่เหล่านั้น`,
    };
    f.refs = m.latest.map((x) => ({ title: `${x.cve} — ${x.name}`.slice(0, 90), url: `https://nvd.nist.gov/vuln/detail/${x.cve}`, source: 'NVD / CISA KEV' }));
  }
  return { used: true, fetched: new Date(kev.at).toISOString() };
}

module.exports = { enrich, guardUrl, assertPublicText, KEV_URL };