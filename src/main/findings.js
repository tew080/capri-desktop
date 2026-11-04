'use strict';

// findings.js — turns what nmap + the OS saw into FINDINGS a person can understand and act on.
// Each finding answers: what is it, what is it doing now, is anything using it, why is it unsafe, what can be done.
// Fixes are NEVER written by a model: they come from this fixed catalog and are run only by remediate.js's whitelist.

const { usage, isAny, isLoop } = require('./listeners');

// port → what it is / why it matters. block: Windows Firewall inbound rule may be offered. key: CISA KEV topic (intel.js)
const CATALOG = {
  21:    { svc: 'FTP', sev: 'high', block: true, key: 'ftp', what: 'บริการโอนไฟล์ (FTP)', why: 'ส่งชื่อผู้ใช้ รหัสผ่าน และไฟล์เป็นข้อความเปล่า คนในวงเครือข่ายเดียวกันดักอ่านได้', warn: 'คนที่ใช้ FTP ต่อเข้ามาที่เครื่องนี้จะต่อไม่ได้' },
  23:    { svc: 'Telnet', sev: 'high', block: true, key: 'telnet', what: 'รีโมตเข้าเครื่องแบบ Telnet', why: 'ไม่เข้ารหัสเลย ทั้งรหัสผ่านและคำสั่ง และเป็นเป้าสุ่มรหัสผ่านที่พบบ่อย', warn: 'ใครที่ต่อ Telnet เข้ามาจะต่อไม่ได้' },
  135:   { svc: 'RPC', sev: 'medium', block: true, key: 'rpc', what: 'RPC Endpoint Mapper ของ Windows', why: 'เป็นประตูที่มัลแวร์ในวงเดียวกันใช้สำรวจ/โจมตีบริการ Windows อื่น ๆ', warn: 'การจัดการเครื่องจากระยะไกลบางแบบ (เช่น เครื่องมือผู้ดูแลระบบ) อาจใช้ไม่ได้' },
  139:   { svc: 'NetBIOS', sev: 'medium', block: true, key: 'netbios', what: 'NetBIOS (แชร์ไฟล์ระบบเก่า)', why: 'โปรโตคอลเก่า เปิดเผยชื่อเครื่อง/ข้อมูลแชร์ ถ้าไม่ได้แชร์ไฟล์ก็ไม่จำเป็น', warn: 'การแชร์ไฟล์/เครื่องพิมพ์ผ่านวง LAN แบบเก่าอาจใช้ไม่ได้' },
  445:   { svc: 'SMB', sev: 'high', block: true, key: 'smb', what: 'แชร์ไฟล์และเครื่องพิมพ์ของ Windows (SMB)', why: 'เป็นเป้าอันดับต้น ๆ ของมัลแวร์/แรนซัมแวร์ที่แพร่ตัวในวง LAN', warn: 'เครื่องอื่นจะเปิดโฟลเดอร์แชร์/เครื่องพิมพ์ของเครื่องนี้ไม่ได้' },
  1433:  { svc: 'MSSQL', sev: 'medium', block: true, key: 'mssql', what: 'ฐานข้อมูล Microsoft SQL Server', why: 'ฐานข้อมูลไม่ควรเปิดให้เครื่องอื่นต่อ ถ้าไม่ได้ตั้งใจใช้ข้ามเครื่อง', warn: 'แอปบนเครื่องอื่นที่ต่อฐานข้อมูลนี้จะต่อไม่ได้' },
  3306:  { svc: 'MySQL', sev: 'medium', block: true, key: 'mysql', what: 'ฐานข้อมูล MySQL/MariaDB', why: 'ฐานข้อมูลไม่ควรเปิดให้เครื่องอื่นต่อ ถ้าไม่ได้ตั้งใจใช้ข้ามเครื่อง', warn: 'แอปบนเครื่องอื่นที่ต่อฐานข้อมูลนี้จะต่อไม่ได้' },
  3389:  { svc: 'RDP', sev: 'high', block: true, key: 'rdp', what: 'รีโมตเดสก์ท็อป (RDP)', why: 'เป็นช่องที่ถูกสุ่มรหัสผ่านและโจมตีมากที่สุดช่องหนึ่ง ถ้าไม่ได้ใช้ควรปิด', warn: 'คุณจะรีโมตเข้าเครื่องนี้จากเครื่องอื่นไม่ได้' },
  5432:  { svc: 'PostgreSQL', sev: 'medium', block: true, key: 'postgres', what: 'ฐานข้อมูล PostgreSQL', why: 'ฐานข้อมูลไม่ควรเปิดให้เครื่องอื่นต่อ ถ้าไม่ได้ตั้งใจใช้ข้ามเครื่อง', warn: 'แอปบนเครื่องอื่นที่ต่อฐานข้อมูลนี้จะต่อไม่ได้' },
  5900:  { svc: 'VNC', sev: 'high', block: true, key: 'vnc', what: 'รีโมตดูและควบคุมหน้าจอ (VNC)', why: 'หลายรุ่นรหัสผ่านอ่อน/ไม่เข้ารหัส และเป็นเป้าสแกนหาเครื่องเปิดโล่ง', warn: 'คุณจะรีโมตหน้าจอเครื่องนี้ผ่าน VNC ไม่ได้' },
  6379:  { svc: 'Redis', sev: 'high', block: true, key: 'redis', what: 'ฐานข้อมูล Redis', why: 'ค่าเริ่มต้นมักไม่มีรหัสผ่าน ใครต่อได้ก็อ่าน/เขียนข้อมูลได้', warn: 'แอปบนเครื่องอื่นที่ต่อ Redis นี้จะต่อไม่ได้' },
  9200:  { svc: 'Elasticsearch', sev: 'high', block: true, key: 'elasticsearch', what: 'Elasticsearch', why: 'มักเปิดโดยไม่มีรหัสผ่าน ใครต่อได้ก็อ่านข้อมูลได้', warn: 'แอปบนเครื่องอื่นที่ต่อ Elasticsearch นี้จะต่อไม่ได้' },
  27017: { svc: 'MongoDB', sev: 'high', block: true, key: 'mongodb', what: 'ฐานข้อมูล MongoDB', why: 'มักเปิดโดยไม่มีรหัสผ่าน ใครต่อได้ก็อ่านข้อมูลได้', warn: 'แอปบนเครื่องอื่นที่ต่อ MongoDB นี้จะต่อไม่ได้' },
  // Web control panels — should not be reachable from the internet without IP restriction or VPN
  8083:  { svc: 'Hestia CP', sev: 'medium', block: false, key: null, what: 'แผงควบคุม Hestia Control Panel', why: 'แผงจัดการเซิร์ฟเวอร์ที่เปิดสู่อินเทอร์เน็ตโดยตรงเสี่ยงต่อการ brute-force และช่องโหว่ของซอฟต์แวร์แผงควบคุม', warn: 'ผู้ดูแลระบบจะเข้าแผงควบคุม Hestia จากเครื่องอื่นไม่ได้จนกว่าจะเปิดกฎ firewall อีกครั้ง' },
  10000: { svc: 'Webmin', sev: 'medium', block: false, key: null, what: 'แผงควบคุม Webmin (MiniServ)', why: 'แผงจัดการเซิร์ฟเวอร์ที่เปิดสู่อินเทอร์เน็ตโดยตรงเสี่ยงต่อการ brute-force และช่องโหว่ที่รู้จักกันของ Webmin', warn: 'ผู้ดูแลระบบจะเข้า Webmin จากเครื่องอื่นไม่ได้จนกว่าจะเปิดกฎ firewall อีกครั้ง' },
  // SIP / telephony — often probed by VoIP scanners
  5060:  { svc: 'SIP', sev: 'low', block: false, key: null, what: 'บริการ VoIP / SIP (Session Initiation Protocol)', why: 'พอร์ต SIP ที่เปิดสู่อินเทอร์เน็ตมักถูก VoIP scanner สุ่มหาและโจมตีด้วย toll fraud ถ้าไม่ได้ใช้ VoIP ควรปิด', warn: 'บริการ VoIP จะรับสายภายนอกไม่ได้' },
  2000:  { svc: 'Cisco SCCP', sev: 'low', block: false, key: null, what: 'Cisco Skinny (SCCP) หรือบริการอื่นที่ใช้พอร์ต 2000', why: 'ถ้าไม่ได้ใช้ระบบโทรศัพท์ Cisco การเปิดพอร์ตนี้ไม่จำเป็น', warn: 'โทรศัพท์ IP ของ Cisco อาจลงทะเบียนไม่ได้' },
};
const BLOCKABLE = new Set(Object.keys(CATALOG).filter((p) => CATALOG[p].block).map(Number));
const SERVICE_FIX = { 23: 'TlntSvr', 21: 'FTPSVC' }; // a Windows service that is the whole reason for the port
const CLEARTEXT = /^(http|ftp|telnet|pop3?|imap|smtp|snmp|tftp)$/i;
const RANK = { high: 0, medium: 1, low: 2, info: 3 };
const SEV_TH = { high: 'สูง', medium: 'กลาง', low: 'ต่ำ', info: 'ข้อมูล' };

