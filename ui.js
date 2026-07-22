/* =========================================================
   OKEY 101 — Kullanıcı Arayüzü (UI) v8
   - Çip + seviye + lobi sistemi (v1)
   - Tur zamanlayıcısı (30/20/5 sn, açınca 60 sn)
   - Hassas sürükleme (hayalet-merkezli hedefleme)
   - Okey ters çevirme (kapalı taş), gerçek taşla okey değişimi
   ========================================================= */
'use strict';
(function () {
const E = (typeof Engine !== 'undefined') ? Engine : window.Engine;
const $ = (id) => document.getElementById(id);

const BOT_NAMES = ['Elif', 'Burak', 'Zeynep'];
const BOT_AVAS = ['👩🏻', '🧔🏻', '👩🏻‍🦱'];
const COLOR_TR = ['Kırmızı', 'Sarı', 'Mavi', 'Siyah'];

const RACK_SLOTS = 32;
const RACK_COLS = 16;
const HOLD_MS = 430;

/* ---------------- guarded persistence (falls back to memory) ---------------- */
const store = (() => {
  let mem = {};
  let ls = null;
  try { ls = window.localStorage; ls.getItem('__probe'); } catch (e) { ls = null; }
  return {
    get(k, d) {
      try { const v = ls ? ls.getItem(k) : mem[k]; return v == null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set(k, v) {
      try { const s = JSON.stringify(v); if (ls) ls.setItem(k, s); else mem[k] = s; }
      catch (e) { try { mem[k] = JSON.stringify(v); } catch (e2) {} }
    },
  };
})();

/* ---------------- chips + level meta + rooms ---------------- */
/* 9 oda: çip aralığı büyüdükçe girilebilirlik zorlaşır */
const ROOMS = [
  { id: 'cirak',    name: 'ÇIRAK KAHVESİ',        ico: '☕', min: 500,      max: 2500,      giris: 0,         tavan: 100000 },
  { id: 'mahalle',  name: 'MAHALLE KIRAATHANESİ', ico: '🏘️', min: 1000,    max: 10000,     giris: 5000,      tavan: 500000 },
  { id: 'sahil',    name: 'SAHİL ÇAY BAHÇESİ',    ico: '🌊', min: 5000,     max: 50000,     giris: 25000,     tavan: 2500000 },
  { id: 'bogaz',    name: 'BOĞAZ KEYFİ',          ico: '🌉', min: 25000,    max: 250000,    giris: 100000,    tavan: 10000000 },
  { id: 'ustalar',  name: 'TAŞ USTALARI',         ico: '🎯', min: 100000,   max: 1000000,   giris: 500000,    tavan: 50000000 },
  { id: 'gosterge', name: 'ALTIN GÖSTERGE',       ico: '<span class="coin">M</span>', min: 500000,   max: 5000000,   giris: 2000000,   tavan: 250000000 },
  { id: 'pasa',     name: 'PAŞA KONAĞI',          ico: '🎩', min: 2000000,  max: 20000000,  giris: 10000000,  tavan: 1000000000 },
  { id: 'sultan',   name: 'SULTAN SARAYI',        ico: '👑', min: 10000000, max: 100000000, giris: 50000000,  tavan: 0 },
  { id: 'olimpos',  name: 'OKEY OLİMPOSU',        ico: '⚡', min: 50000000, max: 500000000, giris: 250000000, tavan: 0 },
]; // tavan: bakiyesi bunu aşan oyuncu bu odaya giremez (0 = sınırsız)
const EL_OPTS = [1, 2, 3, 4, 5];
const BOT_POOL = ['Elif', 'Burak', 'Zeynep', 'Ayşe', 'Kemal', 'Deniz', 'Murat', 'Selin', 'Emre', 'Fatma', 'Ali', 'Ceren'];
let meta = store.get('okey101_meta', { chips: 25000, xp: 0 });
function saveMeta() { store.set('okey101_meta', meta); }
/* tek seferlik test hediyesi + profil verileri */
meta.stats = meta.stats || { games: 0, wins: 0, elden: 0 };
meta.tasks = meta.tasks || {};
if (!meta.start) { const d = new Date(); meta.start = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear(); }
if (!store.get('okey101_bigift', false)) { meta.chips = Math.max(meta.chips, 999999999); store.set('okey101_bigift', true); }
saveMeta();
function levelOf(xp) { return 1 + Math.floor(xp / 250); }
function fmtChips(n) { return n.toLocaleString('tr-TR'); }
let settings = Object.assign(
  { room: 'caylaklar', bahis: 1000, el: 5, yardimli: true, katlamali: true },
  store.get('okey101_settings', {})
);
let currentStake = 0;
let currentSettings = null;
/* genel ayarlar + hemen oyna tercihleri */
let prefs = Object.assign({ muzik: false, ses: true, titresim: true, arkadaslik: true, sohbet: true, davet: true, bildirim: false }, store.get('okey101_prefs', {}));
let qp = Object.assign({ el: 0, mod: 'any', yard: 'any', kat: 'any' }, store.get('okey101_qp', {})); // 0/'any' = farketmez
const GIFT_AMOUNT = 2500, GIFT_CD = 4 * 60 * 60 * 1000;
function fakeOnline(base) { return (base + Math.floor(Math.random() * base * 0.12)).toLocaleString('tr-TR'); }

let G = null;
let totalRounds = 5;
let rackSlots = new Array(RACK_SLOTS).fill(null);
let prevCornerTops = [null, null, null, null];
let seenPenalties = 0;
let ui = {
  sel: new Set(),
  busy: false,
  drawnId: null,
  hiddenOkeys: new Set(),   // okeyler ters çevrildi (kapalı)
  counterMode: 'seri',      // 'seri' | 'cift'
  timeouts: 0,              // AFK sayısı (el başına)
};

/* ---------------- tile DOM ---------------- */
function tileEl(t, opts = {}) {
  const d = document.createElement('div');
  d.className = 'tile' + (opts.mini ? ' mini' : '');
  if (t === 'back') { d.classList.add('back'); return d; }
  if (opts.facedown) { d.classList.add('facedown'); return d; }
  if (t.fake) {
    d.classList.add('fake');
    d.innerHTML = '<div class="n">★</div>';
  } else {
    d.classList.add('c' + t.color);
    d.innerHTML = '<div class="n">' + t.num + '</div><div class="dot"></div>';
    if (G && E.isOkeyTile(t, G.okey) && opts.badge) d.classList.add('okeybadge');
  }
  return d;
}
function tileName(t) {
  if (t.fake) return 'Sahte Okey ★';
  return COLOR_TR[t.color] + ' ' + t.num;
}
function isWild(t) { return E.effective(t, G.okey) === null; }

/* ---------------- main menu ---------------- */
function roomOf(id) { return ROOMS.find(r => r.id === id) || ROOMS[0]; }
function giftReady() { return Date.now() - store.get('okey101_gift', 0) > GIFT_CD; }
function giftLeftTxt() {
  const ms = GIFT_CD - (Date.now() - store.get('okey101_gift', 0));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h + 's ' + m + 'd';
}
function initStart() {
  const lv = levelOf(meta.xp);
  const prog = (meta.xp % 250) / 250;
  $('inp-name').value = store.get('okey101_name', 'Sen');
  $('lvl-line').innerHTML = '<span class="lvl">Sv ' + lv + '</span>' +
    '<div class="lvlbar"><div class="lvlfill" style="width:' + Math.round(prog * 100) + '%"></div></div>';
  $('chips-val').textContent = fmtChips(meta.chips);
  const gb = $('banner-gift');
  if (giftReady()) {
    gb.classList.add('ready');
    gb.innerHTML = '🎁 2.500 ÇİP<br><span>HEDİYE — TOPLA!</span>';
  } else {
    gb.classList.remove('ready');
    gb.innerHTML = '🎁 2.500 ÇİP<br><span>Kalan: ' + giftLeftTxt() + '</span>';
  }
  $('klasik-online').textContent = fakeOnline(4800) + ' oyuncu';
  const rizBahis = rizStake();
  $('riz-sub').innerHTML = 'Bahis: <span class="coin">M</span> ' + fmtChips(rizBahis) + ' · ⚡ çarpanlı · tek el';
  $('online-line').textContent = fakeOnline(70000) + ' Oyuncu Çevrimiçi';
}
function rizStake() {
  const raw = Math.round(meta.chips * 0.10 / 500) * 500;
  return Math.max(1000, Math.min(50000, Math.min(raw, meta.chips)));
}
$('inp-name').onchange = () => store.set('okey101_name', ($('inp-name').value || 'Sen').trim().slice(0, 12) || 'Sen');
$('btn-start').onclick = () => { // HEMEN OYNA: ayarlardaki tercihlerle (farketmez = rastgele)
  const cfg = Object.assign({}, settings);
  cfg.el = qp.el || 1 + Math.floor(Math.random() * 5);
  cfg.esli = qp.mod === 'any' ? Math.random() < 0.35 : qp.mod === 'esli';
  cfg.yardimli = qp.yard === 'any' ? Math.random() < 0.8 : qp.yard === 'yard';
  cfg.katlamali = qp.kat === 'any' ? Math.random() < 0.5 : qp.kat === 'kat';
  cfg.rizikolu = false;
  cfg.bahis = Math.min(Math.max(500, settings.bahis || 1000), meta.chips);
  launch(cfg);
};
$('btn-odasec').onclick = () => odaSecDialog(ROOMS.findIndex(r => r.id === settings.room));
$('btn-masaac').onclick = () => masaAcDialog(ROOMS.findIndex(r => r.id === settings.room));
$('btn-riz').onclick = () => rizDialog();
function rizDialog() {
  const maxB = Math.max(1000, Math.min(meta.chips, 250000));
  let bahis = Math.min(rizStake(), maxB);
  let kat = settings.katlamali, yard = settings.yardimli;
  modal('<h2>⚡ RİZİKOLU MASA</h2>' +
    '<div class="dlg-row"><span class="lbl">BAHİS</span><span class="val" id="rz-bval"><span class="coin">M</span> ' + fmtChips(bahis) + '</span></div>' +
    '<input type="range" class="bahis" id="rz-bahis" min="1000" max="' + maxB + '" step="1" value="' + bahis + '">' +
    '<div class="dlg-row"><span class="lbl">Katlamalı / Katlamasız</span><span class="dlg-toggle" id="rz-kat"></span></div>' +
    '<div class="dlg-row"><span class="lbl">Yardımlı / Yardımsız</span><span class="dlg-toggle" id="rz-yard"></span></div>' +
    '<p class="rules" style="font-size:12px">Okeyin sayısı, ★ ve okey masaya indikçe çarpan +1 · bitiş +1, elden +2, okeyle +4. Kazanan <b>bahis × çarpan</b> alır. Tek el oynanır.</p>' +
    '<div class="btnrow"><button class="btn secondary" id="rz-x">✕</button><button class="btn" id="rz-ok">⚡ KATIL</button></div>');
  const bval = $('rz-bval'), sl = $('rz-bahis');
  sl.oninput = () => { bahis = +sl.value; bval.innerHTML = '<span class="coin">M</span> ' + fmtChips(bahis); };
  const katBtn = $('rz-kat'), yardBtn = $('rz-yard');
  const drawT = () => {
    katBtn.textContent = kat ? 'KATLAMALI' : 'KATLAMASIZ';
    katBtn.className = 'dlg-toggle ' + (kat ? 'warn' : 'on');
    yardBtn.textContent = yard ? 'YARDIMLI' : 'YARDIMSIZ';
    yardBtn.className = 'dlg-toggle ' + (yard ? 'on' : 'warn');
  };
  katBtn.onclick = () => { kat = !kat; drawT(); };
  yardBtn.onclick = () => { yard = !yard; drawT(); };
  drawT();
  $('rz-x').onclick = closeModal;
  $('rz-ok').onclick = () => {
    closeModal();
    launch({ room: settings.room, bahis, el: 1, yardimli: yard, katlamali: kat, rizikolu: true });
  };
}
$('banner-gift').onclick = () => {
  if (!giftReady()) return;
  meta.chips += GIFT_AMOUNT;
  store.set('okey101_gift', Date.now());
  saveMeta();
  const gb = $('banner-gift');
  gb.innerHTML = '🎉 +' + fmtChips(GIFT_AMOUNT) + '!<br><span>hesabına eklendi</span>';
  setTimeout(initStart, 1300);
};
/* ---- ÇİP MAĞAZASI (demo: gerçek ödeme yok, Play Billing buraya bağlanacak) ---- */
const PACKS = [
  { id: 'cip_100k',  chips: 100000,   tl: '29,99',    ico: 1 },
  { id: 'cip_550k',  chips: 550000,   tl: '129,99',   ico: 2, bonus: '%10', tag: 'POPÜLER' },
  { id: 'cip_1m2',   chips: 1200000,  tl: '229,99',   ico: 2, bonus: '%20' },
  { id: 'cip_3m25',  chips: 3250000,  tl: '499,99',   ico: 3, bonus: '%30', tag: 'EN İYİ FİYAT' },
  { id: 'cip_7m',    chips: 7000000,  tl: '899,99',   ico: 3, bonus: '%40' },
  { id: 'cip_15m',   chips: 15000000, tl: '1.499,99', ico: 4, bonus: '%50', tag: 'VIP' },
];
function showShop() {
  const cards = PACKS.map((p, i) =>
    '<div class="pack' + (p.tag ? ' feat' : '') + '">' +
    (p.tag ? '<div class="pbadge">' + p.tag + '</div>' : '') +
    '<div class="pico">' + '<span class="coin">M</span>'.repeat(p.ico) + '</div>' +
    '<div class="pchips">' + fmtChips(p.chips) + '</div>' +
    '<div class="pbonus">' + (p.bonus ? '+' + p.bonus + ' bonus dahil' : '&nbsp;') + '</div>' +
    '<button class="btn small pbuy" data-pk="' + i + '">₺ ' + p.tl + '</button></div>').join('');
  modal('<h2><span class="coin">M</span> ÇİP MAĞAZASI</h2>' +
    '<p class="reshead">Bakiyen: <span class="coin">M</span> <b>' + fmtChips(meta.chips) + '</b></p>' +
    '<div class="shopgrid">' + cards + '</div>' +
    '<p class="rules" style="font-size:11px;text-align:center">⚠ <b>DEMO mağaza</b> — gerçek ödeme alınmaz. Yayında Google Play / App Store faturalandırması buraya bağlanır.<br>Çipler yalnızca oyun içindir, paraya çevrilemez.</p>' +
    '<div class="btnrow"><button class="btn" onclick="window.closeModal()">Kapat</button></div>');
  document.querySelectorAll('#modal-box .pbuy').forEach(b => b.onclick = () => buyPack(+b.dataset.pk));
}
function buyPack(i) {
  const p = PACKS[i];
  modal('<h2><span class="coin">M</span> Satın Al</h2>' +
    '<div class="resrow win" style="justify-content:center"><span class="rava"><span class="coin">M</span></span>' +
    '<div class="rinfo"><b>' + fmtChips(p.chips) + ' çip</b>' + (p.bonus ? '<span class="rsub neg">+' + p.bonus + ' bonus dahil</span>' : '') + '</div>' +
    '<div class="rright"><span class="rpts">₺ ' + p.tl + '</span></div></div>' +
    '<p class="rules" style="font-size:11.5px;text-align:center">Bu bir <b>demo satın alımdır</b> — kartından para çekilmez.<br>Gerçek sürümde burada Google Play ödeme penceresi açılır.</p>' +
    '<div class="btnrow finalbtns"><button class="btn exit" id="pk-x">VAZGEÇ</button><button class="btn go" id="pk-ok">✓ SATIN AL (DEMO)</button></div>');
  $('pk-x').onclick = () => { closeModal(); showShop(); };
  $('pk-ok').onclick = () => {
    const b = $('pk-ok');
    b.disabled = true;
    b.textContent = '⏳ İşleniyor…';
    setTimeout(() => {
      meta.chips += p.chips;
      saveMeta();
      const log = store.get('okey101_purchases', []);
      log.push({ id: p.id, chips: p.chips, tl: p.tl, ts: Date.now() }); // ileride: mağaza makbuzu buraya
      store.set('okey101_purchases', log);
      closeModal();
      playSnd('jackpot'); // çuvala dökülen altın sesi
      chipFx.quiet = true;
      chipFx(p.chips);
      toast('🎉 ' + fmtChips(p.chips) + ' çip hesabına eklendi! (demo)');
      initStart();
      setTimeout(showShop, 900);
    }, 900);
  };
}
$('btn-plus').onclick = showShop;
$('btn-menu-settings').onclick = menuSettings;

/* ---- ana menü ayarları: genel + hemen oyna tercihleri + nasıl oynanır ---- */
function menuSettings() {
  const P = [
    ['muzik', '🎵 Müzik'], ['ses', '🔊 Oyun Sesi'], ['titresim', '📳 Titreşim'],
    ['arkadaslik', '👥 Arkadaşlık İstekleri'], ['sohbet', '💬 Sohbet'],
    ['davet', '📨 Masa Daveti'], ['bildirim', '🔔 Bildirimler'],
  ];
  const CY = [
    ['el', '🃏 EL SAYISI', v => v ? v + ' EL' : 'FARKETMEZ'],
    ['mod', '🤝 TEK / EŞLİ', v => v === 'tek' ? 'TEK' : v === 'esli' ? 'EŞLİ' : 'FARKETMEZ'],
    ['yard', '💡 YARDIM', v => v === 'yard' ? 'YARDIMLI' : v === 'no' ? 'YARDIMSIZ' : 'FARKETMEZ'],
    ['kat', '📈 KATLAMA', v => v === 'kat' ? 'KATLAMALI' : v === 'no' ? 'KATLAMASIZ' : 'FARKETMEZ'],
  ];
  modal('<h2>⚙ AYARLAR</h2><h3 class="setsec">GENEL</h3>' +
    P.map(([k, l]) => '<div class="dlg-row"><span class="lbl">' + l + '</span><span class="dlg-toggle ' + (prefs[k] ? 'on' : '') + '" data-p="' + k + '">' + (prefs[k] ? 'AÇIK' : 'KAPALI') + '</span></div>').join('') +
    '<h3 class="setsec">HEMEN OYNA TERCİHLERİ</h3>' +
    CY.map(([k, l, f]) => '<div class="dlg-row"><span class="lbl">' + l + '</span><span class="dlg-toggle on" data-c="' + k + '">' + f(qp[k]) + '</span></div>').join('') +
    '<h3 class="setsec">YARDIM</h3>' +
    '<div class="dlg-row"><span class="lbl">📖 Nasıl Oynanır</span><button class="btn secondary small" id="ms-rules">Göster</button></div>' +
    '<div class="btnrow"><button class="btn" onclick="window.closeModal()">Kapat</button></div>');
  document.querySelectorAll('#modal-box [data-p]').forEach(b => b.onclick = () => {
    const k = b.dataset.p;
    prefs[k] = !prefs[k];
    store.set('okey101_prefs', prefs);
    b.textContent = prefs[k] ? 'AÇIK' : 'KAPALI';
    b.classList.toggle('on', prefs[k]);
  });
  const cycles = { el: [0, 1, 2, 3, 4, 5], mod: ['any', 'tek', 'esli'], yard: ['any', 'yard', 'no'], kat: ['any', 'kat', 'no'] };
  document.querySelectorAll('#modal-box [data-c]').forEach(b => b.onclick = () => {
    const k = b.dataset.c, arr = cycles[k];
    qp[k] = arr[(arr.indexOf(qp[k]) + 1) % arr.length];
    store.set('okey101_qp', qp);
    b.textContent = CY.find(c => c[0] === k)[2](qp[k]);
  });
  $('ms-rules').onclick = () => { closeModal(); showRules(); };
}

/* ---- oyun içi ayarlar ---- */
function showSettings() {
  const snd = store.get('okey101_sound', true);
  modal('<h2>⚙ Ayarlar</h2>' +
    '<div class="dlg-row"><span class="lbl">🔊 SES</span><span class="dlg-toggle ' + (snd ? 'on' : '') + '" id="st-snd">' + (snd ? 'AÇIK' : 'KAPALI') + '</span></div>' +
    '<div class="dlg-row"><span class="lbl">⛶ TAM EKRAN</span><button class="btn secondary small" id="st-fs">' + (document.fullscreenElement ? 'Çık' : 'Aç') + '</button></div>' +
    '<div class="dlg-row"><span class="lbl">📖 Kurallar</span><button class="btn secondary small" id="st-rules">Göster</button></div>' +
    '<div class="btnrow"><button class="btn" onclick="window.closeModal()">Kapat</button></div>');
  $('st-snd').onclick = () => {
    const v = !store.get('okey101_sound', true);
    store.set('okey101_sound', v);
    const b = $('st-snd');
    b.textContent = v ? 'AÇIK' : 'KAPALI';
    b.classList.toggle('on', v);
  };
  $('st-fs').onclick = () => {
    const b = $('st-fs');
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); b.textContent = 'Aç'; }
    else if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); b.textContent = 'Çık'; }
  };
  $('st-rules').onclick = () => { closeModal(); showRules(); };
  const lv = $('st-leave');
  if (lv) lv.onclick = () => { closeModal(); leaveTable(); };
}
function leaveTable() {
  stopTurnTimer();
  // bahis zaten oyun başında ödendi — geri verilmez (bahis yanar)
  G = null;
  ui.busy = false;
  $('scr-game').classList.add('hidden');
  $('scr-start').classList.remove('hidden');
  initStart();
}
$('btn-satinal').onclick = showShop;
$('btn-gamemenu').onclick = () => { // oyun içi menü: masayı temiz tutar
  modal('<h2>☰ MENÜ</h2>' +
    '<div class="btnrow" style="flex-direction:column;align-items:stretch;gap:8px">' +
    '<button class="btn secondary" id="gm-scores">📊 Puanlar</button>' +
    '<button class="btn secondary" id="gm-rules">📖 Nasıl Oynanır</button>' +
    '<button class="btn secondary" id="gm-settings">⚙ Ayarlar</button>' +
    (G && !G.roundOver ? (G.rizikolu
      ? '<button class="btn secondary" disabled>🚪 Masadan Çık — ⚡ Rizikoluda kapalı</button>'
      : '<button class="btn exit" id="gm-leave">🚪 MASADAN ÇIK' + (currentStake ? ' (bahis yanar)' : '') + '</button>') : '') +
    '<button class="btn" onclick="window.closeModal()">Kapat</button></div>');
  $('gm-scores').onclick = () => { closeModal(); showScores(); };
  $('gm-rules').onclick = () => { closeModal(); showRules(); };
  $('gm-settings').onclick = () => { closeModal(); showSettings(); };
  const lv = $('gm-leave');
  if (lv) lv.onclick = () => { closeModal(); leaveTable(); };
};
$('btn-sort-l').onclick = () => { if (G) { ui.counterMode = 'cift'; sortRack('pairs'); render(); } };
$('btn-sort-r').onclick = () => { if (G) { ui.counterMode = 'seri'; sortRack('runs'); render(); } };

