/* =========================================================
   101 OKEY — FAZ A Oyun Sunucusu (sunucu-otoriter)
   Sıfır bağımlılık: Node http + crypto. Kural motoru = ../engine.js
   - Kimlik: cihaz-tabanlı (deviceId → kullanıcı + token)
   - Cüzdan: kalıcı, SADECE ledger üzerinden değişir
   - Masa: engine sunucuda koşar; istemci niyet yollar, görüntü alır
   - Boş koltuklar botla dolar; kopan oyuncuyu bot devralır
   Çalıştırma:  node okey-server.js [port]     (varsayılan 8101)
   Test modu :  OKEY_FAST=1 node okey-server.js
   ========================================================= */
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const E = require('../engine.js');

// Hosting (Render vb.) portu process.env.PORT ile verir; yerelde argv ya da 8101
const PORT = +(process.env.PORT || process.argv[2] || 8101);
const FAST = !!process.env.OKEY_FAST;
const DATA_FILE = process.env.OKEY_DATA || path.join(__dirname, 'data.json');

const START_CHIPS = 100000;      // yeni hesap başlangıç bakiyesi
const FILL_MS   = FAST ? 200 : 9000;   // bu süre içinde masa dolmazsa botla tamamla
const BOT_MS    = +process.env.OKEY_BOT_MS || (FAST ? 25 : 950); // bot hamle temposu
const TURN_MS   = FAST ? 4000 : 30000; // insan tur süresi
const OPEN_MS   = FAST ? 4000 : 60000; // açış yapılan turda işleme süresi
const ROUND_BREAK = FAST ? 250 : 7000; // eller arası bekleme
const BOT_POOL = ['Elif', 'Burak', 'Zeynep', 'Kemal', 'Selin', 'Emre', 'Murat', 'Ceren'];

/* ---------------- Kalıcı depo (FAZ A: dosya; üretimde PostgreSQL) ---------------- */
let DB = { users: {}, tokens: {}, ledger: [], seq: 0 };
try { DB = Object.assign(DB, JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); } catch (e) {}
let saveT = null;
function saveSoon() {
  if (saveT) return;
  saveT = setTimeout(() => {
    saveT = null;
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(DB)); } catch (e) { console.error('kayıt hatası', e.message); }
  }, FAST ? 20 : 400);
}

/* Cüzdan: bakiye ASLA doğrudan yazılmaz — her hareket ledger'a işlenir */
function tx(userId, delta, reason, ref) {
  const u = DB.users[userId];
  if (!u) return false;
  if (delta < 0 && u.chips + delta < 0) return false; // yetersiz bakiye
  u.chips += delta;
  DB.ledger.push({ id: ++DB.seq, uid: userId, delta, reason, ref: ref || null, bal: u.chips, ts: Date.now() });
  saveSoon();
  return true;
}

function getOrCreateUser(deviceId, name) {
  let u = Object.values(DB.users).find(x => x.deviceId === deviceId);
  if (!u) {
    const id = 'u' + (++DB.seq);
    u = DB.users[id] = {
      id, deviceId, name: String(name || 'Oyuncu').slice(0, 12),
      chips: 0, xp: 0, games: 0, wins: 0, created: Date.now(), tableId: null,
    };
    tx(id, START_CHIPS, 'bonus', 'hosgeldin');
  } else if (name) u.name = String(name).slice(0, 12);
  saveSoon();
  return u;
}
function issueToken(userId) {
  const t = crypto.randomBytes(18).toString('hex');
  DB.tokens[t] = userId;
  saveSoon();
  return t;
}
function pubUser(u) {
  return { id: u.id, name: u.name, chips: u.chips, xp: u.xp, games: u.games, wins: u.wins };
}

