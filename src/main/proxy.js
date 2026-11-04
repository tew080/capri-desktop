'use strict';

// Mini proxy for YOUR OWN traffic, on YOUR machine.
//
//  start({ type: 'socks5' | 'http', port, host, username, password, blocklist })
//  stop()
//  status()
//
//  - socks5 : SOCKS5 CONNECT (no auth, or username/password per RFC 1929), IPv4 / IPv6 / domain names
//  - http   : HTTP proxy for plain http:// requests + CONNECT tunnels for https://  (Basic auth optional)
//  - blocklist : domains to refuse (a domain and all its subdomains), e.g. ['doubleclick.net']
//
// By default it listens on 127.0.0.1 only. It is a local relay: sites still see this PC's own IP, so it hides
// nothing by itself. What it gives you is one place to log, count and block what your apps connect to.
// Listening on anything other than loopback is refused unless a username and password are set.
//
// This is not a VPN: a real VPN needs a virtual network adapter (WireGuard / OpenVPN / ssh -D), which plain
// Node cannot create.

const net = require('node:net');
const http = require('node:http');

const IDLE_MS = 5 * 60 * 1000;
const MAX_CONN = 256;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

let state = null; // { server, opts, startedAt, stats }

const blocked = (host, list) => {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  return list.some((d) => h === d || h.endsWith(`.${d}`));
};

// connect to the target and join the two sockets; counts the bytes
function relay(client, host, port, stats, onReady, onFail) {
  const upstream = net.connect({ host, port }, () => {
    onReady(upstream);
    client.pipe(upstream);
    upstream.pipe(client);
  });
  stats.active++; stats.total++;
  let closed = false;
  const done = () => { if (!closed) { closed = true; stats.active--; } client.destroy(); upstream.destroy(); };
  client.on('data', (d) => { stats.out += d.length; });
  upstream.on('data', (d) => { stats.in += d.length; });
  upstream.on('error', (e) => { onFail?.(e); done(); });
  client.on('error', done);
  client.on('close', done);
  upstream.on('close', done);
  client.setTimeout(IDLE_MS, done);
  upstream.setTimeout(IDLE_MS, done);
}

// ---------- SOCKS5 ----------

function socksServer(opts, stats) {
  return net.createServer((sock) => {
    if (stats.active >= MAX_CONN) { sock.destroy(); return; }
    sock.on('error', () => sock.destroy());
    sock.setTimeout(30000, () => sock.destroy()); // handshake must finish quickly (relay() resets this)
    sock.once('data', (hello) => {
      if (hello[0] !== 5) { sock.destroy(); return; }
      const methods = [...hello.subarray(2, 2 + hello[1])];
      const auth = Boolean(opts.username);
      const want = auth ? 0x02 : 0x00;
      if (!methods.includes(want)) { sock.end(Buffer.from([5, 0xff])); return; }
      sock.write(Buffer.from([5, want]));

      const request = () => sock.once('data', (d) => {
        if (d[0] !== 5) { sock.destroy(); return; }
        if (d[1] !== 1) { sock.end(Buffer.from([5, 7, 0, 1, 0, 0, 0, 0, 0, 0])); return; } // only CONNECT
        let host; let off;
        if (d[3] === 1) { host = [...d.subarray(4, 8)].join('.'); off = 8; }
        else if (d[3] === 3) { host = d.subarray(5, 5 + d[4]).toString('utf8'); off = 5 + d[4]; }
        else if (d[3] === 4) {
          const parts = []; for (let i = 0; i < 16; i += 2) parts.push(d.readUInt16BE(4 + i).toString(16));
          host = parts.join(':'); off = 20;
        } else { sock.end(Buffer.from([5, 8, 0, 1, 0, 0, 0, 0, 0, 0])); return; }
        const port = d.readUInt16BE(off);
        if (blocked(host, opts.blocklist)) { stats.blocked++; sock.end(Buffer.from([5, 2, 0, 1, 0, 0, 0, 0, 0, 0])); return; }
        sock.setTimeout(0);
        relay(sock, host, port, stats,
          () => sock.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0])),
          () => { try { sock.write(Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0])); } catch { /* gone */ } });
        stats.last = `${host}:${port}`;
      });

      if (!auth) { request(); return; }
      sock.once('data', (a) => {
        const ul = a[1];
        const user = a.subarray(2, 2 + ul).toString('utf8');
        const pl = a[2 + ul];
        const pass = a.subarray(3 + ul, 3 + ul + pl).toString('utf8');
        if (a[0] === 1 && user === opts.username && pass === opts.password) { sock.write(Buffer.from([1, 0])); request(); }
        else { stats.denied++; sock.end(Buffer.from([1, 1])); }
      });
    });
  });
}