/* ---- oda başlığı: oklar hep aynı yerde, uçlarda durur (başa sarmaz) ---- */
function roomRich(room) { return room.tavan > 0 && meta.chips > room.tavan; } // bakiye tavanı aşarsa giremez
function roomHeadHtml(ri) {
  const room = ROOMS[ri];
  const locked = meta.chips < room.giris;
  const note = locked ? ' · 🔒 Giriş şartı: ' + fmtChips(room.giris)
    : roomRich(room) ? ' · 💰 Tavan ' + fmtChips(room.tavan) + ' — bakiyen çok yüksek' : '';
  return '<div class="roomnav">' +
    '<button class="navbtn" id="dg-prev"' + (ri === 0 ? ' disabled' : '') + '>◀</button>' +
    '<div class="roomhead"><div class="rico">' + room.ico + '</div>' +
    '<div class="rname">' + room.name + '</div>' +
    '<div class="rrange"><span class="coin">M</span> ' + fmtChips(room.min) + ' – ' + fmtChips(room.max) + '</div>' +
    '<div class="ronline">' + fakeOnline(1000 + ri * 400) + ' çevrimiçi' + note + '</div></div>' +
    '<button class="navbtn" id="dg-next"' + (ri === ROOMS.length - 1 ? ' disabled' : '') + '>▶</button></div>';
}
function bindRoomNav(ri, open) {
  $('dg-prev').onclick = () => { if (ri > 0) { closeModal(); open(ri - 1); } };
  $('dg-next').onclick = () => { if (ri < ROOMS.length - 1) { closeModal(); open(ri + 1); } };
}

/* ---- MASA AÇ: kendi masanı kur ---- */
function masaAcDialog(ri) {
  ri = Math.max(0, ri);
  const room = ROOMS[ri];
  const locked = meta.chips < room.giris;
  const maxB = Math.min(room.max, Math.max(room.min, meta.chips));
  let bahis = Math.min(Math.max(settings.bahis, room.min), maxB);
  let el = Math.min(5, Math.max(1, settings.el || 3));
  let yard = settings.yardimli, kat = settings.katlamali, esli = !!settings.esli;
  const canPlay = !locked && !roomRich(room) && meta.chips >= room.min;
  modal(
    roomHeadHtml(ri) +
    '<div class="dlg-row"><span class="lbl">BAHİS</span><span class="val" id="dg-bval"><span class="coin">M</span> ' + fmtChips(bahis) + '</span></div>' +
    '<input type="range" class="bahis" id="dg-bahis" min="' + room.min + '" max="' + maxB + '" step="1" value="' + bahis + '"' + (canPlay ? '' : ' disabled') + '>' +
    '<div class="dlg-row"><span class="lbl">🎙 SESLİ SOHBET</span><span class="dlg-toggle dis">KAPALI · Yakında</span></div>' +
    '<div class="dlg-row"><span class="lbl">EL SAYISI</span><span class="val" id="dg-elval">' + el + ' EL</span></div>' +
    '<input type="range" class="bahis" id="dg-el" min="1" max="5" step="1" value="' + el + '">' +
    '<div class="dlg-row"><span class="lbl">Yardımlı / Yardımsız</span><span class="dlg-toggle" id="dg-yard"></span></div>' +
    '<div class="dlg-row"><span class="lbl">Katlamalı / Katlamasız</span><span class="dlg-toggle" id="dg-kat"></span></div>' +
    '<div class="dlg-row"><span class="lbl">Tek / Eşli</span><span class="dlg-toggle" id="dg-esli"></span></div>' +
    '<div class="btnrow"><button class="btn secondary" id="dg-x">✕</button><button class="btn" id="dg-ok"' + (canPlay ? '' : ' disabled') + '>✓ MASAYI AÇ</button></div>'
  );
  const bval = $('dg-bval'), slider = $('dg-bahis');
  slider.oninput = () => { bahis = +slider.value; bval.innerHTML = '<span class="coin">M</span> ' + fmtChips(bahis); };
  const elval = $('dg-elval'), elSlider = $('dg-el');
  elSlider.oninput = () => { el = +elSlider.value; elval.textContent = el + ' EL'; };
  const yardBtn = $('dg-yard'), katBtn = $('dg-kat'), esliBtn = $('dg-esli');
  const drawT = () => {
    yardBtn.textContent = yard ? 'YARDIMLI' : 'YARDIMSIZ';
    yardBtn.className = 'dlg-toggle ' + (yard ? 'on' : 'warn');
    katBtn.textContent = kat ? 'KATLAMALI' : 'KATLAMASIZ';
    katBtn.className = 'dlg-toggle ' + (kat ? 'warn' : 'on');
    esliBtn.textContent = esli ? 'EŞLİ' : 'TEK';
    esliBtn.className = 'dlg-toggle ' + (esli ? 'warn' : 'on');
  };
  yardBtn.onclick = () => { yard = !yard; drawT(); };
  katBtn.onclick = () => { kat = !kat; drawT(); };
  esliBtn.onclick = () => { esli = !esli; drawT(); };
  drawT();
  bindRoomNav(ri, masaAcDialog);
  $('dg-x').onclick = closeModal;
  $('dg-ok').onclick = () => {
    closeModal();
    launch({ room: room.id, bahis, el, yardimli: yard, katlamali: kat, esli });
  };
}

