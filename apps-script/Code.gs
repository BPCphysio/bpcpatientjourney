// The staff passcode. The deployed script has the real one on this line;
// this copy is public on GitHub, so it carries a placeholder. When pasting
// this file into the Apps Script editor, keep the editor's own line 1.
var ADMIN_KEY = 'SET-IN-THE-DEPLOYED-SCRIPT-ONLY';
var FOLDER_NAME = 'BPC Trainer Responses';
var PEOPLE_SHEET = 'People';
var INDEX_NAME = 'index.json';

// Searching Drive by name on every request was the bulk of the wait (a
// marking-view load ranged from 4 to 42 seconds). The ids never change, so
// they are remembered and only looked up again if one stops resolving.
var PROPS = PropertiesService.getScriptProperties();
var _folder = null, _ss = null;

function folder_() {
  if (_folder) return _folder;
  var id = PROPS.getProperty('folderId');
  if (id) {
    try { _folder = DriveApp.getFolderById(id); return _folder; } catch (e) {}
  }
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  _folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  PROPS.setProperty('folderId', _folder.getId());
  return _folder;
}

function spreadsheet_() {
  if (_ss) return _ss;
  var id = PROPS.getProperty('ssId');
  if (id) {
    try { _ss = SpreadsheetApp.openById(id); return _ss; } catch (e) {}
  }
  var f = folder_();
  var it = f.getFilesByName(FOLDER_NAME);
  if (it.hasNext()) {
    _ss = SpreadsheetApp.open(it.next());
  } else {
    _ss = SpreadsheetApp.create(FOLDER_NAME);
    var file = DriveApp.getFileById(_ss.getId());
    f.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
    _ss.getSheets()[0].appendRow(['Submitted', 'Name', 'Scenario', 'Track', 'Level', 'Response ID', 'Marked', 'Scenario ID']);
  }
  PROPS.setProperty('ssId', _ss.getId());
  return _ss;
}

// Day/month/year, 24-hour, Bangkok time, however the viewer's device is set.
function when_(ms) {
  return Utilities.formatDate(new Date(ms || Date.now()), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm');
}

// A tab listing who opened the marking view and who saved marks, and when.
function markingLog_(by, what, rec) {
  try {
    var ss = spreadsheet_(), sh = ss.getSheetByName('Marking log');
    if (!sh) {
      sh = ss.insertSheet('Marking log');
      sh.appendRow(['When (day/month/year)', 'Who', 'What', 'Answer from', 'Case', 'Response ID']);
      sh.setFrozenRows(1);
    }
    sh.appendRow([when_(), by || '(name not given)', what,
      rec ? (rec.person || rec.who || '') : '', rec ? (rec.scenarioTitle || '') : '', rec ? (rec.id || '') : '']);
  } catch (x) { /* the log must never stop a mark being saved */ }
}

function sheet_() {
  return spreadsheet_().getSheets()[0];
}

// The index file id, likewise — the marking list reads it on every load.
function indexFileCached_() {
  var id = PROPS.getProperty('indexId');
  if (id) {
    try { return DriveApp.getFileById(id); } catch (e) {}
  }
  var it = folder_().getFilesByName(INDEX_NAME);
  if (!it.hasNext()) return null;
  var f = it.next();
  PROPS.setProperty('indexId', f.getId());
  return f;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Same normalisation the trainer uses: names match case- and spacing-insensitively.
function nameKey_(n) {
  return String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isMedia_(k) {
  return k.slice(-4) === ':img' || k.slice(-6) === ':audio';
}

// A record without its image/audio data (those are fetched per answer when
// a card is opened), listing which keys were dropped.
function light_(r) {
  var copy = {}, k;
  for (k in r) if (k !== 'answers') copy[k] = r[k];
  copy.answers = {};
  copy.media = [];
  for (k in (r.answers || {})) {
    if (isMedia_(k)) copy.media.push(k); else copy.answers[k] = r.answers[k];
  }
  return copy;
}

function readRecord_(id) {
  var files = folder_().getFilesByName(id + '.json');
  if (!files.hasNext()) return null;
  try { return JSON.parse(files.next().getBlob().getDataAsString()); } catch (x) { return null; }
}

function allRecords_() {
  var out = [], it = folder_().getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var name = f.getName();
    if (name.slice(-5) !== '.json' || name === INDEX_NAME) continue;
    try { out.push(JSON.parse(f.getBlob().getDataAsString())); } catch (x) {}
  }
  return out;
}

// ---- index: one file (and a cache) holding every answer in light form ----
// Reading it is one Drive read instead of one per answer; every write below
// keeps it in step. If it is ever missing it is rebuilt from the files.

function indexFile_() {
  return indexFileCached_();
}

function readIndex_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('index');
  if (hit) { try { return JSON.parse(hit); } catch (x) {} }
  var f = indexFile_();
  if (f) {
    try {
      var arr = JSON.parse(f.getBlob().getDataAsString());
      cacheIndex_(arr);
      return arr;
    } catch (x) {}
  }
  var rebuilt = allRecords_().map(light_);
  writeIndex_(rebuilt);
  return rebuilt;
}

function cacheIndex_(arr) {
  var s = JSON.stringify(arr);
  var cache = CacheService.getScriptCache();
  if (s.length < 95000) cache.put('index', s, 21600); else cache.remove('index');
}

function writeIndex_(arr) {
  var s = JSON.stringify(arr);
  var f = indexFile_();
  if (f) {
    f.setContent(s);
  } else {
    f = folder_().createFile(INDEX_NAME, s, 'application/json');
    PROPS.setProperty('indexId', f.getId());
  }
  cacheIndex_(arr);
}

// Apply fn to the index under a lock so two phones submitting at once
// cannot lose each other's entry.
function updateIndex_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    CacheService.getScriptCache().remove('index');
    var arr = readIndex_();
    writeIndex_(fn(arr));
  } finally {
    lock.releaseLock();
  }
}

