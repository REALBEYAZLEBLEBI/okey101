#!/usr/bin/env python3
import pathlib
d = pathlib.Path(__file__).parent
tpl = (d / 'template.html').read_text()
engine = (d / 'engine.js').read_text()
ui = (d / 'ui.js').read_text()
out = tpl.replace('/*__ENGINE__*/', engine).replace('/*__UI__*/', ui)
(d / 'okey101.html').write_text(out)
print('built okey101.html', len(out), 'bytes')
