'use strict';
const E = require('./engine.js');
let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', msg); }
}
const T = (color, num, fake) => ({ id: Math.floor(Math.random() * 1e9), color, num, fake: !!fake });
// colors: 0 red 1 yellow 2 blue 3 black

// --- tile set ---
const set = E.createTileSet();
ok(set.length === 106, 'tile set 106');
ok(set.filter(t => t.fake).length === 2, '2 fake jokers');
ok(set.filter(t => !t.fake && t.color === 0 && t.num === 7).length === 2, 'two red 7s');

// --- okey determination ---
ok(E.okeyFromIndicator({ color: 2, num: 5 }).num === 6, 'indicator blue5 -> okey blue6');
ok(E.okeyFromIndicator({ color: 3, num: 13 }).num === 1, 'indicator 13 -> okey 1');

const okey = { color: 2, num: 6 }; // blue 6

// --- meld validation: groups ---
ok(E.validateMeld([T(0,5),T(2,5),T(3,5)], okey).valid, 'group 3 colors valid');
ok(E.validateMeld([T(0,5),T(1,5),T(2,5),T(3,5)], okey).points === 20, 'group of 4 = 20 pts');
ok(!E.validateMeld([T(0,5),T(0,5),T(2,5)], okey).valid, 'group same color twice invalid');
ok(!E.validateMeld([T(0,5),T(2,5)], okey).valid, 'group of 2 invalid');

// --- runs ---
ok(E.validateMeld([T(0,7),T(0,8),T(0,9)], okey).points === 24, 'run 7-8-9 = 24');
ok(!E.validateMeld([T(0,7),T(1,8),T(0,9)], okey).valid, 'run mixed color invalid');
ok(!E.validateMeld([T(0,7),T(0,7),T(0,8)], okey).valid, 'run duplicate invalid');
ok(!E.validateMeld([T(3,12),T(3,13),T(3,1)], okey).valid, '12-13-1 invalid (13 is the end)');
ok(!E.validateMeld([T(3,13),T(3,1),T(3,2)], okey).valid, '13-1-2 invalid');
ok(E.validateMeld([T(3,11),T(3,12),T(3,13)], okey).points === 36, '11-12-13 valid');
// run splitting
{
  const run6 = [T(0,1),T(0,2),T(0,3),T(0,4),T(0,5),T(0,6)];
  const chunks = E.splitRunTiles(run6, okey);
  ok(chunks.length === 2 && chunks[0].length === 3 && chunks[1].length === 3, '6-run splits 3+3');
  ok(chunks[0].map(t=>t.num).join(',') === '1,2,3' && chunks[1].map(t=>t.num).join(',') === '4,5,6', 'split keeps order');
  const run7 = [T(1,4),T(1,5),T(1,6),T(1,7),T(1,8),T(1,9),T(1,10)];
  const c7 = E.splitRunTiles(run7, okey);
  ok(c7.length === 2 && c7[0].length === 3 && c7[1].length === 4, '7-run splits 3+4');
  const wildRun = [T(0,7),T(2,6),T(0,9),T(0,10),T(0,11),T(0,12)]; // blue6=okey fills the 8
  const cw = E.splitRunTiles(wildRun, okey);
  ok(cw.length === 2 && cw[0].some(t=>t.color===2&&t.num===6), 'wild positioned inside split');
}

// --- okey (wild) substitution ---
const wild = T(2,6); // blue 6 = okey
ok(E.validateMeld([T(0,7),wild,T(0,9)], okey).points === 24, 'wild fills run gap');
ok(E.validateMeld([T(0,5),T(3,5),wild], okey).points === 15, 'wild in group');
// fake joker = plays as blue 6
const fj = T(-1,0,true);
ok(E.validateMeld([T(2,5),fj,T(2,7)], okey).valid, 'fake joker as blue6 in blue run');
ok(!E.validateMeld([T(0,5),fj,T(0,7)], okey).valid, 'fake joker (blue6) cannot sit in red run');
ok(E.tileValue(fj, okey) === 6, 'fake joker value = okey num');
ok(E.tileValue(wild, okey) === 6, 'okey tile value = its num');