const bindText = (binds) => binds.map((b) => (isAny(b) ? `${b} (ทุกการ์ดเครือข่าย)` : isLoop(b) ? `${b} (เฉพาะในเครื่อง)` : b)).join(', ');

function portFinding(p, ctx) {
  const cat = CATALOG[p.port];
  const u = ctx.local ? usage(ctx.snap, p.port) : null;
  const l = u?.listener || null;
  // exposure: from the OS table when we have it (exact), else unknown
  const exposure = !ctx.local ? 'lan' : u ? (u.lan ? 'lan' : 'local') : 'unknown';
  if (ctx.local && u && !l) return null; // nmap saw it, the OS table does not: closed meanwhile
  const doing = [];
  if (l) {
    doing.push(`โปรแกรม: ${l.name || '(ไม่ทราบชื่อ)'} (PID ${l.pid})${l.path ? ` — ${l.path}` : ''}`);
    if (l.services?.length) doing.push(`บริการ Windows: ${l.services.map((s) => `${s.name} (${s.display || '-'}, ${s.state})`).join('; ')}`);
    doing.push(`กำลังฟังที่: ${bindText(l.binds)}`);
    if (l.started) doing.push(`โปรเซสนี้เริ่มทำงานเมื่อ ${l.started.replace('T', ' ')}`);
  } else if (ctx.local) {
    doing.push('อ่านรายชื่อโปรแกรมที่เปิดพอร์ตนี้ไม่ได้ (ลองรันแอปในฐานะ Administrator)');
  }
  if (p.product) doing.push(`Nmap อ่านได้ว่าเป็น: ${p.product}`);

  // already fixed: Capri's own firewall rule is on. The scan runs from this PC, so it still sees the port open (its traffic never meets the inbound filter): say so instead of offering the same fix again
  if (ctx.local && exposure !== 'local' && (ctx.snap?.blocked || []).includes(p.port)) {
    return {
      id: `port-${p.port}`, kind: 'port', port: p.port, proto: p.proto || 'tcp', severity: 'info', exposure: 'blocked',
      title: `พอร์ต ${p.port} (${cat.svc})`, what: cat.what,
      why: `แก้แล้ว: มีกฎ Firewall "Capri block TCP ${p.port}" เปิดอยู่ เครื่องอื่นต่อพอร์ตนี้ไม่ได้ (การสแกนจากเครื่องนี้เองยังเห็นว่าเปิด เพราะการต่อจากเครื่องตัวเองไม่ผ่านด่านขาเข้า)`,
      doing, usedBy: { text: 'บล็อกจากเครื่องอื่นแล้ว', remotes: [], local: 0 }, intelKey: cat.key, fixes: [], manual: null,
      infoNote: 'แก้แล้ว บล็อกจากเครื่องอื่นด้วย Firewall',
    };
  }

  let usedBy;
  if (!ctx.local) usedBy = { text: 'ตรวจจากภายนอก จึงไม่ทราบว่าใครต่ออยู่', remotes: [], local: 0 };
  else if (!u) usedBy = { text: 'อ่านตารางการเชื่อมต่อไม่ได้ จึงไม่ทราบว่าใครต่ออยู่', remotes: [], local: 0 };
  else if (u.remotes.length) usedBy = { text: `ตอนนี้มีเครื่องอื่นเชื่อมอยู่: ${u.remotes.map((r) => `${r.ip} (${r.n} การเชื่อมต่อ)`).join(', ')}`, remotes: u.remotes, local: u.localCount };
  else if (u.localCount) usedBy = { text: `ไม่มีเครื่องอื่นเชื่อมอยู่ตอนนี้ มีโปรแกรมในเครื่องเดียวกันใช้อยู่ ${u.localCount} การเชื่อมต่อ`, remotes: [], local: u.localCount };
  else usedBy = { text: 'ตอนสแกนไม่มีใครเชื่อมต่ออยู่ (ฟังรออยู่เฉย ๆ — อาจมีคนใช้เป็นช่วง ๆ)', remotes: [], local: 0 };

  const sev = exposure === 'local' ? 'info' : cat.sev;
  const f = {
    id: `port-${p.port}`, kind: 'port', port: p.port, proto: p.proto || 'tcp', severity: sev, exposure,
    title: `พอร์ต ${p.port} (${cat.svc}) — ${cat.what}`,
    what: cat.what,
    why: exposure === 'local'
      ? `ฟังเฉพาะภายในเครื่องนี้ เครื่องอื่นในเครือข่ายเข้าไม่ถึง จึงไม่ถือเป็นปัญหา (${cat.why})`
      : cat.why,
    doing, usedBy, intelKey: cat.key, product: p.product || '', fixes: [], manual: null,
  };

  // an FTP server that answers TLS: "plain text" is only true if TLS is not required, and a scan cannot tell which
  if (p.port === 21 && exposure !== 'local' && /TLSv1\.[0-3]/.test(p.scriptOut || '')) {
    f.severity = 'medium';
    f.why = 'เซิร์ฟเวอร์ FTP นี้รองรับ TLS แต่การสแกนบอกไม่ได้ว่าบังคับใช้หรือไม่ ถ้าไม่บังคับ ใครต่อด้วย FTP ธรรมดาก็ยังส่งรหัสผ่านเป็นข้อความเปล่าได้';
  }

  if (exposure !== 'local' && ctx.local) {
    const inUse = usedBy.remotes.length > 0;
    if (BLOCKABLE.has(p.port)) {
      f.fixes.push({
        action: 'firewall-block-port', params: { port: p.port, proto: 'tcp' },
        label: `บล็อกพอร์ต ${p.port} (${cat.svc}) จากเครื่องอื่นด้วย Windows Firewall`,
        effect: `สร้างกฎ Firewall ขาเข้า "Capri block TCP ${p.port}" เครื่องอื่นจะต่อพอร์ตนี้ไม่ได้ ส่วนโปรแกรมในเครื่องนี้ใช้ได้ตามปกติ ไม่ลบ/ไม่หยุดโปรแกรมใด`,
        risk: inUse ? 'medium' : 'low',
        warn: inUse ? `ตอนนี้มีเครื่องอื่นต่ออยู่ ${usedBy.remotes.map((r) => r.ip).join(', ')} — ${cat.warn}` : cat.warn,
        reversible: true,
      });
    }
    const svc = SERVICE_FIX[p.port];
    if (svc && l?.services?.some((s) => s.name.toLowerCase() === svc.toLowerCase())) {
      f.fixes = [{
        action: 'service-disable', params: { name: svc },
        label: `ปิดและหยุดบริการ ${svc} (ต้นเหตุของพอร์ต ${p.port})`,
        effect: `ตั้งบริการ ${svc} เป็น Disabled และหยุดมัน จำสถานะเดิมไว้เพื่อย้อนกลับ`,
        risk: inUse ? 'medium' : 'low', warn: cat.warn, reversible: true,
      }];
    }
    if (!f.fixes.length) f.manual = `ปิดบริการ/ตั้งค่าโปรแกรม ${l?.name || 'ที่เปิดพอร์ตนี้'} ให้ฟังเฉพาะ 127.0.0.1`;
  } else if (!ctx.local) {
    f.manual = 'เป็นอุปกรณ์อื่นในเครือข่าย ฉันแก้ให้ไม่ได้ ต้องไปปิดบริการที่เครื่องนั้นเอง';
  }
  return f;
}