/* ---- ODA SEÇ: oda kuralları → masa listesi ---- */
function odaSecDialog(ri) {
  ri = Math.max(0, ri);
  const room = ROOMS[ri];
  const locked = meta.chips < room.giris;
  modal(
    roomHeadHtml(ri) +
    '<div class="dlg-row"><span class="lbl">🃏 EL SAYISI</span><span class="val">1 – 5 (masaya göre)</span></div>' +
    '<div class="dlg-row"><span class="lbl">🔑 GİRİŞ ŞARTI</span><span class="val">' + (room.giris ? '<span class="coin">M</span> ' + fmtChips(room.giris) : 'Yok — herkese açık') + '</span></div>' +
    (locked ? '<p class="rules" style="color:#ff8a80;text-align:center">🔒 Bu odaya girmek için en az <b>' + fmtChips(room.giris) + '</b> çipin olmalı.</p>' : '') +
    (roomRich(room) ? '<p class="rules" style="color:#ffd54f;text-align:center">💰 Bakiyen bu odanın tavanını (<b>' + fmtChips(room.tavan) + '</b>) aşıyor — daha üst odalarda oyna.</p>' : '') +
    '<div class="btnrow"><button class="btn secondary" id="dg-x">✕</button><button class="btn" id="dg-ok"' + (locked || roomRich(room) ? ' disabled' : '') + '>✓ ODAYA GİR</button></div>'
  );
  bindRoomNav(ri, odaSecDialog);
  $('dg-x').onclick = closeModal;
  $('dg-ok').onclick = () => { closeModal(); roomTablesDialog(ri); };
}
function roomTablesDialog(ri) {
  const room = ROOMS[ri];
  const pick3 = () => {
    const pool = BOT_POOL.slice();
    const out = [];
    for (let k = 0; k < 3; k++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  };
  const step = Math.max(500, Math.round((room.max - room.min) / 8 / 500) * 500);
  const tables = [];
  for (let i = 0; i < 6; i++) {
    tables.push({
      no: 100 + ri * 100 + i,
      bahis: Math.min(room.max, room.min + Math.floor(Math.random() * 9) * step),
      el: EL_OPTS[Math.floor(Math.random() * EL_OPTS.length)],
      kat: Math.random() < 0.6,
      yard: Math.random() < 0.7,
      bots: pick3(),
    });
  }
  let html = '<h2>' + room.name + ' — Masalar</h2><div style="display:flex;flex-direction:column;gap:7px">';
  tables.forEach((t, i) => {
    const afford = meta.chips >= t.bahis;
    html += '<div class="tablecard"><div class="tinfo">' +
      '<div class="tname">Masa #' + t.no + ' · <span class="coin">M</span> ' + fmtChips(t.bahis) + '</div>' +
      '<div class="tmeta">' + t.bots.join(' · ') + ' · 1 boş koltuk</div>' +
      '<div class="tags"><span class="tag">' + t.el + ' EL</span>' +
      '<span class="tag kat">' + (t.kat ? 'KATLAMALI' : 'KATLAMASIZ') + '</span>' +
      '<span class="tag yard">' + (t.yard ? 'YARDIMLI' : 'YARDIMSIZ') + '</span></div></div>' +
      '<button class="btn small" id="tbl-' + i + '"' + (afford ? '' : ' disabled') + '>OTUR</button></div>';
  });
  html += '</div><div class="btnrow"><button class="btn secondary" id="dg-back">◀ Odalar</button><button class="btn secondary" id="dg-x">✕</button></div>';
  modal(html);
  tables.forEach((t, i) => {
    const b = $('tbl-' + i);
    if (b) b.onclick = () => {
      closeModal();
      launch({ room: room.id, bahis: t.bahis, el: t.el, yardimli: t.yard, katlamali: t.kat, bots: t.bots });
    };
  });
  $('dg-back').onclick = () => { closeModal(); odaSecDialog(ri); };
  $('dg-x').onclick = closeModal;
}

/* ---- oyunu başlat ---- */
function launch(cfg) {
  const name = store.get('okey101_name', 'Sen');
  currentSettings = cfg;
  settings = Object.assign({}, settings, { room: cfg.room, bahis: cfg.bahis || settings.bahis, el: cfg.el, yardimli: cfg.yardimli, katlamali: cfg.katlamali, esli: !!cfg.esli });
  store.set('okey101_settings', settings);
  currentStake = (cfg.bahis && meta.chips >= cfg.bahis) ? cfg.bahis : 0;
  // bahis oyun başında hesaptan düşer (oyun sonunda alınan dağıtılır)
  if (currentStake) {
    meta.chips = Math.max(0, meta.chips - currentStake);
    saveMeta();
    setTimeout(() => chipFx(-currentStake), 700);
  }
  const bots = (cfg.bots && cfg.bots.length === 3) ? cfg.bots : BOT_NAMES;
  G = E.newGame({ names: [name, ...bots], rounds: cfg.el, katlamali: cfg.katlamali, esli: cfg.esli, rizikolu: cfg.rizikolu });
  chatState.msgs = []; chatState.unread = 0; renderChat();
  $('scr-start').classList.add('hidden');
  $('scr-game').classList.remove('hidden');
  // yardımsız: diz butonları tamamen kapalı
  document.querySelectorAll('.rackside').forEach(b => b.classList.toggle('hidden', cfg.yardimli === false));
  // telefonda uygulama hissi: tam ekrana geç (kullanıcı jesti içindeyiz)
  if (window.matchMedia('(pointer: coarse)').matches && document.documentElement.requestFullscreen && !document.fullscreenElement) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
  beginRound();
}
function assist() { return !currentSettings || currentSettings.yardimli !== false; }

function beginRound() {
  E.startRound(G);
  rackSlots = new Array(RACK_SLOTS).fill(null);
  G.players[0].hand.forEach((t, i) => { rackSlots[i] = t.id; });
  if (assist()) sortRack('runs'); // yardımsızda taşlar dağıtıldığı gibi yan yana gelir
  ui.lastCarpan = 1;
  playSnd('shuffle'); // taşlar dağıtılıyor
  ui.sel.clear(); ui.drawnId = null;
  ui.hiddenOkeys.clear();
  ui.counterMode = 'seri';
  ui.timeouts = 0;
  seenPenalties = 0;
  prevCornerTops = [null, null, null, null];
  stopTurnTimer();
  render();
  toast(G.players[G.starter].name + ' başlıyor. Okey: ' + COLOR_TR[G.okey.color] + ' ' + G.okey.num +
        ' (okeylerin ★ rozetli; uzun bas, ters çevir).');
  if (G.turn !== 0) botLoop();
  else startTurnTimer();
}

/* ---------------- rack ---------------- */
function me() { return G.players[0]; }
function handById(id) { return me().hand.find(t => t.id === id); }

function syncRack() {
  const ids = new Set(me().hand.map(t => t.id));
  for (let i = 0; i < RACK_SLOTS; i++) {
    if (rackSlots[i] != null && !ids.has(rackSlots[i])) rackSlots[i] = null;
  }
  for (const hid of [...ui.hiddenOkeys]) if (!ids.has(hid)) ui.hiddenOkeys.delete(hid);
  const placed = new Set(rackSlots.filter(x => x != null));
  for (const t of me().hand) {
    if (placed.has(t.id)) continue;
    let idx = -1, last = -1;
    for (let i = 0; i < RACK_SLOTS; i++) if (rackSlots[i] != null) last = i;
    if (last + 2 < RACK_SLOTS && rackSlots[last + 2] == null) idx = last + 2;
    else if (last + 1 < RACK_SLOTS && rackSlots[last + 1] == null) idx = last + 1;
    else idx = rackSlots.indexOf(null);
    if (idx >= 0) rackSlots[idx] = t.id;
    placed.add(t.id);
  }
}

function sortRack(mode) {
  syncRack();
  const hand = me().hand.slice();
  let groups = [], leftovers = [];
  if (mode === 'pairs') {
    const pairs = E.bestPairCover(hand, G.okey);
    groups = pairs.map(p => p.slice());
    const used = new Set(groups.flat().map(t => t.id));
    leftovers = hand.filter(t => !used.has(t.id));
    leftovers.sort((a, b) => keyGroup(a) - keyGroup(b));
  } else {
    const cover = E.bestMeldCover(hand, G.okey);
    groups = cover.melds.map(m => sortMeldForDisplay(m.tiles));
    groups.sort((a, b) => meldPts(b) - meldPts(a)); // biggest first, side by side
    leftovers = cover.leftover.slice();
    leftovers.sort((a, b) => keyRun(a) - keyRun(b));
  }
  arrangeWithGaps(groups, leftovers);
}
function meldPts(tiles) { const v = E.validateMeld(tiles, G.okey); return v.valid ? v.points : 0; }
function keyRun(t) { const e = E.effective(t, G.okey); return e ? e.color * 20 + e.num : 999; }
function keyGroup(t) { const e = E.effective(t, G.okey); return e ? e.num * 10 + e.color : 999; }
function sortMeldForDisplay(tiles) {
  const v = E.validateMeld(tiles, G.okey);
  if (v.type === 'run') return E.sortRunTiles(tiles, G.okey);
  return [...tiles].sort((a, b) => keyGroup(a) - keyGroup(b));
}

function arrangeWithGaps(groups, leftovers) {
  const slots = new Array(RACK_SLOTS).fill(null);
  let pos = 0, gapless = false;
  const blocks = groups.concat(leftovers.length ? [leftovers] : []);
  for (const block of blocks) {
    if (!gapless) {
      const row = Math.floor(pos / RACK_COLS);
      const rowEnd = (row + 1) * RACK_COLS;
      if (pos + block.length > rowEnd && block.length <= RACK_COLS) pos = rowEnd;
      if (pos + block.length > RACK_SLOTS) { gapless = true; pos = compact(slots); }
    }
    if (pos + block.length > RACK_SLOTS) { gapless = true; pos = compact(slots); }
    for (const t of block) { if (pos < RACK_SLOTS) slots[pos++] = t.id; }
    if (!gapless) pos++;
  }
  const placed = new Set(slots.filter(x => x != null));
  for (const t of me().hand) {
    if (!placed.has(t.id)) {
      const i = slots.indexOf(null);
      if (i >= 0) { slots[i] = t.id; placed.add(t.id); }
    }
  }
  rackSlots = slots;
}
function compact(slots) {
  const ids = slots.filter(x => x != null);
  slots.fill(null);
  ids.forEach((id, i) => { slots[i] = id; });
  return ids.length;
}

function parseRackGroups() {
  syncRack();
  const groups = [];
  for (let r = 0; r < RACK_SLOTS / RACK_COLS; r++) {
    let cur = [];
    for (let c = 0; c < RACK_COLS; c++) {
      const id = rackSlots[r * RACK_COLS + c];
      if (id != null) {
        const t = handById(id);
        if (t) cur.push(t);
      } else if (cur.length) { groups.push(cur); cur = []; }
    }
    if (cur.length) groups.push(cur);
  }
  return groups;
}
/* performans: analiz render başına bir kez hesaplanır (telefon kasmasına karşı) */
let _an = null;
function analyzeRack() {
  if (_an) return _an;
  const groups = parseRackGroups();
  const melds = [], pairs = [];
  let meldPtsTotal = 0;
  const meldIds = new Set(), pairIds = new Set(), islekIds = new Set();
  for (const g of groups) {
    if (g.length >= 3) {
      const v = E.validateMeld(g, G.okey);
      if (v.valid) {
        melds.push(g); meldPtsTotal += v.points;
        g.forEach(t => meldIds.add(t.id));
      }
    } else if (g.length === 2) {
      const v = E.validatePair(g, G.okey);
      if (v.valid) { pairs.push(g); g.forEach(t => pairIds.add(t.id)); }
    }
  }
  if (G.tableMelds.length) {
    for (const t of me().hand) {
      if (meldIds.has(t.id) || pairIds.has(t.id)) continue;
      if (isWild(t) || t.fake) continue;
      if (G.tableMelds.some(m => E.canAttach(m, t, G.okey))) islekIds.add(t.id);
    }
  }
  return (_an = { melds, meldPts: meldPtsTotal, pairs, meldIds, pairIds, islekIds });
}

/* ---------------- messages ---------------- */
let toastTimer = null;
function toast(msg, isErr) {
  const bar = $('msgbar');
  bar.textContent = msg;
  bar.classList.toggle('err', !!isErr);
  clearTimeout(toastTimer);
  if (isErr) toastTimer = setTimeout(() => { bar.classList.remove('err'); renderHint(); }, 3000);
}
function renderHint() {
  if (!G || G.roundOver) return;
  const bar = $('msgbar');
  bar.classList.remove('err');
  if (G.turn !== 0) { bar.textContent = ''; return; } // "X oynuyor" yazısı kaldırıldı — süre barı koltukta
  const p = me();
  if (!G.hasDrawn) { bar.textContent = 'Sıra sende: desteden ya da soldaki atılandan taş sürükle (dokunmak da olur).'; return; }
  if (p.tookDiscard != null) { bar.textContent = 'Aldığın taşı bu tur kullanmalısın — ya da geri sürükleyip desteden çek.'; return; }
  if (!assist()) { bar.textContent = 'Yardımsız mod: ipucu yok — perlerini boşluklarla ayır, sıra sende oyna.'; return; }
  const a = analyzeRack();
  if (a.islekIds.size) { bar.textContent = '⚠ Kırmızı halkalı taşlar İŞLEK: atarsan +101 ceza! ' + (p.opened ? 'İŞLE ile masaya koy.' : ''); return; }
  if (!p.opened) {
    const rq = E.openReq(G).seri;
    if (a.meldPts > 0 && a.meldPts < rq) { bar.textContent = 'Geçerli perlerin: ' + a.meldPts + ' sayı. Açmak için ' + rq + ' gerekir' + (rq > 101 ? ' (katlamalı baraj)' : '') + '.'; return; }
    bar.textContent = 'Perlerini boşluklarla ayır; yeterse SERİ AÇ. Gruba uzun bas: birlikte taşınır.';
    return;
  }
  bar.textContent = 'Seri atabilir, işleyebilir ya da taşı köşene sürükleyip atabilirsin.';
}

/* ---------------- render ---------------- */
let pendingRender = false;
function render() {
  if (!G) return;
  if (drag && drag.moved) { pendingRender = true; return; }
  _an = null; // analiz önbelleğini tazele
  if (G.rizikolu && ui.lastCarpan != null && G.carpan > ui.lastCarpan) queueCarpanFx(ui.lastCarpan + 1, G.carpan);
  if (G.rizikolu) ui.lastCarpan = G.carpan;
  if (!drag) document.querySelectorAll('.tile.ghost, .ghostrow').forEach(g => g.remove());
  $('chips-top').innerHTML = '<span class="coin">M</span> ' + fmtChips(currentStake || 0); // sadece masa bedeli
  const cb = $('carpan-badge');
  if (G.rizikolu) {
    const txt = '⚡×' + G.carpan;
    cb.classList.remove('hidden');
    if (cb.textContent !== txt) { cb.textContent = txt; cb.classList.remove('bump'); void cb.offsetWidth; cb.classList.add('bump'); }
  } else cb.classList.add('hidden');
  // sıra sende: orta bölüm yakınlaşır; rakiplerdeyken uzaklaşır
  $('boards').classList.toggle('zoom', G.turn === 0 && !G.roundOver);
  renderCounter();
  renderSeats();
  renderCorners();
  renderHub();
  renderMelds();
  renderRack();
  renderActions();
  renderHint();
  checkPenaltyFloats();
}

/* mechanical tally counter; çift modunda kırmızı risk değeri gösterir */
function renderCounter() {
  const c = $('counter');
  if (!G || G.roundOver) { c.classList.add('hidden'); return; } // sayaç her modda görünür
  const a = analyzeRack();
  let val, risk = false;
  if (me().opened && me().openType === 'pairs') {
    // çift açan: elde kalan taşların ×2 cezası her daim kırmızı görünür
    val = me().hand.reduce((s, t) => s + E.tileValue(t, G.okey), 0) * 2;
    risk = true;
  } else if (ui.counterMode === 'cift' && a.pairs.length >= 5) {
    const pairIds = a.pairIds;
    const left = me().hand.filter(t => !pairIds.has(t.id));
    val = left.reduce((s, t) => s + E.tileValue(t, G.okey), 0) * 2;
    risk = true;
  } else {
    val = a.meldPts;
  }
  val = Math.min(999, val);
  const str = String(val).padStart(3, '0');
  c.classList.remove('hidden');
  c.classList.toggle('risk', risk);
  const reqS = me().opened ? 101 : E.openReq(G).seri;
  c.classList.toggle('ready', !risk && a.meldPts >= reqS);
  c.title = risk
    ? 'Çift açarsan elinde kalacak ceza (kalan taşlar × 2)'
    : 'Geçerli perlerinin toplamı' + (reqS > 101 ? ' · Açış barajı: ' + reqS : '') + (a.pairs.length ? ' · ' + a.pairs.length + ' çift' : '');
  if (!c.dataset.init) {
    c.innerHTML = '<div class="dig"><span>0</span></div><div class="dig"><span>0</span></div><div class="dig"><span>0</span></div>';
    c.dataset.init = '1';
  }
  const digs = c.querySelectorAll('.dig span');
  str.split('').forEach((ch, i) => {
    const s = digs[i];
    if (s.textContent !== ch) {
      s.textContent = ch;
      s.classList.remove('roll'); void s.offsetWidth; s.classList.add('roll');
    }
  });
}

/* seats: opening points shown as MINI OKEY TILES + red penalties */
function ptRowHtml(p) {
  if (!p.opened) return '';
  return '<span class="ptrow">' +
    String(p.openPoints).split('').map(d => '<span class="ptile">' + d + '</span>').join('') +
    '</span>';
}
function seatInfoHtml(p, i) {
  const pen = p.penalty > 0 ? '<span class="pen">+' + p.penalty + '</span>' : '';
  const es = G && G.esli && i === 2 ? ' <span title="Takım arkadaşın">🤝</span>' : '';
  if (i === 0) return '<span class="nm">' + p.name + '</span> <span class="cnt">' + p.score + 'p</span>' + pen;
  return '<span class="nm">' + p.name + '</span>' + es + pen;
}
function renderSeats() {
  for (let i = 0; i < 4; i++) {
    const p = G.players[i];
    const el = $('seat-' + i);
    el.classList.toggle('turn', G.turn === i && !G.roundOver);
    el.innerHTML = '';
    const ava = document.createElement('div');
    ava.className = 'ava';
    ava.textContent = i === 0 ? '🙂' : BOT_AVAS[i - 1];
    el.appendChild(ava);
    const side = (i === 1 || i === 3);
    const info = document.createElement('div');
    info.className = side ? 'vinfo' : 'info';
    info.innerHTML = seatInfoHtml(p, i);
    el.appendChild(info);
    if (i !== 0 && p.opened) { // açış puanı mini taşlarla
      const pr = document.createElement('div');
      pr.className = 'ptrowwrap';
      pr.innerHTML = ptRowHtml(p);
      el.appendChild(pr);
    }
    if (p.opened) {
      const b = document.createElement('span');
      b.className = 'badge' + (p.openType === 'pairs' ? ' pairs' : '');
      b.textContent = p.openType === 'pairs' ? 'ÇİFT' : 'AÇTI';
      el.appendChild(b);
    }
  }
}

/* red floating "+101" above the offender's seat */
function checkPenaltyFloats() {
  if (!G || !G.penaltyLog) return;
  while (seenPenalties < G.penaltyLog.length) {
    const e = G.penaltyLog[seenPenalties++];
    const seat = $('seat-' + e.player);
    if (!seat) continue;
    const r = seat.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'penaltyfloat';
    f.textContent = '+' + e.amount + ' İŞLEK!';
    f.style.left = (r.left + r.width / 2) + 'px';
    f.style.top = (r.top - 6) + 'px';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 2100);
  }
}

