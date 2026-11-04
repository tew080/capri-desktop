'use strict';

// correlate.js — joins individual findings into a risk picture (score + correlations + surface).
// Pure local logic: no network, no model. Used by findings.js after buildFindings().

const RANK = { high: 0, medium: 1, low: 2, info: 3 };
const WEIGHT = { high: 25, medium: 12, low: 4, info: 0 };

const DB_PORTS = new Set([1433, 3306, 5432, 6379, 9200, 27017]);
const MAIL_PORTS = new Set([25, 110, 143, 465, 587, 993, 995]);
// Only treat these as panel when product/banner actually says so — bare 8443 on CDN is not a panel
const PANEL_PORTS = new Set([8083, 10000, 2082, 2083, 2086, 2087]);
const REMOTE_PORTS = new Set([22, 23, 3389, 5900]);

function isReal(f) {
  return f && f.severity !== 'info';
}

function portOf(f) {
  return Number(f?.port) || 0;
}

function blobOf(ports) {
  return (ports || []).map((p) => `${p.product || ''} ${p.service || ''} ${p.scriptOut || ''}`).join('\n');
}

function isCdn(ports) {
  const b = blobOf(ports);
  return /cloudflare|cloudfront|akamai|fastly|incapsula|sucuri|stackpath|keycdn|cdn77/i.test(b);
}

/**
 * @param {object[]} findings
 * @param {object[]} ports
 * @param {{ local?: boolean }} ctx
 */
