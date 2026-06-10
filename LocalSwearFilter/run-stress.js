"use strict";

// Node-раннер стресс-базы: `node run-stress.js`.
// Сводка — в stdout (ASCII), детали провалов + серая зона — в stress-output.txt (UTF-8).
// Каждый FAIL = реальный дефект: либо мат прошёл, либо нормальное слово зацензурено.

var fs = require("fs");
var path = require("path");

var createProfanityFilter = require("./js/filter.js").createProfanityFilter;
var FILTER_DATA_RU = require("./js/data-ru.js");
var FILTER_DATA_EN = require("./js/data-en.js");
var corpus = require("./js/stress-corpus.js");

var filter = createProfanityFilter([FILTER_DATA_RU, FILTER_DATA_EN]);
var res = corpus.runStressTests(filter);

// Разделяем провалы на два типа дефектов.
var leaks = [];   // profane:true, но не пойман — мат прошёл
var overs = [];   // profane:false, но пойман — зацензурено лишнее
for (var i = 0; i < res.results.length; i++) {
  var r = res.results[i];
  if (r.ok) continue;
  if (r.expected === true) leaks.push(r); else overs.push(r);
}

var lines = [];
lines.push("СТРЕСС-БАЗА: всего " + res.total + ", прошло " + res.passed + ", провалов " + res.failed);
lines.push("  ДЫРКИ (мат прошёл сквозь фильтр): " + leaks.length);
lines.push("  ПЕРЕЦЕНЗУРА (зацензурено нормальное слово): " + overs.length);
lines.push("");

function dump(title, arr) {
  lines.push("── " + title + " ──");
  if (arr.length === 0) { lines.push("  (нет)"); lines.push(""); return; }
  for (var i = 0; i < arr.length; i++) {
    var r = arr[i];
    lines.push("  \"" + r.text + "\"" + (r.note ? "   [" + r.note + "]" : ""));
    lines.push("     ожидали profane=" + r.expected + ", получили=" + r.got + " | censored: " + r.censored);
  }
  lines.push("");
}

dump("ДЫРКИ — мат пролез", leaks);
dump("ПЕРЕЦЕНЗУРА — пострадали нормальные слова", overs);

// Серая зона — чисто информативно.
var grey = corpus.runGreyzone(filter);
lines.push("── СЕРАЯ ЗОНА (фильтр по дизайну не ловит; решай, надо ли) ──");
for (var g = 0; g < grey.length; g++) {
  lines.push("  [" + (grey[g].caught ? "поймал" : "пропустил") + "] \"" + grey[g].text + "\"   " + grey[g].note);
}

fs.writeFileSync(path.join(__dirname, "stress-output.txt"), lines.join("\n"), "utf8");
console.log("stress total=" + res.total + " passed=" + res.passed + " failed=" + res.failed +
  " leaks=" + leaks.length + " overcensor=" + overs.length);
