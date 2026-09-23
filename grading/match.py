"""The matcher, and a hand-marked test set.

    python grading/match.py

Scores an answer by how many of the concepts a case needs it actually
mentions. Plain substring matching, case-folded — Thai needs no word
splitting because we match phrases, not tokens. No service, no key, no cost.

The test set is the honest part: sample answers with the score a human would
give, so the matcher's agreement can be measured rather than assumed.
"""
import json
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LIB = json.loads((ROOT / 'concepts.json').read_text(encoding='utf-8'))
CONCEPTS, CASES, SCORING = LIB['concepts'], LIB['cases'], LIB['scoring']


def norm(s):
    s = unicodedata.normalize('NFKC', s or '').lower()
    return ' '.join(s.split())


def covered(answer, concept_id):
    text = norm(answer)
    for phrase in CONCEPTS[concept_id]['say']:
        if norm(phrase) in text:
            return phrase
    return None


def grade(case_id, answer):
    case = CASES[case_id]
    hits, misses = {}, []
    for cid in case['q2']:
        got = covered(answer, cid)
        if got:
            hits[cid] = got
        else:
            misses.append(cid)
    n = min(len(hits), case['q2_expected'])
    return {'score': SCORING['map'][str(n)], 'covered': hits, 'missed': misses, 'n': n}


# --- hand-marked samples: what a senior would give, written before running ---
TESTS = [
    ('c01', 5, "1. How long has this been going on and how did it start? 2. What do you do for work - what does your day actually look like? 3. What have you stopped doing because of it, and are you taking anything for the pain?"),
    ('c01', 5, "ปวดมานานเท่าไหร่แล้ว เริ่มจากอะไร / ทำงานอะไร วันหนึ่งต้องยกของไหม / ตอนนี้มีอะไรที่ทำไม่ได้แล้วบ้าง กินยาอะไรอยู่หรือเปล่า"),
    ('c01', 4, "I'd ask how long she's had it, what her job is, and how bad the pain gets."),
    ('c01', 2, "I would ask her how long she has had the back pain."),
    ('c01', 0, "I would just see her tomorrow and assess her in the room."),
    ('c05', 5, "What actually happened when it started? Has it got better or worse since? Any numbness or weakness or pain going down the leg? And what do you need to be able to do to get back to work?"),
    ('c05', 4, "เกิดจากอะไร ตอนนี้ดีขึ้นหรือแย่ลง แล้วอยากกลับไปทำงานเมื่อไหร่"),
    ('c05', 2, "I'd ask him what he needs the certificate for."),
    ('c03', 5, "First I'd get the patient on the phone himself. Then which side is it and how long has it been going on. Then what does he want from the visit?"),
    ('c04', 4, "What does he want the massage for, how long has the tightness been there, and does he play any sport?"),
]

if __name__ == '__main__':
    agree = 0
    print(f'{"case":5} {"human":>5} {"auto":>5}  covered')
    print('-' * 70)
    for case_id, expected, answer in TESTS:
        r = grade(case_id, answer)
        mark = 'ok ' if r['score'] == expected else 'OFF'
        if r['score'] == expected:
            agree += 1
        print(f'{case_id:5} {expected:>5} {r["score"]:>5}  {mark} {", ".join(r["covered"]) or "—"}')
    print('-' * 70)
    print(f'agreed with the human mark on {agree}/{len(TESTS)}')
    sys.exit(0 if agree == len(TESTS) else 1)