// wild extension points go high first
const rext = E.validateMeld([T(0,11),T(0,12),wild], okey);
ok(rext.valid && rext.points === 36, 'wild extends to 13 (11+12+13)');

// --- pairs ---
ok(E.validatePair([T(0,5),T(0,5)], okey).valid, 'identical pair valid');
ok(!E.validatePair([T(0,5),T(1,5)], okey).valid, 'diff color pair invalid');
ok(E.validatePair([T(0,5),wild], okey).valid, 'okey pairs with anything');
ok(E.validatePair([fj, T(2,6)], okey).valid, 'fake joker pairs with real blue6');

// --- canAttach ---
const meldRun = { type:'run', tiles:[T(0,7),T(0,8),T(0,9)] };
ok(E.canAttach(meldRun, T(0,10), okey), 'attach 10 to 7-8-9');
ok(E.canAttach(meldRun, T(0,6), okey), 'attach 6 to 7-8-9');
ok(!E.canAttach(meldRun, T(1,10), okey), 'attach wrong color fails');
const meldGrp = { type:'group', tiles:[T(0,5),T(1,5),T(2,5)] };
ok(E.canAttach(meldGrp, T(3,5), okey), 'attach 4th color to group');
ok(!E.canAttach(meldGrp, T(0,5), okey), 'attach dup color to group fails');
const meldPair = { type:'pair', tiles:[T(0,5),T(0,5)] };
ok(!E.canAttach(meldPair, T(0,5), okey), 'cannot attach to pair');

// --- bestMeldCover sanity ---
const hand1 = [T(0,10),T(1,10),T(2,10),T(3,10), T(0,11),T(0,12),T(0,13), T(2,3)];
const cover1 = E.bestMeldCover(hand1, okey);
ok(cover1.points === 40 + 36, 'cover finds group+run = 76 (got ' + cover1.points + ')');