function renderCorners() {
  const canTake = G.turn === 0 && !G.hasDrawn && !ui.busy && !G.roundOver;
  const prev = E.prevPlayer(G);
  for (let i = 0; i < 4; i++) {
    const el = $('corner-' + i);
    const pile = G.discards[i];
    const top = pile.length ? pile[pile.length - 1] : null;
    el.innerHTML = '';
    const ped = document.createElement('div');
    ped.className = 'pedestal';
    if (top) {
      const tEl = tileEl(top);
      ped.appendChild(tEl);
      if (canTake && i === prev) attachSourcePointer(tEl, 'discard');
    } else {
      const e = document.createElement('div'); e.className = 'empty';
      ped.appendChild(e);
    }
    el.appendChild(ped);
    const takeable = canTake && i === prev && pile.length > 0;
    el.classList.toggle('can', takeable);
    const topId = top ? top.id : null;
    if (topId != null && prevCornerTops[i] !== topId && pile.length > 0) {
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
      clearTimeout(el._flashT);
      el._flashT = setTimeout(() => el.classList.remove('flash'), 560);
    }
    prevCornerTops[i] = topId;
  }
}

function renderHub() {
  // masa bilgileri (üst boşluk): el, tek/eşli, katlama, yardım
  $('tableinfo').innerHTML =
    '<div class="ti gold">El ' + G.round + '/' + G.rounds + '</div>' +
    '<div class="ti">' + (G.esli ? '🤝 EŞLİ' : 'TEK') + '</div>' +
    '<div class="ti">' + (G.katlamali !== false ? 'KATLAMALI' : 'KATLAMASIZ') + '</div>' +
    '<div class="ti">' + (assist() ? 'YARDIMLI' : 'YARDIMSIZ') + '</div>' +
    (G.rizikolu ? '<div class="ti gold">⚡ RİZİKOLU</div>' : '');
  const deck = $('deck');
  deck.innerHTML = '';
  const back = tileEl('back');
  deck.appendChild(back);
  const cnt = document.createElement('div'); // kalan taş sayısı: destenin içinde, kabartma
  cnt.className = 'cnt';
  cnt.textContent = G.deck.length;
  deck.appendChild(cnt);
  const canDraw = G.turn === 0 && !G.hasDrawn && !ui.busy && !G.roundOver;
  deck.classList.toggle('can', canDraw && G.deck.length > 0);
  if (canDraw && G.deck.length > 0) attachSourcePointer(back, 'deck');
  else if (canDraw && G.deck.length === 0) deck.onclick = () => { E.endRound(G); render(); showRoundEnd(); };
  else deck.onclick = null;

  const ind = $('indicator');
  ind.innerHTML = '';
  ind.appendChild(tileEl(G.indicator));
  ind.firstChild.style.cursor = 'default';
  ind.title = 'Gösterge: ' + tileName(G.indicator) + ' → okey bunun bir üstü';
  if (G.roundOver && G.finisher >= 0 && G.finalTile) {
    const ft = tileEl(G.finalTile);
    ft.classList.add('finaltile');
    ind.appendChild(ft);
  }
}

function renderMelds() {
  // düzenli masa: tüm perler tek akışta, başlangıç sayısına göre küçükten büyüğe
  const seri = $('board-seri');
  const cift = $('board-cift');
  seri.innerHTML = ''; cift.innerHTML = '';
  const startOf = m => Math.min(...m.tiles.map(t => {
    const e = E.effective(t, G.okey);
    return e ? e.num : 14;
  }));
  const all = G.tableMelds.map((m, mi) => ({ m, mi }));
  const melds = all.filter(x => x.m.type !== 'pair').sort((a, b) => startOf(a.m) - startOf(b.m));
  const pairs = all.filter(x => x.m.type === 'pair').sort((a, b) => startOf(a.m) - startOf(b.m));
  if (melds.length) seri.appendChild(meldRowEl(melds));
  if (pairs.length) cift.appendChild(meldRowEl(pairs));
}
function meldRowEl(items) {
  const row = document.createElement('div');
  row.className = 'meldrow';
  for (const { m, mi } of items) {
    const el = document.createElement('div');
    el.className = 'meld';
    el.dataset.mi = mi;
    const sorted = m.type === 'run' ? E.sortRunTiles(m.tiles, G.okey) : m.tiles;
    for (const t of sorted) {
      const te = tileEl(t, { mini: true });
      te.dataset.tid = t.id;
      el.appendChild(te);
    }
    row.appendChild(el);
  }
  return row;
}

function renderRack() {
  syncRack();
  const rack = $('rack');
  rack.innerHTML = '';
  // işlek/per halkaları HER ZAMAN görünür (sıra rakipteyken de)
  const a = !G.roundOver ? analyzeRack() : { meldIds: new Set(), pairIds: new Set(), islekIds: new Set() };
  for (let i = 0; i < RACK_SLOTS; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot'; slot.dataset.idx = i;
    const id = rackSlots[i];
    if (id != null) {
      const t = handById(id);
      if (t) {
        const hidden = ui.hiddenOkeys.has(t.id);
        const el = tileEl(t, { badge: !hidden, facedown: hidden });
        el.dataset.tid = t.id;
        if (ui.sel.has(t.id)) el.classList.add('sel');
        if (!hidden) {
          if (ui.drawnId === t.id) el.classList.add('drawnhl');
          if (assist() && a.islekIds.has(t.id)) el.classList.add('islk'); // tek işaret: işlek
        }
        attachRackPointer(el, t);
        slot.appendChild(el);
      }
    }
    rack.appendChild(slot);
  }
}

/* ---------------- drag / long-press system (v2: precise & smooth) ---------------- */
let drag = null;

function makeGhost(fromEl) {
  const r = fromEl.getBoundingClientRect();
  const g = fromEl.cloneNode(true);
  g.classList.add('ghost');
  g.classList.remove('dragging', 'sel', 'touch', 'gvalid', 'gpair', 'islk', 'drawnhl', 'grouplift');
  g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
  g.style.left = r.left + 'px'; g.style.top = r.top + 'px';
  document.body.appendChild(g);
  return { g, x: r.left, y: r.top, w: r.width, h: r.height };
}
function makeGroupGhost(els) {
  const r0 = els[0].getBoundingClientRect();
  const wrap = document.createElement('div');
  wrap.className = 'ghostrow';
  for (const e of els) {
    const c = e.cloneNode(true);
    const rr = e.getBoundingClientRect();
    c.classList.remove('dragging', 'sel', 'touch', 'gvalid', 'gpair', 'islk', 'drawnhl', 'grouplift');
    c.style.width = rr.width + 'px';
    c.style.height = rr.height + 'px';
    wrap.appendChild(c);
  }
  wrap.style.left = r0.left + 'px'; wrap.style.top = r0.top + 'px';
  document.body.appendChild(wrap);
  return { g: wrap, x: r0.left, y: r0.top, w: r0.width, h: r0.height };
}
function endDrag() {
  if (!drag) return;
  clearTimeout(drag.holdTimer);
  if (drag.el) drag.el.classList.remove('dragging', 'touch');
  document.querySelectorAll('#rack .tile.grouplift').forEach(e => e.classList.remove('grouplift'));
  document.querySelectorAll('#rack .tile.dragging').forEach(e => e.classList.remove('dragging'));
  document.querySelectorAll('.meld.attach-ok, .meld.swappable').forEach(m => m.classList.remove('attach-ok', 'swappable'));
  if (drag.ghost) drag.ghost.remove();
  clearDropHints();
  drag = null;
  if (pendingRender) { pendingRender = false; render(); }
}
document.addEventListener('pointerup', () => { if (drag) { endDrag(); render(); } });
document.addEventListener('pointercancel', () => { if (drag) { endDrag(); render(); } });

function clearDropHints() {
  document.querySelectorAll('.slot.dragover').forEach(s => s.classList.remove('dragover'));
  document.querySelectorAll('.droptarget').forEach(s => s.classList.remove('droptarget'));
}
function hitAt(x, y) {
  const g = document.querySelector('.tile.ghost, .ghostrow');
  if (g) g.style.display = 'none';
  const el = document.elementFromPoint(x, y);
  if (g) g.style.display = '';
  return el;
}
/* the drop position is where the GHOST TILE sits, not where the finger is —
   this is what makes drops land exactly where the player aims */
function ghostCenter() {
  if (!drag || !drag.ghost) return null;
  return { x: drag.gx + drag.dx + drag.gw / 2, y: drag.gy + drag.dy + drag.gh / 2 };
}
function moveGhost(dx, dy, scale, rot) {
  drag.dx = dx; drag.dy = dy;
  drag.ghost.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0) scale(' + scale + ') rotate(' + rot + 'deg)';
}

function blockAt(id) {
  const idx = rackSlots.indexOf(id);
  if (idx < 0) return [id];
  const row = Math.floor(idx / RACK_COLS), rs = row * RACK_COLS, re = rs + RACK_COLS;
  let a = idx, b = idx;
  while (a - 1 >= rs && rackSlots[a - 1] != null) a--;
  while (b + 1 < re && rackSlots[b + 1] != null) b++;
  return rackSlots.slice(a, b + 1);
}
/* place a block at the target, displacing other tiles toward the row's gaps */
function placeGroup(ids, targetIdx) {
  const orig = ids.map(id => rackSlots.indexOf(id));
  const revert = () => { orig.forEach((p, k) => { rackSlots[p] = ids[k]; }); };
  orig.forEach(p => { rackSlots[p] = null; });
  const row = Math.floor(targetIdx / RACK_COLS), rs = row * RACK_COLS, re = rs + RACK_COLS;
  let start = Math.min(Math.max(targetIdx, rs), re - ids.length);
  if (start < rs) { revert(); return false; }
  const span = [];
  for (let k = 0; k < ids.length; k++) span.push(start + k);
  const displaced = span.map(i => rackSlots[i]).filter(x => x != null);
  const freeR = []; for (let i = start + ids.length; i < re; i++) if (rackSlots[i] == null) freeR.push(i);
  const freeL = []; for (let i = start - 1; i >= rs; i--) if (rackSlots[i] == null) freeL.push(i);
  if (displaced.length > freeR.length + freeL.length) { revert(); return false; }
  span.forEach(i => { rackSlots[i] = null; });
  let ri = 0, li = 0;
  for (const d of displaced) {
    if (ri < freeR.length) rackSlots[freeR[ri++]] = d;
    else rackSlots[freeL[li++]] = d;
  }
  ids.forEach((id, k) => { rackSlots[start + k] = id; });
  return true;
}
/* single tile: drop onto an occupied slot slides the row toward the nearest gap */
function moveTile(id, slotIdx) {
  const from = rackSlots.indexOf(id);
  if (from < 0 || slotIdx < 0 || slotIdx >= RACK_SLOTS || from === slotIdx) return;
  rackSlots[from] = null;
  if (rackSlots[slotIdx] == null) { rackSlots[slotIdx] = id; return; }
  const row = Math.floor(slotIdx / RACK_COLS), rs = row * RACK_COLS, re = rs + RACK_COLS;
  let e = -1;
  for (let i = slotIdx + 1; i < re; i++) if (rackSlots[i] == null) { e = i; break; }
  if (e >= 0) {
    for (let i = e; i > slotIdx; i--) rackSlots[i] = rackSlots[i - 1];
    rackSlots[slotIdx] = id;
    return;
  }
  for (let i = slotIdx - 1; i >= rs; i--) if (rackSlots[i] == null) { e = i; break; }
  if (e >= 0) {
    for (let i = e; i < slotIdx; i++) rackSlots[i] = rackSlots[i + 1];
    rackSlots[slotIdx] = id;
    return;
  }
  rackSlots[from] = rackSlots[slotIdx];
  rackSlots[slotIdx] = id;
}

function highlightTargetsFor(t) {
  if (!G || G.turn !== 0 || !G.hasDrawn || ui.busy || G.roundOver) return;
  document.querySelectorAll('.meld').forEach(el => {
    const m = G.tableMelds[+el.dataset.mi];
    if (!m || !me().opened) return;
    if (E.canSwapWith(G, m, t)) el.classList.add('swappable');
    else if (E.canAttach(m, t, G.okey)) el.classList.add('attach-ok');
  });
}

