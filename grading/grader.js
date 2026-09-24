/*
 * BPC answer grader — runs in the browser and in Node, needs no service.
 *
 * Each written question has three key points. For each point the grader
 * looks for evidence in the physiotherapist's answer, in two ways:
 *
 *   1. Cue words. Each point carries short terms, in Thai and English, that
 *      an answer covering it almost always contains ("นานแค่ไหน", "how long",
 *      "onset"). A "core" term earns the point; a "near" term earns half.
 *      English terms tolerate a small spelling slip ("mecanism").
 *
 *   2. Likeness to the reference answers. Every point has ten reference
 *      phrasings (five Thai, five English). The answer is cut into its lines
 *      and sentences, and each piece is compared with every phrasing by the
 *      three-letter chunks they share. Chunks that turn up in every case
 *      ("ปวด", "the patient") count for almost nothing; chunks that belong to
 *      this case count for a lot. Thai needs no word-splitting this way.
 *
 * A point's credit is the better of the two. The question's percentage is the
 * average of its three points. Nothing here is final: it is a first reading
 * for the senior physiotherapist, who sees which points were found and why,
 * and changes the mark whenever they disagree.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BPCGrader = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Tuned against a blind human marking of real staff answers; see test.js.
  // common: a cue word listed in at least this many cases is ordinary; on its
  // own it earns half a point. See grade().
  var DEFAULTS = { lo: 0.26, hi: 0.46, n: 3, common: 6 };
  var params = Object.assign({}, DEFAULTS);

  var data = null;      // the reference file
  var idf = null;       // chunk -> weight
  var refs = null;      // caseId -> q -> [ point -> [ {text, vec} ] ]
  var spread = null;    // cue word -> how many cases list it
  var loading = null;

  // ---------------------------------------------------------------- text
  var THAI_MARK = /([ัิ-ฺ็-๎])\1+/g;   // "อย่่าง" -> "อย่าง"

  function norm(s) {
    s = String(s || '');
    if (s.normalize) s = s.normalize('NFKC');
    return s.toLowerCase()
      .replace(/[​-‍﻿]/g, '')
      .replace(THAI_MARK, '$1')
      .replace(/[’‘`]/g, "'")
      .replace(/[^0-9a-z'฀-๿]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Lines, bullets, numbered items and sentences each become a piece. The
  // whole answer is kept as a piece too, for answers written as one block.
  function pieces(text) {
    var raw = String(text || '');
    var out = raw
      .split(/\n+|(?:^|\s)(?:\d+[.)]|[-•*–]|ข้อ\s*\d+)\s+|[.;!?]\s+/)
      .map(norm)
      .filter(function (p) { return p.length >= 2; });
    var whole = norm(raw);
    if (whole && out.indexOf(whole) < 0) out.push(whole);
    return out;
  }

  function grams(s) {
    var n = params.n, g = {}, t = ' ' + s + ' ';
    for (var i = 0; i + n <= t.length; i++) {
      var k = t.substr(i, n);
      if (k.trim().length === 0) continue;
      g[k] = (g[k] || 0) + 1;
    }
    return g;
  }

  function vec(s) {
    var g = grams(s), v = {}, len = 0, k, w;
    for (k in g) {
      w = (1 + Math.log(g[k])) * (idf[k] || idf.__unseen);
      v[k] = w; len += w * w;
    }
    len = Math.sqrt(len) || 1;
    for (k in v) v[k] /= len;
    return v;
  }

  function cos(a, b) {
    var s = 0, k;
    if (Object.keys(a).length > Object.keys(b).length) { var t = a; a = b; b = t; }
    for (k in a) if (b[k]) s += a[k] * b[k];
    return s;
  }

  // ------------------------------------------------------------ cue terms
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      var best = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Returns the cue as found, or null. Thai cues are plain substrings; English
  // cues must start at a word and may carry a short ending ("injury" also
  // matches "injury's", "limits" also matches "limitation" only if listed).
  function findCue(text, words, cue) {
    var c = norm(cue);
    if (!c) return null;
    if (/[฀-๿]/.test(c)) return text.indexOf(c) > -1 ? cue : null;
    var re = new RegExp('(^| )' + escapeRe(c) + "[a-z']{0,3}(?= |$)");
    if (re.test(text)) return cue;
    // one or two slips in a longer single word: "mecanism", "mecjamism"
    if (c.indexOf(' ') < 0 && c.length >= 6) {
      var max = c.length >= 9 ? 2 : 1;
      for (var i = 0; i < words.length; i++) {
        if (words[i].length >= 5 && lev(words[i], c, max) <= max) return cue + ' ≈ ' + words[i];
      }
    }
    return null;
  }

  // --------------------------------------------------------------- setup
  function load(json) {
    data = json;
    // Every reference phrasing of every point of every case is one document.
    var docs = [];
    Object.keys(data.cases).forEach(function (cid) {
      ['q1', 'q2'].forEach(function (q) {
        var b = data.cases[cid][q];
        if (!b) return;
        ['en', 'th'].forEach(function (lang) {
          (b.answers[lang] || []).forEach(function (a) {
            a.forEach(function (item) { docs.push(norm(item)); });
          });
        });
      });
    });
    var df = {};
    docs.forEach(function (d) {
      var g = grams(d);
      for (var k in g) df[k] = (df[k] || 0) + 1;
    });
    idf = {};
    var N = docs.length;
    for (var k in df) idf[k] = Math.log((N + 1) / (df[k] + 1)) + 1;
    idf.__unseen = Math.log(N + 1) + 1;

    // How ordinary is each cue word? Count the cases whose reference answers
    // use it. "พรุ่งนี้" or "goal" turns up in case after case; "breastfeeding"
    // in one. A word listed for one case but used everywhere is still ordinary.
    var caseText = {};
    Object.keys(data.cases).forEach(function (cid) {
      var bits = [];
      ['q1', 'q2'].forEach(function (q) {
        var b = data.cases[cid][q];
        if (!b) return;
        ['en', 'th'].forEach(function (lang) {
          (b.answers[lang] || []).forEach(function (a) { bits.push(norm(a.join(' '))); });
        });
      });
      caseText[cid] = ' ' + bits.join(' ') + ' ';
    });
    var cids = Object.keys(caseText);
    spread = {};
    cids.forEach(function (cid) {
      ['q1', 'q2'].forEach(function (q) {
        var b = data.cases[cid][q];
        if (!b) return;
        b.points.forEach(function (p) {
          (p.core || []).concat(p.near || []).forEach(function (t) {
            var k = norm(t);
            if (!k || spread[k] !== undefined) return;
            var thai = /[฀-๿]/.test(k), re = thai ? null : new RegExp(' ' + escapeRe(k) + "[a-z']{0,3} ");
            spread[k] = cids.filter(function (c) {
              return thai ? caseText[c].indexOf(k) > -1 : re.test(caseText[c]);
            }).length || 1;
          });
        });
      });
    });

    refs = {};
    Object.keys(data.cases).forEach(function (cid) {
      refs[cid] = {};
      ['q1', 'q2'].forEach(function (q) {
        var b = data.cases[cid][q];
        if (!b) return;
        refs[cid][q] = b.points.map(function (p, i) {
          var list = [];
          ['en', 'th'].forEach(function (lang) {
            (b.answers[lang] || []).forEach(function (a, j) {
              list.push({ text: a[i], lang: lang, n: j, vec: vec(norm(a[i])) });
            });
          });
          return list;
        });
      });
    });
    return api;
  }

  // In the page: fetch the reference file once, from next to this script.
  function ready(url) {
    if (data) return Promise.resolve(api);
    if (loading) return loading;
    loading = fetch(url || 'grading/answers.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('answers ' + r.status); return r.json(); })
      .then(load)
      .catch(function (e) { loading = null; throw e; });
    return loading;
  }

  // ---------------------------------------------------------------- grade
  // skip: optional {lang, n} — leave that reference answer out, so a
  // reference can be graded against the other nine without meeting itself.
  function grade(caseId, q, text, skip) {
    if (!data) return { graded: false, reason: 'not loaded' };
    var block = data.cases[caseId] && data.cases[caseId][q];
    if (!block) return { graded: false, reason: 'no reference' };
    var whole = norm(text);
    if (whole.replace(/[^a-z฀-๿]/g, '').length < 3) return { graded: false, reason: 'empty' };

    var words = whole.split(' ');
    var parts = pieces(text).map(function (p) { return { text: p, vec: vec(p) }; });

    var points = block.points.map(function (p, i) {
      var best = { credit: 0, how: null, evidence: null, sim: 0 };
      var t, k, hits = [], rare = false;
      // A cue word that belongs to this case earns the point outright. An
      // ordinary one ("goal", "how long", "งาน") earns it only alongside a
      // second cue for the same point; alone it is half, the way a marker
      // treats a generic mention or half of a two-part point.
      for (k = 0; k < (p.core || []).length; k++) {
        t = findCue(whole, words, p.core[k]);
        if (!t) continue;
        hits.push(t);
        if ((spread[norm(p.core[k])] || 1) < params.common) rare = true;
      }
      if (hits.length) {
        best = { credit: rare || hits.length >= 2 ? 1 : 0.5, how: 'core', evidence: hits.slice(0, 3).join(', '), sim: 0 };
      }
      if (best.credit < 1) {
        for (k = 0; k < (p.near || []).length && !best.credit; k++) {
          t = findCue(whole, words, p.near[k]);
          if (t) best = { credit: 0.5, how: 'near', evidence: t, sim: 0 };
        }
      }
      // likeness to the reference phrasings for this point
      var top = 0, topRef = null;
      refs[caseId][q][i].forEach(function (r) {
        if (skip && r.lang === skip.lang && r.n === skip.n) return;
        parts.forEach(function (pc) {
          var s = cos(pc.vec, r.vec);
          if (s > top) { top = s; topRef = r.text; }
        });
      });
      var simCredit = top >= params.hi ? 1 : top >= params.lo ? 0.5 : 0;
      if (simCredit > best.credit) best = { credit: simCredit, how: 'similar', evidence: topRef, sim: top };
      best.sim = Math.round(top * 100) / 100;
      best.label = { en: p.en, th: p.th };
      return best;
    });

    var pct = Math.round(points.reduce(function (s, p) { return s + p.credit; }, 0) / points.length * 100);
    return { graded: true, pct: pct, suggested: Math.round(pct / 20), points: points };
  }

  // Whole submission: the multiple choice plus the two written answers.
  // The keys are the app's own: q0 the choice, q1 "the three questions",
  // q2 "why those three", q3 the picture (never graded here).
  // Spoken-only answers cannot be read, so they are left out of the average
  // and reported, rather than counted as zero.
  function gradeResponse(r, correctIndex) {
    var a = r.answers || {};
    var parts = [], out = { q1: null, q2: null, mc: null, spoken: [] };
    if (typeof a['q0:mc'] === 'number' && typeof correctIndex === 'number') {
      out.mc = a['q0:mc'] === correctIndex ? 100 : 0;
      parts.push(out.mc);
    }
    ['q1', 'q2'].forEach(function (q) {
      var g = grade(r.scenarioId, q, a[q + ':text']);
      if (g.graded) { out[q] = g; parts.push(g.pct); }
      else if (a[q + ':audiosec'] || (r.media || []).indexOf(q + ':audio') > -1) out.spoken.push(q);
    });
    out.pct = parts.length ? Math.round(parts.reduce(function (s, x) { return s + x; }, 0) / parts.length) : null;
    return out;
  }

  // The three key points for one question, for showing as the answer key.
  function points(caseId, q) {
    var b = data && data.cases[caseId] && data.cases[caseId][q];
    return b ? b.points.map(function (p) { return { en: p.en, th: p.th }; }) : [];
  }

  var api = {
    load: load, ready: ready, grade: grade, gradeResponse: gradeResponse, points: points,
    norm: norm, pieces: pieces,
    set: function (p) {
      var rebuild = p.n !== undefined && p.n !== params.n;
      Object.assign(params, p);
      if (data && rebuild) load(data);
      return api;
    },
    params: function () { return Object.assign({}, params); },
    loaded: function () { return !!data; },
    defaults: DEFAULTS
  };
  return api;
});