// --- openHand flow with a controlled game ---
function mkGame() {
  const g = E.newGame({ names: ['A','B','C','D'], rounds: 1, rng: Math.random });
  E.startRound(g);
  return g;
}
{
  const g = mkGame();
  const p = g.players[g.turn];
  // force a known okey & hand
  g.okey = { color: 2, num: 6 };
  p.hand = [T(0,13),T(1,13),T(2,13),T(3,13), T(0,11),T(1,11),T(2,11), T(0,5),T(0,6),T(0,7), T(3,4)];
  g.hasDrawn = true;
  const melds = [
    [p.hand[0],p.hand[1],p.hand[2],p.hand[3]], // 52
    [p.hand[4],p.hand[5],p.hand[6]],           // 33
    [p.hand[7],p.hand[8],p.hand[9]],           // 5+6+7=18
  ];
  const r = E.openHand(g, melds, 'normal'); // 103
  ok(r.ok, 'open with 103 pts ok: ' + (r.err||''));
  ok(p.opened && p.openType === 'normal', 'player marked opened');
  ok(p.hand.length === 1, 'one tile left after opening');
  const d = E.discardTile(g, p.hand[0]);
  ok(d.ok && d.finished, 'discarding last tile finishes round');
  ok(p.roundScore === -101, 'finisher gets -101 (never doubled by elden): ' + p.roundScore);
  // this WAS an elden bitme (opened + finished same turn, others unopened):
  ok(g.eldenBitti === true, 'elden bitme detected');
  ok(g.players.filter((q,i)=>i!==g.finisher).every(q => q.roundScore === 404), 'others get 404 on elden bitme');
}
// --- elden bitme with okey finish: winner -202, others 808 ---
{
  const g = mkGame();
  const p = g.players[g.turn];
  g.okey = { color: 2, num: 6 };
  const okeyTile = T(2,6);
  p.hand = [T(0,13),T(1,13),T(2,13),T(3,13), T(0,11),T(1,11),T(2,11), T(0,5),T(0,6),T(0,7), okeyTile];
  g.hasDrawn = true; p.tookDiscard = null;
  g.tableMelds = [];
  const r = E.openHand(g, [[p.hand[0],p.hand[1],p.hand[2],p.hand[3]],[p.hand[4],p.hand[5],p.hand[6]],[p.hand[7],p.hand[8],p.hand[9]]], 'normal');
  ok(r.ok, 'elden okey: open ok');
  const d = E.discardTile(g, okeyTile);
  ok(d.ok && d.finished && g.finishedWithOkey, 'finished with okey');
  ok(p.roundScore === -202, 'elden + okey finish: winner -202, got ' + p.roundScore);
  ok(g.players.filter((q,i)=>i!==g.finisher).every(q => q.roundScore === 808), 'others get 808, got ' + g.players.map(q=>q.roundScore));
}
// --- NOT elden if the finisher had opened on an earlier turn ---
{
  const g = mkGame();
  const p = g.players[g.turn];
  g.okey = { color: 2, num: 6 };
  p.hand = [T(0,13),T(1,13),T(2,13),T(3,13), T(0,11),T(1,11),T(2,11), T(0,5),T(0,6),T(0,7), T(3,4)];
  g.hasDrawn = true; p.tookDiscard = null;
  g.tableMelds = [];
  E.openHand(g, [[p.hand[0],p.hand[1],p.hand[2],p.hand[3]],[p.hand[4],p.hand[5],p.hand[6]],[p.hand[7],p.hand[8],p.hand[9]]], 'normal');
  g.turnCounter += 4; // simulate turns passing after the open
  g.hasDrawn = true;
  const d = E.discardTile(g, p.hand[0]);
  ok(d.ok && d.finished, 'finished later');
  ok(g.eldenBitti === false, 'not elden bitme when opened earlier');
  ok(g.players.filter((q,i)=>i!==g.finisher).every(q => q.roundScore === 202), 'others get plain 202');
}
// --- real-tile okey swap (8-[okey as 9]-10 + real 9) ---
{
  const g = mkGame();
  g.okey = { color: 2, num: 5 }; // blue 5 is okey
  const p = g.players[g.turn];
  p.opened = true; p.openType = 'normal';
  g.hasDrawn = true; p.tookDiscard = null;
  const okeyTile = T(2,5);
  g.tableMelds = [{ owner: (g.turn+1)%4, type: 'run', tiles: [T(0,8), okeyTile, T(0,10)] }]; // okey plays as red 9
  const nine = T(0,9);
  p.hand = [nine, T(3,2)];
  ok(E.canSwapWith(g, g.tableMelds[0], nine), 'real 9 can swap the okey');
  const r = E.swapForOkey(g, nine, 0);
  ok(r.ok, 'real-tile swap ok: ' + (r.err||''));
  ok(p.hand.some(t => t.id === okeyTile.id), 'okey landed in hand');
  ok(E.validateMeld(g.tableMelds[0].tiles, g.okey).valid, 'meld valid after real-tile swap');
  ok(!E.canSwapWith(g, g.tableMelds[0], T(0,7)), 'wrong tile cannot swap');
}
// --- rule 10: seri opener lays pairs only if someone else opened pairs ---
{
  const g = mkGame();
  g.okey = { color: 2, num: 6 };
  const p = g.players[g.turn];
  p.opened = true; p.openType = 'normal';
  g.hasDrawn = true; p.tookDiscard = null;
  p.hand = [T(0,4),T(0,4), T(3,2), T(1,9)];
  const r1 = E.layPair(g, [p.hand[0], p.hand[1]]);
  ok(!r1.ok, 'seri opener cannot lay pair while nobody opened pairs');
  g.players[(g.turn+1)%4].opened = true;
  g.players[(g.turn+1)%4].openType = 'pairs';
  const r2 = E.layPair(g, [p.hand[0], p.hand[1]]);
  ok(r2.ok, 'seri opener lays pair once another player opened pairs: ' + (r2.err||''));
}
// --- smarter cover beats greedy ---
{
  const okey2 = { color: 2, num: 6 };
  // greedy grabs red 5-6-7-8 (26); optimal: [5,6,7] + [8,8,8] = 42
  const hand = [T(0,5),T(0,6),T(0,7),T(0,8), T(1,8), T(3,8)];
  const cover = E.bestMeldCover(hand, okey2);
  ok(cover.points === 42, 'DFS cover finds 42 (18+24), got ' + cover.points);
  ok(cover.melds.length === 2 && cover.leftover.length === 0, 'two melds, no leftovers');
}
{
  // open below 101 must fail
  const g = mkGame();
  const p = g.players[g.turn];
  g.okey = { color: 2, num: 6 };
  p.hand = [T(0,2),T(1,2),T(2,2), T(0,3),T(1,3),T(2,3), T(3,4), T(3,5)];
  g.hasDrawn = true;
  const r = E.openHand(g, [[p.hand[0],p.hand[1],p.hand[2]],[p.hand[3],p.hand[4],p.hand[5]]], 'normal');
  ok(!r.ok, 'open with 15 pts rejected');
}
{
  // pairs opening
  const g = mkGame();
  const p = g.players[g.turn];
  g.okey = { color: 2, num: 6 };
  const mk = (c,n) => [T(c,n),T(c,n)];
  p.hand = [...mk(0,4),...mk(1,7),...mk(2,9),...mk(3,12),...mk(0,13), T(1,2), T(2,3)];
  g.hasDrawn = true;
  const pairs = [];
  for (let i=0;i<10;i+=2) pairs.push([p.hand[i],p.hand[i+1]]);
  const r = E.openHand(g, pairs, 'pairs');
  ok(r.ok, 'pairs open with 5 pairs: ' + (r.err||''));
  ok(p.openType === 'pairs', 'openType pairs');
  const r2 = E.openHand(g, pairs, 'pairs');
  ok(!r2.ok, 'cannot open twice');
}
{
  // took discard must be used
  const g = mkGame();
  g.okey = { color: 2, num: 6 };
  const p = g.players[g.turn];
  // give prev player a discard
  const prev = E.prevPlayer(g);
  const dt = T(3,9);
  g.discards[prev].push(dt);
  g.hasDrawn = false;
  p.tookDiscard = null;
  const taken = E.takeDiscard(g);
  ok(taken && taken.id === dt.id, 'takeDiscard returns tile');
  const rd = E.discardTile(g, taken);
  ok(!rd.ok, 'cannot discard the taken tile');
  const back = E.returnDiscard(g);
  ok(p.tookDiscard === null && back && back.id === dt.id, 'returnDiscard puts the tile back');
  ok(g.hasDrawn === false, 'after return the player must draw again');
  ok(g.discards[prev].length === 1, 'tile returned to pile');
  const drawn = E.drawFromDeck(g);
  ok(drawn && g.hasDrawn === true, 'manual deck draw works after return');
}
// open with a 6-run must land as two table melds
{
  const g = mkGame();
  const p = g.players[g.turn];
  g.okey = { color: 2, num: 6 };
  p.hand = [T(0,8),T(0,9),T(0,10),T(0,11),T(0,12),T(0,13), T(1,13),T(2,13),T(3,13), T(3,4)];
  g.hasDrawn = true; p.tookDiscard = null;
  g.tableMelds = [];
  const r = E.openHand(g, [[p.hand[0],p.hand[1],p.hand[2],p.hand[3],p.hand[4],p.hand[5]],[p.hand[6],p.hand[7],p.hand[8]]], 'normal');
  ok(r.ok, '6-run + group opens (63+39=102): ' + (r.err||''));
  ok(g.tableMelds.length === 3, '6-run split into 2 melds on table (total 3), got ' + g.tableMelds.length);
  ok(g.tableMelds.every(m => m.type === 'pair' ? true : (m.type==='group'||m.type==='run') && m.tiles.length >= 3), 'all table melds >= 3 tiles');
}

