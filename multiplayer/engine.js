/* =========================================================
   OKEY 101 — Oyun Motoru (Game Engine)
   Pure logic, no DOM. Works in browser and Node.
   ========================================================= */
'use strict';

const COLORS = ['red', 'yellow', 'blue', 'black'];
const COLOR_TR = { red: 'Kırmızı', yellow: 'Sarı', blue: 'Mavi', black: 'Siyah' };

/* ---------- Tiles ---------- */
// tile: { id, color: 0..3, num: 1..13, fake: bool }  (fake => sahte okey / joker tile)
function createTileSet() {
  const tiles = [];
  let id = 0;
  for (let c = 0; c < 4; c++) {
    for (let n = 1; n <= 13; n++) {
      tiles.push({ id: id++, color: c, num: n, fake: false });
      tiles.push({ id: id++, color: c, num: n, fake: false });
    }
  }
  tiles.push({ id: id++, color: -1, num: 0, fake: true });
  tiles.push({ id: id++, color: -1, num: 0, fake: true });
  return tiles; // 106
}

function shuffle(arr, rng) {
  rng = rng || Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* Okey (wild) determination: indicator tile -> okey = same color, num+1 (13 -> 1) */
function okeyFromIndicator(ind) {
  return { color: ind.color, num: ind.num === 13 ? 1 : ind.num + 1 };
}

function isOkeyTile(t, okey) { // real wild tile
  return !t.fake && t.color === okey.color && t.num === okey.num;
}

/* Effective identity of a tile for melds:
   - real okey  -> wildcard (returns null)
   - fake joker -> plays as the okey's color/number
   - normal     -> itself */
function effective(t, okey) {
  if (t.fake) return { color: okey.color, num: okey.num };
  if (isOkeyTile(t, okey)) return null; // wildcard
  return { color: t.color, num: t.num };
}

/* Point value of a tile left in hand (okey & fake joker count as okey's number) */
function tileValue(t, okey) {
  if (t.fake || isOkeyTile(t, okey)) return okey.num;
  return t.num;
}

/* ---------- Meld validation ----------
   A meld is valid as:
   - GROUP: 3-4 tiles, same number, all different colors
   - RUN:   3+ tiles, same color, consecutive numbers.
            1 may follow 13 (…12,13,1) but sequence cannot continue past 1 (13,1,2 invalid).
   Wildcards (real okey tiles) can substitute anything.
   Returns { valid, type, points } — points = sum of represented numbers (1 always counts 1). */
function validateMeld(tiles, okey) {
  if (!tiles || tiles.length < 3) return { valid: false };
  let wilds = 0;
  const eff = [];
  for (const t of tiles) {
    const e = effective(t, okey);
    if (e === null) wilds++;
    else eff.push(e);
  }
  // all wilds: treat as group of okey.num
  if (eff.length === 0) {
    if (tiles.length <= 4) return { valid: true, type: 'group', points: okey.num * tiles.length };
    return { valid: false };
  }

  // GROUP check
  const num = eff[0].num;
  const sameNum = eff.every(e => e.num === num);
  if (sameNum && tiles.length >= 3 && tiles.length <= 4) {
    const colors = new Set(eff.map(e => e.color));
    if (colors.size === eff.length) {
      return { valid: true, type: 'group', points: num * tiles.length };
    }
  }

  // RUN check
  const color = eff[0].color;
  if (eff.every(e => e.color === color)) {
    const res = validateRunNumbers(eff.map(e => e.num), wilds, tiles.length);
    if (res.valid) return { valid: true, type: 'run', points: res.points };
  }
  return { valid: false };
}

/* Try to arrange given numbers (same color) + wilds into a consecutive run.
   Numbers 1..13; 1 may also act as 14 (after 13). No duplicates.
   Wilds fill internal gaps first; leftover wilds extend high end, then low end.
   Value of position 14 counts as 1 point. */
function validateRunNumbers(nums, wilds, totalLen) {
  if (new Set(nums).size !== nums.length) return { valid: false };
  const tryArrange = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    const min = s[0], max = s[s.length - 1];
    const span = max - min + 1;
    if (span > totalLen) return null;
    const gaps = span - s.length;
    if (gaps > wilds) return null;
    let extra = wilds - gaps;
    // occupy [min..max], then extend: high first, then low
    let lo = min, hi = max;
    while (extra > 0 && hi < 14) { hi++; extra--; }
    while (extra > 0 && lo > 1) { lo--; extra--; }
    if (extra > 0) return null;
    if (hi > 14 || lo < 1) return null;
    // 14 only allowed if it's the very top (1 after 13); positions beyond 14 impossible
    let points = 0;
    for (let n = lo; n <= hi; n++) points += (n === 14 ? 1 : n);
    return { valid: true, points };
  };
  // interpretation A: 1 is low
  let best = tryArrange(nums);
  // interpretation B: 1 acts as 14 (only if 1 present and 13 or high numbers involved)
  if (nums.includes(1)) {
    const alt = nums.map(n => (n === 1 ? 14 : n));
    const r = tryArrange(alt);
    if (r && (!best || r.points > best.points)) best = r;
  }
  return best || { valid: false };
}