function configFindings(ports) {
  const out = [];
  // ssl-cert prints "Not valid after: 2025-10-09T07:49:14": the same certificate is often on many ports, so one finding
  const expired = [];
  for (const p of ports) {
    const m = /Not valid after:\s*(\d{4}-\d{2}-\d{2})/.exec(p.scriptOut || '');
    if (m && Date.parse(m[1]) < Date.now()) expired.push({ port: p.port, date: m[1] });
  }
  if (expired.length) {
    const list = expired.map((e) => e.port).join(', ');
    out.push({
      id: 'cert-expired', kind: 'config', port: expired[0].port, exposure: 'lan', severity: 'medium',
      title: `ใบรับรอง TLS หมดอายุแล้ว (พอร์ต ${list}) — หมดอายุเมื่อ ${expired[0].date}`,
      what: 'ใบรับรอง TLS ที่หมดอายุ',
      why: 'ใบรับรองที่หมดอายุทำให้โปรแกรมฝั่งผู้ใช้เตือนหรือปฏิเสธการเชื่อมต่อ และยืนยันตัวตนของเซิร์ฟเวอร์ไม่ได้',
      doing: [`ssl-cert อ่านวันหมดอายุได้ ${expired[0].date} บนพอร์ต ${list}`], usedBy: { text: 'ตรวจจากภายนอก จึงไม่ทราบว่าใครต่ออยู่', remotes: [], local: 0 }, fixes: [],
      manual: 'ต่ออายุหรือออกใบรับรองใหม่ แล้วตั้งให้ต่ออายุอัตโนมัติ',
      refs: [{ title: 'Let’s Encrypt — เอกสารการออกและต่ออายุใบรับรอง', url: 'https://letsencrypt.org/docs/', source: 'Let’s Encrypt' }],
    });
  }
  for (const p of ports) {
    const s = p.scriptOut || '';
    if (!s) continue;
    const base = { kind: 'config', port: p.port, exposure: 'lan', doing: [`พอร์ต ${p.port} (${p.service || '?'})`], usedBy: { text: 'ไม่ทราบ', remotes: [], local: 0 }, fixes: [] };
    if (/TLSv1\.0|SSLv/.test(s)) out.push({ ...base, id: `tls-${p.port}`, severity: 'medium', title: `พอร์ต ${p.port}: รองรับ TLS รุ่นเก่า (TLS 1.0 / SSL)`, what: 'การเข้ารหัสรุ่นเก่า', why: 'TLS 1.0/SSL มีจุดอ่อนที่รู้กันแล้ว', manual: 'ตั้งค่าโปรแกรมนั้นให้ใช้ TLS 1.2 ขึ้นไป' });
    if (/anon.*allowed|Anonymous.*OK/i.test(s)) out.push({ ...base, id: `ftpanon-${p.port}`, severity: 'high', title: `พอร์ต ${p.port} (FTP): เข้าได้โดยไม่ต้องมีบัญชี (anonymous)`, what: 'FTP แบบไม่ต้องล็อกอิน', why: 'ใครก็เข้ามาอ่าน/เขียนไฟล์ได้', manual: 'ปิด anonymous login ในตั้งค่าเซิร์ฟเวอร์ FTP' });
    if (/message signing.*(disabled|not required)|signing.*not required/i.test(s)) out.push({ ...base, id: `smbsign-${p.port}`, severity: 'medium', title: `พอร์ต ${p.port} (SMB): ไม่บังคับ message signing`, what: 'SMB ไม่บังคับลายเซ็นข้อความ', why: 'เสี่ยงโดนโจมตีแบบ relay ในวง LAN', manual: 'เปิด "Digitally sign communications (always)" ใน Local Security Policy' });
    if (/empty password|no password/i.test(s)) out.push({ ...base, id: `nopass-${p.port}`, severity: 'high', title: `พอร์ต ${p.port}: บริการนี้ไม่มีรหัสผ่าน`, what: 'บริการไม่ตั้งรหัสผ่าน', why: 'ใครต่อเข้ามาได้ก็ใช้ได้เลย', manual: 'ตั้งรหัสผ่านให้บริการนั้นทันที' });
  }
  return out;
}