// --- deck exhaustion scoring ---
{
  const g = mkGame();
  g.okey = { color: 2, num: 6 };
  g.deck = [];
  const p = g.players[g.turn];
  g.hasDrawn = true;
  p.tookDiscard = null;
  p.hand = [T(0,5), T(1,9)];
  g.players.forEach((q,i) => { if (i!==g.turn) { q.opened = false; q.hand=[T(0,1)]; } });
  p.opened = true; p.openType = 'normal';
  const r = E.discardTile(g, p.hand[0]);
  ok(r.ok && r.exhausted, 'deck exhausted ends round');
  ok(p.roundScore === 9, 'opened player scores hand sum (9), got ' + p.roundScore);
  ok(g.players[(g.turn+1)%4].roundScore === 202, 'unopened player 202');
}

// --- işlek / okey discard penalty ---
{
  const g = mkGame();
  g.okey = { color: 2, num: 6 };
  const p = g.players[g.turn];
  g.hasDrawn = true; p.tookDiscard = null;
  g.tableMelds = [{ owner: (g.turn+1)%4, type: 'run', tiles: [T(0,9),T(0,10),T(0,11)] }];
  p.hand = [T(0,12), T(3,2), T(1,5)];
  const r = E.discardTile(g, p.hand[0]); // red 12 attaches to 9-10-11 => penalty
  ok(r.ok && r.penalty === true, 'işlek discard flagged');
  ok(p.penalty === 101, 'işlek discard costs +101');
  ok(g.penaltyLog.length === 1, 'penalty logged');
}
{
  const g = mkGame();
  g.okey = { color: 2, num: 6 };
  const p = g.players[g.turn];
  g.hasDrawn = true; p.tookDiscard = null;
  g.tableMelds = [];
  p.hand = [T(2,6), T(3,2)]; // real okey
  const r = E.discardTile(g, p.hand[0]);
  ok(r.ok && r.penalty === true && p.penalty === 101, 'okey discard costs +101 even with empty table');
}
{
  // finishing tile exempt from penalty
  const g = mkGame();
  g.okey = { color: 2, num: 6 };
  const p = g.players[g.turn];
  g.hasDrawn = true; p.tookDiscard = null;
  p.opened = true; p.openType = 'normal';
  g.tableMelds = [{ owner: g.turn, type: 'run', tiles: [T(0,9),T(0,10),T(0,11)] }];
  p.hand = [T(0,12)];
  const r = E.discardTile(g, p.hand[0]);
  ok(r.ok && r.finished && p.penalty === 0, 'finishing işlek tile carries no penalty');
  ok(p.roundScore <= -101, 'finisher still scores -101 or better');
}
// --- penalty lands in round score on exhaustion ---
{
  const g = mkGame();
  g.okey = { color: 2, num: 6 };
  const p = g.players[g.turn];
  g.deck = [T(3,1)];
  g.hasDrawn = true; p.tookDiscard = null;
  p.opened = true; p.openType = 'normal';
  p.penalty = 101;
  p.hand = [T(0,5), T(1,4)];
  g.players.forEach((q,i) => { if (i!==g.turn) { q.opened = true; q.openType='normal'; q.hand=[T(0,1)]; q.penalty = 0; } });
  g.deck = [];
  const r = E.discardTile(g, p.hand[0]);
  ok(r.ok && r.exhausted, 'exhaustion end');
  ok(p.roundScore === 4 + 101, 'penalty added to round score, got ' + p.roundScore);
}
// --- undo open ---
{
  const g = mkGame();
  g.okey = { color: 2, num: 6 };
  const p = g.players[g.turn];
  p.hand = [T(0,13),T(1,13),T(2,13),T(3,13), T(0,11),T(1,11),T(2,11), T(0,5),T(0,6),T(0,7), T(3,4)];
  g.hasDrawn = true; p.tookDiscard = null;
  g.tableMelds = [];
  const handBefore = p.hand.length;
  const r = E.openHand(g, [[p.hand[0],p.hand[1],p.hand[2],p.hand[3]],[p.hand[4],p.hand[5],p.hand[6]],[p.hand[7],p.hand[8],p.hand[9]]], 'normal');
  ok(r.ok && p.opened, 'opened before undo');
  const u = E.undoOpen(g);
  ok(u.ok, 'undoOpen works: ' + (u.err||''));
  ok(!p.opened && p.openType === null, 'opened state reverted');
  ok(p.hand.length === handBefore, 'all tiles back in hand');
  ok(g.tableMelds.length === 0, 'table melds removed');
  // after another action, undo is gone
  const r2 = E.openHand(g, [[p.hand.find(t=>t.num===13&&t.color===0),p.hand.find(t=>t.num===13&&t.color===1),p.hand.find(t=>t.num===13&&t.color===2),p.hand.find(t=>t.num===13&&t.color===3)],
    [p.hand.find(t=>t.num===11&&t.color===0),p.hand.find(t=>t.num===11&&t.color===1),p.hand.find(t=>t.num===11&&t.color===2)],
    [p.hand.find(t=>t.num===5),p.hand.find(t=>t.num===6),p.hand.find(t=>t.num===7)]], 'normal');
  ok(r2.ok, 're-open ok');
  const d = E.discardTile(g, p.hand[0]);
  ok(d.ok, 'discard after open');
  const u2 = E.undoOpen(g);
  ok(!u2.ok, 'undo unavailable after discard');
}
// --- attach does NOT re-split (rule: split only at first open) ---
{
  const g = mkGame();
  g.okey = { color: 2, num: 6 };
  const p = g.players[g.turn];
  p.opened = true; p.openType = 'normal';
  g.hasDrawn = true; p.tookDiscard = null;
  g.tableMelds = [{ owner: g.turn, type: 'run', tiles: [T(0,5),T(0,6),T(0,7),T(0,8),T(0,9)] }];
  p.hand = [T(0,10), T(3,2)];
  const r = E.attachTile(g, p.hand[0], 0);
  ok(r.ok, 'attach 10 to 5..9');
  ok(g.tableMelds.length === 1 && g.tableMelds[0].tiles.length === 6, '6-run stays whole after attach');
}
// --- fake joker swap ---
{
  const g = mkGame();
  g.okey = { color: 2, num: 13 }; // blue 13 is okey
  const p = g.players[g.turn];
  p.opened = true; p.openType = 'normal';
  g.hasDrawn = true; p.tookDiscard = null;
  const okeyTile = T(2,13);
  g.tableMelds = [{ owner: (g.turn+1)%4, type: 'run', tiles: [T(2,11),T(2,12),okeyTile] }];
  const fake = T(-1,0,true);
  p.hand = [fake, T(3,2)];
  ok(E.canSwapFake(g, g.tableMelds[0]), 'swap detected as possible');
  const r = E.swapFakeForOkey(g, fake, 0);
  ok(r.ok, 'swap ok: ' + (r.err||''));
  ok(p.hand.some(t => t.id === okeyTile.id), 'okey now in hand');
  ok(g.tableMelds[0].tiles.some(t => t.fake), 'fake now on table');
  const v = E.validateMeld(g.tableMelds[0].tiles, g.okey);
  ok(v.valid, 'meld still valid after swap');
}
{
  // swap must fail if fake cannot hold the position (okey used as wildcard elsewhere)
  const g = mkGame();
  g.okey = { color: 2, num: 13 }; // fake plays as blue 13
  const p = g.players[g.turn];
  p.opened = true; p.openType = 'normal';
  g.hasDrawn = true; p.tookDiscard = null;
  const okeyTile = T(2,13);
  g.tableMelds = [{ owner: 0, type: 'run', tiles: [T(0,4),T(0,5),okeyTile] }]; // okey plays as red 6
  const fake = T(-1,0,true);
  p.hand = [fake, T(3,2)];
  ok(!E.canSwapFake(g, g.tableMelds[0]), 'swap impossible when okey is a red 6');
  const r = E.swapFakeForOkey(g, fake, 0);
  ok(!r.ok, 'swap rejected');
}
// --- okey placed with pair instead of extending a complete run ---
{
  const okey2 = { color: 2, num: 6 };
  const hand = [T(0,10),T(0,11),T(0,12), T(1,8),T(3,8), T(2,6)]; // blue6=okey
  const cover = E.bestMeldCover(hand, okey2);
  ok(cover.melds.length === 2, 'okey forms second meld with the 8s (2 melds), got ' + cover.melds.length);
  ok(cover.points === 33 + 24, 'cover points 57, got ' + cover.points);
  ok(cover.leftover.length === 0, 'no leftovers');
}
// --- AI avoids işlek discards ---
{
  const g = mkGame();
  g.okey = { color: 2, num: 6 };
  const p = g.players[g.turn];
  g.tableMelds = [{ owner: 0, type: 'run', tiles: [T(0,9),T(0,10),T(0,11)] }];
  p.tookDiscard = null;
  p.hand = [T(0,12), T(3,2), T(1,7), T(2,4)];
  const d = E.aiChooseDiscard(g, p);
  ok(d.id !== p.hand[0].id, 'AI does not throw the işlek red 12');
}

