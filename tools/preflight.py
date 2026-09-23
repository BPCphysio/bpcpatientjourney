"""Pre-flight checks for index.html. Run before every push.

    python tools/preflight.py

Exits non-zero if anything is wrong. Most of what has broken this site would
have been caught here: a dictionary key defined twice and silently
overwritten, a label used in one language but not the other, media fetched
in parallel (Apps Script refuses concurrent requests), a Thai case missing
its model answers, the bundler's placeholder <title> shipping to staff.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'index.html'
THAI = re.compile('[฀-๿]')

problems = []
notes = []


def fail(msg):
    problems.append(msg)


def ok(msg):
    notes.append(msg)


html = INDEX.read_text(encoding='utf-8')

# ---------------------------------------------------------------- structure
m = re.search(r'<script type="__bundler/template">\n(.*?)\n  </script>', html, re.S)
if not m:
    print('FATAL: no bundler template block')
    sys.exit(1)
try:
    tpl = json.loads(m.group(1))
except Exception as exc:                                  # noqa: BLE001
    print(f'FATAL: template is not valid JSON — {exc}')
    sys.exit(1)
ok(f'template parses ({len(tpl):,} chars)')

if '</script>' in m.group(1):
    fail('template contains a raw </script> — it will truncate the page')

title = re.search(r'<title>([^<]*)</title>', html)
if not title or title.group(1) != 'BPC Patient Journey Trainer':
    fail(f'outer <title> is {title.group(1)!r}, expected BPC Patient Journey Trainer')
else:
    ok('outer <title> correct')

stamp = re.search(r'build ([A-Z]+-\d+)', tpl)
ok(f'build stamp {stamp.group(1)}' if stamp else 'no build stamp')
if not stamp:
    fail('no build stamp in the footer — cannot tell which build is live')


# -------------------------------------------------- dictionaries / duplicates
def object_body(src, start_idx):
    """Return the text of the object literal opening at start_idx."""
    depth = 0
    for i in range(start_idx, len(src)):
        if src[i] == '{':
            depth += 1
        elif src[i] == '}':
            depth -= 1
            if depth == 0:
                return src[start_idx + 1:i]
    return ''


def top_level_keys(body):
    """Keys declared directly in this object (skipping nested objects)."""
    keys, depth, i = [], 0, 0
    while i < len(body):
        ch = body[i]
        if ch in '{[(':
            depth += 1
        elif ch in '}])':
            depth -= 1
        elif ch in '\'"':                                   # skip strings
            quote, i = ch, i + 1
            while i < len(body) and body[i] != quote:
                i += 2 if body[i] == '\\' else 1
        elif depth == 0:
            mm = re.match(r'([A-Za-z_$][\w$]*)\s*:', body[i:])
            if mm and (i == 0 or body[i - 1] in ' \n\t,{'):
                keys.append(mm.group(1))
                i += mm.end() - 1
        i += 1
    return keys


dicts = {}
for name, pattern in [('MK.en', r'const MK = \{\s*en:\s*\{'),
                      ('UI.en', r'const UI = \{\s*en:\s*\{')]:
    mm = re.search(pattern, tpl)
    if not mm:
        continue
    body = object_body(tpl, tpl.index('{', mm.end() - 1))
    dicts[name] = top_level_keys(body)

# the th halves follow their en sibling
for base in ('MK', 'UI'):
    mm = re.search(base + r' = \{', tpl)
    if not mm:
        continue
    whole = object_body(tpl, tpl.index('{', mm.end() - 1))
    th = re.search(r'\bth:\s*\{', whole)
    if th:
        dicts[base + '.th'] = top_level_keys(object_body(whole, whole.index('{', th.end() - 1)))

for name, keys in dicts.items():
    dupes = {k for k in keys if keys.count(k) > 1}
    if dupes:
        fail(f'{name} declares {", ".join(sorted(dupes))} more than once — '
             'JavaScript keeps only the last one, silently')
    else:
        ok(f'{name}: {len(keys)} keys, no duplicates')

# A key missing from one language only matters if the app reads it; the
# design tool leaves unused strings behind and those are not worth shouting
# about. `t.x` is the taker dictionary, `mk_.x` the marking one.
# `t` is also the name of the per-case Thai translation inside view(), so its
# fields are not UI strings.
CASE_FIELDS = {'title', 'brief', 'reveal', 'model', 'q', 'q5key', 'prompt',
               'options', 'why', 'key', 'rubric', 'answer', 'track', 'level', 'id'}
used = {'UI': set(re.findall(r'\bt\.([A-Za-z_$][\w$]*)', tpl)) - CASE_FIELDS,
        'MK': set(re.findall(r'\bmk_\.([A-Za-z_$][\w$]*)', tpl))}

for base in ('MK', 'UI'):
    en, th = dicts.get(base + '.en'), dicts.get(base + '.th')
    if not (en and th):
        continue
    live = used[base]
    only_en = (set(en) - set(th)) & live
    only_th = (set(th) - set(en)) & live
    if only_en:
        fail(f'{base}: {", ".join(sorted(only_en))} used but missing from Thai')
    if only_th:
        fail(f'{base}: {", ".join(sorted(only_th))} used but missing from English')
    if not only_en and not only_th:
        ok(f'{base}: every key the app uses exists in both languages')
    for missing in sorted(live - set(en) - set(th)):
        fail(f'{base}: {missing} is read by the page but defined in neither language')
    unused = (set(en) | set(th)) - live
    if unused:
        ok(f'{base}: {len(unused)} unused string(s) ignored ({", ".join(sorted(unused)[:3])}…)'
           if len(unused) > 3 else
           f'{base}: unused string(s) ignored ({", ".join(sorted(unused))})')


# ------------------------------------------------------------------ the cases
man = json.loads(re.search(r'<script type="__bundler/manifest">\n(.*?)\n  </script>', html, re.S).group(1))
import base64, gzip                                          # noqa: E402

en_ids, th_report, idempotent = [], {}, False
for v in man.values():
    if 'javascript' not in v.get('mime', ''):
        continue
    raw = base64.b64decode(v['data'])
    if v.get('compressed'):
        raw = gzip.decompress(raw)
    src = raw.decode('utf-8', 'replace')
    if 'BPC_ADD_CASES' in src:
        idempotent = True
    en_ids += re.findall(r"id\s*:\s*'(c\d+)'", src)
    if 'BPC_TH' not in src:
        continue
    parts = re.split(r'"(c\d+)"\s*:\s*\{', src)
    for i in range(1, len(parts), 2):
        cid, body = parts[i], parts[i + 1]
        keys = re.findall(r"\bkey\s*:\s*'((?:[^'\\]|\\.)*)'", body, re.S)
        th_report[cid] = (len(keys), sum(1 for k in keys if THAI.search(k)),
                          bool(re.search(r'q5key\s*:', body)))

if len(en_ids) != len(set(en_ids)):
    fail(f'English cases load {len(en_ids)} entries for {len(set(en_ids))} ids — duplicated on load')
else:
    ok(f'English cases: {len(en_ids)} unique')
if not idempotent:
    fail('cases are not added through an idempotent helper; a re-evaluation will duplicate them')

if len(th_report) != len(set(en_ids)):
    fail(f'Thai cases: {len(th_report)} vs {len(set(en_ids))} English')
bad_th = [c for c, (n, thai, q5) in th_report.items() if n < 4 or thai != n or not q5]
if bad_th:
    fail(f'Thai cases missing question keys or q5key: {", ".join(sorted(bad_th)[:8])}')
else:
    ok(f'Thai cases: {len(th_report)}, all with 4 Thai question keys + q5key')


# ------------------------------------------------------------- behaviours
required = {
    'progress follows the person': ["'who=' +", 'qiOffset', 'BUCKETS.slice'],
    'one id per attempt':          ['attemptId'],
    'confirm before failure':      ['exists=', 'landed('],
    'offline outbox':              ['drainOutbox', 'LS_OUTBOX'],
    'roster + canonical names':    ['roster=1', 'canonical('],
    'marking: media per key':      ['&k=', 'hydrate('],
    'marking: shows the chart':    ['theCase', 'hasBrief'],
    'marking: scores by person':   ['byPerson', 'scoreOf'],
    'marking: branch level':       ['openBranch', 'branchMeta'],
}
for label, needles in required.items():
    missing = [n for n in needles if n not in tpl]
    if missing:
        fail(f'{label}: missing {", ".join(missing)}')
    else:
        ok(label)

# An export reverted this once: a single attempt, and every failure reported
# as a wrong passcode. Both halves matter, so both are checked.
if 'attempt < 3' not in tpl and 'attempt < 2' not in tpl:
    fail('the marking view no longer retries a failed load — a blip will read '
         'as a wrong passcode')
else:
    ok('marking view retries a failed load')
if "error: 'That passcode did not work, or the collection endpoint could not be reached.'" in tpl:
    fail('the marking view still blames the passcode for any failure; only a '
         'server "bad key" should say that')
else:
    ok('a failed load is not blamed on the passcode')

# The senior asked, more than once, for the full word.
short = [x.group(0) for x in re.finditer(r"[^']{0,40}physio(?!therap)[^']{0,20}", tpl)
         if '//' not in x.group(0)]
if short:
    fail(f'copy still says "physio" instead of "physiotherapist": {short[:2]}')
else:
    ok('copy says physiotherapist, never physio')

# Inside a branch the header once counted every answer in the clinic.
if 'openB ? openB.answers' not in tpl or 'openB ? openB.left' not in tpl:
    fail('the marking header does not scope its answer counts to the open '
         'branch — it will show the clinic-wide totals')
else:
    ok('marking header counts are scoped to the open branch')

if re.search(r'Promise\.all\(\s*keys', tpl):
    fail('media keys are fetched with Promise.all — Apps Script refuses '
         'concurrent requests and answers every one with an error page')
else:
    ok('media fetched one piece at a time')

if 'hasWeak' in tpl:
    fail('the scenario ranking is back; the senior asked for names instead')

buckets = re.search(r'const BUCKETS = (\[.*?\]);', tpl)
if buckets:
    bands = json.loads(buckets.group(1))
    top = max(max(b) for b in bands)
    ok(f'{len(bands)} cases per set, hardest level {top}')
    if top < 5:
        fail(f'a set never reaches difficulty 5 (tops out at {top})')
    for word in ('six', 'Six', 'หก'):
        leftovers = [x.group(0)[:60] for x in
                     re.finditer(r"[A-Za-z0-9_]+\s*:\s*'[^']*" + word + r"[^']*'", tpl)]
        if leftovers and len(bands) != 6:
            fail(f'copy still says "{word}" though a set is {len(bands)} cases: {leftovers[:2]}')

# ------------------------------------------------------------------- report
print()
for n in notes:
    print(f'  ok   {n}')
if problems:
    print()
    for p in problems:
        print(f'  FAIL {p}')
    print(f'\n{len(problems)} problem(s) — do not push.')
    sys.exit(1)
print(f'\nAll {len(notes)} checks passed.')
