/* FAZ A test 2: tek insan + bot doldurma + kopma/yeniden bağlanma.
   1) 1 istemci masaya oturur, 'fill' → 3 bot, oyun başlar
   2) oyun ortasında bağlantı KOPARILIR (token elde)
   3) token ile yeniden bağlanır → aynı koltuğa 'resumed' dönmeli
   4) oyun finale kadar oynanır, cüzdan escrow+dağıtımla tutarlı olmalı */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { connect } = require('./ws-client.js');

const PORT = 8198;
const STAKE = 500;
const DATA = path.join(__dirname, 'test-data2.json');
try { fs.unlinkSync(DATA); } catch (e) {}

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL:', msg); } };

const srv = spawn(process.execPath, [path.join(__dirname, 'okey-server.js'), String(PORT)], {
  env: Object.assign({}, process.env, { OKEY_FAST: '1', OKEY_DATA: DATA, OKEY_BOT_MS: '250' }),
  stdio: ['ignore', 'ignore', 'inherit'],
});

let token = null, seat0 = -1, dropped = false, resumed = false, final = null, meAfter = null;
let turnsPlayed = 0;

function autoPlay(st, api) {
  const v = st.view;
  if (!v || v.roundOver || v.turn !== v.seat || st.pending) return;
  st.pending = true;
  setTimeout(() => {
    st.pending = false;
    const vv = st.view;
    if (!vv || vv.roundOver || vv.turn !== vv.seat) return;
    if (!vv.hasDrawn) api.send({ t: 'act', a: 'draw' });
    else {
      api.send({ t: 'act', a: 'discard', id: vv.hand[0].id });
      turnsPlayed++;
      if (turnsPlayed === 3 && !dropped) { dropped = true; setTimeout(() => api.sock.destroy(), 10); setTimeout(reconnect, 400); }
    }
  }, 12);
}

function phase1() {
  const st = { view: null };
  const api = connect('127.0.0.1', PORT, (m, api) => {
    if (m.t === 'welcome') { token = m.token; api.send({ t: 'join', stake: STAKE, rounds: 1 }); }
    if (m.t === 'joined') { seat0 = m.seat; api.send({ t: 'fill' }); }
    if (m.t === 'state') { st.view = m.v; autoPlay(st, api); }
  }, api => api.send({ t: 'hello', deviceId: 'solo-dev', name: 'Solo' }));
}

function reconnect() {
  const st = { view: null };
  const api = connect('127.0.0.1', PORT, (m, api) => {
    if (m.t === 'joined' && m.resumed) { resumed = true; ok(m.seat === seat0, 'aynı koltuğa dönüldü'); }
    if (m.t === 'state') { st.view = m.v; autoPlay(st, api); }
    if (m.t === 'final') {
      final = m; meAfter = m.me;
      setTimeout(finish, 250);
    }
  }, api => api.send({ t: 'hello', token }));
  setTimeout(() => { if (!final) { console.log('ZAMAN AŞIMI (final yok)'); finish(); } }, 45000);
}

function finish() {
  ok(resumed, 'kopma sonrası token ile aynı masaya dönüldü (resumed)');
  ok(!!final, 'oyun finale ulaştı');
  if (final) {
    const myRow = final.rows.find(r => r.seat === seat0);
    ok(meAfter.chips === 100000 - STAKE + myRow.receive, 'cüzdan: 100000 - bahis + alınan = ' + meAfter.chips);
    ok(final.rows.reduce((s, r) => s + r.receive, 0) === STAKE * 4, 'havuz tam dağıtıldı');
  }
  const db = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  ok(db.ledger.filter(l => l.reason === 'stake').length === 1, 'ledger: tek insan → tek stake kaydı');
  console.log('\n' + pass + ' geçti, ' + fail + ' kaldı');
  srv.kill();
  process.exit(fail ? 1 : 0);
}

setTimeout(phase1, 700);
setTimeout(() => { console.log('GENEL ZAMAN AŞIMI'); srv.kill(); process.exit(1); }, 60000);