function attachRackPointer(el, t) {
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    if (drag) return;
    drag = { src: 'rack', id: t.id, x: ev.clientX, y: ev.clientY, moved: false, held: false, group: null,
             el, ghost: null, dx: 0, dy: 0, lastHX: -99, lastHY: -99 };
    el.classList.add('touch');
    try { el.setPointerCapture(ev.pointerId); } catch (e) {}
    drag.holdTimer = setTimeout(() => {
      if (!drag || drag.src !== 'rack' || drag.id !== t.id || drag.moved) return;
      drag.held = true;
      const block = blockAt(t.id);
      if (block.length >= 2) {
        drag.group = block;
        block.forEach(id => {
          const be = document.querySelector('#rack .tile[data-tid="' + id + '"]');
          if (be) be.classList.add('grouplift');
        });
      }
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
    }, HOLD_MS);
  });
  el.addEventListener('pointermove', (ev) => {
    if (!drag || drag.src !== 'rack' || drag.id !== t.id) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 8) {
      clearTimeout(drag.holdTimer);
      drag.moved = true;
      el.classList.remove('touch');
      if (drag.group) {
        const els = drag.group.map(id => document.querySelector('#rack .tile[data-tid="' + id + '"]')).filter(Boolean);
        els.forEach(e2 => e2.classList.add('dragging'));
        const gh = makeGroupGhost(els);
        drag.ghost = gh.g; drag.gx = gh.x; drag.gy = gh.y; drag.gw = gh.w; drag.gh = gh.h;
      } else {
        el.classList.add('dragging');
        const gh = makeGhost(el);
        drag.ghost = gh.g; drag.gx = gh.x; drag.gy = gh.y; drag.gw = gh.w; drag.gh = gh.h;
        highlightTargetsFor(t);
      }
    }
    if (drag.moved) {
      moveGhost(dx, dy, drag.group ? 1.06 : 1.08, drag.group ? 1 : 2);
      const gc = ghostCenter();
      if (Math.hypot(gc.x - drag.lastHX, gc.y - drag.lastHY) > 4) {
        drag.lastHX = gc.x; drag.lastHY = gc.y;
        clearDropHints();
        if (drag.group) {
          const hit = hitAt(gc.x, gc.y);
          const slot = hit && hit.closest('.slot');
          if (slot) slot.classList.add('dragover');
        } else {
          const target = rackDropTarget(gc.x, gc.y, t);
          if (target && target.kind === 'slot') target.el.classList.add('dragover');
          else if (target) target.el.classList.add('droptarget');
        }
      }
    }
  });
  el.addEventListener('pointerup', (ev) => {
    if (!drag || drag.src !== 'rack' || drag.id !== t.id) return;
    const wasMoved = drag.moved, wasHeld = drag.held, group = drag.group;
    if (wasMoved) { drag.dx = ev.clientX - drag.x; drag.dy = ev.clientY - drag.y; }
    const gc = wasMoved ? ghostCenter() : null;
    const target = wasMoved
      ? (group
          ? (() => { const hit = hitAt(gc.x, gc.y); const s = hit && hit.closest('.slot'); return s ? { kind: 'slot', el: s } : null; })()
          : rackDropTarget(gc.x, gc.y, t))
      : null;
    endDrag();
    if (!wasMoved) {
      if (wasHeld) {
        if (!group && (E.isOkeyTile(t, G.okey) || t.fake)) { flipOkey(t.id); return; }
        render(); return;
      }
      onTileTap(t); return;
    }
    if (!target) { render(); return; }
    if (group) {
      if (!placeGroup(group, +target.el.dataset.idx)) toast('Grup için yeterli boşluk yok.', true);
      render(); return;
    }
    if (target.kind === 'slot') { moveTile(t.id, +target.el.dataset.idx); render(); }
    else if (target.kind === 'discard') dropDiscard(t);
    else if (target.kind === 'meld') dropAttach(t, +target.el.dataset.mi);
    else if (target.kind === 'swap') dropSwap(t, +target.el.dataset.mi);
    else if (target.kind === 'return') dropReturn();
  });
  el.addEventListener('pointercancel', () => endDrag());
}

/* okeyi ters çevir: yüzü kapalı boş taş görünümü; el açılınca geri döner */
function flipOkey(id) {
  const el = document.querySelector('#rack .tile[data-tid="' + id + '"]');
  const doToggle = () => {
    if (ui.hiddenOkeys.has(id)) ui.hiddenOkeys.delete(id);
    else ui.hiddenOkeys.add(id);
    render();
    const ne = document.querySelector('#rack .tile[data-tid="' + id + '"]');
    if (ne) {
      ne.style.transition = 'none';
      ne.style.transform = 'rotateY(-90deg)';
      requestAnimationFrame(() => {
        ne.style.transition = 'transform .14s ease-out';
        ne.style.transform = '';
        setTimeout(() => { ne.style.transition = ''; }, 170);
      });
    }
  };
  if (el) {
    el.style.transition = 'transform .13s ease-in';
    el.style.transform = 'rotateY(90deg)';
    setTimeout(doToggle, 130);
  } else doToggle();
}

function rackDropTarget(x, y, t) {
  const hit = hitAt(x, y);
  if (!hit) return null;
  const slot = hit.closest('.slot');
  if (slot) return { kind: 'slot', el: slot };
  const myTurn = G && G.turn === 0 && G.hasDrawn && !ui.busy && !G.roundOver;
  if (!myTurn) return null;
  if (me().tookDiscard === t.id) {
    const back = hit.closest('#corner-' + E.prevPlayer(G));
    if (back) return { kind: 'return', el: back };
  }
  const corner = hit.closest('#corner-0');
  if (corner) return { kind: 'discard', el: corner };
  const meld = hit.closest('.meld');
  if (meld && me().opened && meld.dataset.mi != null) {
    const m = G.tableMelds[+meld.dataset.mi];
    if (m) {
      if (E.canSwapWith(G, m, t)) return { kind: 'swap', el: meld };
      if (E.canAttach(m, t, G.okey)) return { kind: 'meld', el: meld };
    }
  }
  return null;
}

function attachSourcePointer(el, src) {
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    if (drag) return;
    drag = { src, x: ev.clientX, y: ev.clientY, moved: false, el, ghost: null, dx: 0, dy: 0, lastHX: -99, lastHY: -99 };
    el.classList.add('touch');
    try { el.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  el.addEventListener('pointermove', (ev) => {
    if (!drag || drag.src !== src) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 8) {
      drag.moved = true;
      el.classList.remove('touch');
      const gh = makeGhost(el);
      drag.ghost = gh.g; drag.gx = gh.x; drag.gy = gh.y; drag.gw = gh.w; drag.gh = gh.h;
    }
    if (drag.moved) {
      moveGhost(dx, dy, 1.08, 2);
      const gc = ghostCenter();
      if (Math.hypot(gc.x - drag.lastHX, gc.y - drag.lastHY) > 4) {
        drag.lastHX = gc.x; drag.lastHY = gc.y;
        clearDropHints();
        const hit = hitAt(gc.x, gc.y);
        const slot = hit && hit.closest('.slot');
        if (slot) slot.classList.add('dragover');
      }
    }
  });
  el.addEventListener('pointerup', (ev) => {
    if (!drag || drag.src !== src) return;
    const wasMoved = drag.moved;
    if (wasMoved) { drag.dx = ev.clientX - drag.x; drag.dy = ev.clientY - drag.y; }
    const gc = wasMoved ? ghostCenter() : null;
    const slot = wasMoved ? (() => { const h = hitAt(gc.x, gc.y); return h && h.closest('.slot'); })() : null;
    endDrag();
    if (!wasMoved) { src === 'deck' ? doDraw() : doTake(); return; }
    if (!slot) { render(); return; }
    const slotIdx = +slot.dataset.idx;
    const t = src === 'deck' ? E.drawFromDeck(G) : E.takeDiscard(G);
    if (!t) { render(); return; }
    ui.drawnId = t.id;
    syncRack();
    moveTile(t.id, slotIdx);
    toast(src === 'deck' ? ('Çektin: ' + tileName(t)) : ('Aldın: ' + tileName(t) + ' — bu taşı bu tur kullanmalısın.'));
    render();
  });
  el.addEventListener('pointercancel', () => endDrag());
}

function dropDiscard(t) {
  const r = E.discardTile(G, t);
  if (!r.ok) { toast(r.err, true); render(); return; }
  if (r.penalty) toast('⚠ İşlek taş attın: +101 ceza!', true);
  afterDiscard();
}
function dropAttach(t, mi) {
  const r = E.attachTile(G, t, mi);
  if (!r.ok) { toast(r.err, true); render(); return; }
  ui.sel.delete(t.id);
  toast(tileName(t) + ' işlendi.');
  render();
}
function dropSwap(t, mi) {
  const r = E.swapForOkey(G, t, mi);
  if (!r.ok) { toast(r.err, true); render(); return; }
  ui.sel.clear();
  ui.drawnId = r.okey.id;
  toast(tileName(t) + ' perdeki okeyle değişti — OKEY artık rafında! 🎉');
  render();
}
function dropReturn() {
  const t = E.returnDiscard(G);
  ui.sel.clear(); ui.drawnId = null;
  if (t) toast('Taşı geri verdin — şimdi desteden çek.');
  render();
}

function onTileTap(t) {
  if (!G || ui.busy || G.roundOver) return;
  if (G.turn !== 0 || !G.hasDrawn) return;
  if (ui.sel.has(t.id)) ui.sel.delete(t.id);
  else { ui.sel.clear(); ui.sel.add(t.id); }
  render();
}

/* ---------------- turn timer (30/20/5 sn; açık el: 60 sn) ---------------- */
const TIMER_STEPS = [30, 20, 5];
let timerInt = null, timerDeadline = 0, timerTotal = 1;
/* süre barı ilgili oyuncunun koltuğunun hemen altına yerleşir */
function placeSeatTimer(idx) {
  const el = $('seat-' + idx), st = $('seattimer');
  if (!el || !st) return false;
  const r = el.getBoundingClientRect();
  const w = Math.max(44, Math.min(110, r.width));
  st.style.left = (r.left + r.width / 2 - w / 2) + 'px';
  st.style.width = w + 'px';
  st.style.top = (r.bottom + 3) + 'px';
  return true;
}
/* bot oynarken kısa süren akıcı bir bar (görsel eşitlik) */
function botSeatTimer(idx) {
  const st = $('seattimer'), sf = $('seatfill');
  if (!placeSeatTimer(idx)) return;
  st.classList.remove('hidden', 'low', 'anim');
  sf.style.width = '100%';
  void sf.offsetWidth;
  st.classList.add('anim');
  sf.style.width = '0%';
}
function startTurnTimer() {
  stopTurnTimer();
  if (!G || G.roundOver || G.turn !== 0 || ui.busy) return;
  const dur = me().opened ? 60 : TIMER_STEPS[Math.min(ui.timeouts, TIMER_STEPS.length - 1)];
  timerTotal = dur;
  timerDeadline = Date.now() + dur * 1000;
  const st = $('seattimer');
  st.classList.remove('hidden', 'anim');
  placeSeatTimer(0);
  timerInt = setInterval(tickTimer, 200);
  tickTimer();
}
function stopTurnTimer() {
  if (timerInt) { clearInterval(timerInt); timerInt = null; }
  const st = $('seattimer');
  if (st) { st.classList.add('hidden'); st.classList.remove('low', 'anim'); }
}
function tickTimer() {
  const remain = (timerDeadline - Date.now()) / 1000;
  const st = $('seattimer');
  if (!st) return;
  const pct = Math.max(0, Math.min(1, remain / timerTotal));
  $('seatfill').style.width = (pct * 100) + '%';
  st.classList.toggle('low', remain <= 5);
  placeSeatTimer(0);
  if (remain <= 0) onTurnTimeout();
}
function onTurnTimeout() {
  stopTurnTimer();
  if (!G || G.roundOver || G.turn !== 0) return;
  ui.timeouts++;
  // otomatik oyna: aldıysa geri ver, çekmediyse çek, sonra güvenli taş at
  if (me().tookDiscard != null) E.returnDiscard(G);
  if (!G.hasDrawn) {
    if (G.deck.length === 0) { E.endRound(G); render(); showRoundEnd(); return; }
    E.drawFromDeck(G);
  }
  const d = E.aiChooseDiscard(G, me());
  if (d) E.discardTile(G, d);
  toast('⏰ Süre doldu — senin yerine oynandı. (Sonraki süre: ' +
        (me().opened ? 60 : TIMER_STEPS[Math.min(ui.timeouts, 2)]) + ' sn)', true);
  ui.sel.clear(); ui.drawnId = null;
  render();
  if (G.roundOver) { showRoundEnd(); return; }
  botLoop();
}

/* ---------------- actions ---------------- */
function renderActions() {
  const bar = $('actions');
  bar.innerHTML = '';
  const mk = (label, fn, opts = {}) => {
    const b = document.createElement('button');
    b.className = 'btn small' + (opts.primary ? '' : ' secondary') + (opts.cls ? ' ' + opts.cls : '');
    b.textContent = label;
    b.disabled = !!opts.disabled;
    b.onclick = fn;
    bar.appendChild(b);
    return b;
  };
  mk('Çift Diz', () => { ui.counterMode = 'cift'; sortRack('pairs'); render(); }, { cls: 'sortbtn-inline' });
  mk('Seri Diz', () => { ui.counterMode = 'seri'; sortRack('runs'); render(); }, { cls: 'sortbtn-inline' });
  if (!G || G.roundOver || ui.busy || G.turn !== 0) return;
  const p = me();
  const selTile = ui.sel.size === 1 ? handById([...ui.sel][0]) : null;

  if (!G.hasDrawn) return; // çekme/alma: desteye ya da parlayan taşa dokun

  const a = analyzeRack();
  const canUndo = G.lastOpen && G.lastOpen.player === 0;
  const otherPairsOpen = G.players.some((q, i) => i !== 0 && q.opened && q.openType === 'pairs');
  const hp = assist(); // yardımlı mı?
  if (canUndo) mk('GERİ AL ↩', doUndoOpen);
  const req = E.openReq(G); // katlamalıda baraj öncekini geçer
  if (!p.opened) {
    mk('SERİ AÇ' + (hp ? ' · ' + a.meldPts + (req.seri > 101 ? '/' + req.seri : '') : ''), () => doOpenParsed('normal', a),
       { primary: true, disabled: hp ? a.meldPts < req.seri : !a.melds.length });
    mk('ÇİFT AÇ' + (hp ? ' · ' + a.pairs.length + (req.cift > 5 ? '/' + req.cift : '') : ''), () => doOpenParsed('pairs', a),
       { disabled: hp ? a.pairs.length < req.cift : !a.pairs.length });
  } else if (p.openType === 'normal') {
    mk('SERİ AÇ', () => doLayParsed(a), { disabled: !a.melds.length });
    if (otherPairsOpen) mk('ÇİFT AÇ' + (hp ? ' · ' + a.pairs.length : ''), () => doLayPairsParsed(a), { disabled: !a.pairs.length });
  } else {
    mk('ÇİFT AÇ', () => doLayPairsParsed(a), { disabled: !a.pairs.length });
  }
  if (p.opened && hp) { // İŞLE yardımcısı yardımsızda kapalı
    mk('İŞLE' + (a.islekIds.size ? ' · ' + a.islekIds.size : ''), () => doAutoIslek(),
       { primary: a.islekIds.size > 0, disabled: !a.islekIds.size || p.hand.length <= 1 });
  }
  const selIslek = hp && selTile && a.islekIds.has(selTile.id);
  mk('Taş At' + (selIslek ? ' ⚠' : ''), doDiscard, { primary: true, disabled: !selTile });
  if (p.tookDiscard != null) mk('Vazgeç ↩', dropReturn);
}