// ---------- HTTP / HTTPS (CONNECT) ----------

function httpAuthOk(req, opts) {
  if (!opts.username) return true;
  const m = /^Basic\s+(.+)$/i.exec(req.headers['proxy-authorization'] || '');
  if (!m) return false;
  return Buffer.from(m[1], 'base64').toString('utf8') === `${opts.username}:${opts.password}`;
}

function httpServer(opts, stats) {
  const server = http.createServer((req, res) => {
    if (!httpAuthOk(req, opts)) {
      stats.denied++;
      res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="capri"' }).end();
      return;
    }
    let url;
    try { url = new URL(req.url); } catch { res.writeHead(400).end(); return; }
    if (url.protocol !== 'http:') { res.writeHead(400).end(); return; }
    if (blocked(url.hostname, opts.blocklist)) { stats.blocked++; res.writeHead(403).end(); return; }
    const headers = { ...req.headers };
    delete headers['proxy-authorization']; delete headers['proxy-connection'];
    stats.total++; stats.active++; stats.last = `${url.hostname}:${url.port || 80}`;
    const up = http.request({ host: url.hostname, port: url.port || 80, method: req.method, path: url.pathname + url.search, headers }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.on('data', (d) => { stats.in += d.length; });
      r.pipe(res);
    });
    req.on('data', (d) => { stats.out += d.length; });
    let closed = false;
    const done = () => { if (!closed) { closed = true; stats.active--; } };
    res.on('close', done);
    up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); done(); });
    up.setTimeout(IDLE_MS, () => up.destroy());
    req.pipe(up);
  });

  server.on('connect', (req, client, head) => {
    client.on('error', () => client.destroy());
    if (!httpAuthOk(req, opts)) {
      stats.denied++;
      client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="capri"\r\n\r\n');
      return;
    }
    if (stats.active >= MAX_CONN) { client.end('HTTP/1.1 503 Service Unavailable\r\n\r\n'); return; }
    const [host, portStr] = req.url.split(/:(?=\d+$)/);
    const port = Number(portStr) || 443;
    if (blocked(host, opts.blocklist)) { stats.blocked++; client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    stats.last = `${host}:${port}`;
    relay(client, host.replace(/^\[|\]$/g, ''), port, stats,
      (up) => { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head?.length) up.write(head); },
      () => { try { client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch { /* gone */ } });
  });
  server.on('clientError', (_e, sock) => sock.destroy());
  return server;
}

// ---------- control ----------

function start({ type = 'socks5', port = 0, host = '127.0.0.1', username = '', password = '', blocklist = [] } = {}) {
  return new Promise((resolve) => {
    if (state) { resolve({ ok: false, error: 'already-running', ...status() }); return; }
    if (!['socks5', 'http'].includes(type)) { resolve({ ok: false, error: 'bad-type' }); return; }
    if (!LOOPBACK.has(host) && !(username && password)) { resolve({ ok: false, error: 'needs-auth-off-loopback' }); return; }
    const p = Number(port);
    if (!Number.isInteger(p) || p < 0 || p > 65535) { resolve({ ok: false, error: 'bad-port' }); return; }

    const opts = {
      type, host, username: String(username || ''), password: String(password || ''),
      blocklist: (blocklist || []).map((d) => String(d).toLowerCase().trim().replace(/^\*?\./, '')).filter(Boolean),
    };
    const stats = { active: 0, total: 0, in: 0, out: 0, blocked: 0, denied: 0, last: '' };
    const server = type === 'socks5' ? socksServer(opts, stats) : httpServer(opts, stats);
    server.once('error', (err) => resolve({ ok: false, error: err.code || err.message }));
    server.listen(p, host, () => {
      state = { server, opts, stats, startedAt: Date.now(), port: server.address().port };
      resolve({ ok: true, ...status() });
    });
  });
}

function stop() {
  return new Promise((resolve) => {
    if (!state) { resolve({ ok: true, running: false }); return; }
    const { server } = state;
    state = null;
    server.close(() => resolve({ ok: true, running: false }));
    server.closeAllConnections?.();
  });
}

function status() {
  if (!state) return { running: false };
  const { opts, stats, startedAt, port } = state;
  return {
    running: true,
    type: opts.type,
    host: opts.host,
    port,
    url: `${opts.type === 'socks5' ? 'socks5h' : 'http'}://${opts.host}:${port}`,
    auth: Boolean(opts.username),
    blocklist: opts.blocklist,
    seconds: Math.round((Date.now() - startedAt) / 1000),
    ...stats,
  };
}

module.exports = { start, stop, status };