function firewallFindings(snap) {
  if (!snap?.ok) return [];
  return (snap.firewall || []).filter((p) => /^(Domain|Private|Public)$/.test(p.name) && p.enabled === 'False').map((p) => ({
    id: `fw-${p.name}`, kind: 'firewall', severity: 'high', exposure: 'lan',
    title: `Windows Firewall โปรไฟล์ ${p.name} ถูกปิดอยู่`,
    what: 'ไฟร์วอลล์ของ Windows',
    why: 'เมื่อปิด พอร์ตทุกตัวที่โปรแกรมเปิดไว้จะเปิดให้เครื่องอื่นในเครือข่ายนั้นต่อได้โดยไม่มีด่านกรอง',
    doing: [`โปรไฟล์ ${p.name}: Enabled = False`],
    usedBy: { text: 'มีผลกับทุกโปรแกรมที่รับการเชื่อมต่อ', remotes: [], local: 0 },
    fixes: [{
      action: 'firewall-enable-profile', params: { profile: p.name },
      label: `เปิด Windows Firewall โปรไฟล์ ${p.name}`,
      effect: `เปิดไฟร์วอลล์โปรไฟล์ ${p.name} กลับเป็นปกติ จำค่าเดิมไว้เพื่อย้อนกลับ`,
      risk: 'low', warn: 'โปรแกรมที่รอรับการเชื่อมต่อจากเครื่องอื่น อาจต้องอนุญาตผ่านไฟร์วอลล์ใหม่', reversible: true,
    }],
    manual: null,
  }));
}