// ---- people roster ----

function peopleSheet_() {
  var ss = spreadsheet_();
  var sh = ss.getSheetByName(PEOPLE_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(PEOPLE_SHEET);
  sh.appendRow(['Name', 'Thai name', 'Other spellings (comma-separated)']);
  var seen = {};
  readIndex_().forEach(function (r) {
    var k = nameKey_(r.who);
    if (!k || seen[k]) return;
    seen[k] = 1;
    sh.appendRow([String(r.who || '').trim(), '', '']);
  });
  return sh;
}

function people_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('people');
  if (hit) { try { return JSON.parse(hit); } catch (x) {} }
  var rows = peopleSheet_().getDataRange().getValues(), out = [];
  for (var i = 1; i < rows.length; i++) {
    var name = String(rows[i][0] || '').trim();
    if (!name) continue;
    var aliases = String(rows[i][2] || '').split(',').map(function (s) { return s.trim(); }).filter(String);
    out.push({ name: name, th: String(rows[i][1] || '').trim(), aliases: aliases,
               branch: String(rows[i][4] || '').trim() });
  }
  cache.put('people', JSON.stringify(out), 900);
  return out;
}

// Which branch a resolved person works at, '' when the roster does not say.
function branchOf_(person, people) {
  var k = nameKey_(person);
  for (var i = 0; i < people.length; i++) {
    if (nameKey_(people[i].name) === k) return people[i].branch || '';
  }
  return '';
}

// Whichever spelling a person typed, resolve it to their roster name.
function resolve_(name, people) {
  var k = nameKey_(name);
  if (!k) return String(name || '').trim();
  for (var i = 0; i < people.length; i++) {
    var p = people[i];
    if (nameKey_(p.name) === k || nameKey_(p.th) === k) return p.name;
    for (var j = 0; j < p.aliases.length; j++) if (nameKey_(p.aliases[j]) === k) return p.name;
  }
  return String(name || '').trim();
}

