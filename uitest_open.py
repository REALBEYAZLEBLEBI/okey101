#!/usr/bin/env python3
"""New flow test: rig a hand, use Seri Diz to arrange groups with gaps,
verify live analysis + AÇ gating, open via AÇ, lay a new meld via PER AT,
then discard by dragging onto own corner."""
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
        page = await b.new_page(viewport={'width': 900, 'height': 700})
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await page.add_init_script('const _st=window.setTimeout.bind(window); window.setTimeout=(fn,ms,...a)=>_st(fn,Math.min(ms||0,30),...a);')
        await page.goto('file:///home/claude/okey101/okey101.html')
        await page.click('#btn-start')
        for i in range(200):
            r = await page.evaluate('() => { const G = window.__okey.G; return G && G.turn === 0 && !G.roundOver && !G.hasDrawn && !window.__okey.ui.busy; }')
            if r: break
            await page.wait_for_timeout(150)
        assert r, 'never reached my pre-draw turn'
        # rig hand: 13x4 group (52) + red 11,12,13 (36) + 5x3 group (15) = 103 + extras
        await page.evaluate('''() => {
            const G = window.__okey.G;
            const mk = (c, n, i) => ({ id: 9000 + i, color: c, num: n, fake: false });
            G.players[0].hand = [
                mk(0,13,1), mk(1,13,2), mk(2,13,3), mk(3,13,4),
                mk(0,11,5), mk(0,12,6), mk(0,13,7),
                mk(0,5,8), mk(1,5,9), mk(2,5,10),
                mk(3,9,11), mk(2,2,12), mk(1,8,13), mk(3,4,14),
                mk(3,6,15), mk(3,7,16), mk(3,8,17),  // extra run to lay after opening
            ];
            window.__okey.render();
        }''')
        await page.evaluate(TAP_DECK)
        await page.wait_for_timeout(150)
        # Seri Diz should group melds with gaps
        await page.click('#btn-sort-r')
        await page.wait_for_timeout(150)
        an = await page.evaluate('''() => {
            const a = window.__okey.analyze();
            const rack = window.__okey.rack;
            // count gaps between groups in row-major order
            return { pts: a.meldPts, melds: a.melds.length, pairs: a.pairs.length,
                     rackPattern: rack.map(x => x == null ? '.' : 'X').join('') };
        }''')
        print('after Seri Diz:', an['pts'], 'pts,', an['melds'], 'melds')
        print('rack:', an['rackPattern'][:16], '/', an['rackPattern'][16:])
        assert an['pts'] >= 101, 'Seri Diz should find >= 101'
        # gvalid highlight present?
        nvalid = await page.evaluate('document.querySelectorAll("#rack .tile.gvalid").length')
        print('green-highlighted tiles:', nvalid)
        assert nvalid >= 9
        # AÇ button enabled with live count
        btn = await page.evaluate('''() => {
            const b = [...document.querySelectorAll('#actions .btn')].find(x => x.textContent.startsWith('SERİ AÇ'));
            return b ? { label: b.textContent, disabled: b.disabled } : null;
        }''')
        print('AÇ button:', btn)
        assert btn and not btn['disabled']
        await page.click('#actions .btn:has-text("SERİ AÇ ·")')
        await page.wait_for_timeout(200)
        st = await page.evaluate('''() => {
            const G = window.__okey.G;
            return { opened: G.players[0].opened, melds: G.tableMelds.length, hand: G.players[0].hand.length };
        }''')
        print('after AÇ:', st)
        assert st['opened'] and st['melds'] >= 3
        await page.screenshot(path='shot_open_v3.png')
        # PER AT: black 6-7-8 still on rack should be layable
        peratBtn = await page.evaluate('''() => {
            const b = [...document.querySelectorAll('#actions .btn')].find(x => x.textContent === 'SERİ AÇ');
            return b ? b.disabled : null;
        }''')
        print('SERİ AÇ (lay) disabled:', peratBtn)
        if peratBtn == False:
            await page.click('#actions .btn:text-is("SERİ AÇ")')
            await page.wait_for_timeout(150)
            st2 = await page.evaluate('() => window.__okey.G.tableMelds.length')
            print('melds after lay:', st2)
        # drag-discard: drag first rack tile onto own corner (#corner-0)
        ok = await page.evaluate('''() => {
            const tile = document.querySelector('#rack .tile');
            if (!tile) return 'no tile';
            const corner = document.getElementById('corner-0');
            const tr = tile.getBoundingClientRect(), cr = corner.getBoundingClientRect();
            const mk = (type, x, y) => new PointerEvent(type, {bubbles:true, clientX:x, clientY:y, pointerId:1});
            tile.dispatchEvent(mk('pointerdown', tr.x+8, tr.y+8));
            tile.dispatchEvent(mk('pointermove', tr.x+40, tr.y-30));
            tile.dispatchEvent(mk('pointermove', cr.x+cr.width/2, cr.y+cr.height/2));
            tile.dispatchEvent(mk('pointerup', cr.x+cr.width/2, cr.y+cr.height/2));
            const G = window.__okey.G;
            return { myDiscards: G.discards[0].length, turn: G.turn };
        }''')
        print('drag-discard result:', ok)
        assert isinstance(ok, dict) and ok['myDiscards'] == 1
        if errors:
            print('JS ERRORS:', errors[:5]); sys.exit(1)
        print('NEW OPEN FLOW OK')
        await b.close()

asyncio.run(main())
