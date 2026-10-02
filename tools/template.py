"""Edit the page template that index.html carries inside it.

index.html keeps the single-file shape it was exported in: the page itself
lives as a JSON string in <script type="__bundler/template">. Editing that
string by hand means editing escaped HTML on one 150 KB line. This pulls it
out as plain HTML and puts it back.

    python tools/template.py extract    # writes build/template.html
    (edit build/template.html)
    python tools/template.py inject     # writes it back into index.html
    python tools/preflight.py

`inject` refuses to run if index.html changed since the extract, so an edit
made directly to index.html in between is never overwritten.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'index.html'
OUT = ROOT / 'build' / 'template.html'
STAMP = ROOT / 'build' / '.index-sha'
BLOCK = re.compile(r'(<script type="__bundler/template">\n)(.*?)(\n  </script>)', re.S)


def encode(tpl):
    return json.dumps(tpl, ensure_ascii=False).replace('</', '<\\/')


def main(cmd):
    html = INDEX.read_text(encoding='utf-8')
    m = BLOCK.search(html)
    if not m:
        sys.exit('no template block in index.html')
    sha = hashlib.sha256(html.encode('utf-8')).hexdigest()
    if cmd == 'extract':
        tpl = json.loads(m.group(2))
        if encode(tpl) != m.group(2):
            sys.exit('template does not round-trip; the encoding has changed')
        OUT.parent.mkdir(exist_ok=True)
        OUT.write_text(tpl, encoding='utf-8')
        STAMP.write_text(sha)
        print(f'wrote {OUT.relative_to(ROOT)} ({len(tpl):,} chars)')
    elif cmd == 'inject':
        if not STAMP.exists() or STAMP.read_text() != sha:
            sys.exit('index.html changed since the extract; extract again first')
        tpl = OUT.read_text(encoding='utf-8')
        html = html[:m.start(2)] + encode(tpl) + html[m.end(2):]
        INDEX.write_text(html, encoding='utf-8')
        STAMP.write_text(hashlib.sha256(html.encode('utf-8')).hexdigest())
        print(f'injected {len(tpl):,} chars into index.html')
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '')
