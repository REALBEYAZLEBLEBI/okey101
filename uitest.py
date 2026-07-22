#!/usr/bin/env python3
"""Drive the built game in headless Chromium: start a 3-round game, play dumb
(draw + discard first selectable tile) through all rounds, catch JS errors."""
import asyncio, sys
from playwright.async_api import async_playwright

URL = 'file:///home/claude/okey101/okey101.html'

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
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={'width': 420, 'height': 820})
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        # accelerate all animation timers 20x
        await page.add_init_script('''
            const _st = window.setTimeout.bind(window);
            window.setTimeout = (fn, ms, ...a) => _st(fn, Math.min(ms || 0, 40), ...a);
        ''')
        await page.goto(URL)
        await page.screenshot(path='shot_start.png')
        # pick 3 rounds
        await page.click('text=3 el')
        await page.click('#btn-start')
        await page.wait_for_timeout(500)
        await page.screenshot(path='shot_game.png')

        rounds_done = 0
        for step in range(4000):
            if step % 100 == 0:
                st = await page.evaluate('''() => document.getElementById('round-info').textContent + ' | msg: ' + document.getElementById('msgbar').textContent + ' | deck: ' + (document.querySelector('#deck .cnt')||{}).textContent''')
                print('step', step, '|', st, flush=True)
            if errors:
                break
            # modal open?
            modal_hidden = await page.eval_on_selector('#modal', 'el => el.classList.contains("hidden")')
            if not modal_hidden:
                txt = await page.inner_text('#modal-box')
                if 'Kazand' in txt or 'Oyun Bitti' in txt:
                    await page.screenshot(path='shot_final.png')
                    print('FINAL MODAL:', ' '.join(txt.split())[:160])
                    break
                if 'El' in txt and 'Bitti' in txt:
                    rounds_done += 1
                    print(f'round {rounds_done} ended:', ' '.join(txt.split())[:120])
                    if rounds_done == 1:
                        await page.screenshot(path='shot_roundend.png')
                btn = page.locator('#modal-box button.btn:not(.secondary)').first
                await btn.click()
                await page.wait_for_timeout(400)
                continue
            # my turn?
            gs = await page.evaluate('''() => {
                const G = window.__okey && window.__okey.G;
                if (!G) return null;
                return { turn: G.turn, drawn: G.hasDrawn, over: G.roundOver, deck: G.deck.length, busy: window.__okey.ui.busy };
            }''')
            if not gs or gs['over'] or gs['turn'] != 0 or gs['busy']:
                await page.wait_for_timeout(300)
                continue
            if not gs['drawn']:
                if gs['deck'] == 0:
                    await page.evaluate('document.getElementById("deck").click()')
                    await page.wait_for_timeout(200)
                    continue
                await page.evaluate(TAP_DECK)
                await page.wait_for_timeout(120)
                continue
            # select a tile then discard
            sel_ok = await page.evaluate('''() => {
                const tiles = [...document.querySelectorAll('#rack .tile:not(.staged)')];
                if (!tiles.length) return false;
                // prefer discarding a non-selected tile: click to select first unselected
                const t = tiles.find(x => !x.classList.contains('sel')) || tiles[0];
                t.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientX:10, clientY:10, pointerId:1}));
                t.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, clientX:10, clientY:10, pointerId:1}));
                return true;
            }''')
            await page.wait_for_timeout(80)
            nsel = await page.evaluate('document.querySelectorAll("#rack .tile.sel").length')
            if nsel != 1:
                # deselect extras: click selected until 1 remains
                await page.evaluate('''() => {
                    const sels = [...document.querySelectorAll('#rack .tile.sel')];
                    for (let i = 1; i < sels.length; i++) {
                        sels[i].dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientX:10, clientY:10, pointerId:1}));
                        sels[i].dispatchEvent(new PointerEvent('pointerup', {bubbles:true, clientX:10, clientY:10, pointerId:1}));
                    }
                }''')
                await page.wait_for_timeout(60)
            try:
                await page.click('#actions .btn:has-text("Taş At")', timeout=1500)
            except Exception:
                pass
            await page.wait_for_timeout(150)
        else:
            print('LOOP LIMIT REACHED')
        if errors:
            print('JS ERRORS:')
            for e in errors[:8]:
                print('  ', e)
            sys.exit(1)
        print('rounds completed:', rounds_done)
        await browser.close()

asyncio.run(main())
