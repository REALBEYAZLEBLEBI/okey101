/* FAZ C testi: günlük bonus + seri, görevler, sıralama, kalıcılık (dosya) */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { connect } = require('./ws-client.js');
const PORT = 8197, DATA = path.join(__dirname, 'test-data3.json');
try { fs.unlinkSync(DATA); } catch (e) {}
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL:', msg); } };
const srv = spawn(process.execPath, [path.join(__dirname, 'okey-server.js'), String(PORT)], {
  env: Object.assign({}, process.env, { OKEY_FAST: '1', OKEY_DATA: DATA }), stdio: ['ignore', 'ignore', 'inherit'],
});
let step = 0, u0 = null, final = null;
setTimeout(() => {
  const st = { view: null };
  const api = connect('127.0.0.1', PORT, (m, api) => {
    if (m.t === 'welcome') {
      u0 = m.user;
      ok(u0.daily && u0.daily.can === true, 'günlük bonus alınabilir');
      ok(Array.isArray(u0.tasks) && u0.tasks.length === 3, '3 günlük görev geldi');
      api.send({ t: 'daily' });
    }
    if (m.t === 'daily' && m.ok) {
      ok(m.reward === 5000 && m.streak === 1, 'ilk gün bonusu 5000, seri 1');
      ok(m.user.chips === 105000, 'bonus cüzdana işledi: ' + m.user.chips);
      api.send({ t: 'daily' }); // ikinci talep reddedilmeli
      step = 1;
    }
    if (m.t === 'err' && step === 1) {
      ok(true, 'aynı gün ikinci bonus reddedildi');
      step = 2;
      api.send({ t: 'join', stake: 1000, rounds: 1 });
    }
    if (m.t === 'joined') api.send({ t: 'fill' });
    if (m.t === 'state') {
      st.view = m.v;
      const v = m.v;
      if (!v.roundOver && v.turn === v.seat && !st.p) {
        st.p = true;
        setTimeout(() => {
          st.p = false;
          const vv = st.view;
          if (!vv || vv.roundOver || vv.turn !== vv.seat) return;
          if (!vv.hasDrawn) api.send({ t: 'act', a: 'draw' });
          else api.send({ t: 'act', a: 'discard', id: vv.hand[0].id });
        }, 12);
      }
    }
    if (m.t === 'final') {
      final = m;
      const el3 = m.me.tasks.find(t => t.id === 'el3');
      ok(el3 && el3.prog >= 1, 'görev ilerlemesi işlendi (el3: ' + (el3 && el3.prog) + ')');
      api.send({ t: 'top' });
    }
    if (m.t === 'top') {
      ok(m.rows.length >= 1 && m.myRank >= 1, 'sıralama: ' + m.rows.length + ' satır, sıram #' + m.myRank);
      // kalıcılık: dosya var ve bonus ledger'da
      setTimeout(() => {
        const db = JSON.parse(fs.readFileSync(DATA, 'utf8'));
        ok(db.ledger.some(l => l.reason === 'bonus' && l.delta === 5000), 'ledger: günlük bonus kaydı');
        const uu = Object.values(db.users)[0];
        ok(uu.streak === 1 && uu.dailyDay > 0, 'kalıcı: seri ve gün kaydedildi');
        console.log('\n' + pass + ' geçti, ' + fail + ' kaldı');
        srv.kill(); process.exit(fail ? 1 : 0);
      }, 300);
    }
  }, api => api.send({ t: 'hello', deviceId: 'c3-dev', name: 'C3' }));
}, 700);
setTimeout(() => { console.log('ZAMAN AŞIMI'); srv.kill(); process.exit(1); }, 60000);