/**
 * @param {{ ip: string, local: boolean, ports: object[], snap: object|null }} ctx
 */
function buildFindings(ctx) {
  const byPort = new Map();
  for (const p of ctx.ports || []) byPort.set(p.port, p);
  // on this PC the OS table also knows ports that nmap on 127.0.0.1 can't see (bound to the LAN address only)
  if (ctx.local && ctx.snap?.ok) {
    for (const l of ctx.snap.listeners) if (CATALOG[l.port] && !byPort.has(l.port)) byPort.set(l.port, { port: l.port, proto: 'tcp', service: CATALOG[l.port].svc, product: '' });
  }
  const list = [];
  for (const p of byPort.values()) {
    if (CATALOG[p.port]) { const f = portFinding(p, ctx); if (f) list.push(f); }
    else if (CLEARTEXT.test(p.service || '') && p.tunnel !== 'ssl' && !/\b(?:STARTTLS|STLS)\b/.test(p.scriptOut || '') && (!ctx.local || usage(ctx.snap, p.port)?.lan !== false)) {
      list.push({
        id: `clear-${p.port}`, kind: 'cleartext', port: p.port, proto: p.proto || 'tcp', severity: 'low', exposure: 'lan',
        title: `พอร์ต ${p.port} (${p.service}) ส่งข้อมูลแบบไม่เข้ารหัส`, what: `บริการ ${p.service} แบบไม่เข้ารหัส`,
        why: 'ข้อมูลที่ผ่านพอร์ตนี้ถูกดักอ่านได้ในวงเครือข่ายเดียวกัน (ถ้าเป็นเว็บที่คุณตั้งใจเปิดให้ใช้ ก็ไม่เป็นไร)',
        doing: [`พอร์ต ${p.port}${p.product ? ` — ${p.product}` : ''}`], usedBy: { text: 'ไม่ทราบ', remotes: [], local: 0 }, fixes: [], manual: 'ถ้าไม่จำเป็น ให้ใช้เวอร์ชันที่เข้ารหัส (HTTPS / SFTP)',
      });
    }
  }
  list.push(...configFindings(ctx.ports || []));
  if (ctx.local) list.push(...firewallFindings(ctx.snap));
  return list.sort((a, b) => (RANK[a.severity] - RANK[b.severity]) || ((a.port || 0) - (b.port || 0)));
}