function doUndoOpen() {
  const r = E.undoOpen(G);
  if (!r.ok) { toast(r.err, true); return; }
  syncRack();
  toast('Açış geri alındı — taşlar rafına döndü.');
  render();
}
function doDraw() {
  if (G.deck.length === 0) { E.endRound(G); render(); showRoundEnd(); return; }
  const t = E.drawFromDeck(G);
  if (!t) return;
  playSnd('draw');
  ui.drawnId = t.id;
  syncRack();
  toast('Çektin: ' + tileName(t));
  render();
}
function doTake() {
  const t = E.takeDiscard(G);
  if (!t) return;
  ui.drawnId = t.id;
  syncRack();
  toast('Aldın: ' + tileName(t) + ' — bu taşı bu tur kullanmalısın.');
  render();
}

function doOpenParsed(mode, a) {
  const melds = mode === 'pairs' ? a.pairs : a.melds;
  if (!melds.length) { toast('Istakada geçerli grup yok. Taşları boşluklarla ayırarak grupla.', true); return; }
  const rects = captureRackRects(melds);
  const r = E.openHand(G, melds, mode);
  if (!r.ok) { toast(r.err, true); return; }
  ui.sel.clear();
  ui.hiddenOkeys.clear(); // el masaya açıldı: kapalı okeyler görünür olur
  toast(mode === 'pairs' ? 'Çiftten açtın! (Yanlışsa: GERİ AL)' : 'Elini açtın! (' + a.meldPts + ' sayı) Yanlışsa: GERİ AL.');
  startTurnTimer(); // açınca işleme süresi: 60 sn (ses her perin inişinde ayrı çalar)
  if (mode === 'pairs' && E.checkAllPairsCancel(G)) { render(); showRoundEnd(); return; }
  render();
  flyOpenedGroups(melds, rects);
}
function doLayParsed(a) {
  let laid = 0, lastErr = null;
  const rects = captureRackRects(a.melds);
  const done = [];
  for (const g of a.melds) {
    const r = E.layMeld(G, g);
    if (r.ok) { laid++; done.push(g); }
    else lastErr = r.err;
  }
  if (!laid) { toast(lastErr || 'Atılacak geçerli seri yok.', true); return; }
  ui.sel.clear();
  toast(laid + ' seri masaya atıldı.');
  render();
  flyOpenedGroups(done, rects);
}
function doLayPairsParsed(a) {
  let laid = 0, lastErr = null;
  const rects = captureRackRects(a.pairs);
  const done = [];
  for (const g of a.pairs) {
    const r = E.layPair(G, g);
    if (r.ok) { laid++; done.push(g); }
    else lastErr = r.err;
  }
  if (!laid) { toast(lastErr || 'Atılacak geçerli çift yok.', true); return; }
  ui.sel.clear();
  toast(laid + ' çift masaya atıldı.');
  render();
  flyOpenedGroups(done, rects);
}
/* per açılırken grup halinde uçan animasyon (İŞLE'nin grup versiyonu) */
function captureRackRects(groups) {
  const map = {};
  for (const t of groups.flat()) {
    const el = document.querySelector('#rack .tile[data-tid="' + t.id + '"]');
    if (el) map[t.id] = el.getBoundingClientRect();
  }
  return map;
}
async function flyOpenedGroups(groups, rects) {
  for (const tiles of groups) await flyGroup(tiles, rects);
}
/* bot açışları: per, koltuğundan süzülerek masaya iner (herkes aynı şeyi görür) */
function seatSrcMap(idx, tiles) {
  const el = document.getElementById('seat-' + idx);
  if (!el) return {};
  const r = el.getBoundingClientRect();
  const fake = { left: r.left + r.width / 2 - 15, top: r.top + r.height / 2 - 21, width: 30, height: 42 };
  const map = {};
  for (const t of tiles) map[t.id] = fake;
  return map;
}
async function flyBotGroups(idx, events) {
  for (const e of events) {
    if ((e.type === 'open' || e.type === 'openPairs') && e.melds) {
      for (const tiles of e.melds) await flyGroup(tiles, seatSrcMap(idx, tiles));
    } else if ((e.type === 'lay' || e.type === 'layPair') && e.tiles) {
      await flyGroup(e.tiles, seatSrcMap(idx, e.tiles));
    } else if (e.type === 'attach' && e.tile) {
      await flyGroup([e.tile], seatSrcMap(idx, [e.tile]));
    } else if (e.type === 'discard' && e.tile) {
      await flyToCorner(e.tile, seatSrcMap(idx, [e.tile])[e.tile.id], idx);
    }
  }
}
function flyGroup(tiles, rects) {
  return new Promise(resolve => {
    const dests = tiles.map(t => document.querySelector('.meld .tile[data-tid="' + t.id + '"]')).filter(Boolean);
    const srcs = tiles.map(t => rects[t.id]).filter(Boolean);
    if (!dests.length || !srcs.length) { resolve(); return; }
    const left = Math.min(...srcs.map(r => r.left));
    const top = Math.min(...srcs.map(r => r.top));
    const wrap = document.createElement('div');
    wrap.className = 'flygroup';
    wrap.style.left = left + 'px'; wrap.style.top = top + 'px';
    for (const t of tiles) {
      const te = tileEl(t, { badge: true });
      te.style.width = srcs[0].width + 'px'; te.style.height = srcs[0].height + 'px';
      te.style.fontSize = (srcs[0].width * 0.52) + 'px';
      wrap.appendChild(te);
    }
    for (const d of dests) d.style.visibility = 'hidden';
    // hedef: taşların GERÇEK iniş noktası (per kutusunun köşesi değil) — kayma olmaz
    const drs = dests.map(d => d.getBoundingClientRect());
    const dl = Math.min(...drs.map(r => r.left));
    const dt = Math.min(...drs.map(r => r.top));
    const dr = drs[0];
    document.body.appendChild(wrap);
    requestAnimationFrame(() => {
      wrap.style.left = dl + 'px'; wrap.style.top = dt + 'px';
      wrap.querySelectorAll('.tile').forEach(te => {
        te.style.width = dr.width + 'px'; te.style.height = dr.height + 'px';
        te.style.fontSize = (dr.width * 0.52) + 'px';
      });
    });
    setTimeout(() => {
      wrap.remove();
      for (const d of dests) d.style.visibility = '';
      playSnd('tile'); // per masaya "tak" diye oturur
      setTimeout(resolve, 45);
    }, 280);
  });
}
/* rizikolu çarpan patlaması — kademeli: ×2, ×3, ×4… tek tek belirir */
let carpanQueue = [], carpanBusy = false;
function queueCarpanFx(from, to) {
  for (let n = from; n <= to; n++) carpanQueue.push(n);
  pumpCarpanFx();
}
function pumpCarpanFx() {
  if (carpanBusy) return;
  const n = carpanQueue.shift();
  if (n == null) return;
  carpanBusy = true;
  const felt = $('felt');
  if (felt) {
    const d = document.createElement('div');
    d.className = 'carpanfx';
    d.textContent = '×' + n;
    felt.appendChild(d);
    playSnd('carpan', n);
    setTimeout(() => d.remove(), 1450);
  }
  setTimeout(() => { carpanBusy = false; pumpCarpanFx(); }, 1480);
}
/* çarpan animasyonu bitmeden sıra bir sonraki oyuncuya geçmez */
function carpanWait() {
  return new Promise(res => {
    const chk = () => (carpanBusy || carpanQueue.length) ? setTimeout(chk, 120) : res();
    chk();
  });
}
/* koltuk üstü küçük çip bildirimi: kazanç yeşil, bahis kırmızı (referans video) */
function seatChipFloat(amount) {
  const seat = $('seat-0');
  if (!seat) return;
  const r = seat.getBoundingClientRect(); // render koltuk içini yeniden kurduğu için gövdeye sabitlenir
  const f = document.createElement('div');
  f.className = 'chipfloat ' + (amount < 0 ? 'out' : 'in');
  f.style.left = (r.left + r.width / 2) + 'px';
  f.style.top = (r.top - 8) + 'px';
  f.textContent = (amount > 0 ? '+' : '−') + fmtChips(Math.abs(amount));
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 2350);
}
/* çip giriş/çıkış animasyonu: az sayıda çip süzülür; tutar oyundaysa profil üstünde */
function chipFx(amount) {
  const inGame = !$('scr-game').classList.contains('hidden');
  const nC = inGame
    ? Math.min(9, 5 + Math.floor(Math.log10(Math.abs(amount) + 10)))
    : Math.min(16, 7 + Math.floor(Math.log10(Math.abs(amount) + 10) * 1.6));
  const spread = Math.min(inGame ? 190 : 270, innerWidth * 0.3);
  for (let i = 0; i < nC; i++) {
    const c = document.createElement('div');
    c.className = 'coinfly ' + (amount < 0 ? 'out' : 'in');
    c.textContent = 'M';
    c.style.left = '50%';
    c.style.top = '56px';
    c.style.setProperty('--dx', ((Math.random() * 2 - 1) * spread) + 'px');
    c.style.setProperty('--dy', (90 + Math.random() * 200) + 'px');
    c.style.animationDelay = (Math.random() * 0.4) + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 2350);
  }
  if (inGame) {
    seatChipFloat(amount); // büyük orta yazı yerine profil üstünde küçük bildirim
  } else {
    const d = document.createElement('div');
    d.className = 'chipfly ' + (amount < 0 ? 'out' : 'in');
    d.innerHTML = (amount > 0 ? '+' : '−') + fmtChips(Math.abs(amount)) + ' <span class="coin">M</span>';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1900);
  }
  if (!chipFx.quiet) { playSnd('coin'); setTimeout(() => playSnd('coin'), 240); }
  chipFx.quiet = false;
}
/* ---- minik ses motoru: dosyasız WebAudio efektleri ---- */
let actx = null;
function sndOn() { return prefs.ses !== false && store.get('okey101_sound', true); }
function blip(freq, dur, type, vol, at) {
  const t = at || actx.currentTime;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type || 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol || .2, t);
  g.gain.exponentialRampToValueAtTime(.001, t + (dur || .1));
  o.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t + (dur || .1) + .02);
}
/* "tak" — gerçek taş vuruşu: kısa gürültü patlaması (alçak geçiren süzgeçli) + gövde tınısı */
function knock(vol, freq, dur, at) {
  const t = at || actx.currentTime;
  const len = Math.max(1, Math.floor(actx.sampleRate * (dur || .06)));
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
  const src = actx.createBufferSource();
  src.buffer = buf;
  const f = actx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = freq || 1000; f.Q.value = 1.4;
  const g = actx.createGain();
  g.gain.setValueAtTime(vol || .5, t);
  g.gain.exponentialRampToValueAtTime(.001, t + (dur || .06) + .02);
  src.connect(f); f.connect(g); g.connect(actx.destination);
  src.start(t);
  blip(105 + Math.random() * 45, .05, 'sine', (vol || .5) * .55, t); // masaya oturan gövde
}
function playSnd(name, n) {
  if (!sndOn()) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { return; }
  const t = actx.currentTime;
  if (name === 'tile') knock(.55, 900 + Math.random() * 550, .06, t);                 // tek taş "tak"
  else if (name === 'draw') knock(.22, 1800, .04, t);                                  // taş kaydırma
  else if (name === 'open') { knock(.45, 1250, .055, t); knock(.5, 1000, .06, t + .1); knock(.6, 780, .07, t + .2); } // per masaya inişi: tak-tak-tak
  else if (name === 'shuffle') for (let i = 0; i < 6; i++) knock(.13 + Math.random() * .1, 1300 + Math.random() * 800, .04, t + i * .05); // dağıtım hışırtısı
  else if (name === 'carpan') { knock(.6, 560, .09, t); blip(280 + (n || 2) * 55, .22, 'triangle', .1, t + .05); blip(560 + (n || 2) * 110, .3, 'sine', .12, t + .12); }
  else if (name === 'coin') [1568, 1976, 2637].forEach((f, i) => blip(f, .07, 'triangle', .05, t + i * .045));
  else if (name === 'jackpot') { // çuvala dökülen altınlar: şıkır şıkır
    knock(.45, 650, .09, t);
    for (let i = 0; i < 16; i++) {
      const tt = t + .06 + i * .05 + Math.random() * .035;
      const f = 1250 + Math.random() * 1900;
      blip(f, .05 + Math.random() * .05, 'triangle', .045 + Math.random() * .04, tt);
      if (Math.random() < .5) blip(f * 1.5, .04, 'sine', .03, tt + .012);
    }
    knock(.2, 900, .06, t + .5);
  }
  else if (name === 'win') { knock(.5, 900, .06, t); [523, 659, 784, 1046].forEach((f, i) => blip(f, .22, 'triangle', .13, t + .1 + i * .12)); }
  else if (name === 'lose') [392, 311, 233].forEach((f, i) => blip(f, .24, 'sine', .11, t + i * .15));
}
let islekAnimating = false;
async function doAutoIslek() {
  if (islekAnimating) return;
  islekAnimating = true;
  ui.busy = true;
  let n = 0, guard = 0;
  while (guard++ < 40 && me().hand.length > 1) {
    const a = analyzeRack();
    const t = me().hand.find(x => a.islekIds.has(x.id));
    if (!t) break;
    const mi = G.tableMelds.findIndex(m => E.canAttach(m, t, G.okey));
    if (mi < 0) break;
    const srcEl = document.querySelector('#rack .tile[data-tid="' + t.id + '"]');
    const srcRect = srcEl ? srcEl.getBoundingClientRect() : null;
    const r = E.attachTile(G, t, mi);
    if (!r.ok) break;
    n++;
    render();
    await flyToMeld(t, srcRect, mi);
  }
  islekAnimating = false;
  ui.busy = false;
  if (!n) { toast('İşlenecek taş yok.', true); render(); return; }
  ui.sel.clear();
  toast(n + ' taş masaya işlendi.');
  render();
}
function flyToMeld(t, srcRect, mi) {
  return new Promise(resolve => {
    const dest = document.querySelector('.meld[data-mi="' + mi + '"] .tile[data-tid="' + t.id + '"]');
    if (!srcRect || !dest) { resolve(); return; }
    const dr = dest.getBoundingClientRect();
    dest.style.visibility = 'hidden';
    const fly = tileEl(t);
    fly.classList.add('flytile');
    fly.style.width = srcRect.width + 'px';
    fly.style.height = srcRect.height + 'px';
    fly.style.fontSize = (srcRect.width * 0.52) + 'px';
    fly.style.left = srcRect.left + 'px';
    fly.style.top = srcRect.top + 'px';
    document.body.appendChild(fly);
    requestAnimationFrame(() => {
      fly.style.left = dr.left + 'px';
      fly.style.top = dr.top + 'px';
      fly.style.width = dr.width + 'px';
      fly.style.height = dr.height + 'px';
      fly.style.fontSize = (dr.width * 0.52) + 'px';
    });
    setTimeout(() => {
      fly.remove();
      dest.style.visibility = '';
      playSnd('tile'); // işlenen taş perde yerine oturunca "tak"
      setTimeout(resolve, 55);
    }, 195);
  });
}
function doDiscard() {
  const t = handById([...ui.sel][0]);
  const srcEl = t && document.querySelector('#rack .tile[data-tid="' + t.id + '"]');
  const srcRect = srcEl && srcEl.getBoundingClientRect();
  const r = E.discardTile(G, t);
  if (!r.ok) { toast(r.err, true); return; }
  if (r.penalty) toast('⚠ İşlek taş attın: +101 ceza!', true);
  afterDiscard();
  flyToCorner(t, srcRect, 0);
}
/* atılan taş köşe sehpasına süzülür (işlek animasyonunun aynısı) */
function flyToCorner(t, srcRect, idx) {
  return new Promise(resolve => {
    const corner = $('corner-' + idx);
    if (!srcRect || !corner) { resolve(); return; }
    const tiles = corner.querySelectorAll('.tile');
    const dest = tiles.length ? tiles[tiles.length - 1] : corner;
    const dr = dest.getBoundingClientRect();
    if (dest.style) dest.style.visibility = 'hidden';
    const fly = tileEl(t, { badge: true });
    fly.classList.add('flytile');
    fly.style.width = srcRect.width + 'px';
    fly.style.height = srcRect.height + 'px';
    fly.style.fontSize = (srcRect.width * 0.52) + 'px';
    fly.style.left = srcRect.left + 'px';
    fly.style.top = srcRect.top + 'px';
    document.body.appendChild(fly);
    requestAnimationFrame(() => {
      fly.style.left = dr.left + 'px';
      fly.style.top = dr.top + 'px';
      fly.style.width = dr.width + 'px';
      fly.style.height = dr.height + 'px';
      fly.style.fontSize = (dr.width * 0.52) + 'px';
    });
    setTimeout(() => {
      fly.remove();
      if (dest.style) dest.style.visibility = '';
      playSnd('tile'); // ses tam iniş anında
      setTimeout(resolve, 40);
    }, 200);
  });
}
function afterDiscard() {
  ui.sel.clear(); ui.drawnId = null;
  ui.timeouts = 0; // oynadı: AFK sayacı sıfırlanır
  stopTurnTimer();
  render();
  if (G.roundOver) { showRoundEnd(); return; }
  botLoop();
}