/* Pair: exactly 2 tiles with identical effective identity; wildcard matches anything */
function validatePair(tiles, okey) {
  if (!tiles || tiles.length !== 2) return { valid: false };
  const a = effective(tiles[0], okey), b = effective(tiles[1], okey);
  if (a === null || b === null) return { valid: true, type: 'pair' };
  return { valid: a.color === b.color && a.num === b.num, type: 'pair' };
}

/* Can `tile` be appended to an existing meld (group/run)? Pairs cannot be extended. */
function canAttach(meld, tile, okey) {
  if (meld.type === 'pair') return false;
  const test = validateMeld([...meld.tiles, tile], okey);
  return test.valid;
}

/* ---------- Hand analysis (AI + hints) ---------- */
/* Greedy best meld cover: repeatedly extract the highest-point meld. */
function bestMeldCover(hand, okey) {
  const pool = hand.slice();
  const melds = [];
  let total = 0;
  for (;;) {
    const m = bestSingleMeld(pool, okey);
    if (!m) break;
    melds.push(m);
    total += m.points;
    for (const t of m.tiles) {
      const i = pool.findIndex(p => p.id === t.id);
      pool.splice(i, 1);
    }
  }
  return { melds, points: total, leftover: pool };
}

function bestSingleMeld(pool, okey) {
  const wildTiles = pool.filter(t => effective(t, okey) === null);
  const normal = pool.filter(t => effective(t, okey) !== null);
  // index by color/num of effective identity (fake jokers become okey identity)
  const byColorNum = new Map(); // key `${c}-${n}` -> tiles[]
  for (const t of normal) {
    const e = effective(t, okey);
    const k = e.color + '-' + e.num;
    if (!byColorNum.has(k)) byColorNum.set(k, []);
    byColorNum.get(k).push(t);
  }
  const take = (c, n) => {
    const arr = byColorNum.get(c + '-' + n);
    return arr && arr.length ? arr[arr.length - 1] : null;
  };
  let best = null;
  const consider = (tiles, points, type) => {
    if (!best || points > best.points) best = { tiles, points, type };
  };

  // GROUPS: for each number, distinct colors available
  for (let n = 1; n <= 13; n++) {
    const colorsAvail = [];
    for (let c = 0; c < 4; c++) if (take(c, n)) colorsAvail.push(c);
    const maxW = Math.min(wildTiles.length, 4 - colorsAvail.length);
    for (let w = 0; w <= maxW; w++) {
      const size = colorsAvail.length + w;
      if (size < 3 || size > 4) continue;
      const tiles = colorsAvail.map(c => take(c, n)).concat(wildTiles.slice(0, w));
      consider(tiles, n * size, 'group');
    }
  }

  // RUNS: windows per color; allow 1 as 14
  for (let c = 0; c < 4; c++) {
    const have = (n) => !!take(c, (n === 14 ? 1 : n));
    for (let start = 1; start <= 12; start++) {
      for (let end = start + 2; end <= 14 && end - start + 1 <= 13; end++) {
        if (end >= 14 && start <= 1) break; // 1..14 would use 1 twice
        let missing = [];
        for (let n = start; n <= end; n++) if (!have(n)) missing.push(n);
        if (missing.length > wildTiles.length) continue;
        // Require at least (len - wilds) real tiles and ends should preferably exist
        const tiles = [];
        const usedOne = { flag: false };
        for (let n = start; n <= end; n++) {
          if (have(n)) {
            const t = take(c, n === 14 ? 1 : n);
            // avoid using same physical tile twice for 1 and 14
            if (tiles.some(x => x.id === t.id)) { missing.push(n); continue; }
            tiles.push(t);
          }
        }
        if ((end - start + 1) - tiles.length > wildTiles.length) continue;
        const wNeed = (end - start + 1) - tiles.length;
        const meldTiles = tiles.concat(wildTiles.slice(0, wNeed));
        let pts = 0;
        for (let n = start; n <= end; n++) pts += (n === 14 ? 1 : n);
        // verify
        const v = validateMeld(meldTiles, okey);
        if (v.valid) consider(meldTiles, v.points, 'run');
      }
    }
  }
  // require a minimum: any valid meld
  return best;
}