/* ---------------- WebSocket (RFC 6455) ---------------- */
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const wsAccept = key => crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');
function wsEncode(str) {
  const p = Buffer.from(str, 'utf8'), len = p.length;
  let h;
  if (len < 126) h = Buffer.from([0x81, len]);
  else if (len < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(len, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([h, p]);
}
function makeDecoder(onMessage, onClose) {
  let buf = Buffer.alloc(0);
  return chunk => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const opcode = buf[0] & 0x0f, masked = !!(buf[1] & 0x80);
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const ml = masked ? 4 : 0;
      if (buf.length < off + ml + len) return;
      let pay = buf.slice(off + ml, off + ml + len);
      if (masked) { const mask = buf.slice(off, off + 4); pay = Buffer.from(pay.map((b, i) => b ^ mask[i % 4])); }
      buf = buf.slice(off + ml + len);
      if (opcode === 0x8) { onClose(); return; }
      if (opcode === 0x9) continue;
      if (opcode === 0x1) onMessage(pay.toString('utf8'));
    }
  };
}
function send(sock, obj) { if (sock && !sock.destroyed) sock.write(wsEncode(JSON.stringify(obj))); }

/* ---------------- Masalar ---------------- */
/* seat: null | { userId, sock|null, gone:bool, left:bool } | { bot:true, name } */
const TABLES = new Map();
let tableSeq = 0;

function newTable(stake, rounds) {
  const tb = {
    id: 'm' + (++tableSeq) + '-' + crypto.randomBytes(2).toString('hex'),
    stake, rounds: rounds || 1,
    seats: [null, null, null, null],
    state: 'waiting', g: null,
    fillT: null, turnT: null, deadline: 0,
  };
  TABLES.set(tb.id, tb);
  tb.fillT = setTimeout(() => fillAndStart(tb), FILL_MS);
  return tb;
}
function humanSeats(tb) { return tb.seats.filter(s => s && s.userId); }
function seatName(tb, i) {
  const s = tb.seats[i];
  if (!s) return '—';
  if (s.bot) return s.name;
  return DB.users[s.userId].name;
}
function isBotTurnSeat(tb, i) {
  const s = tb.seats[i];
  return !s || s.bot || s.left || s.gone; // kopan/ayrılan oyuncuyu bot devralır
}

function joinTable(client, stake, rounds) {
  const u = DB.users[client.userId];
  if (u.tableId && TABLES.has(u.tableId)) return sendErr(client, 'Zaten bir masadasın.');
  if (u.chips < stake) return sendErr(client, 'Yetersiz bakiye.');
  let tb = [...TABLES.values()].find(t => t.state === 'waiting' && t.stake === stake && t.seats.some(s => !s));
  if (!tb) tb = newTable(stake, rounds);
  const seat = tb.seats.findIndex(s => !s);
  tb.seats[seat] = { userId: u.id, sock: client.sock, gone: false, left: false };
  u.tableId = tb.id;
  client.tableId = tb.id;
  client.seat = seat;
  saveSoon();
  send(client.sock, { t: 'joined', tableId: tb.id, seat, stake: tb.stake });
  broadcastWaiting(tb);
  if (humanSeats(tb).length === 4) startTable(tb);
}
function broadcastWaiting(tb) {
  if (tb.state !== 'waiting') return;
  const names = tb.seats.map((s, i) => s ? seatName(tb, i) : null);
  forEachHuman(tb, (s, i) => send(s.sock, { t: 'waiting', names, you: i }));
}
function fillAndStart(tb) {
  if (tb.state !== 'waiting') return;
  if (!humanSeats(tb).length) { TABLES.delete(tb.id); return; } // boş masa çöpe
  const used = new Set(tb.seats.filter(s => s && s.bot).map(s => s.name));
  for (let i = 0; i < 4; i++) {
    if (!tb.seats[i]) {
      const name = BOT_POOL.find(n => !used.has(n)) || 'Bot' + i;
      used.add(name);
      tb.seats[i] = { bot: true, name };
    }
  }
  startTable(tb);
}
function startTable(tb) {
  clearTimeout(tb.fillT);
  if (tb.state !== 'waiting') return;
  // bahis escrow: masaya oturan her insanın bahsi cüzdanından kilitlenir
  for (let i = 0; i < 4; i++) {
    const s = tb.seats[i];
    if (s && s.userId && !tx(s.userId, -tb.stake, 'stake', tb.id)) {
      // ödeyemedi (teoride join'de elendi): koltuğu bota çevir
      DB.users[s.userId].tableId = null;
      tb.seats[i] = { bot: true, name: 'Bot' + i };
    }
  }
  tb.state = 'playing';
  tb.g = E.newGame({ names: tb.seats.map((s, i) => seatName(tb, i)), rounds: tb.rounds, katlamali: true });
  E.startRound(tb.g);
  broadcastState(tb);
  scheduleTurn(tb);
}