// --- katlamalı = artan açış barajı; katlamasızda baraj sabit 101/5 ---
{
  const g = E.newGame({ names: ['A','B','C','D'], rounds: 1, katlamali: true });
  E.startRound(g);
  ok(E.openReq(g).seri === 101 && E.openReq(g).cift === 5, 'katlamalı: ilk açış barajı 101/5');
  g.players[1].opened = true; g.players[1].openType = 'normal'; g.players[1].openPoints = 120;
  ok(E.openReq(g).seri === 121, 'katlamalı: 120 ile açıldı → sonraki baraj 121, got ' + E.openReq(g).seri);
  g.players[2].opened = true; g.players[2].openType = 'pairs'; g.players[2].openPoints = 6;
  ok(E.openReq(g).cift === 7, 'katlamalı: 6 çiftle açıldı → sonraki çift barajı 7');
  const g2 = E.newGame({ names: ['A','B','C','D'], rounds: 1, katlamali: false });
  E.startRound(g2);
  g2.players[1].opened = true; g2.players[1].openType = 'normal'; g2.players[1].openPoints = 150;
  g2.players[2].opened = true; g2.players[2].openType = 'pairs'; g2.players[2].openPoints = 8;
  ok(E.openReq(g2).seri === 101 && E.openReq(g2).cift === 5, 'katlamasız: baraj hep 101/5 kalır');
}