/* Count best pair cover (for pairs opening). Wildcards pair with leftovers. */
function bestPairCover(hand, okey) {
  const wilds = hand.filter(t => effective(t, okey) === null);
  const normal = hand.filter(t => effective(t, okey) !== null);
  const groups = new Map();
  for (const t of normal) {
    const e = effective(t, okey);
    const k = e.color + '-' + e.num;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const pairs = [];
  const singles = [];
  for (const arr of groups.values()) {
    while (arr.length >= 2) pairs.push([arr.pop(), arr.pop()]);
    if (arr.length) singles.push(arr.pop());
  }
  // wilds pair with highest-value singles first
  singles.sort((a, b) => tileValue(b, okey) - tileValue(a, okey));
  const wpool = wilds.slice();
  while (wpool.length && singles.length) pairs.push([wpool.pop(), singles.shift()]);
  while (wpool.length >= 2) pairs.push([wpool.pop(), wpool.pop()]);
  return pairs;
}

/* ---------- Game state ---------- */
/*
players: [{ name, isBot, hand:[], opened:false, openType:null ('normal'|'pairs'),
            score, roundScore }]
tableMelds: [{ owner, type, tiles:[] }]
*/
function newGame(opts) {
  const g = {
    rounds: opts.rounds || 5,
    round: 0,
    players: opts.names.map((name, i) => ({
      name, isBot: i !== 0, hand: [], opened: false, openType: null,
      score: 0, roundScore: 0,
    })),
    rng: opts.rng || Math.random,
  };
  return g;
}

function startRound(g) {
  g.round++;
  const tiles = shuffle(createTileSet(), g.rng);
  // indicator: must be a normal tile
  let indIdx = tiles.findIndex(t => !t.fake);
  const indicator = tiles.splice(indIdx, 1)[0];
  g.indicator = indicator;
  g.okey = okeyFromIndicator(indicator);
  // dealer rotates; starter = player after dealer (counter-clockwise = next index)
  g.dealer = (g.round - 1) % 4;
  g.turn = (g.dealer + 1) % 4;
  g.starter = g.turn;
  for (const p of g.players) {
    p.hand = []; p.opened = false; p.openType = null; p.roundScore = 0;
    p.tookDiscard = null;
  }
  for (let i = 0; i < 4; i++) {
    const cnt = i === g.starter ? 22 : 21;
    const p = g.players[i];
    for (let k = 0; k < cnt; k++) p.hand.push(tiles.pop());
  }
  g.deck = tiles;
  g.discards = [[], [], [], []]; // per-player discard piles
  g.tableMelds = [];
  g.phase = 'discard'; // starter begins by discarding (no draw)
  g.hasDrawn = true;   // starter counts as "drawn" (they discard directly)
  g.finisher = -1;
  g.finishedWithOkey = false;
  g.roundOver = false;
  g.log = [];
}

/* Whose discard can current player take? previous player in turn order */
function prevPlayer(g) { return (g.turn + 3) % 4; }
function nextPlayer(g) { return (g.turn + 1) % 4; }

function lastDiscardOfPrev(g) {
  const pile = g.discards[prevPlayer(g)];
  return pile.length ? pile[pile.length - 1] : null;
}

function drawFromDeck(g) {
  if (g.hasDrawn || g.roundOver) return null;
  if (!g.deck.length) return null;
  const t = g.deck.pop();
  g.players[g.turn].hand.push(t);
  g.hasDrawn = true;
  return t;
}

function takeDiscard(g) {
  if (g.hasDrawn || g.roundOver) return null;
  const pile = g.discards[prevPlayer(g)];
  if (!pile.length) return null;
  const t = pile.pop();
  const p = g.players[g.turn];
  p.hand.push(t);
  p.tookDiscard = t.id; // must be used this turn
  g.hasDrawn = true;
  return t;
}

/* Undo a takeDiscard (tile goes back, player draws from deck instead) */
function returnDiscard(g) {
  const p = g.players[g.turn];
  if (p.tookDiscard == null) return null;
  const idx = p.hand.findIndex(t => t.id === p.tookDiscard);
  const t = p.hand.splice(idx, 1)[0];
  g.discards[prevPlayer(g)].push(t);
  p.tookDiscard = null;
  g.hasDrawn = false;
  return drawFromDeck(g);
}

/* Open hand with melds (normal) or pairs. meldsTiles: array of tile arrays. */
function openHand(g, meldsTiles, mode) {
  const p = g.players[g.turn];
  if (p.opened) return { ok: false, err: 'Zaten açtınız.' };
  if (!g.hasDrawn) return { ok: false, err: 'Önce taş çekmelisiniz.' };

  const flat = meldsTiles.flat();
  // all tiles must be in hand, no duplicates
  const ids = new Set();
  for (const t of flat) {
    if (ids.has(t.id)) return { ok: false, err: 'Aynı taş iki kez kullanılamaz.' };
    ids.add(t.id);
    if (!p.hand.some(h => h.id === t.id)) return { ok: false, err: 'Taş elinizde değil.' };
  }
  // must keep at least 1 tile to discard
  if (p.hand.length - flat.length < 1) return { ok: false, err: 'Son taşı atmak için elinizde taş kalmalı.' };
  // took discard must be used
  if (p.tookDiscard != null && !ids.has(p.tookDiscard)) {
    return { ok: false, err: 'Ortadan aldığınız taşı kullanmak zorundasınız.' };
  }

  const newMelds = [];
  if (mode === 'pairs') {
    if (meldsTiles.length < 5) return { ok: false, err: 'Çiftten açmak için en az 5 çift gerekir.' };
    for (const mt of meldsTiles) {
      const v = validatePair(mt, g.okey);
      if (!v.valid) return { ok: false, err: 'Geçersiz çift var.' };
      newMelds.push({ owner: g.turn, type: 'pair', tiles: mt });
    }
  } else {
    let total = 0;
    for (const mt of meldsTiles) {
      const v = validateMeld(mt, g.okey);
      if (!v.valid) return { ok: false, err: 'Geçersiz per var.' };
      total += v.points;
      newMelds.push({ owner: g.turn, type: v.type, tiles: mt });
    }
    if (total < 101) return { ok: false, err: 'Açmak için en az 101 sayı gerekir. (Şu an: ' + total + ')' };
  }

  // commit
  for (const t of flat) {
    const i = p.hand.findIndex(h => h.id === t.id);
    p.hand.splice(i, 1);
  }
  g.tableMelds.push(...newMelds);
  p.opened = true;
  p.openType = mode === 'pairs' ? 'pairs' : 'normal';
  p.tookDiscard = null;
  return { ok: true };
}

/* Lay a new meld after having opened (normal openers, any point value) */
function layMeld(g, tiles) {
  const p = g.players[g.turn];
  if (!p.opened || p.openType !== 'normal') return { ok: false, err: 'Önce elinizi (101 ile) açmalısınız.' };
  if (!g.hasDrawn) return { ok: false, err: 'Önce taş çekmelisiniz.' };
  const v = validateMeld(tiles, g.okey);
  if (!v.valid) return { ok: false, err: 'Geçersiz per.' };
  if (p.hand.length - tiles.length < 1) return { ok: false, err: 'Son taşı atmak için elinizde taş kalmalı.' };
  const ids = new Set();
  for (const t of tiles) {
    if (ids.has(t.id)) return { ok: false, err: 'Aynı taş iki kez kullanılamaz.' };
    ids.add(t.id);
    if (!p.hand.some(h => h.id === t.id)) return { ok: false, err: 'Taş elinizde değil.' };
  }
  for (const t of tiles) {
    const i = p.hand.findIndex(h => h.id === t.id);
    p.hand.splice(i, 1);
  }
  g.tableMelds.push({ owner: g.turn, type: v.type, tiles });
  if (p.tookDiscard != null && tiles.some(t => t.id === p.tookDiscard)) p.tookDiscard = null;
  return { ok: true };
}

/* Lay additional pair (only for pairs-openers) */
function layPair(g, tiles) {
  const p = g.players[g.turn];
  if (!p.opened || p.openType !== 'pairs') return { ok: false, err: 'Sadece çiftten açanlar çift işleyebilir.' };
  if (!g.hasDrawn) return { ok: false, err: 'Önce taş çekmelisiniz.' };
  const v = validatePair(tiles, g.okey);
  if (!v.valid) return { ok: false, err: 'Geçersiz çift.' };
  if (p.hand.length - 2 < 1) return { ok: false, err: 'Son taşı atmak için elinizde taş kalmalı.' };
  for (const t of tiles) {
    const i = p.hand.findIndex(h => h.id === t.id);
    if (i < 0) return { ok: false, err: 'Taş elinizde değil.' };
  }
  for (const t of tiles) {
    const i = p.hand.findIndex(h => h.id === t.id);
    p.hand.splice(i, 1);
  }
  g.tableMelds.push({ owner: g.turn, type: 'pair', tiles });
  if (p.tookDiscard != null && tiles.some(t => t.id === p.tookDiscard)) p.tookDiscard = null;
  return { ok: true };
}

/* Attach one tile from hand to a table meld (must have opened) */
function attachTile(g, tile, meldIndex) {
  const p = g.players[g.turn];
  if (!p.opened) return { ok: false, err: 'Önce elinizi açmalısınız.' };
  if (!g.hasDrawn) return { ok: false, err: 'Önce taş çekmelisiniz.' };
  const meld = g.tableMelds[meldIndex];
  if (!meld) return { ok: false, err: 'Per bulunamadı.' };
  const i = p.hand.findIndex(h => h.id === tile.id);
  if (i < 0) return { ok: false, err: 'Taş elinizde değil.' };
  if (!canAttach(meld, tile, g.okey)) return { ok: false, err: 'Bu taş bu pere işlenemez.' };
  if (p.hand.length - 1 < 1) return { ok: false, err: 'Son taşı atmak için elinizde taş kalmalı.' };
  p.hand.splice(i, 1);
  meld.tiles.push(tile);
  if (p.tookDiscard != null && tile.id === p.tookDiscard) p.tookDiscard = null;
  return { ok: true };
}

/* Discard to end turn */
function discardTile(g, tile) {
  const p = g.players[g.turn];
  if (!g.hasDrawn) return { ok: false, err: 'Önce taş çekmelisiniz.' };
  if (p.tookDiscard != null && tile.id === p.tookDiscard) {
    return { ok: false, err: 'Ortadan aldığınız taşı atamazsınız; kullanmak zorundasınız.' };
  }
  if (p.tookDiscard != null) {
    return { ok: false, err: 'Ortadan aldığınız taşı bir pere işlemeden bitiremezsiniz.' };
  }
  const i = p.hand.findIndex(h => h.id === tile.id);
  if (i < 0) return { ok: false, err: 'Taş elinizde değil.' };
  p.hand.splice(i, 1);
  g.discards[g.turn].push(tile);

  if (p.hand.length === 0) {
    // must have opened to finish
    if (!p.opened) {
      // shouldn't happen (opening requires melds), but guard
      p.hand.push(g.discards[g.turn].pop());
      return { ok: false, err: 'Açmadan bitemezsiniz.' };
    }
    g.finisher = g.turn;
    g.finishedWithOkey = isOkeyTile(tile, g.okey) || tile.fake;
    endRound(g);
    return { ok: true, finished: true };
  }

  // deck exhausted?
  if (g.deck.length === 0) {
    // next player has no tile to draw — round ends drawn (middle exhausted)
    // (they could still take the discard, but classic play ends the round; we end it)
    endRound(g);
    return { ok: true, exhausted: true };
  }

  g.turn = nextPlayer(g);
  g.hasDrawn = false;
  g.players[g.turn].tookDiscard = null;
  return { ok: true };
}

/* ---------- Scoring ---------- */
function endRound(g) {
  g.roundOver = true;
  const fin = g.finisher;
  const withOkey = g.finishedWithOkey;
  // "elden bitme": finisher opened everything on their final turn while nobody else had opened
  let eldenBitti = false;
  if (fin >= 0) {
    const othersOpened = g.players.some((p, i) => i !== fin && p.opened);
    const finisherMelds = g.tableMelds.filter(m => m.owner === fin);
    // if no other player opened at all -> all scores doubled
    eldenBitti = !othersOpened && finisherMelds.length > 0;
  }
  for (let i = 0; i < 4; i++) {
    const p = g.players[i];
    let pts;
    if (fin === i) {
      pts = withOkey ? -202 : -101;
      if (eldenBitti) pts *= 2; // -404
    } else if (fin >= 0) {
      if (!p.opened) {
        pts = withOkey ? 404 : 202;
      } else {
        let sum = p.hand.reduce((s, t) => s + tileValue(t, g.okey), 0);
        if (withOkey) sum *= 2;
        if (p.openType === 'pairs') sum *= 2;           // double player caught
        pts = sum;
      }
      if (g.players[fin].openType === 'pairs') pts *= 2; // double player finished
      if (eldenBitti) pts *= 2;
    } else {
      // deck exhausted, no finisher
      if (!p.opened) pts = 202;
      else {
        let sum = p.hand.reduce((s, t) => s + tileValue(t, g.okey), 0);
        if (p.openType === 'pairs') sum *= 2;
        pts = sum;
      }
    }
    p.roundScore = pts;
    p.score += pts;
  }
  g.phase = 'roundEnd';
}

/* Cancel round: all four players opened pairs */
function checkAllPairsCancel(g) {
  if (g.players.every(p => p.opened && p.openType === 'pairs')) {
    g.roundOver = true;
    g.cancelled = true;
    for (const p of g.players) p.roundScore = 0;
    g.phase = 'roundEnd';
    return true;
  }
  return false;
}

/* ---------- AI ---------- */
function aiUsefulness(hand, tile, okey) {
  // heuristic usefulness of a tile within hand
  const e = effective(tile, okey);
  if (e === null) return 1000; // never discard okey
  let u = 0;
  for (const o of hand) {
    if (o.id === tile.id) continue;
    const oe = effective(o, okey);
    if (oe === null) { u += 0.5; continue; }
    if (oe.num === e.num && oe.color === e.color) u += 3;        // pair
    else if (oe.num === e.num && oe.color !== e.color) u += 1.5; // group potential
    else if (oe.color === e.color && Math.abs(oe.num - e.num) === 1) u += 1.5;
    else if (oe.color === e.color && Math.abs(oe.num - e.num) === 2) u += 0.7;
  }
  return u;
}

function aiChooseDiscard(g, p) {
  // discard least useful, highest value; prefer not to break made melds
  const cover = bestMeldCover(p.hand, g.okey);
  const inMeld = new Set(cover.melds.flatMap(m => m.tiles.map(t => t.id)));
  let cand = p.hand.filter(t => !inMeld.has(t.id));
  if (!cand.length) cand = p.hand.slice();
  cand = cand.filter(t => p.tookDiscard == null || t.id !== p.tookDiscard);
  if (!cand.length) cand = p.hand.filter(t => t.id !== p.tookDiscard);
  if (!cand.length) cand = p.hand.slice();
  let best = null, bestScore = Infinity;
  for (const t of cand) {
    const u = aiUsefulness(p.hand, t, g.okey);
    const score = u * 100 - tileValue(t, g.okey);
    if (score < bestScore) { bestScore = score; best = t; }
  }
  return best;
}

/* Perform full AI turn. Returns array of event objects for UI animation. */
function aiTakeTurn(g) {
  const events = [];
  const p = g.players[g.turn];
  const idx = g.turn;

  // ---- 1. Draw phase ----
  if (!g.hasDrawn) {
    const disc = lastDiscardOfPrev(g);
    let took = false;
    if (disc) {
      if (p.opened && p.openType === 'normal') {
        // take if attaches to any meld
        const mi = g.tableMelds.findIndex(m => canAttach(m, disc, g.okey));
        if (mi >= 0) {
          takeDiscard(g);
          events.push({ type: 'take', player: idx, tile: disc });
          attachTile(g, disc, mi);
          events.push({ type: 'attach', player: idx, tile: disc, meld: mi });
          took = true;
        }
      } else if (!p.opened) {
        // take if enables opening with the tile used
        const trial = p.hand.concat([disc]);
        const cover = bestMeldCover(trial, g.okey);
        const usesTile = cover.melds.some(m => m.tiles.some(t => t.id === disc.id));
        if (cover.points >= 101 && usesTile && trial.length - cover.melds.flat().length >= 1) {
          takeDiscard(g);
          events.push({ type: 'take', player: idx, tile: disc });
          const meldsTiles = trimCoverForOpen(cover, trial.length);
          const r = openHand(g, meldsTiles, 'normal');
          if (r.ok) { events.push({ type: 'open', player: idx, melds: meldsTiles }); took = true; }
          else { returnDiscard(g); events.push({ type: 'draw', player: idx }); took = true; }
        }
      }
    }
    if (!took) {
      const t = drawFromDeck(g);
      if (!t) { endRound(g); events.push({ type: 'exhausted' }); return events; }
      events.push({ type: 'draw', player: idx });
    }
  }

  // ---- 2. Open if possible ----
  if (!p.opened) {
    const cover = bestMeldCover(p.hand, g.okey);
    if (cover.points >= 101 && p.hand.length - cover.melds.flat().length >= 1) {
      const meldsTiles = trimCoverForOpen(cover, p.hand.length);
      const r = openHand(g, meldsTiles, 'normal');
      if (r.ok) events.push({ type: 'open', player: idx, melds: meldsTiles });
    } else {
      // pairs opening
      const pairs = bestPairCover(p.hand, g.okey);
      if (pairs.length >= 6 && p.hand.length - pairs.length * 2 >= 1) {
        // open with pairs only when strong (6+ pairs) — AI conservative
        const r = openHand(g, pairs, 'pairs');
        if (r.ok) {
          events.push({ type: 'openPairs', player: idx, melds: pairs });
          checkAllPairsCancel(g);
          if (g.roundOver) return events;
        }
      }
    }
  }

  // ---- 3. Lay new melds + attach loop (opened players) ----
  if (p.opened && p.openType === 'normal') {
    // lay any new melds (any value) while keeping one tile to discard
    let laying = true;
    while (laying) {
      laying = false;
      const cover = bestMeldCover(p.hand, g.okey);
      for (const m of cover.melds) {
        if (p.hand.length - m.tiles.length < 1) continue;
        // avoid spending the okey in a low-value meld early
        const usesWild = m.tiles.some(t => effective(t, g.okey) === null);
        if (usesWild && p.hand.length > 5 && m.points < 20) continue;
        const r = layMeld(g, m.tiles);
        if (r.ok) { events.push({ type: 'lay', player: idx, tiles: m.tiles }); laying = true; break; }
      }
    }
    let changed = true;
    while (changed && p.hand.length > 1) {
      changed = false;
      for (const t of p.hand.slice()) {
        if (p.hand.length <= 1) break;
        const mi = g.tableMelds.findIndex(m => canAttach(m, t, g.okey));
        // don't waste okey by attaching unless it finishes the hand soon
        const isWild = effective(t, g.okey) === null;
        if (mi >= 0 && (!isWild || p.hand.length <= 3)) {
          attachTile(g, t, mi);
          events.push({ type: 'attach', player: idx, tile: t, meld: mi });
          changed = true;
        }
      }
    }
  } else if (p.opened && p.openType === 'pairs') {
    // lay extra pairs, and attach to others' melds
    let changed = true;
    while (changed && p.hand.length > 2) {
      changed = false;
      const pairs = bestPairCover(p.hand, g.okey);
      if (pairs.length && p.hand.length - 2 >= 1) {
        const pr = pairs[0];
        const r = layPair(g, pr);
        if (r.ok) { events.push({ type: 'layPair', player: idx, tiles: pr }); changed = true; continue; }
      }
      for (const t of p.hand.slice()) {
        if (p.hand.length <= 1) break;
        const mi = g.tableMelds.findIndex(m => canAttach(m, t, g.okey));
        const isWild = effective(t, g.okey) === null;
        if (mi >= 0 && !isWild) {
          attachTile(g, t, mi);
          events.push({ type: 'attach', player: idx, tile: t, meld: mi });
          changed = true;
        }
      }
    }
  }

  if (g.roundOver) return events;

  // ---- 4. Discard ----
  const d = aiChooseDiscard(g, p);
  if (p.tookDiscard != null) {
    // couldn't use the taken tile (open failed) — rules: return & draw handled earlier.
    // Safety: clear flag to avoid deadlock (should not happen)
    p.tookDiscard = null;
  }
  const r = discardTile(g, d);
  events.push({ type: 'discard', player: idx, tile: d, finished: !!(r && r.finished) });
  return events;
}

/* Reduce a greedy cover so at least one tile remains in hand after opening */
function trimCoverForOpen(cover, handLen) {
  let melds = cover.melds.map(m => m.tiles);
  let used = melds.reduce((s, m) => s + m.length, 0);
  while (handLen - used < 1 && melds.length) {
    // drop the lowest-point meld while keeping >= 101
    let dropIdx = -1, dropPts = Infinity;
    let total = cover.melds.reduce((s, m) => s + m.points, 0);
    for (let i = 0; i < cover.melds.length; i++) {
      const m = cover.melds[i];
      if (total - m.points >= 101 && m.points < dropPts) { dropPts = m.points; dropIdx = i; }
    }
    if (dropIdx < 0) {
      // can't drop a whole meld; drop last tile of a long run instead — too complex, drop smallest meld anyway
      break;
    }
    cover.melds.splice(dropIdx, 1);
    melds = cover.melds.map(m => m.tiles);
    used = melds.reduce((s, m) => s + m.length, 0);
  }
  return melds;
}

/* exports */
const Engine = {
  COLORS, COLOR_TR,
  createTileSet, shuffle, okeyFromIndicator, isOkeyTile, effective, tileValue,
  validateMeld, validatePair, canAttach,
  bestMeldCover, bestSingleMeld, bestPairCover,
  newGame, startRound, prevPlayer, nextPlayer, lastDiscardOfPrev,
  drawFromDeck, takeDiscard, returnDiscard, openHand, layMeld, layPair, attachTile,
  discardTile, endRound, checkAllPairsCancel,
  aiTakeTurn, aiChooseDiscard, aiUsefulness, trimCoverForOpen,
};
if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
if (typeof window !== 'undefined') window.Engine = Engine;