/* ---- görüş (view): her oyuncu SADECE kendi elini görür ---- */
function viewFor(tb, seat) {
  const g = tb.g;
  return {
    tableId: tb.id, seat, stake: tb.stake, pot: tb.stake * 4,
    round: g.round, rounds: g.rounds, turn: g.turn,
    hasDrawn: g.hasDrawn, roundOver: !!g.roundOver,
    okey: g.okey, indicator: g.indicator, deck: g.deck.length,
    discards: g.discards, tableMelds: g.tableMelds,
    hand: g.players[seat].hand,
    tookDiscard: g.players[seat].tookDiscard,
    canUndo: !!(g.lastOpen && g.lastOpen.player === seat),
    players: g.players.map((p, i) => ({
      name: p.name, count: p.hand.length,
      opened: p.opened, openType: p.openType, openPoints: p.openPoints || 0,
      penalty: p.penalty || 0, score: p.score,
      isBot: !tb.seats[i] || !!tb.seats[i].bot,
      connected: !!(tb.seats[i] && tb.seats[i].sock && !tb.seats[i].sock.destroyed),
    })),
    deadline: tb.deadline, katlamali: g.katlamali !== false, carpan: g.carpan || 1,
  };
}
function forEachHuman(tb, fn) {
  tb.seats.forEach((s, i) => { if (s && s.userId && s.sock && !s.gone) fn(s, i); });
}
function broadcastState(tb) {
  forEachHuman(tb, (s, i) => send(s.sock, { t: 'state', v: viewFor(tb, i) }));
}
/* olaylar (animasyon için): başkasının ÇEKTİĞİ taş gizlenir */
function broadcastEvents(tb, seat, events) {
  if (!events || !events.length) return;
  forEachHuman(tb, (s, i) => {
    const evs = events.map(e => (e.type === 'draw' && i !== seat) ? { type: 'draw', player: e.player } : e);
    send(s.sock, { t: 'ev', seat, events: evs });
  });
}

