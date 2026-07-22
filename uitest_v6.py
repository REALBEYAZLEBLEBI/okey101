#!/usr/bin/env python3
"""Browser tests for v6 features: undo open, işlek rings + auto İşle,
insert-shift, long-press group drag, okey flip, fake-joker swap, pts chip."""
import asyncio, sys
from playwright.async_api import async_playwright

TAP_DECK = '''() => {
    const d = document.querySelector('#deck .tile.back');
    if (!d) return false;
    const r = d.getBoundingClientRect();
    const mk = (ty,x,y) => new PointerEvent(ty,{bubbles:true,clientX:x,clientY:y,pointerId:1});
    d.dispatchEvent(mk('pointerdown', r.x+5, r.y+5));
    d.dispatchEvent(mk('pointerup', r.x+5, r.y+5));
    return true;
}'''

async def main():
    errors = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        page = await b.new_page(viewport={'width': 1000, 'height': 740})
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await page.add_init_script('window._realST=window.setTimeout.bind(window); const _st=window._realST; window.setTimeout=(fn,ms,...a)=>_st(fn,Math.min(ms||0,30),...a);')
        await page.goto('file:///home/claude/okey101/okey101.html')
        await page.click('#btn-start')
        for i in range(200):
            r = await page.evaluate('() => { const G = window.__okey.G; return G && G.turn === 0 && !G.roundOver && !G.hasDrawn && !window.__okey.ui.busy; }')
            if r: break
            await page.wait_for_timeout(150)
        assert r

        # tally counter always visible with 3 digits
        chip = await page.evaluate('() => { const c = document.getElementById("counter"); return { hidden: c.classList.contains("hidden"), digits: [...c.querySelectorAll(".dig span")].map(s => s.textContent).join("") }; }')
        print('counter pre-draw:', chip)
        assert not chip['hidden'] and len(chip['digits']) == 3

        # rig hand + rack, draw, then AÇ and UNDO
        await page.evaluate('''() => {
            const G = window.__okey.G;
            const mk = (c, n, i) => ({ id: 9000 + i, color: c, num: n, fake: false });
            G.players[0].hand = [
                mk(0,13,1), mk(1,13,2), mk(2,13,3), mk(3,13,4),
                mk(0,11,5), mk(1,11,6), mk(2,11,7),
                mk(0,5,8), mk(0,6,9), mk(0,7,10),
                mk(3,4,11), mk(1,2,12),
            ];
            window.__okey.render();
        }''')
        await page.evaluate(TAP_DECK)
        await page.wait_for_timeout(120)
        await page.click('#btn-sort-r')
        await page.wait_for_timeout(120)
        melds_before = await page.evaluate('() => window.__okey.G.tableMelds.length')  # bots may have opened
        await page.click('#actions .btn:has-text("SERİ AÇ ·")')
        await page.wait_for_timeout(150)
        st = await page.evaluate('() => ({ opened: window.__okey.G.players[0].opened, melds: window.__okey.G.tableMelds.length })')
        print('opened:', st, '| table melds before my open:', melds_before)
        assert st['opened'] and st['melds'] > melds_before
        # undo button present -> click
        await page.click('#actions .btn:has-text("GERİ AL")')
        await page.wait_for_timeout(150)
        st2 = await page.evaluate('() => ({ opened: window.__okey.G.players[0].opened, melds: window.__okey.G.tableMelds.length, hand: window.__okey.G.players[0].hand.length })')
        print('after undo:', st2)
        assert not st2['opened'] and st2['melds'] == melds_before and st2['hand'] == 13
        # re-open (needed for İşle test)
        await page.click('#btn-sort-r')
        await page.wait_for_timeout(120)
        await page.click('#actions .btn:has-text("SERİ AÇ ·")')
        await page.wait_for_timeout(150)

        # işlek: give me a tile that attaches (red 8 fits red 5-6-7) → red ring + İŞLE button
        await page.evaluate('''() => {
            const G = window.__okey.G;
            G.players[0].hand.push({ id: 9800, color: 0, num: 8, fake: false });
            window.__okey.render();
        }''')
        isl = await page.evaluate('''() => {
            const a = window.__okey.analyze();
            const ring = document.querySelectorAll('#rack .tile.islk').length;
            const btn = [...document.querySelectorAll('#actions .btn')].find(x => x.textContent.startsWith('İŞLE'));
            return { islek: a.islekIds.size, ring, btn: btn ? btn.textContent + '|' + btn.disabled : null };
        }''')
        print('işlek state:', isl)
        assert isl['islek'] >= 1 and isl['ring'] >= 1
        await page.click('#actions .btn:has-text("İŞLE")')
        await page.wait_for_timeout(150)
        isl2 = await page.evaluate('() => ({ hand: window.__okey.G.players[0].hand.length, islek: window.__okey.analyze().islekIds.size })')
        print('after auto İşle:', isl2)
        assert isl2['islek'] == 0

        # işlek discard penalty via UI: add another attachable tile and discard it
        pen = await page.evaluate('''() => {
            const G = window.__okey.G;
            const t = { id: 9801, color: 0, num: 4, fake: false }; // fits red 5-6-7(-8)
            G.players[0].hand.push(t);
            window.__okey.render();
            const r = Engine.discardTile(G, t);
            return { ok: r.ok, penalty: r.penalty, total: G.players[0].penalty };
        }''')
        print('işlek discard via engine:', pen)
        assert pen['penalty'] and pen['total'] == 101

        # ---- new round context for insert-shift & group drag: fresh game state ----
        await page.evaluate('''() => {
            const G = window.__okey.G;
            // force my turn state for rack manipulation tests
            G.turn = 0; G.hasDrawn = true; G.roundOver = false;
            const mk = (c, n, i) => ({ id: 9900 + i, color: c, num: n, fake: false });
            G.players[0].hand = [mk(0,6,1), mk(0,8,2), mk(0,7,3), mk(1,1,4), mk(1,2,5), mk(1,3,6)];
            window.__okey.setRack([9901, 9902, null, 9903, null, null, 9904, 9905, 9906].concat(new Array(23).fill(null)));
            window.__okey.render();
        }''')
        # insert-shift: drag red7 (slot 3) onto red8 (slot 1) → 6,7,8 in slots 0,1,2
        shift = await page.evaluate('''() => {
            const src = document.querySelector('#rack .tile[data-tid="9903"]');
            const dst = document.querySelector('#rack .slot[data-idx="1"]');
            const sr = src.getBoundingClientRect(), dr = dst.getBoundingClientRect();
            const mk = (ty,x,y) => new PointerEvent(ty,{bubbles:true,clientX:x,clientY:y,pointerId:1});
            src.dispatchEvent(mk('pointerdown', sr.x+8, sr.y+8));
            src.dispatchEvent(mk('pointermove', sr.x+40, sr.y+8));
            src.dispatchEvent(mk('pointerup', dr.x+dr.width/2, dr.y+dr.height/2));
            return window.__okey.rack.slice(0, 5);
        }''')
        print('insert-shift result:', shift)
        assert shift[0] == 9901 and shift[1] == 9903 and shift[2] == 9902, 'expected 6,7,8 ordered'

        # long-press group drag: hold yellow 1 (slot 6) 500ms, then drag block to slot 16
        grp = await page.evaluate('''async () => {
            const sleep = (ms) => new Promise(r => _realST(r, ms));
            const src = document.querySelector('#rack .tile[data-tid="9904"]');
            const dst = document.querySelector('#rack .slot[data-idx="16"]');
            const sr = src.getBoundingClientRect(), dr = dst.getBoundingClientRect();
            const mk = (ty,x,y) => new PointerEvent(ty,{bubbles:true,clientX:x,clientY:y,pointerId:1});
            src.dispatchEvent(mk('pointerdown', sr.x+8, sr.y+8));
            await sleep(600);
            const lifted = document.querySelectorAll('#rack .tile.grouplift').length;
            src.dispatchEvent(mk('pointermove', sr.x+30, sr.y-30));
            const ghostRow = !!document.querySelector('.ghostrow');
            src.dispatchEvent(mk('pointerup', dr.x+dr.width/2, dr.y+dr.height/2));
            return { lifted, ghostRow, r16: window.__okey.rack[16], r17: window.__okey.rack[17], r18: window.__okey.rack[18] };
        }''')
        print('group drag:', grp)
        assert grp['lifted'] == 3 and grp['ghostRow'] and grp['r16'] == 9904 and grp['r17'] == 9905 and grp['r18'] == 9906

        # fake joker swap: set okey blue13; meld blue 11,12,okey on table; hold fake
        swap = await page.evaluate('''() => {
            const G = window.__okey.G;
            G.okey = { color: 2, num: 13 };
            G.players[0].opened = true; G.players[0].openType = 'normal';
            const okeyTile = { id: 9950, color: 2, num: 13, fake: false };
            G.tableMelds = [{ owner: 1, type: 'run', tiles: [{id:9951,color:2,num:11,fake:false},{id:9952,color:2,num:12,fake:false}, okeyTile] }];
            const fake = { id: 9953, color: -1, num: 0, fake: true };
            G.players[0].hand = [fake, {id:9954,color:3,num:2,fake:false}];
            window.__okey.setRack([9953, null, 9954].concat(new Array(29).fill(null)));
            window.__okey.render();
            const src = document.querySelector('#rack .tile[data-tid="9953"]');
            const meldEl = document.querySelector('.meld[data-mi="0"]');
            const sr = src.getBoundingClientRect(), mr = meldEl.getBoundingClientRect();
            const mk = (ty,x,y) => new PointerEvent(ty,{bubbles:true,clientX:x,clientY:y,pointerId:1});
            src.dispatchEvent(mk('pointerdown', sr.x+8, sr.y+8));
            src.dispatchEvent(mk('pointermove', sr.x+40, sr.y-40));
            const highlighted = !!document.querySelector('.meld.swappable') || !!document.querySelector('.meld.droptarget');
            src.dispatchEvent(mk('pointermove', mr.x+mr.width/2, mr.y+mr.height/2));
            src.dispatchEvent(mk('pointerup', mr.x+mr.width/2, mr.y+mr.height/2));
            return {
                highlighted,
                okeyInHand: G.players[0].hand.some(t => t.id === 9950),
                fakeOnTable: G.tableMelds[0].tiles.some(t => t.fake),
            };
        }''')
        print('joker swap:', swap)
        assert swap['okeyInHand'] and swap['fakeOnTable']

        # okey long-press: flips FACE-DOWN (blank), second long-press flips back
        flip = await page.evaluate('''async () => {
            const sleep = (ms) => new Promise(r => _realST(r, ms));
            window.__okey.render();
            const hold = async () => {
                const el = document.querySelector('#rack .tile[data-tid="9950"]');
                if (!el) return false;
                const r = el.getBoundingClientRect();
                const mk = (ty,x,y) => new PointerEvent(ty,{bubbles:true,clientX:x,clientY:y,pointerId:1});
                el.dispatchEvent(mk('pointerdown', r.x+8, r.y+8));
                await sleep(600);
                el.dispatchEvent(mk('pointerup', r.x+8, r.y+8));
                await sleep(300); // two-phase flip completes (timers clamped)
                return true;
            };
            await hold();
            const down = document.querySelector('#rack .tile[data-tid="9950"]');
            const isDown = down && down.classList.contains('facedown');
            await hold();
            const up = document.querySelector('#rack .tile[data-tid="9950"]');
            const isUpAgain = up && !up.classList.contains('facedown');
            return { isDown, isUpAgain, hidden: window.__okey.ui.hiddenOkeys.size };
        }''')
        print('okey facedown flip:', flip)
        assert flip['isDown'] and flip['isUpAgain'] and flip['hidden'] == 0

        # turn timer: deadline is set on my turn; forced expiry auto-plays
        timer = await page.evaluate('''() => {
            const G = window.__okey.G;
            G.turn = 0; G.hasDrawn = false; G.roundOver = false;
            G.players[0].tookDiscard = null;
            window.__okey.ui.busy = false;
            window.__okey.timer.start();
            const armed = window.__okey.timer.deadline > Date.now();
            const handBefore = G.players[0].hand.length;
            window.__okey.timer.expire();
            return { armed, timeouts: window.__okey.ui.timeouts,
                     turnAfter: window.__okey.G.turn, handBefore,
                     handAfter: window.__okey.G.players[0].hand.length };
        }''')
        print('turn timer:', timer)
        assert timer['armed'] and timer['timeouts'] == 1
        assert timer['turnAfter'] != 0 or timer['handAfter'] <= timer['handBefore']

        if errors:
            print('JS ERRORS:', errors[:6]); sys.exit(1)
        print('V6 SUITE OK')
        await b.close()

asyncio.run(main())