function doneFor_(who, people) {
  var ids = [];
  readIndex_().forEach(function (r) {
    if (nameKey_(resolve_(r.who, people)) === who && r.scenarioId && ids.indexOf(r.scenarioId) < 0) ids.push(r.scenarioId);
  });
  return ids;
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.action === 'mark') {
      if (body.key !== ADMIN_KEY) return json_({ ok: false, error: 'bad key' });
      var files = folder_().getFilesByName(body.id + '.json');
      if (!files.hasNext()) return json_({ ok: false, error: 'not found' });
      var file = files.next();
      var rec = JSON.parse(file.getBlob().getDataAsString());
      // Who marked, and when. The last marker is on the answer; every save is
      // kept in its history and in the Marking log tab.
      var by = String(body.by || '').trim().slice(0, 60);
      rec.marks = body.marks || {};
      rec.markedAt = Date.now();
      rec.markedBy = by;
      rec.markHistory = (rec.markHistory || []).concat([{ by: by, at: rec.markedAt }]).slice(-20);
      file.setContent(JSON.stringify(rec));
      updateIndex_(function (arr) {
        return arr.map(function (r) {
          return r.id === body.id ? Object.assign({}, r, { marks: rec.marks, markedAt: rec.markedAt,
            markedBy: rec.markedBy, markHistory: rec.markHistory }) : r;
        });
      });
      var sh = sheet_(), data = sh.getDataRange().getValues();
      if (String(data[0][8] || '') !== 'Marked by') sh.getRange(1, 9, 1, 2).setValues([['Marked by', 'Marked at']]);
      for (var i = 1; i < data.length; i++) {
        if (data[i][5] === body.id) {
          sh.getRange(i + 1, 7).setValue('yes');
          sh.getRange(i + 1, 9, 1, 2).setValues([[by, when_(rec.markedAt)]]);
          break;
        }
      }
      markingLog_(by, 'saved marks', rec);
      return json_({ ok: true, markedAt: rec.markedAt, markedBy: by });
    }

    // Someone opened the marking view. Sent by the page after the list has
    // loaded, so it never slows the way in.
    if (body.action === 'visit') {
      if (body.key !== ADMIN_KEY) return json_({ ok: false, error: 'bad key' });
      markingLog_(String(body.by || '').trim().slice(0, 60), 'opened the marking view', null);
      return json_({ ok: true });
    }

    // A language model on the clinic PC reads the written answers and posts
    // its reading here. It sits beside the senior's marks and never touches
    // them. Several answers can come in one request.
    if (body.action === 'ai') {
      if (body.key !== ADMIN_KEY) return json_({ ok: false, error: 'bad key' });
      var got = {};
      (body.items || []).forEach(function (it) {
        var found = folder_().getFilesByName(it.id + '.json');
        if (!found.hasNext()) return;
        var af = found.next();
        var arec = JSON.parse(af.getBlob().getDataAsString());
        arec.ai = Object.assign({}, arec.ai || {}, it.ai || {});
        af.setContent(JSON.stringify(arec));
        got[it.id] = arec.ai;
      });
      updateIndex_(function (arr) {
        return arr.map(function (r) { return got[r.id] ? Object.assign({}, r, { ai: got[r.id] }) : r; });
      });
      return json_({ ok: true, saved: Object.keys(got).length });
    }

    if (body.action === 'delete') {
      if (body.key !== ADMIN_KEY) return json_({ ok: false, error: 'bad key' });
      var del = folder_().getFilesByName(body.id + '.json');
      while (del.hasNext()) del.next().setTrashed(true);
      updateIndex_(function (arr) { return arr.filter(function (r) { return r.id !== body.id; }); });
      var dsh = sheet_(), drows = dsh.getDataRange().getValues();
      for (var j = drows.length - 1; j >= 1; j--) {
        if (drows[j][5] === body.id) dsh.deleteRow(j + 1);
      }
      return json_({ ok: true });
    }

    var r = body.response;
    if (!r || !r.id) return json_({ ok: false, error: 'no response' });
    // The trainer re-sends the same id when a phone lost the connection
    // mid-submit. Treat that as already received rather than storing a copy.
    if (folder_().getFilesByName(r.id + '.json').hasNext()) {
      return json_({ ok: true, id: r.id, duplicate: true });
    }
    r.receivedAt = Date.now();
    folder_().createFile(r.id + '.json', JSON.stringify(r), 'application/json');
    updateIndex_(function (arr) {
      return arr.filter(function (x) { return x.id !== r.id; }).concat([light_(r)]);
    });
    sheet_().appendRow([
      new Date(r.when || Date.now()), r.who || '', r.scenarioTitle || '',
      r.track || '', r.level || '', r.id, 'no', r.scenarioId || ''
    ]);
    return json_({ ok: true, id: r.id });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// Every path returns JSON. Without the try/catch a transient Drive or
// spreadsheet error made Apps Script answer with an HTML error page, which
// the trainer could only read as "that passcode did not work" — sending
// seniors after a passcode that was never the problem.
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};

    // The clinic roster, for the start screen's tap-your-name chips.
    if (p.roster === '1') {
      return json_({ ok: true, people: people_() });
    }

    // Did a submission land? A phone whose confirmation was lost asks this
    // (tiny) before re-uploading the whole answer. Reveals nothing but yes/no.
    if (p.exists) {
      return json_({ ok: true, exists: folder_().getFilesByName(p.exists + '.json').hasNext() });
    }

    // Progress lookup for a returning person: which cases has this name
    // already answered. No passcode needed; it reveals case ids only.
    if (p.who) {
      var people = people_();
      return json_({ ok: true, done: doneFor_(nameKey_(resolve_(p.who, people)), people) });
    }

    if (p.key !== ADMIN_KEY) return json_({ ok: false, error: 'bad key' });

    // One opened card. Media is base64 inside the record and Apps Script
    // serves it slowly (~17 KB/s), so a card with two recordings and an
    // image took ~28 s as one lump. With ?k= the trainer pulls each piece
    // on its own and they arrive in parallel.
    if (p.id) {
      var one = readRecord_(p.id);
      if (!one) return json_({ ok: false, error: 'not found' });
      if (p.k) {
        var v = (one.answers || {})[p.k];
        return json_({ ok: true, id: p.id, key: p.k, value: v === undefined ? null : v });
      }
      return json_({ ok: true, response: one });
    }

    var roster = people_();
    var out = readIndex_().slice();
    out.forEach(function (r) {
      r.person = resolve_(r.who, roster);
      r.branch = branchOf_(r.person, roster);
    });
    out.sort(function (a, b) { return (b.when || 0) - (a.when || 0); });
    return json_({ ok: true, responses: out });
  } catch (err) {
    return json_({ ok: false, error: 'server: ' + String(err) });
  }
}