/* ---- tur akışı ---- */
function scheduleTurn(tb) {
  clearTimeout(tb.turnT);
  const g = tb.g;
  if (!g || g.roundOver || tb.state !== 'playing') return;
  if (isBotTurnSeat(tb, g.turn)) {
    tb.deadline = 0;
    tb.turnT = setTimeout(() => botMove(tb), BOT_MS);
  } else {
    tb.deadline = Date.now() + TURN_MS;
    tb.turnT = setTimeout(() => timeoutPlay(tb), TURN_MS + 500);
    broadcastState(tb); // deadline herkese gitsin (süre barları)
  }
}
function botMove(tb) {
  const g = tb.g;
  if (!g || g.roundOver || tb.state !== 'playing') return;
  const seat = g.turn;
  const events = E.aiTakeTurn(g);
  broadcastEvents(tb, seat, events);
  afterAction(tb);
}
function timeoutPlay(tb) {
  const g = tb.g;
  if (!g || g.roundOver || tb.state !== 'playing' || isBotTurnSeat(tb, g.turn)) return;
  const p = g.players[g.turn];
  if (p.tookDiscard != null) E.returnDiscard(g);
  if (!g.hasDrawn) {
    if (g.deck.length === 0) { E.endRound(g); return afterAction(tb); }
    E.drawFromDeck(g);
  }
  const d = E.aiChooseDiscard(g, p);
  if (d) E.discardTile(g, d);
  const s = tb.seats[g.roundOver ? g.turn : (g.turn + 3) % 4];
  forEachHuman(tb, (h, i) => send(h.sock, { t: 'timeout', seat: (g.turn + 3) % 4 }));
  afterAction(tb);
}
function afterAction(tb) {
  const g = tb.g;
  broadcastState(tb);
  if (g.roundOver) return roundFlow(tb);
  scheduleTurn(tb);
}
function roundFlow(tb) {
  clearTimeout(tb.turnT);
  tb.deadline = 0;
  const g = tb.g;
  const summary = {
    finisher: g.finisher, eldenBitti: !!g.eldenBitti, withOkey: !!g.finishedWithOkey,
    cancelled: !!g.cancelled,
    rows: g.players.map((p, i) => ({ seat: i, name: p.name, roundScore: p.roundScore, score: p.score })),
    penalties: (g.penaltyLog || []).map(e => ({ seat: e.player, amount: e.amount })),
  };
  forEachHuman(tb, s => send(s.sock, { t: 'roundEnd', s: summary }));
  if (g.cancelled) { // dört çift açışı: el sayılmaz, tekrar
    setTimeout(() => {
      g.round--; g.cancelled = false;
      E.startRound(g);
      broadcastState(tb);
      scheduleTurn(tb);
    }, ROUND_BREAK);
    return;
  }
  if (g.round >= g.rounds) return settle(tb);
  setTimeout(() => {
    E.startRound(g);
    broadcastState(tb);
    scheduleTurn(tb);
  }, ROUND_BREAK);
}
/* ---- oyun sonu: dağıtım (klasik): 1. → 3×bahis, 2. → bahsi, 3-4. → 0; tek açan → 4×bahis ---- */
function settle(tb) {
  tb.state = 'done';
  const g = tb.g;
  const order = g.players.map((p, i) => ({ p, i })).sort((a, b) => a.p.score - b.p.score);
  const sweep = g.soloOpen === order[0].i;
  const recMul = sweep ? [4, 0, 0, 0] : [3, 1, 0, 0];
  const rows = order.map((o, rank) => {
    const receive = recMul[rank] * tb.stake;
    const s = tb.seats[o.i];
    if (s && s.userId) {
      if (receive > 0) tx(s.userId, receive, 'win', tb.id);
      const u = DB.users[s.userId];
      u.games++; if (rank === 0) u.wins++;
      u.xp += g.rounds * 25 + [100, 50, 20, 10][rank];
      // kopuk oyuncunun tableId'si KALIR: dönünce finali teslim alır
      if (!s.gone) u.tableId = null;
    }
    return { rank: rank + 1, seat: o.i, name: o.p.name, score: o.p.score, receive };
  });
  tb.finalPayload = { sweep, rows }; // geç dönenler için saklanır
  saveSoon();
  forEachHuman(tb, (s, i) => send(s.sock, { t: 'final', sweep, rows, me: pubUser(DB.users[s.userId]) }));
  setTimeout(() => TABLES.delete(tb.id), 60000);
}