/* ---------------- bots ---------------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function botLoop() {
  ui.busy = true;
  stopTurnTimer();
  await carpanWait(); // oyuncunun açışından gelen çarpan bitmeden sıra geçmez
  while (G && !G.roundOver && G.turn !== 0) {
    render();
    botSeatTimer(G.turn); // botun koltuğunda da süre barı akar
    await sleep(650);
    if (!G) return; // masadan çıkıldı
    const p = G.players[G.turn];
    const events = E.aiTakeTurn(G);
    maybeBotChat(p, events);
    render();
    await flyBotGroups(G.players.indexOf(p), events); // bot perleri de animasyonla iner
    await carpanWait(); // taşlar indi → çarpan oynar → sonra sıra geçer
    await sleep(420);
  }
  if (!G) return; // masadan çıkıldı
  ui.busy = false;
  render();
  if (G.roundOver) { showRoundEnd(); return; }
  startTurnTimer();
}
function describeEvents(name, events) {
  const msgs = [];
  for (const e of events) {
    if (e.type === 'draw') msgs.push(name + ' desteden çekti.');
    else if (e.type === 'take') msgs.push(name + ' atılan taşı aldı: ' + tileName(e.tile));
    else if (e.type === 'open') msgs.push('🔓 ' + name + ' elini açtı!');
    else if (e.type === 'openPairs') msgs.push('🔓 ' + name + ' ÇİFTTEN açtı!');
    else if (e.type === 'lay') msgs.push(name + ' yeni seri attı.');
    else if (e.type === 'layPair') msgs.push(name + ' çift attı.');
    else if (e.type === 'attach') msgs.push(name + ' taş işledi: ' + tileName(e.tile));
    else if (e.type === 'discard') msgs.push(name + (e.finished ? ' son taşını attı ve BİTİRDİ! 🎉' :
      ' attı: ' + tileName(e.tile) + (e.penalty ? ' (İŞLEK! +101 ceza)' : '')));
    else if (e.type === 'exhausted') msgs.push('Destede taş kalmadı — el bitti.');
  }
  return msgs.length > 4 ? [msgs[0], ...msgs.slice(1, -1).filter(m => m.includes('🔓') || m.includes('BİTİRDİ') || m.includes('İŞLEK')), msgs[msgs.length - 1]] : msgs;
}

/* ---------------- modals ---------------- */
function modal(html) {
  $('modal-box').innerHTML = html;
  $('modal').classList.remove('hidden');
}
function closeModal() {
  $('modal').classList.add('hidden');
  clearInterval(autoNextT); // otomatik devam sayacı varsa iptal
}
/* modal butonu geri sayımla kendiliğinden basılır (otomatik yeni el / yeni oyun) */
let autoNextT = null;
function armAutoNext(id, secs) {
  clearInterval(autoNextT);
  const b = $(id);
  if (!b) return;
  const base = b.textContent;
  let s = secs;
  b.textContent = base + ' (' + s + ')';
  autoNextT = setInterval(() => {
    const bb = $(id);
    if (!bb) { clearInterval(autoNextT); return; }
    s--;
    if (s <= 0) { clearInterval(autoNextT); bb.click(); }
    else bb.textContent = base + ' (' + s + ')';
  }, 1000);
}
window.closeModal = closeModal;

function showRoundEnd() {
  stopTurnTimer();
  render();
  if (G.cancelled) {
    modal('<h2>El İptal</h2><p class="rules">Dört oyuncu da çiftten açtı — bu el sayılmadı, yeni el başlıyor.</p>' +
      '<div class="btnrow"><button class="btn" onclick="window.__next()">Devam</button></div>');
    window.__next = () => { closeModal(); G.round--; G.cancelled = false; beginRound(); };
    return;
  }
  const fin = G.finisher;
  if (G.eldenBitti && fin === 0) { meta.stats.elden++; saveMeta(); }
  if (G.round >= G.rounds) { showFinal(); return; } // son el: ara ekran yok, direkt oyun sonucu
  let head = fin >= 0
    ? '🏁 ' + G.players[fin].name + ' eli bitirdi' +
      (G.eldenBitti ? ' — ELDEN BİTTİ!' : '') +
      (G.finishedWithOkey ? ' (okey ile!)' : '')
    : 'Destede taş kalmadı — herkesin elindeki taşlar sayıldı.';
  const rows = G.players.map((p, i) => resRow({
    crown: i === fin, win: i === fin,
    ava: avaOf(i),
    name: p.name, me: i === 0,
    sub: (p.roundScore > 0 ? '+' : '') + p.roundScore + ' el puanı',
    subCls: p.roundScore < 0 ? 'neg' : 'pos',
    right: p.score, rightSub: 'toplam',
  })).join('');
  let penNote = '';
  if (G.penaltyLog && G.penaltyLog.length) {
    const items = G.penaltyLog.map(e => G.players[e.player].name + ' +' + e.amount).join(' · ');
    penNote = '<p class="rules" style="font-size:12px;color:#ff8a80">⚠ İşlek/okey cezaları: ' + items + '</p>';
  }
  const teamNote = G.esli
    ? '<p class="rules" style="font-size:13px">🤝 Takımlar: Sen & ' + G.players[2].name + ': <b>' + (G.players[0].score + G.players[2].score) + '</b> · ' +
      G.players[1].name + ' & ' + G.players[3].name + ': <b>' + (G.players[1].score + G.players[3].score) + '</b></p>'
    : '';
  modal('<h2>EL SONUCU</h2><p class="reshead">' + head + '</p>' +
    '<div class="reslist">' + rows + '</div>' +
    teamNote + penNote +
    '<div class="btnrow"><button class="btn go" id="btn-nextel" onclick="window.__next()">SONRAKİ EL →</button></div>');
  window.__next = () => { closeModal(); beginRound(); };
  armAutoNext('btn-nextel', 6); // 6 sn sonra otomatik devam
}

/* oyun sonu satırı: avatar + isim + çip + puan (referans tasarım) */
const avaOf = i => (i === 0 ? '🙂' : BOT_AVAS[i - 1]);
function resRow(o) {
  return '<div class="resrow' + (o.win ? ' win' : '') + (o.me ? ' me' : '') + '">' +
    '<span class="rava">' + (o.crown ? '<span class="rcrown">👑</span>' : '') + o.ava + '</span>' +
    '<div class="rinfo"><b>' + escapeHtml(o.name) + '</b>' +
    (o.sub != null ? '<span class="rsub ' + (o.subCls || '') + '">' + o.sub + '</span>' : '') + '</div>' +
    '<div class="rright">' + (o.win ? '<span class="rwin">KAZANAN</span>' : '') +
    '<span class="rpts">' + o.right + '</span>' +
    (o.rightSub ? '<span class="rlbl">' + o.rightSub + '</span>' : '') + '</div></div>';
}

/* game over: rank + chip settlement (3x / 1x / 0 / 0 of the stake) + XP */
function showFinal() {
  if (G.esli) return showFinalEsli();
  const order = G.players.map((p, i) => ({ p, i })).sort((a, b) => a.p.score - b.p.score);
  const myRank = order.findIndex(o => o.i === 0);
  const stake = currentStake;
  const receiveMul = [3, 1, 0, 0];
  const riz = G.rizikolu ? (G.carpan || 1) : 0;
  let chipRows = '';
  let myReceive = 0;
  meta.stats.games++; if (myRank === 0) meta.stats.wins++;
  // bahisler oyun başında ödendi; burada yalnız ALINAN dağıtılır:
  // 1. → 3×bahis, 2. → bahsini geri alır, 3.-4. → 0
  // tek açan bitirdiyse pot süpürülür: kazanan 4 bahsi de alır, "ikinci" olmaz
  const sweep = !riz && G.soloOpen === order[0].i;
  order.forEach((o, rank) => {
    const receive = !stake ? 0 : riz
      ? (rank === 0 ? stake * riz + stake : rank === 1 ? stake : 0)
      : sweep
        ? (rank === 0 ? 4 * stake : 0)
        : receiveMul[rank] * stake;
    if (o.i === 0) myReceive = receive;
    chipRows += resRow({
      crown: rank === 0, win: rank === 0,
      ava: avaOf(o.i),
      name: (rank + 1) + '. ' + o.p.name, me: o.i === 0,
      sub: stake ? '<span class="coin">M</span> ' + (receive ? '+' + fmtChips(receive) : '0') : null,
      subCls: receive > stake ? 'neg' : (!receive && stake) ? 'pos' : '',
      right: o.p.score, rightSub: 'puan',
    });
  });
  if (myReceive > 0) meta.chips += myReceive;
  const lvBefore = levelOf(meta.xp);
  let xpGain = G.rounds * 25 + [100, 50, 20, 10][myRank];
  const noAssist = currentSettings && currentSettings.yardimli === false;
  if (noAssist) xpGain = Math.round(xpGain * 1.5); // yardımsız bonusu
  meta.xp += xpGain;
  const lvAfter = levelOf(meta.xp);
  let bonusNote = '';
  if (meta.chips < 1000) { meta.chips = 1000; bonusNote = '<p class="rules" style="font-size:12px">🎁 Çip yardımı: bakiyen 1.000\'e tamamlandı.</p>'; }
  saveMeta();
  const youWon = myRank === 0;
  modal('<h2>OYUN SONUCU</h2>' +
    '<p class="reshead">' + (youWon ? '🏆 Kazandın!' : order[0].p.name + ' kazandı') +
    (riz ? ' · <b class="rznote">⚡ Çarpan ×' + riz + '</b>' : '') +
    (sweep && stake ? ' · <b class="rznote">Tek açan — potun tamamını aldı!</b>' : '') + '</p>' +
    '<div class="reslist">' + chipRows + '</div>' +
    (lvAfter > lvBefore ? '<p class="rules" style="font-size:12px;text-align:center">🎉 <b>Seviye ' + lvAfter + '!</b></p>' : '') +
    '<div class="btnrow finalbtns"><button class="btn exit" onclick="window.__menu()">MASADAN AYRIL</button>' +
    '<button class="btn go" id="btn-newgame" onclick="window.__again()">YENİ OYUN</button></div>');
  if (myReceive > 0) setTimeout(() => chipFx(myReceive), 500);
  playSnd(youWon ? 'win' : 'lose');
  armAutoNext('btn-newgame', 10); // 10 sn sonra otomatik yeni oyun
  window.__again = () => { closeModal(); launch(currentSettings || settings); };
  window.__menu = () => { closeModal(); $('scr-game').classList.add('hidden'); $('scr-start').classList.remove('hidden'); initStart(); };
}

/* eşli final: takım puanları toplanır; kazanan takımın her oyuncusu net +bahis */
function showFinalEsli() {
  const stake = currentStake;
  const teams = [
    { names: G.players[0].name + ' & ' + G.players[2].name, score: G.players[0].score + G.players[2].score, mine: true },
    { names: G.players[1].name + ' & ' + G.players[3].name, score: G.players[1].score + G.players[3].score, mine: false },
  ].sort((a, b) => a.score - b.score);
  const tie = teams[0].score === teams[1].score;
  const myWin = teams[0].mine && !tie;
  // bahisler baştan ödendi: kazanan takım oyuncusu 2×bahis alır, berabere bahsini geri alır
  const myReceive = stake ? (tie ? stake : myWin ? 2 * stake : 0) : 0;
  meta.stats.games++; if (myWin) meta.stats.wins++;
  let chipRows = '';
  teams.forEach((t, rank) => {
    const receive = stake ? (tie ? stake : rank === 0 ? 2 * stake : 0) : 0;
    chipRows += resRow({
      crown: rank === 0 && !tie, win: rank === 0 && !tie,
      ava: t.mine ? '🙂' : '🧔🏻',
      name: (tie ? '=' : (rank + 1) + '.') + ' ' + t.names, me: t.mine,
      sub: stake ? '<span class="coin">M</span> ' + (receive ? '+' + fmtChips(receive) : '0') + '/kişi' : null,
      subCls: receive > stake ? 'neg' : (!receive && stake) ? 'pos' : '',
      right: t.score, rightSub: 'puan',
    });
  });
  if (myReceive > 0) meta.chips += myReceive;
  const lvBefore = levelOf(meta.xp);
  let xpGain = G.rounds * 25 + (myWin ? 100 : tie ? 50 : 20);
  const noAssist = currentSettings && currentSettings.yardimli === false;
  if (noAssist) xpGain = Math.round(xpGain * 1.5);
  meta.xp += xpGain;
  const lvAfter = levelOf(meta.xp);
  let bonusNote = '';
  if (meta.chips < 1000) { meta.chips = 1000; bonusNote = '<p class="rules" style="font-size:12px">🎁 Çip yardımı: bakiyen 1.000\'e tamamlandı.</p>'; }
  saveMeta();
  modal('<h2>OYUN SONUCU</h2>' +
    '<p class="reshead">' + (myWin ? '🏆 Takımın Kazandı!' : tie ? '🤝 Berabere!' : 'Rakip takım kazandı') + '</p>' +
    '<div class="reslist">' + chipRows + '</div>' +
    (lvAfter > lvBefore ? '<p class="rules" style="font-size:12px;text-align:center">🎉 <b>Seviye ' + lvAfter + '!</b></p>' : '') +
    '<div class="btnrow finalbtns"><button class="btn exit" onclick="window.__menu()">MASADAN AYRIL</button>' +
    '<button class="btn go" id="btn-newgame" onclick="window.__again()">YENİ OYUN</button></div>');
  if (myReceive > 0) setTimeout(() => chipFx(myReceive), 500);
  playSnd(myWin ? 'win' : 'lose');
  armAutoNext('btn-newgame', 10);
  window.__again = () => { closeModal(); launch(currentSettings || settings); };
  window.__menu = () => { closeModal(); $('scr-game').classList.add('hidden'); $('scr-start').classList.remove('hidden'); initStart(); };
}

