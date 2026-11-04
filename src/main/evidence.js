'use strict';

// evidence.js — what her LOCAL model reads from a scan, and a check on what it writes back.
//
// Rules this file follows (CAPRI_AI_DATA_FLOW_REPORT.txt):
//   - only main.js calls it, and only AFTER privacy.canShare() said ok (the gate is not repeated here, never skip it);
//   - nothing here makes a network request: references come from the scan data (intel.js / findings.js / netscan.js);
//   - the model gets facts plus NUMBERED references (R1, R2…) and may cite only those;
//   - whatever it writes that is not in the pack (a URL, a CVE id, an unknown [R#]) is removed before the person sees it.

// hosts a reference may point to. https only, no credentials, no query / fragment (so search pages are refused:
// "nvd.nist.gov/vuln/search?query=ftp" is a search, not a source).
const TRUSTED_HOSTS = new Set([
  'nvd.nist.gov', 'www.cisa.gov', 'www.first.org', 'attack.mitre.org',
  'learn.microsoft.com', 'cheatsheetseries.owasp.org', 'ssl-config.mozilla.org', 'letsencrypt.org',
  'redis.io', 'www.postgresql.org', 'dev.mysql.com', 'www.mongodb.com', 'www.elastic.co',
  'www.ssllabs.com',  // SSL/TLS configuration testing — referenced in EXTERNAL_REMEDIATION port 443
]);

function isTrustedRef(raw) {
  try {
    const u = new URL(String(raw));
    return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash
      && TRUSTED_HOSTS.has(u.hostname) && u.pathname.length > 1;
  } catch {
    return false;
  }
}

const SEV = { high: 0, medium: 1, low: 2 };
const MAX_FINDINGS = 8;

/**
 * net = scan.data.net of a 'vuln' or 'external' scan (netscan.js).
 * @returns {{ text: string, refs: {id,title,url,source}[], cves: Set<string> }}
 */
function buildPack(net) {
  const refs = [];
  const idOf = new Map();
  const cves = new Set();
  const add = (r) => {
    const ref = typeof r === 'string' ? { url: r } : r;
    if (!ref || !isTrustedRef(ref.url)) return null;
    if (!idOf.has(ref.url)) {
      const id = `R${refs.length + 1}`;
      const host = new URL(ref.url).hostname;
      idOf.set(ref.url, id);
      refs.push({ id, title: String(ref.title || host).slice(0, 120), url: ref.url, source: String(ref.source || host) });
    }
    return idOf.get(ref.url);
  };

  const remByPort = new Map((net.remediations || []).map((r) => [r.port, r]));
  const real = (net.findings || [])
    .filter((f) => f.severity !== 'info')
    .sort((a, b) => (SEV[a.severity] ?? 3) - (SEV[b.severity] ?? 3))
    .slice(0, MAX_FINDINGS);

  const failed = (net.ports || []).reduce((n, p) => n + (p.scriptErrors || 0), 0);
  const lines = [
    `SCAN kind=${net.kind} target=${net.local ? 'this-pc' : 'other-host'} ports-open=${(net.ports || []).length} findings=${real.length} script-checks-failed=${failed}`,
  ];
  real.forEach((f, i) => {
    const rem = remByPort.get(f.port);
    const ids = [
      ...(f.refs || []),
      ...((rem?.refs || []).map((url) => ({ url, title: rem.label }))),
    ].map(add).filter(Boolean);
    for (const c of f.intel?.latest || []) cves.add(c);
    lines.push(
      `[F${i + 1}] severity=${f.severity} exposure=${f.exposure || 'unknown'} ${f.port ? `port=${f.port}/${f.proto || 'tcp'} ` : ''}${f.product ? `nmap-product="${String(f.product).slice(0, 60)}" ` : ''}${f.title}`,
      `  what: ${f.what || ''}`,
      `  why: ${f.why || ''}`,
      ...(f.usedBy?.text ? [`  used-by: ${f.usedBy.text}`] : []),
      ...(f.intel ? [`  intel(${f.intel.source}, fetched ${f.intel.fetched}): ${f.intel.text}`] : []),
      `  refs: ${ids.length ? [...new Set(ids)].join(',') : 'none'}`,
    );
  });
  if (refs.length) {
    lines.push('REFERENCES (cite only these, as [R#])');
    for (const r of refs) lines.push(`  [${r.id}] ${r.title} — ${r.source}`);
  }
  return { text: lines.join('\n'), refs, cves };
}

// appended to her persona (system message) when the pack is used
const RULES = [
  'กติกาการวิเคราะห์ผลสแกน (ห้ามฝ่าฝืน):',
  '1) ใช้ข้อมูลใน SCAN ด้านล่างเท่านั้น ห้ามเดาพอร์ต โปรแกรม หรือช่องโหว่ที่ไม่มีในข้อมูล',
  '2) ถ้าจะอ้างแหล่งที่มา ให้ใส่เป็น [R1], [R2] ตามรายการ REFERENCES เท่านั้น ห้ามพิมพ์ URL เอง ห้ามสร้างเลข CVE เอง',
  '3) ข้อความ intel เป็นข้อมูลทั่วไปของบริการประเภทนั้น ไม่ได้แปลว่าเครื่องนี้มีช่องโหว่เหล่านั้น ต้องพูดให้ตรงตามนี้',
  '4) ถ้าข้อสรุปข้อไหนไม่มี [R#] รองรับ ให้บอกว่า "ยังไม่มีแหล่งอ้างอิงยืนยัน"',
  '5) ถ้า script-checks-failed มากกว่า 0 แปลว่าการตรวจบางส่วนไม่ได้ทำงาน ห้ามสรุปว่าปลอดภัย ให้บอกว่าผลยังไม่ครบ',
  '6) ตอบ 2-3 ประโยคสั้น ๆ ข้อความธรรมดา ภาษาเดียวกับผู้ใช้ พูดเรื่องที่รุนแรงที่สุดก่อน บอกสิ่งที่ควรเช็กเป็นภาษาคน ห้ามเขียนคำสั่งที่แก้ระบบให้รัน',
].join('\n');

/** what the model wrote → what the person sees. Removes links / CVE ids / [R#] that are not in the pack. */
function verify(answer, pack) {
  const urls = new Set(pack.refs.map((r) => r.url));
  const byId = new Map(pack.refs.map((r) => [r.id, r]));
  const removed = [];
  const cited = new Set();
  let text = String(answer || '');

  text = text.replace(/https?:\/\/[^\s)\]>"'<]+/gi, (u) => {
    const clean = u.replace(/[.,;:!?]+$/, '');
    if (urls.has(clean)) return u;
    removed.push(clean);
    return '[ลิงก์ที่ไม่อยู่ในแหล่งอ้างอิงถูกลบ]';
  });
  text = text.replace(/CVE-\d{4}-\d{4,7}/gi, (c) => {
    if (pack.cves.has(c.toUpperCase())) return c.toUpperCase();
    removed.push(c);
    return '[CVE ไม่อยู่ในข้อมูล]';
  });
  text = text.replace(/\[(R\d+)\]/g, (m, id) => {
    if (byId.has(id)) { cited.add(id); return m; }
    removed.push(id);
    return '';
  });

  // sources come back as DATA, not appended to the text: chat.js drops an answer longer than 600 characters
  const sources = [...cited].map((id) => ({ id, title: byId.get(id).title, url: byId.get(id).url }));
  return { text: text.replace(/[ \t]{2,}/g, ' ').trim(), removed, sources };
}

module.exports = { buildPack, verify, isTrustedRef, RULES, TRUSTED_HOSTS };