/* ---- oyuncu aksiyonları (tek otorite: engine) ---- */
function handleAction(client, m) {
  const tb = TABLES.get(client.tableId);
  if (!tb || tb.state !== 'playing') return sendErr(client, 'Aktif masa yok.');
  const g = tb.g, seat = client.seat;
  if (g.roundOver) return sendErr(client, 'El bitti.');
  if (g.turn !== seat) return sendErr(client, 'Sıra sende değil.');
  const hand = g.players[seat].hand;
  const findT = id => hand.find(t => t.id === id);
  let r = { ok: false, err: 'Bilinmeyen hamle.' };
  let evs = null;
  switch (m.a) {
    case 'draw': {
      if (g.deck.length === 0) { E.endRound(g); return afterAction(tb); }
      const t0 = E.drawFromDeck(g);
      r = t0 ? { ok: true } : { ok: false, err: 'Çekilemedi.' };
      if (r.ok) evs = [{ type: 'draw', player: seat, tile: t0 }];
      break;
    }
    case 'take': {
      const t0 = E.takeDiscard(g);
      r = t0 ? { ok: true } : { ok: false, err: 'Alınacak taş yok.' };
      if (r.ok) evs = [{ type: 'take', player: seat, tile: t0 }];
      break;
    }
    case 'return': r = E.returnDiscard(g) ? { ok: true } : { ok: false, err: 'Geri verilecek taş yok.' }; break;
    case 'discard': {
      const t0 = findT(m.id);
      if (!t0) return sendErr(client, 'Taş elinde değil.');
      r = E.discardTile(g, t0);
      if (r.ok) evs = [{ type: 'discard', player: seat, tile: t0, penalty: !!r.penalty, finished: !!r.finished }];
      break;
    }
    case 'open': {
      const melds = (m.melds || []).map(ids => ids.map(findT));
      if (melds.some(mm => mm.some(t => !t))) return sendErr(client, 'Taşlar elinde değil.');
      r = E.openHand(g, melds, m.mode === 'pairs' ? 'pairs' : 'normal');
      if (r.ok) {
        evs = [{ type: m.mode === 'pairs' ? 'openPairs' : 'open', player: seat, melds }];
        if (m.mode === 'pairs' && E.checkAllPairsCancel(g)) { broadcastEvents(tb, seat, evs); return afterAction(tb); }
        tb.deadline = Date.now() + OPEN_MS; // açış turu: işleme süresi
        clearTimeout(tb.turnT);
        tb.turnT = setTimeout(() => timeoutPlay(tb), OPEN_MS + 500);
      }
      break;
    }
    case 'lay': {
      const tiles = (m.ids || []).map(findT);
      if (tiles.some(t => !t)) return sendErr(client, 'Taşlar elinde değil.');
      r = E.layMeld(g, tiles);
      if (r.ok) evs = [{ type: 'lay', player: seat, tiles }];
      break;
    }
    case 'layPair': {
      const tiles = (m.ids || []).map(findT);
      if (tiles.some(t => !t)) return sendErr(client, 'Taşlar elinde değil.');
      r = E.layPair(g, tiles);
      if (r.ok) evs = [{ type: 'layPair', player: seat, tiles }];
      break;
    }
    case 'attach': {
      const t0 = findT(m.id);
      if (!t0) return sendErr(client, 'Taş elinde değil.');
      r = E.attachTile(g, t0, m.mi);
      if (r.ok) evs = [{ type: 'attach', player: seat, tile: t0, meld: m.mi }];
      break;
    }
    case 'swap': {
      const t0 = findT(m.id);
      if (!t0) return sendErr(client, 'Taş elinde değil.');
      r = E.swapForOkey(g, t0, m.mi);
      if (r.ok) evs = [{ type: 'swap', player: seat, meld: m.mi }];
      break;
    }
    case 'undo': r = E.undoOpen(g); break;
  }
  if (!r.ok) return sendErr(client, r.err || 'Hamle geçersiz.');
  // işlem yapan insana ek süre: 30 sn baştan (açış turu 60 sn zaten kurulu)
  if (['lay', 'layPair', 'attach', 'swap'].includes(m.a) && tb.deadline) {
    tb.deadline = Date.now() + TURN_MS;
    clearTimeout(tb.turnT);
    tb.turnT = setTimeout(() => timeoutPlay(tb), TURN_MS + 500);
  }
  if (evs) broadcastEvents(tb, seat, evs);
  afterAction(tb);
}

function sendErr(client, msg) { send(client.sock, { t: 'err', msg }); }

/* ---- kopma / yeniden bağlanma / ayrılma ---- */
function onDisconnect(client) {
  const tb = TABLES.get(client.tableId);
  if (!tb) return;
  const s = tb.seats[client.seat];
  if (s && s.userId === client.userId) {
    s.sock = null;
    s.gone = true; // sırası gelirse bot devralır; dönerse kaldığı yerden devam
    if (tb.state === 'playing' && tb.g && tb.g.turn === client.seat) scheduleTurn(tb);
  }
}
function reattach(client, u) {
  const tb = TABLES.get(u.tableId);
  if (tb && tb.state === 'done' && tb.finalPayload) {
    // sen yokken oyun bitti: finali şimdi teslim et
    send(client.sock, { t: 'final', sweep: tb.finalPayload.sweep, rows: tb.finalPayload.rows, me: pubUser(u), late: true });
    u.tableId = null;
    saveSoon();
    return null;
  }
  if (!tb || tb.state === 'done') { u.tableId = null; return null; }
  const seat = tb.seats.findIndex(s => s && s.userId === u.id);
  if (seat < 0) { u.tableId = null; return null; }
  const s = tb.seats[seat];
  s.sock = client.sock;
  s.gone = false;
  client.tableId = tb.id;
  client.seat = seat;
  if (tb.state === 'playing') {
    send(client.sock, { t: 'joined', tableId: tb.id, seat, stake: tb.stake, resumed: true });
    send(client.sock, { t: 'state', v: viewFor(tb, seat) });
    if (tb.g.turn === seat && !tb.g.roundOver) scheduleTurn(tb);
  } else broadcastWaiting(tb);
  return tb;
}
function leaveTable(client) {
  const tb = TABLES.get(client.tableId);
  if (!tb) return;
  const s = tb.seats[client.seat];
  if (!s || s.userId !== client.userId) return;
  const u = DB.users[client.userId];
  u.tableId = null;
  saveSoon();
  if (tb.state === 'waiting') {
    tb.seats[client.seat] = null;
    broadcastWaiting(tb);
    if (!humanSeats(tb).length) { clearTimeout(tb.fillT); TABLES.delete(tb.id); }
  } else if (tb.state === 'playing') {
    // bahis zaten escrow'da — geri verilmez; koltuğu kalıcı bot devralır
    tb.seats[client.seat] = { bot: true, name: tb.g.players[client.seat].name };
    if (tb.g.turn === client.seat) scheduleTurn(tb);
    if (!humanSeats(tb).length) { clearTimeout(tb.turnT); tb.state = 'done'; TABLES.delete(tb.id); }
  }
  client.tableId = null;
  client.seat = -1;
  send(client.sock, { t: 'left' });
}