// --- rizikolu: okey sayısı taşları çarpanı artırır, bitiş bonusu eklenir ---
{
  const g = E.newGame({ names: ['A','B','C','D'], rounds: 1, rizikolu: true });
  E.startRound(g);
  g.okey = { color: 2, num: 5 };
  const p = g.players[g.turn];
  p.hand = [
    T(0,5), T(1,5), T(3,5),          // üç adet 5 → +3
    T(0,13), T(1,13), T(2,13),
    T(0,12), T(1,12), T(2,12),
    T(0,11), T(1,11), T(2,11),
    T(2,9),
  ];
  g.hasDrawn = true; p.tookDiscard = null; g.tableMelds = [];
  const r = E.openHand(g, [
    [p.hand[0],p.hand[1],p.hand[2]],
    [p.hand[3],p.hand[4],p.hand[5]],
    [p.hand[6],p.hand[7],p.hand[8]],
    [p.hand[9],p.hand[10],p.hand[11]],
  ], 'normal');
  ok(r.ok, 'rizikolu: open ok — ' + (r.err || ''));
  ok(g.carpan === 4, 'rizikolu: üç adet 5 → çarpan 4, got ' + g.carpan);
  const d = E.discardTile(g, p.hand[0]); // kalan son taş → elden bitiş (+2)
  ok(d.ok && d.finished, 'rizikolu: finished');
  ok(g.carpan === 6, 'rizikolu: elden bitiş +2 → çarpan 6, got ' + g.carpan);
}

