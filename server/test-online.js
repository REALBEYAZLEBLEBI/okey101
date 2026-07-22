/* =========================================================
   FAZ A uçtan uca test: 4 GERÇEK istemci, gerçek soketler.
   Doğrulananlar:
   1) kimlik + hoşgeldin bakiyesi + token
   2) eşleştirme: 4 istemci aynı masada
   3) sanitizasyon: kimse başkasının elini GÖREMEZ
   4) sunucu-otoriter oyun: eller sunucuda oynanır, hile denemesi reddedilir
   5) escrow + dağıtım: cüzdanlar ledger'la tutarlı, havuz tam dağıtılır
   Çalıştırma:  node test-online.js
   ========================================================= */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { connect } = require('./ws-client.js');

const PORT = 8199;
const STAKE = 1000;
const DATA = path.join(__dirname, 'test-data.json');
try { fs.unlinkSync(DATA); } catch (e) {}

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; } else { fail++; console.log('FAIL:', msg); } };

const srv = spawn(process.execPath, [path.join(__dirname, 'okey-server.js'), String(PORT)], {
  env: Object.assign({}, process.env, { OKEY_FAST: '1', OKEY_DATA: DATA }),
  stdio: ['ignore', 'pipe', 'inherit'],
});
srv.stdout.on('data', () => {});

const clients = [];
let finals = 0, sawOtherHand = false, cheatRejected = false, welcomeChips = [];
const finalMe = {};

function makeClient(n) {
  const st = { n, seat: -1, view: null, token: null, user: null, acted: false };
  const api = connect('127.0.0.1', PORT, (m, api) => {
    if (m.t === 'welcome') {
      st.token = m.token; st.user = m.user;
      welcomeChips.push(m.user.chips);
      api.send({ t: 'join', stake: STAKE, rounds: 1 });
    }
    if (m.t === 'state') {
      st.seat = m.v.seat;
      st.view = m.v;
      // sanitizasyon: players[] içinde el (hand) sızıyor mu?
      if (m.v.players.some(p => p.hand)) sawOtherHand = true;
      maybeAct(st, api);
    }
    if (m.t === 'err' && st.cheatTried) cheatRejected = true;
    if (m.t === 'final') {
      finals++;
      st.final = m;
      finalMe[st.n] = m.me;
      if (finals === 4) setTimeout(finish, 300);
    }
  }, api => api.send({ t: 'hello', deviceId: 'test-dev-' + n, name: 'Test' + n }));
  st.api = api;
  clients.push(st);
}

function maybeAct(st, api) {
  const v = st.view;
  if (!v || v.roundOver || v.turn !== v.seat) return;
  if (st.pending) return;
  st.pending = true;
  setTimeout(() => {
    st.pending = false;
    const vv = st.view;
    if (!vv || vv.roundOver || vv.turn !== vv.seat) return;
    if (!vv.hasDrawn) {
      // bir kez hile dene: elinde OLMAYAN taşı atmayı iste (sunucu reddetmeli)
      if (!st.cheatTried) {
        st.cheatTried = true;
        api.send({ t: 'act', a: 'discard', id: 999999 });
      }
      api.send({ t: 'act', a: 'draw' });
    } else {
      const t = vv.hand[Math.floor(Math.random() * vv.hand.length)];
      api.send({ t: 'act', a: 'discard', id: t.id });
    }
  }, 15);
}

setTimeout(() => { for (let i = 0; i < 4; i++) makeClient(i); }, 700);

function finish() {
  // cüzdan mutabakatı
  ok(welcomeChips.every(c => c === 100000), 'hoşgeldin bakiyesi 100.000: ' + welcomeChips);
  ok(!sawOtherHand, 'sanitizasyon: başkasının eli görünmüyor');
  ok(cheatRejected, 'hile denemesi (elinde olmayan taş) reddedildi');
  const c0 = clients[0].final;
  ok(c0 && c0.rows.length === 4, 'final 4 satır');
  const totalReceive = c0.rows.reduce((s, r) => s + r.receive, 0);
  ok(totalReceive === STAKE * 4, 'havuz tam dağıtıldı: ' + totalReceive + ' / ' + STAKE * 4);
  // her istemcinin bakiyesi = 100000 - stake + receive
  let walletOk = true;
  for (const st of clients) {
    const row = c0.rows.find(r => r.seat === st.seat);
    const expect = 100000 - STAKE + row.receive;
    if (finalMe[st.n].chips !== expect) { walletOk = false; console.log('cüzdan?', st.n, finalMe[st.n].chips, 'beklenen', expect); }
  }
  ok(walletOk, 'cüzdanlar escrow+dağıtımla birebir tutarlı');
  // ledger denetimi
  const db = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const stakes = db.ledger.filter(l => l.reason === 'stake');
  const wins = db.ledger.filter(l => l.reason === 'win');
  ok(stakes.length === 4, 'ledger: 4 stake kaydı');
  ok(wins.reduce((s, l) => s + l.delta, 0) === STAKE * 4, 'ledger: win toplamı = havuz');
  ok(db.ledger.every(l => typeof l.bal === 'number'), 'ledger: her satırda bakiye izi');
  console.log('\n' + pass + ' geçti, ' + fail + ' kaldı');
  for (const st of clients) st.api.close();
  srv.kill();
  process.exit(fail ? 1 : 0);
}

setTimeout(() => { console.log('ZAMAN AŞIMI — final gelmedi (finals=' + finals + ')'); srv.kill(); process.exit(1); }, 60000);
