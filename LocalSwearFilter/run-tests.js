"use strict";

// Node-раннер тестов: `node run-tests.js`.
// Сводка — в stdout (ASCII), детали провалов — в test-output.txt (UTF-8).

var fs = require("fs");
var path = require("path");

var createProfanityFilter = require("./js/filter.js").createProfanityFilter;
var FILTER_DATA_RU = require("./js/data-ru.js");
var FILTER_DATA_EN = require("./js/data-en.js");
var FILTER_DATA_DE = require("./js/data-de.js");
var FILTER_DATA_ES = require("./js/data-es.js");
var FILTER_DATA_TR = require("./js/data-tr.js");
var FILTER_DATA_JA = require("./js/data-ja.js");
var tests = require("./js/tests.js");
var stress = require("./js/stress-corpus.js");

// Стресс-база подмешивается к основным тестам — как на странице стенда.
tests.FILTER_TESTS.push.apply(tests.FILTER_TESTS, stress.FILTER_STRESS_TESTS);

var filter = createProfanityFilter([
  FILTER_DATA_RU, FILTER_DATA_EN,
  FILTER_DATA_DE, FILTER_DATA_ES, FILTER_DATA_TR, FILTER_DATA_JA
]);
var res = tests.runFilterTests(filter);

var lines = [];
lines.push("Tests: " + res.total + ", passed: " + res.passed + ", failed: " + res.failed);
lines.push("");
for (var i = 0; i < res.results.length; i++) {
  var r = res.results[i];
  if (r.ok) continue;
  lines.push("FAIL: \"" + r.text + "\"" + (r.note ? "  (" + r.note + ")" : ""));
  lines.push("  expected profane=" + r.expected + ", got=" + r.got);
  lines.push("  censored: " + r.censored);
  var hitsStr = r.hits.map(function (h) { return h.lang + ":" + h.root; }).join(", ");
  lines.push("  hits: " + (hitsStr || "(none)"));
  lines.push("");
}

fs.writeFileSync(path.join(__dirname, "test-output.txt"), lines.join("\n"), "utf8");
console.log("tests=" + res.total + " passed=" + res.passed + " failed=" + res.failed);

// ── Бенчмарк: среднее время check() на сообщение ────────────────────────────
// Корпус — все тестовые сообщения (мат, обходы, чистые фразы вперемешку).
var corpus = tests.FILTER_TESTS.map(function (t) { return t.text; });
var warm, iter, msg;
for (warm = 0; warm < 20; warm++) for (msg = 0; msg < corpus.length; msg++) filter.check(corpus[msg]);
var REPEATS = 200;
var t0 = process.hrtime.bigint();
for (iter = 0; iter < REPEATS; iter++) {
  for (msg = 0; msg < corpus.length; msg++) filter.check(corpus[msg]);
}
var t1 = process.hrtime.bigint();
var totalMsgs = REPEATS * corpus.length;
var usPerMsg = Number(t1 - t0) / 1000 / totalMsgs;
console.log("bench: " + totalMsgs + " checks, avg " + usPerMsg.toFixed(1) + " us/message (" + (usPerMsg / 1000).toFixed(4) + " ms)");

process.exit(res.failed === 0 ? 0 : 1);