// --- ceza katlamaları her modda standart işler (katlamasızda da) ---
{
  const g = E.newGame({ names: ['A','B','C','D'], rounds: 1, katlamali: false });
  E.startRound(g);
  g.okey = { color: 2, num: 6 };
  const p = g.players[g.turn];
  const okeyTile = T(2,6);
  p.hand = [T(0,13),T(1,13),T(2,13),T(3,13), T(0,11),T(1,11),T(2,11), T(0,5),T(0,6),T(0,7), okeyTile];
  g.hasDrawn = true; p.tookDiscard = null;
  g.tableMelds = [];
  E.openHand(g, [[p.hand[0],p.hand[1],p.hand[2],p.hand[3]],[p.hand[4],p.hand[5],p.hand[6]],[p.hand[7],p.hand[8],p.hand[9]]], 'normal');
  const d = E.discardTile(g, okeyTile); // okeyle elden bitiş — katlamasızda da katlanır
  ok(d.ok && d.finished, 'okeyle elden bitiş: finished');
  ok(p.roundScore === -202, 'okeyle elden bitiş: winner -202, got ' + p.roundScore);
  ok(g.players.filter((q,i)=>i!==g.finisher).every(q => q.roundScore === 808), 'okeyle elden bitiş: others 808, got ' + g.players.map(q=>q.roundScore));
}