function correlate(findings, ports = [], ctx = {}) {
  const list = Array.isArray(findings) ? findings : [];
  const real = list.filter(isReal);
  const byId = new Map(list.map((f) => [f.id, f]));
  const openPorts = new Set((ports || []).map((p) => p.port));
  const correlations = [];
  const surface = new Set();
  const priorities = [];
  const cdn = isCdn(ports);

  if (cdn) surface.add('cdn');

  for (const p of openPorts) {
    if (DB_PORTS.has(p)) surface.add('database');
    if (MAIL_PORTS.has(p)) surface.add('mail');
    if (PANEL_PORTS.has(p)) surface.add('control-panel');
    if (p === 80 || p === 443 || p === 8080) surface.add('web');
    if (REMOTE_PORTS.has(p)) surface.add('remote-access');
    if (p === 21) surface.add('file-transfer');
    if (p === 22) surface.add('remote-access');
  }
  for (const f of list) {
    if (/Hestia|Webmin|cPanel|Plesk/i.test(`${f.title || ''} ${f.what || ''} ${(f.doing || []).join(' ')}`)) {
      surface.add('control-panel');
    }
    if (/WordPress|wp-admin/i.test(`${f.title || ''} ${(f.doing || []).join(' ')}`)) {
      surface.add('web-cms');
    }
  }

  // --- expired certs (skip noisy CDN edge messaging as "origin stack failure") ---
  const cert = byId.get('cert-expired');
  if (cert && !cdn) {
    const portsOnCert = (cert.doing || []).join(' ').match(/\b\d{2,5}\b/g)?.map(Number) || [];
    const mailHit = portsOnCert.filter((p) => MAIL_PORTS.has(p));
    const authHit = portsOnCert.filter((p) => p === 21 || MAIL_PORTS.has(p) || p === 443);
    if (mailHit.length >= 2 || authHit.length >= 3) {
      correlations.push({
        id: 'corr-cert-lifecycle',
        severity: 'medium',
        title: 'ใบรับรอง TLS หมดอายุเป็นชุด (เมล/บริการรับรหัสผ่าน)',
        why: `ใบรับรองชุดเดียวกันหมดอายุบนหลายพอร์ต (${authHit.join(', ') || portsOnCert.join(', ')}) แสดงว่ากระบวนการต่ออายุใบรับรองล้มเหลวทั้ง stack ไม่ใช่พอร์ตเดียวพลาด`,
        ports: authHit.length ? authHit : portsOnCert,
      });
      priorities.push('ต่ออายุใบรับรอง TLS ของเมล/FTP ให้ครบชุด และตั้ง auto-renew');
    }
  }

  // --- DB exposed ---
  const dbFindings = real.filter((f) => DB_PORTS.has(portOf(f)) && f.exposure !== 'local');
  const mysqlBlocked = real.find((f) => f.id?.startsWith('mysql-blocked')
    || /blocked because of many connection errors/i.test(`${f.title} ${f.why} ${(f.doing || []).join(' ')}`));
  if (dbFindings.length || mysqlBlocked) {
    const portsDb = [...new Set(dbFindings.map(portOf).filter(Boolean))];
    correlations.push({
      id: 'corr-db-exposed',
      severity: 'high',
      title: mysqlBlocked
        ? 'ฐานข้อมูลเปิดสู่ภายนอก และมีสัญญาณถูกรบกวนจากเน็ต'
        : 'ฐานข้อมูลเปิดให้เครื่องอื่นในเครือข่าย/ภายนอกเข้าถึงได้',
      why: mysqlBlocked
        ? 'พอร์ตฐานข้อมูลตอบจากภายนอกได้ และมีข้อความว่า host ถูก block เพราะ connection errors ซ้ำ — แปลว่ามีคน/สคริปต์ยิงเข้ามาจริง ไม่ใช่แค่พอร์ตเปิดเฉย ๆ'
        : `พอร์ต ${portsDb.join(', ')} ไม่ควรถูกเปิดให้เน็ตกว้าง โดยเฉพาะ production`,
      ports: portsDb,
    });
    priorities.push(mysqlBlocked
      ? 'ปิดพอร์ตฐานข้อมูลจากภายนอกทันที (bind localhost / firewall) แล้วตรวจ access log'
      : 'จำกัดพอร์ตฐานข้อมูลให้เหลือ localhost หรือ IP ที่ไว้ใจเท่านั้น');
  }

  // --- control panel: require real product evidence, not just 8443 ---
  const panelEvidence = real.find((f) => /Hestia|Webmin|cPanel|Plesk/i.test(`${f.title} ${f.what} ${(f.doing || []).join(' ')}`))
    || list.find((f) => /Hestia Control Panel|Webmin|cPanel|Plesk/i.test((f.doing || []).join(' ')));
  const panelPortsOpen = [...openPorts].filter((p) => PANEL_PORTS.has(p));
  if (panelEvidence || panelPortsOpen.length) {
    const portsPanel = panelPortsOpen.length ? panelPortsOpen : (panelEvidence?.port ? [panelEvidence.port] : []);
    correlations.push({
      id: 'corr-panel',
      severity: panelPortsOpen.length ? 'medium' : 'low',
      title: panelPortsOpen.length
        ? 'พบร่องรอยแผงควบคุมเซิร์ฟเวอร์ที่เปิดพอร์ตอยู่'
        : 'พบร่องรอยแผงควบคุมจากใบรับรอง/แบนเนอร์',
      why: panelPortsOpen.length
        ? `พอร์ตแผงควบคุม ${panelPortsOpen.join(', ')} เปิดอยู่ — ถ้าไม่มี IP allowlist / VPN จะกลายเป็นเป้าหมาย brute-force`
        : 'ใบรับรองหรือแบนเนอร์ระบุแผงควบคุม ควรจำกัดการเข้าถึงด้วย IP หรือ VPN',
      ports: portsPanel,
    });
    if (panelPortsOpen.length) {
      priorities.push('จำกัดพอร์ตแผงควบคุม (Hestia/Webmin ฯลฯ) เฉพาะ IP ผู้ดูแลหรือผ่าน VPN');
    }
  }

  // --- CDN / Cloudflare context ---
  if (cdn) {
    const tlsOld = real.find((f) => f.id?.startsWith('tls-') || /TLS รุ่นเก่า|TLS 1\.0/i.test(f.title || ''));
    correlations.push({
      id: 'corr-cdn',
      severity: 'low',
      title: 'เป้าหมายอยู่หลัง CDN/Cloudflare — ผลสแกนเป็น edge ไม่ใช่ origin โดยตรง',
      why: 'พอร์ต 80/443/8080/8443 และ cipher ที่เห็นมักเป็นของ Cloudflare edge การปิด TLS 1.0 หรือ redirect ต้องตั้งในแดชบอร์ด Cloudflare / origin จริง ไม่ใช่ certbot บน edge IP',
      ports: [...openPorts].filter((p) => [80, 443, 8080, 8443].includes(p)),
    });
    if (tlsOld) {
      priorities.push('ใน Cloudflare Dashboard: SSL/TLS → ปิด TLS 1.0/1.1 (Minimum TLS Version = 1.2)');
    } else {
      priorities.push('ตรวจ SSL/TLS mode ใน Cloudflare และ origin จริง (Full/Strict) แยกจาก edge scan');
    }
  }

  // --- web + CMS ---
  const webClear = real.find((f) => f.kind === 'cleartext' && (portOf(f) === 80 || /http/i.test(f.title || '')));
  const wpHint = (ports || []).some((p) => /wp-admin|WordPress/i.test(p.scriptOut || ''));
  if (wpHint) surface.add('web-cms');
  if (webClear && wpHint) {
    correlations.push({
      id: 'corr-web-cms',
      severity: 'low',
      title: 'เว็บเปิด HTTP และมีร่องรอย CMS (WordPress)',
      why: 'มีทั้งพอร์ต 80 แบบไม่เข้ารหัส และร่องรอยเส้นทาง/แบนเนอร์ของ CMS — ควรบังคับ HTTPS และล็อก /wp-admin/',
      ports: [80, 443].filter((p) => openPorts.has(p)),
    });
    priorities.push('บังคับ HTTPS และจำกัดเส้นทางแผง CMS (/wp-admin/)');
  } else if (webClear && !cdn) {
    priorities.push('ตั้ง HTTP→HTTPS redirect ถ้ายังไม่ได้บังคับ');
  }

  // --- FTP TLS optional ---
  const ftp = real.find((f) => portOf(f) === 21 || /FTP/i.test(f.title || ''));
  if (ftp && /รองรับ TLS|TLS/i.test(`${ftp.why} ${(ftp.doing || []).join(' ')}`)) {
    correlations.push({
      id: 'corr-ftp-tls-optional',
      severity: 'medium',
      title: 'FTP มี TLS แต่ยังไม่ยืนยันว่าบังคับใช้',
      why: 'สแกนเห็น cipher/TLS บนพอร์ต 21 แต่บอกไม่ได้ว่าเซิร์ฟเวอร์ปฏิเสธ plain FTP หรือไม่',
      ports: [21],
    });
    priorities.push('ปิด plain FTP หรือบังคับ FTPS/SFTP อย่างเดียว');
  }

  const mailOpen = [...openPorts].filter((p) => MAIL_PORTS.has(p));
  if (mailOpen.length >= 4) {
    correlations.push({
      id: 'corr-mail-surface',
      severity: 'low',
      title: `บริการเมลเปิดหลายพอร์ต (${mailOpen.length} พอร์ต)`,
      why: 'ผิวโจมตีของเมลกว้าง — ต้องมี auth แข็งแรง ใบรับรองที่ยังไม่หมดอายุ และ anti-abuse',
      ports: mailOpen,
    });
  }

  // --- score (CDN softens TLS/cleartext weight) ---
  let score = 0;
  for (const f of real) {
    let w = WEIGHT[f.severity] || 0;
    if (cdn && (f.id?.startsWith('tls-') || f.kind === 'cleartext')) w = Math.min(w, 4);
    score += w;
  }
  for (const c of correlations) {
    if (c.id === 'corr-cdn') score += 2;
    else score += c.severity === 'high' ? 12 : c.severity === 'medium' ? 6 : 2;
  }
  if (mysqlBlocked) score += 10;
  if (dbFindings.length && !ctx.local) score += 8;
  if (cert && !cdn && (cert.doing || []).join(' ').match(/\b\d{2,5}\b/g)?.length >= 4) score += 5;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const grade = score >= 70 ? 'วิกฤต' : score >= 45 ? 'สูง' : score >= 25 ? 'ปานกลาง' : score >= 10 ? 'ต่ำ' : 'ต่ำมาก';

  const ordered = [...correlations].sort((a, b) => (RANK[a.severity] ?? 3) - (RANK[b.severity] ?? 3));
  const uniqPri = [];
  const actionByCorr = {
    'corr-db-exposed': mysqlBlocked
      ? 'ปิดพอร์ตฐานข้อมูลจากภายนอกทันที (bind localhost / firewall) แล้วตรวจ access log'
      : 'จำกัดพอร์ตฐานข้อมูลให้เหลือ localhost หรือ IP ที่ไว้ใจเท่านั้น',
    'corr-cert-lifecycle': 'ต่ออายุใบรับรอง TLS ของเมล/FTP ให้ครบชุด และตั้ง auto-renew',
    'corr-panel': 'จำกัดพอร์ตแผงควบคุม (Hestia/Webmin ฯลฯ) เฉพาะ IP ผู้ดูแลหรือผ่าน VPN',
    'corr-ftp-tls-optional': 'ปิด plain FTP หรือบังคับ FTPS/SFTP อย่างเดียว',
    'corr-web-cms': 'บังคับ HTTPS และจำกัดเส้นทางแผง CMS (/wp-admin/)',
    'corr-cdn': 'ใน Cloudflare Dashboard: SSL/TLS → Minimum TLS Version = 1.2 และตรวจ origin แยก',
  };
  for (const c of ordered) {
    const tip = actionByCorr[c.id];
    if (tip && !uniqPri.includes(tip)) uniqPri.push(tip);
  }
  for (const p of priorities) if (!uniqPri.includes(p)) uniqPri.push(p);
  for (const f of [...real].sort((a, b) => (RANK[a.severity] ?? 3) - (RANK[b.severity] ?? 3))) {
    if (uniqPri.length >= 5) break;
    if (cdn && f.kind === 'cleartext') continue;
    const tip = f.manual || f.fixes?.[0]?.label;
    if (tip && !uniqPri.includes(tip)) uniqPri.push(tip);
  }

  const surfaceList = [...surface].sort();
  const summaryLines = [
    'SUMMARY',
    `  risk    ${score}/100  (${grade})`,
    `  surface ${surfaceList.length ? surfaceList.join(', ') : '—'}`,
    `  findings ${real.length}  correlations ${ordered.length}`,
  ];
  if (ordered.length) {
    summaryLines.push('CORRELATIONS');
    ordered.forEach((c, i) => {
      summaryLines.push(`  ${i + 1}. [${c.severity}] ${c.title}`);
      summaryLines.push(`     ${c.why}`);
    });
  }
  if (uniqPri.length) {
    summaryLines.push('PRIORITY');
    uniqPri.slice(0, 5).forEach((p, i) => summaryLines.push(`  ${i + 1}. ${p}`));
  }

  return {
    score,
    grade,
    surface: surfaceList,
    correlations: ordered,
    priorities: uniqPri.slice(0, 5),
    summaryLines,
    cdn,
  };
}

module.exports = { correlate, WEIGHT, DB_PORTS, MAIL_PORTS, isCdn };