/* ---------------- Mesaj yönlendirici ---------------- */
function handleMessage(client, raw) {
  if (raw.length > 16384) return;
  let m;
  try { m = JSON.parse(raw); } catch (e) { return; }
  // basit hız sınırı: saniyede 20 mesaj
  const now = Date.now();
  if (now - client.rlT > 1000) { client.rlT = now; client.rlN = 0; }
  if (++client.rlN > 20) return;

  if (m.t === 'hello') {
    let u = null;
    if (m.token && DB.tokens[m.token]) u = DB.users[DB.tokens[m.token]];
    if (!u && m.deviceId) u = getOrCreateUser(String(m.deviceId).slice(0, 64), m.name);
    if (!u) return sendErr(client, 'Kimlik yok.');
    client.userId = u.id;
    const token = m.token && DB.tokens[m.token] === u.id ? m.token : issueToken(u.id);
    send(client.sock, { t: 'welcome', token, user: pubUser(u) });
    if (u.tableId) reattach(client, u); // koptuysan masana geri dön
    return;
  }
  if (!client.userId) return sendErr(client, 'Önce hello.');
  switch (m.t) {
    case 'me': send(client.sock, { t: 'me', user: pubUser(DB.users[client.userId]) }); break;
    case 'join': joinTable(client, Math.max(100, Math.floor(+m.stake || 1000)), Math.min(5, Math.max(1, +m.rounds || 1))); break;
    case 'fill': { const tb = TABLES.get(client.tableId); if (tb && tb.state === 'waiting') fillAndStart(tb); break; }
    case 'act': handleAction(client, m); break;
    case 'chat': {
      const tb = TABLES.get(client.tableId);
      if (!tb) break;
      const text = String(m.text || '').slice(0, 120);
      if (!text) break;
      forEachHuman(tb, s => send(s.sock, { t: 'chat', seat: client.seat, from: DB.users[client.userId].name, text }));
      break;
    }
    case 'leave': leaveTable(client); break;
    case 'ping': send(client.sock, { t: 'pong' }); break;
  }
}

/* ---------------- HTTP + upgrade ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const ROOT = path.join(__dirname, '..');
const server = http.createServer((req, res) => {
  let file = req.url.split('?')[0];
  if (file === '/health') { res.writeHead(200); res.end('ok'); return; }
  if (file === '/') file = '/okey101.html';
  const p = path.join(ROOT, path.normalize(file).replace(/^([.][.][/\\])+/, ''));
  if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('bulunamadı'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return; }
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + wsAccept(key) + '\r\n\r\n');
  const client = { sock, userId: null, tableId: null, seat: -1, rlT: 0, rlN: 0 };
  const bye = () => { onDisconnect(client); try { sock.destroy(); } catch (e) {} };
  sock.on('data', makeDecoder(msg => handleMessage(client, msg), bye));
  sock.on('close', () => onDisconnect(client));
  sock.on('error', bye);
});
server.listen(PORT, () => {
  console.log('101 Okey FAZ A sunucusu ayakta: http://localhost:' + PORT + (FAST ? '  [HIZLI TEST MODU]' : ''));
});