// --- full AI simulation games ---
let simErrors = 0;
for (let s = 0; s < 40; s++) {
  const g = E.newGame({ names: ['A','B','C','D'], rounds: 1 });
  E.startRound(g);
  let guard = 0;
  while (!g.roundOver && guard++ < 500) {
    E.aiTakeTurn(g);
  }
  if (!g.roundOver) { simErrors++; console.log('sim not finished, guard hit'); continue; }
  // invariants
  const totalTiles = g.players.reduce((s,p)=>s+p.hand.length,0)
    + g.deck.length + g.discards.reduce((s,d)=>s+d.length,0)
    + g.tableMelds.reduce((s,m)=>s+m.tiles.length,0) + 1; // +1 indicator
  if (totalTiles !== 106) { simErrors++; console.log('tile count broken:', totalTiles); }
  // validate every table meld
  for (const m of g.tableMelds) {
    const v = m.type === 'pair' ? E.validatePair(m.tiles, g.okey) : E.validateMeld(m.tiles, g.okey);
    if (!v.valid) { simErrors++; console.log('invalid table meld', JSON.stringify(m.tiles), 'okey', JSON.stringify(g.okey)); }
  }
  if (g.finisher >= 0) {
    if (g.players[g.finisher].hand.length !== 0) { simErrors++; console.log('finisher hand not empty'); }
    if (!(g.players[g.finisher].roundScore <= -101)) { simErrors++; console.log('finisher score wrong', g.players[g.finisher].roundScore); }
  }
}
ok(simErrors === 0, 'AI simulations clean (' + simErrors + ' errors)');

// how often do rounds finish with a winner vs exhaustion?
let finPct = 0, cnt = 0;
for (let s = 0; s < 30; s++) {
  const g = E.newGame({ names: ['A','B','C','D'], rounds: 1 });
  E.startRound(g);
  let guard = 0;
  while (!g.roundOver && guard++ < 500) E.aiTakeTurn(g);
  cnt++;
  if (g.finisher >= 0) finPct++;
}
console.log('rounds finished by a player:', finPct + '/' + cnt);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
