/* Sıfır bağımlılıklı mini WebSocket İSTEMCİSİ (test amaçlı, RFC 6455).
   İstemci→sunucu çerçeveleri maskeli gönderilir (standart gereği). */
'use strict';
const net = require('net');
const crypto = require('crypto');

function encodeClient(str) {
  const p = Buffer.from(str, 'utf8'), len = p.length;
  const mask = crypto.randomBytes(4);
  let h;
  if (len < 126) { h = Buffer.from([0x81, 0x80 | len]); }
  else if (len < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 0x80 | 126; h.writeUInt16BE(len, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 0x80 | 127; h.writeBigUInt64BE(BigInt(len), 2); }
  const masked = Buffer.from(p.map((b, i) => b ^ mask[i % 4]));
  return Buffer.concat([h, mask, masked]);
}

function connect(host, port, onMsg, onOpen) {
  const sock = net.connect(port, host, () => {
    const key = crypto.randomBytes(16).toString('base64');
    sock.write(
      'GET / HTTP/1.1\r\nHost: ' + host + ':' + port + '\r\n' +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      'Sec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n'
    );
  });
  let handshook = false;
  let buf = Buffer.alloc(0);
  sock.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    if (!handshook) {
      const idx = buf.indexOf('\r\n\r\n');
      if (idx < 0) return;
      handshook = true;
      buf = buf.slice(idx + 4);
      onOpen && onOpen(api);
    }
    for (;;) {
      if (buf.length < 2) return;
      const opcode = buf[0] & 0x0f;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const pay = buf.slice(off, off + len);
      buf = buf.slice(off + len);
      if (opcode === 0x8) { sock.destroy(); return; }
      if (opcode === 0x1) { try { onMsg(JSON.parse(pay.toString('utf8')), api); } catch (e) {} }
    }
  });
  const api = {
    send: obj => { if (!sock.destroyed) sock.write(encodeClient(JSON.stringify(obj))); },
    close: () => sock.destroy(),
    sock,
  };
  return api;
}

module.exports = { connect };