// the lines of the status card (terminal style), full detail
function renderLines(findings) {
  const real = findings.filter((f) => f.severity !== 'info');
  const info = findings.filter((f) => f.severity === 'info');
  const lines = [];
  if (real.length) {
    lines.push('FINDINGS');
    real.forEach((f, i) => {
      lines.push(`  ${i + 1}. [${SEV_TH[f.severity]}] ${f.title}`);
      lines.push(`     คืออะไร    : ${f.what}`);
      for (const d of f.doing || []) lines.push(`     กำลังทำ    : ${d}`);
      lines.push(`     ใครใช้อยู่ : ${f.usedBy?.text || '-'}`);
      lines.push(`     ทำไมเสี่ยง : ${f.why}`);
      if (f.intel?.text) lines.push(`     ข้อมูลภายนอก: ${f.intel.text}`);
      for (const fx of f.fixes || []) lines.push(`     แก้ได้     : ${fx.label}${fx.risk === 'medium' ? '  (ระวัง: ' + fx.warn + ')' : ''}`);
      if (!f.fixes?.length && f.manual) lines.push(`     ต้องแก้เอง : ${f.manual}`);
    });
  }
  if (info.length) {
    lines.push('OK (ไม่ต้องทำอะไร)');
    for (const f of info) lines.push(`  - ${f.title}: ${f.infoNote || 'ฟังเฉพาะในเครื่อง'}`);
  }
  const refs = [...new Map(real.flatMap((f) => f.refs || []).map((r) => [r.url, r])).values()].slice(0, 4);
  if (refs.length) { lines.push('REFS'); for (const r of refs) lines.push(`  ${r.title}  ${r.url}`); }
  return lines;
}

module.exports = { buildFindings, renderLines, CATALOG, BLOCKABLE, SEV_TH };