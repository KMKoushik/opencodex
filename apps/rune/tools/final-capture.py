#!/usr/bin/env python3
"""Review corpus against explicitly authored, isolated V2 fixtures (not model output)."""
import concurrent.futures, json, os, pathlib, subprocess
from PIL import Image, ImageDraw

root = pathlib.Path(__file__).resolve().parents[3]
out = root / 'apps/rune/goldens/final'
out.mkdir(parents=True, exist_ok=True)
fixture = pathlib.Path('/tmp/ocr-final')
extras = json.loads((fixture / 'extras.json').read_text())
states = sorted(p.name.removesuffix('-dark-1280x800.png') for p in (root/'apps/rune/goldens/web').glob('*-dark-1280x800.png'))
assert len(states) == 69
if os.environ.get('OCR_STATES'):
    selected = set(os.environ['OCR_STATES'].split(','))
    states = [state for state in states if state in selected]
env = {**os.environ, 'HOME':str(fixture/'home'), 'XDG_CONFIG_HOME':str(fixture/'home/.config'), 'XDG_DATA_HOME':str(fixture/'home/.local/share'), 'XDG_STATE_HOME':str(fixture/'home/.local/state'), 'XDG_CACHE_HOME':str(fixture/'home/.cache'), 'OPENCODEX_GATEWAY':'http://127.0.0.1:4506', 'OPENCODEX_BENCH_PROJECT':str((fixture/'proj/atlas-api').resolve()), 'OPENCODEX_DATA_DIR':str(fixture/'rune')}
sessions = {'markdown':0,'tools':1,'question':2,'architecture':3,'long':4,'subagent':5,'checklist':6,'external-read':7}
notes = json.loads((out/'notes.json').read_text()) if (out/'notes.json').exists() else {}
def config(state):
    flags=[]; script=[]; selected=None; page=None; extra={}
    note='Authored fixture/sidebar differs from historical model-generated oracle; native text/shadows differ.'
    if state.startswith('chat-') or state in ['find-long-open','find-markdown-open','thoughts-expanded','tool-detail-open','tool-rows-expanded','tools-expanded','session-details-open','subagent-conversation'] or state.startswith('panel-') or state in ['side-chat-new','subagents-list']:
        selected=0
        for key, index in sessions.items():
            if key in state: selected=index
        if state.startswith('tool') or state=='thoughts-expanded': selected=1
    if state.startswith('chat-') and state.endswith(('-top','-middle','-bottom')): flags+=['--scroll',state.rsplit('-',1)[1]]
    composer={'composer-focused':'focused','composer-text':'text','composer-attachment':'attachment','composer-slash':'slash','composer-mention':'mention','model-picker-open':'model','model-picker-filtered':'filtered','worktree-picker-open':'worktree','worktree-new-selected':'new-worktree','question-selected':'question-selected','question-review':'question-review'}
    if state in composer:
        flags+=['--composer-state',composer[state]]
        if state.startswith('question-'): selected=2
    if state in ['tools-expanded','tool-rows-expanded']: flags+=['--work','open']
    if state=='tool-detail-open': flags+=['--work','details']
    if state=='thoughts-expanded': flags+=['--work','thoughts']
    panels={'panel-canvas':'canvas','panel-changes':'changes','panel-diff-open':'changes','panel-file-open':'files','panel-files':'files','panel-side-chat':'side-chat','panel-subagents':'subagents','panel-terminal':'terminal','side-chat-new':'side-chat','subagents-list':'subagents'}
    if state in panels: flags+=['--panel',panels[state]]
    if state in ['panel-file-open','panel-diff-open']: flags+=['--file','src/index.ts']
    if state=='panel-side-chat': flags+=['--file',extras['side']['id']]
    if state=='panel-canvas':
        extra['OPENCODEX_CANVAS']=extras['canvas']['id']
        note+=' WK child content is omitted by Rune headless capture (not an atomic native screenshot).'
    if state=='subagent-conversation': note+=' Fixture has no native spawned subagent; parent transcript shown, not a verified child state.'
    if state=='chat-streaming': note+=' Completed authored transcript is shown; no successful live model stream was recorded in this pass.'
    if state=='side-chat-new': note+=' Existing real side fork is listed; this is not a screenshot of the web New side chat interaction.'
    if state.startswith('settings-') or state in ['app-menu-open','apps-empty','connection-offline','home-empty','home-no-project','project-actions-open','project-copy-feedback','project-edit-open','project-open-dialog','project-picker-open','sidebar-focus-view','sidebar-hidden','sidebar-project-collapsed','thread-actions-open','thread-context-menu','thread-search-open','tasks-empty','usage-limits-open','worktrees-empty','session-details-open','find-long-open','find-markdown-open']:
        page=state
        if state=='settings-general-bottom':
            page='settings-general';script=[{'t':0.1,'type':'scroll','x':900,'y':500,'dy':-1600,'dur':0.1}]
        if state=='worktrees-empty':page='worktrees-open'
        flags+=['--page',page]
    if state=='sidebar-row-hover':script=[{'t':0.1,'type':'move','key':'session-ses_parity_7'}]
    if state.startswith('find-'):
        script=[{'t':0.1,'type':'click','key':'chat-find'},{'t':0.2,'type':'type','text':'test'}]
    if selected is not None:flags+=['--session',f'ses_parity_{selected}']
    return flags,script,extra,note

def capture(state):
    flags,script,extra,note=config(state)
    notes[state]=note
    for theme in ['dark','light']:
        target=out/f'rune-{state}-{theme}-1280x800.png'
        args=[str(root/'apps/rune/target/release/opencodex'),*flags,'--screenshot',str(target),'--size','1280x800','--scale','2','--theme',theme,'--at','0.7']
        if script:
            path=out/f'script-{state}.json';path.write_text(json.dumps(script, indent=2)+'\n');args+=['--script',str(path)]
        result=subprocess.run(args,cwd=root,env={**env,**extra},stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=120)
        (out/f'capture-{state}-{theme}.log').write_bytes(result.stdout)
        if result.returncode:raise RuntimeError(f'{state}/{theme}: {result.stdout.decode()[-1500:]}')
    pair=Image.new('RGB',(2560,1640),'#202020');draw=ImageDraw.Draw(pair)
    for row,theme in enumerate(['dark','light']):
        draw.text((8,row*820+2),f'{state} / {theme}: WEB LEFT | RUNE RIGHT (authored fixture)',fill='white')
        for col,p in enumerate([root/f'apps/rune/goldens/web/{state}-{theme}-1280x800.png',out/f'rune-{state}-{theme}-1280x800.png']):
            image=Image.open(p).convert('RGB').resize((1280,800),Image.Resampling.LANCZOS)
            pair.paste(image,(col*1280,row*820+20))
    pair.save(out/f'pair-{state}.png')
    # A separate immutable review name avoids path-based image-reader caching.
    pair.save(out/f'review-{state}-integration-v1.png')
    print(state,flush=True)

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(capture,states))
(out/'notes.json').write_text(json.dumps(notes,indent=2)+'\n')