function showScores() {
  if (!G) return;
  const rows = G.players.map((p, i) =>
    '<tr class="' + (i === 0 ? 'me' : '') + '"><td>' + p.name + '</td><td class="num">' + p.score + '</td>' +
    '<td class="num" style="color:#ff8a80">' + (p.penalty ? '+' + p.penalty : '') + '</td></tr>').join('');
  const teamNote = G.esli
    ? '<p class="rules" style="font-size:13px">🤝 Takımlar: Sen & ' + G.players[2].name + ': <b>' + (G.players[0].score + G.players[2].score) + '</b> · ' +
      G.players[1].name + ' & ' + G.players[3].name + ': <b>' + (G.players[1].score + G.players[3].score) + '</b></p>'
    : '';
  modal('<h2>Puan Durumu — El ' + G.round + '/' + G.rounds + '</h2>' +
    '<table><tr><th>Oyuncu</th><th style="text-align:right">Toplam</th><th style="text-align:right">Ceza</th></tr>' + rows + '</table>' + teamNote +
    '<div class="btnrow"><button class="btn" onclick="window.closeModal()">Kapat</button></div>');
}

function showRules() {
  modal('<h2>101 Okey — Kurallar</h2><div class="rules">' +
    '<p><b>Amaç:</b> En az puanla bitirmek. Elin sonunda eldeki taşlar ceza puanıdır.</p>' +
    '<p><b>Okey:</b> Göstergenin bir üstü okeydir, her taşın yerine geçer (★ rozetli). Okeyine <b>uzun bas</b>: ters çevrilir, kimse ne olduğunu görmez; elini açınca geri döner. ★ sahte okey, okeyin gösterdiği taş yerine geçer.</p>' +
    '<p><b>Açmak:</b> Taşları boşluklarla grupla; kırmızı çerçeve = işlek. Rafın üstündeki sayaç geçerli perlerinin toplamını gösterir; <b>101</b>i geçince <b>SERİ AÇ</b>. Yanlışsa <b>GERİ AL</b> (başka hamle yapmadan). 13 serinin sonudur. 6+ taşlık seriler sadece ilk açılışta 3\'erli bölünür.</p>' +
    '<p><b>Çift:</b> En az <b>5 çift</b> ile <b>ÇİFT AÇ</b>. Çift Diz\'e basınca sayaç kırmızıyla, çift açarsan elinde kalacak cezayı (kalan taşlar × 2) gösterir. Seri açan, ancak masada başka biri çift açmışsa çift atabilir.</p>' +
    '<p><b>İşlek cezası:</b> Masadaki bir pere uyan taşı ya da okeyi atmak <b>+101</b>! Kırmızı halkalılar işlektir; <b>İŞLE</b> hepsini animasyonla masaya koyar. Cezalar oyuncunun profilinde kırmızı yazar.</p>' +
    '<p><b>Okey değişimi:</b> Perde okey varsa, elindeki ★ ya da okeyin tuttuğu <b>gerçek taşla</b> (ör. 8-[okey]-10\'a gerçek 9) üzerine sürükleyerek değiştir: okey rafına gelir.</p>' +
    '<p><b>Süre:</b> Her tur 30 sn (rafın altındaki bar). Süreyi kaçırırsan sonraki 20 sn, sonra 5 sn. Elini açtığında işleme süresi 60 sn olur. Süre bitince senin yerine güvenli bir taş atılır.</p>' +
    '<p><b>Bitiş:</b> Son taşını atan <b>-101</b>; okeyle <b>-202</b>. Açamayanlara 202/404. <b>Elden bitme</b> (tek turda açıp bitirme, kimse açmamışken): bitiren -101 kalır, diğerleri <b>404</b>; okeyle elden bitişte bitiren -202, diğerleri <b>808</b>. Deste biterse herkes elindekini sayar.</p>' +
    '<p><b>Katlamalı:</b> Her yeni açış bir öncekini geçmek zorundadır: 101 ile açıldıysa sonraki en az 102, 120 ise 121… Çiftte de 5 çiftle açıldıysa sonraki en az 6 çift. Katlamasız masada baraj hep 101 / 5 çifttir.</p>' +
    '<p><b>⚡ Rizikolu:</b> Okeyin sayısını taşıyan taşlar, sahte okey (★) ve okey masaya indikçe bahis çarpanı +1 artar. Bitiş bonusu: normal +1, elden +2, okeyle +4. Oyun sonunda 1. olan <b>masa bahsi × çarpan</b> kazanır.</p>' +
    '<p><b>Eşli:</b> Karşında oturan takım arkadaşındır (🤝). Takım puanları toplanır, düşük toplam kazanır; kazanan takımın her oyuncusu rakibin bahsini alır.</p>' +
    '<p><b>Çipler:</b> Masa bedeli lobiye göredir. 1. olan masanın 3 katını alır, 2. bedelini geri alır, 3.-4. kaybeder.</p>' +
    '</div><div class="btnrow"><button class="btn" onclick="window.closeModal()">Kapat</button></div>');
}

/* ---------------- masa sohbeti ---------------- */
const chatState = { msgs: [], unread: 0 };
const CHAT_QUICK = ['Selam! 👋', 'Güzel el 👏', 'Hadi bakalım', 'Şanslıyım bugün 🍀', 'Okey bende 😏', 'Bu el benim 💪'];
const BOT_CHAT = {
  open: ['Açtım! 😎', 'Ben açıldım, sıra sizde 😉', 'İşte bu!'],
  finish: ['Bitti! 🎉', 'Güzel eldi, eyvallah 👏'],
  penalty: ['Off, ceza yedim 😤', 'Görmedim onu ya!'],
  idle: ['Taşlar hiç gelmiyor 😩', 'Çayları tazeleyin ☕', 'Acele etmeyin 🙂', 'Bu gösterge de bir şey değil 😅'],
  reply: ['🙂', 'Aynen öyle!', 'Bol şans!', 'Sana da 👍', '😄', 'Bakalım hocam', 'Eyvallah'],
};
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function escapeHtml(s) { return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }
function addChat(name, text, mine) {
  chatState.msgs.push({ name, text, mine });
  if (chatState.msgs.length > 60) chatState.msgs.shift();
  if (!mine && $('chatpanel').classList.contains('hidden')) chatState.unread++;
  renderChat();
}
function renderChat() {
  const log = $('chatlog');
  if (!log) return;
  log.innerHTML = chatState.msgs.map(m =>
    '<div class="cmsg' + (m.mine ? ' me' : '') + '"><b>' + escapeHtml(m.name) + ':</b> ' + escapeHtml(m.text) + '</div>').join('');
  log.scrollTop = log.scrollHeight;
  const b = $('chat-badge');
  if (b) { b.classList.toggle('hidden', !chatState.unread); b.textContent = chatState.unread; }
}
function sendChat(txt) {
  txt = (txt || '').trim();
  if (!txt) return;
  addChat(store.get('okey101_name', 'Sen'), txt, true);
  if (G && Math.random() < 0.8) setTimeout(() => {
    if (!G) return;
    addChat(G.players[1 + Math.floor(Math.random() * 3)].name, pick(BOT_CHAT.reply), false);
  }, 900 + Math.random() * 1600);
}
function maybeBotChat(p, events) {
  for (const e of events) {
    if ((e.type === 'open' || e.type === 'openPairs') && Math.random() < 0.7) { addChat(p.name, pick(BOT_CHAT.open), false); return; }
    if (e.type === 'discard' && e.finished) { addChat(p.name, pick(BOT_CHAT.finish), false); return; }
    if (e.type === 'discard' && e.penalty) { addChat(p.name, pick(BOT_CHAT.penalty), false); return; }
  }
  if (Math.random() < 0.05) addChat(p.name, pick(BOT_CHAT.idle), false);
}
$('btn-chat').onclick = () => {
  $('chatpanel').classList.toggle('hidden');
  chatState.unread = 0;
  renderChat();
};
$('chat-x').onclick = () => $('chatpanel').classList.add('hidden');
$('chat-send').onclick = () => { sendChat($('chat-inp').value); $('chat-inp').value = ''; };
$('chat-inp').onkeydown = e => { if (e.key === 'Enter') { sendChat($('chat-inp').value); $('chat-inp').value = ''; } };
CHAT_QUICK.forEach(q => {
  const b = document.createElement('button');
  b.className = 'qmsg'; b.textContent = q;
  b.onclick = () => sendChat(q);
  $('chat-quick').appendChild(b);
});

/* ---------------- arkadaş listesi ---------------- */
const FRIENDS_DEF = [
  { n: 'Elif', a: '👩🏻', c: 1250000 }, { n: 'Burak', a: '🧔🏻', c: 830000 },
  { n: 'Zeynep', a: '👩🏻‍🦰', c: 2400000 }, { n: 'Kemal', a: '👨🏻‍🦱', c: 415000 },
  { n: 'Selin', a: '👱🏻‍♀️', c: 5600000 }, { n: 'Emre', a: '👨🏽', c: 92000 },
];
let friends = store.get('okey101_friends', FRIENDS_DEF);
function showFriends() {
  let html = '<h2>👥 Arkadaşlar</h2><div class="frlist">';
  friends.forEach((f, i) => {
    html += '<div class="frrow"><span class="fava">' + f.a + '</span>' +
      '<div class="finfo"><b>' + escapeHtml(f.n) + '</b><span class="fchip"><span class="coin">M</span> ' + fmtChips(f.c) + '</span></div>' +
      '<button class="btn small" id="fr-g-' + i + '" title="Hediye çip yolla">🎁</button>' +
      '<button class="btn secondary small" id="fr-m-' + i + '" title="Mesaj at">💬</button></div>';
  });
  html += '</div><p class="rules" style="font-size:11.5px">Gerçek arkadaş ekleme çok oyunculu sürümle geliyor.</p>' +
    '<div class="btnrow"><button class="btn" onclick="window.closeModal()">Kapat</button></div>';
  modal(html);
  friends.forEach((f, i) => {
    $('fr-g-' + i).onclick = () => {
      f.c += 1000;
      store.set('okey101_friends', friends);
      toast('🎁 ' + f.n + ' adlı arkadaşına 1.000 çip yolladın!');
      closeModal(); showFriends();
    };
    $('fr-m-' + i).onclick = () => friendChat(f);
  });
}
function friendChat(f) {
  modal('<h2>💬 ' + f.a + ' ' + escapeHtml(f.n) + '</h2><div id="fclog" class="fclog"></div>' +
    '<div class="cinput"><input id="fc-inp" maxlength="80" placeholder="Mesaj yaz…"><button class="btn small" id="fc-send">Gönder</button></div>' +
    '<div class="btnrow"><button class="btn secondary" id="fc-back">◀ Arkadaşlar</button></div>');
  const log = $('fclog');
  const add = (who, t, mine) => {
    log.innerHTML += '<div class="cmsg' + (mine ? ' me' : '') + '"><b>' + escapeHtml(who) + ':</b> ' + escapeHtml(t) + '</div>';
    log.scrollTop = log.scrollHeight;
  };
  const send = () => {
    const v = $('fc-inp').value.trim();
    if (!v) return;
    add('Sen', v, true);
    $('fc-inp').value = '';
    setTimeout(() => { if ($('fclog')) add(f.n, pick(BOT_CHAT.reply), false); }, 800 + Math.random() * 1200);
  };
  $('fc-send').onclick = send;
  $('fc-inp').onkeydown = e => { if (e.key === 'Enter') send(); };
  $('fc-back').onclick = () => { closeModal(); showFriends(); };
}
$('btn-friends').onclick = showFriends;

/* ---------------- profil penceresi + görevler ---------------- */
function showProfile() {
  const lv = levelOf(meta.xp), prog = Math.round((meta.xp % 250) / 250 * 100);
  const s = meta.stats;
  const TASKS = [
    { id: 't1', name: '3 oyun oyna', goal: 3, cur: s.games, odul: 25000 },
    { id: 't2', name: '1 oyun kazan', goal: 1, cur: s.wins, odul: 50000 },
    { id: 't3', name: 'Elden bitir', goal: 1, cur: s.elden, odul: 100000 },
  ];
  const trows = TASKS.map(t => {
    const done = t.cur >= t.goal, claimed = meta.tasks[t.id];
    return '<div class="dlg-row"><span class="lbl">' + t.name + ' <span class="tprog">' + Math.min(t.cur, t.goal) + '/' + t.goal + '</span></span>' +
      (claimed ? '<span class="dlg-toggle on">ALINDI ✓</span>'
        : done ? '<button class="btn small" data-task="' + t.id + '" data-odul="' + t.odul + '">🎁 ' + fmtChips(t.odul) + '</button>'
        : '<span class="dlg-toggle dis">🎁 ' + fmtChips(t.odul) + '</span>') + '</div>';
  }).join('');
  const winPct = s.games ? Math.round(s.wins / s.games * 100) : 0;
  modal('<h2>👤 Profil</h2>' +
    '<div class="dlg-row"><span class="lbl">İSİM</span><span class="val">' + escapeHtml(store.get('okey101_name', 'Sen')) + '</span></div>' +
    '<div class="dlg-row"><span class="lbl">ÇİP</span><span class="val"><span class="coin">M</span> ' + fmtChips(meta.chips) + '</span></div>' +
    '<div class="dlg-row"><span class="lbl">SEVİYE</span><span class="val">' + lv + ' · %' + prog + '</span></div>' +
    '<div class="dlg-row"><span class="lbl">BAŞLANGIÇ</span><span class="val">' + meta.start + '</span></div>' +
    '<div class="dlg-row"><span class="lbl">İSTATİSTİKLER</span><span class="val">' + s.games + ' oyun · ' + s.wins + ' galibiyet (%' + winPct + ') · ' + s.elden + ' elden</span></div>' +
    '<h2 style="font-size:15px;margin:8px 0 2px">🎯 Görevler</h2>' + trows +
    '<p class="rules" style="font-size:11.5px">Sıralamalar, şampiyonalar ve yeni görevler yakında!</p>' +
    '<div class="btnrow"><button class="btn" onclick="window.closeModal()">Kapat</button></div>');
  document.querySelectorAll('#modal-box [data-task]').forEach(b => b.onclick = () => {
    meta.tasks[b.dataset.task] = true;
    meta.chips += +b.dataset.odul;
    saveMeta();
    toast('🎁 Görev ödülü: +' + fmtChips(+b.dataset.odul) + ' çip!');
    closeModal(); showProfile(); initStart();
  });
}
$('profile-card').onclick = e => { if (e.target.id !== 'inp-name') showProfile(); };

/* init */
initStart();
window.__okey = {
  get G() { return G; }, render, get ui() { return ui; },
  get rack() { return rackSlots.slice(); },
  setRack(a) { rackSlots = a.slice(0, RACK_SLOTS); while (rackSlots.length < RACK_SLOTS) rackSlots.push(null); },
  analyze: () => analyzeRack(), sortRack, showRoundEnd, showFinal,
  get meta() { return meta; },
  timer: { expire: onTurnTimeout, start: startTurnTimer, get deadline() { return timerDeadline; } },
};
})();
