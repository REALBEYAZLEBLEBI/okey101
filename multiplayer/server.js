/* =========================================================
   101 OKEY — Çok Oyunculu Prototip Sunucusu
   Sıfır bağımlılık: Node.js'in http + crypto modülleriyle
   çalışan mini WebSocket sunucusu + oda (lobi) yönetimi.

   Çalıştırma:  node server.js  [port]   (varsayılan 8101)
   Ardından tarayıcıda:  http://localhost:8101/mp-test.html
   ========================================================= */
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = +(process.argv[2] || 8101);
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/* ---------------- Minimal WebSocket (RFC 6455, text frames) ---------------- */
function wsAccept(key) {
  return crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');
}
function wsEncode(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}
/* Streaming decoder: her socket için buffer tutar, tam frame'leri çözer */
function makeDecoder(onMessage, onClose) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const opcode = buf[0] & 0x0f;
      const masked = !!(buf[1] & 0x80);
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const maskLen = masked ? 4 : 0;
      if (buf.length < off + maskLen + len) return;
      let payload = buf.slice(off + maskLen, off + maskLen + len);
      if (masked) {
        const mask = buf.slice(off, off + 4);
        payload = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
      }
      buf = buf.slice(off + maskLen + len);
      if (opcode === 0x8) { onClose(); return; }      // close
      if (opcode === 0x9) continue;                    // ping (tarayıcılar nadiren yollar)
      if (opcode === 0x1) onMessage(payload.toString('utf8'));
    }
  };
}

/* ---------------- Oda yönetimi ---------------- */
/* rooms: { code: { clients: [{sock, name, seat}], hostSeat } } */
const rooms = new Map();

function roomState(room) {
  return {
    type: 'room',
    players: room.clients.map(c => ({ name: c.name, seat: c.seat })),
    hostSeat: room.hostSeat,
  };
}
function broadcast(room, obj, exceptSock) {
  const msg = wsEncode(JSON.stringify(obj));
  for (const c of room.clients) {
    if (c.sock !== exceptSock && !c.sock.destroyed) c.sock.write(msg);
  }
}
function send(sock, obj) {
  if (!sock.destroyed) sock.write(wsEncode(JSON.stringify(obj)));
}

function handleMessage(client, raw) {
  let m;
  try { m = JSON.parse(raw); } catch { return; }
  const { sock } = client;

  if (m.type === 'join') {
    const code = String(m.room || 'LOBI').toUpperCase().slice(0, 8);
    let room = rooms.get(code);
    if (!room) { room = { code, clients: [], hostSeat: 0 }; rooms.set(code, room); }
    if (room.clients.length >= 4) { send(sock, { type: 'error', err: 'Oda dolu (4 kişi).' }); return; }
    const seats = new Set(room.clients.map(c => c.seat));
    let seat = 0; while (seats.has(seat)) seat++;
    client.name = String(m.name || 'Oyuncu').slice(0, 12);
    client.seat = seat;
    client.room = room;
    room.clients.push(client);
    send(sock, { type: 'joined', seat, room: code });
    broadcast(room, roomState(room));
    return;
  }

  const room = client.room;
  if (!room) return;

  if (m.type === 'chat') {
    broadcast(room, { type: 'chat', from: client.name, seat: client.seat, text: String(m.text).slice(0, 200) });
    return;
  }
  /* Oyun aksiyonları: sunucu şimdilik RÖLE (relay) — ev sahibi (seat 0) oyunu
     yönetir, aksiyonlar herkese iletilir. Sunucu-otoriter motor entegrasyonu
     için README'deki yol haritasına bakın (engine.js require edilebilir). */
  if (m.type === 'action' || m.type === 'state') {
    m.seat = client.seat;
    broadcast(room, m, sock);
    return;
  }
}

function removeClient(client) {
  const room = client.room;
  if (!room) return;
  const i = room.clients.indexOf(client);
  if (i >= 0) room.clients.splice(i, 1);
  if (!room.clients.length) rooms.delete(room.code);
  else {
    room.hostSeat = Math.min(...room.clients.map(c => c.seat));
    broadcast(room, roomState(room));
  }
}

/* ---------------- HTTP: statik dosya + WS upgrade ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let file = req.url.split('?')[0];
  if (file === '/') file = '/mp-test.html';
  // oyunun kendisi de sunulur: /okey101.html (bir üst klasörden kopyalayın)
  const p = path.join(__dirname, path.normalize(file).replace(/^([.][.][/\\])+/, ''));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('bulunamadı'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return; }
  sock.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + wsAccept(key) + '\r\n\r\n'
  );
  const client = { sock, name: '', seat: -1, room: null };
  const close = () => { removeClient(client); sock.destroy(); };
  sock.on('data', makeDecoder((msg) => handleMessage(client, msg), close));
  sock.on('close', () => removeClient(client));
  sock.on('error', close);
});

server.listen(PORT, () => {
  console.log('101 Okey çok oyunculu prototip sunucusu: http://localhost:' + PORT);
  console.log('Test istemcisi:  http://localhost:' + PORT + '/mp-test.html');
});
