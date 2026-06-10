"use strict";

// Генерирует Unity-ассет данные из JS-словарей стенда (единый источник правды):
//   js/data-*.js  →  unity/ProfanityFilter/Resources/ProfanityFilter/<lang>.txt
//   tests.js + stress-corpus.js  →  unity-dev/tests.txt (для локального раннера)
//                                →  unity/ProfanityFilter/Tests/ProfanityFilterTestCases.cs
// Запуск: node export-unity-data.js (после любой правки словарей или тестов).

var fs = require("fs");
var path = require("path");

var LANGS = [
  ["ru", require("./js/data-ru.js")],
  ["en", require("./js/data-en.js")],
  ["de", require("./js/data-de.js")],
  ["es", require("./js/data-es.js")],
  ["tr", require("./js/data-tr.js")],
  ["ja", require("./js/data-ja.js")]
];

function buildDataText(data) {
  var lines = [];
  lines.push("# Словарь фильтра мата (" + data.lang + "). Формат описан в README ассета.");
  lines.push("# Файл сгенерирован из js/data-" + data.lang + ".js стенда — правьте либо там и");
  lines.push("# перегенерируйте (node export-unity-data.js), либо прямо здесь.");
  lines.push("lang=" + data.lang);
  lines.push("alphabet=" + (data.alphabet || ""));
  if (data.wildcards) lines.push("wildcards=" + data.wildcards);

  function kvSection(name, obj) {
    var keys = Object.keys(obj || {});
    if (!keys.length) return;
    lines.push("");
    lines.push("[" + name + "]");
    for (var i = 0; i < keys.length; i++) lines.push(keys[i] + "=" + obj[keys[i]]);
  }
  function listSection(name, list) {
    if (!list || !list.length) return;
    lines.push("");
    lines.push("[" + name + "]");
    for (var i = 0; i < list.length; i++) lines.push(list[i]);
  }

  kvSection("digraphs", data.digraphs);
  kvSection("charMap", data.charMap);
  if (data.alphabetRanges && data.alphabetRanges.length) {
    lines.push("");
    lines.push("[alphabetRanges]");
    for (var i = 0; i < data.alphabetRanges.length; i++) {
      lines.push(data.alphabetRanges[i][0].toString(16).toUpperCase() + "-" +
                 data.alphabetRanges[i][1].toString(16).toUpperCase());
    }
  }
  listSection("roots", data.roots);
  listSection("nativeRoots", data.nativeRoots);
  listSection("whitelist", data.whitelist);
  listSection("nativeWhitelist", data.nativeWhitelist);
  return lines.join("\n") + "\n";
}

var resDir = path.join(__dirname, "unity", "ProfanityFilter", "Resources", "ProfanityFilter");
fs.mkdirSync(resDir, { recursive: true });
for (var i = 0; i < LANGS.length; i++) {
  var file = path.join(resDir, LANGS[i][0] + ".txt");
  fs.writeFileSync(file, buildDataText(LANGS[i][1]), "utf8");
  console.log("data:  " + path.relative(__dirname, file));
}

// ── Тестовый корпус ──────────────────────────────────────────────────────────

var tests = require("./js/tests.js");
var stress = require("./js/stress-corpus.js");
var all = tests.FILTER_TESTS.concat(stress.FILTER_STRESS_TESTS);

// для локального раннера: "1<TAB>текст"
var devDir = path.join(__dirname, "unity-dev");
fs.mkdirSync(devDir, { recursive: true });
var tsv = [];
for (var t = 0; t < all.length; t++) {
  var tc = all[t];
  if (tc.text.indexOf("\t") !== -1 || tc.text.indexOf("\n") !== -1) throw new Error("tab/newline in test: " + tc.text);
  tsv.push((tc.profane ? "1" : "0") + "\t" + tc.text);
}
fs.writeFileSync(path.join(devDir, "tests.txt"), tsv.join("\n") + "\n", "utf8");
console.log("tests: unity-dev/tests.txt (" + all.length + " cases)");

// для Unity Test Framework: сгенерированный C#-файл с кейсами
function csEscape(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
var cs = [];
cs.push("// Сгенерировано node export-unity-data.js из tests.js + stress-corpus.js стенда.");
cs.push("// Не редактируйте руками — правьте тесты в стенде и перегенерируйте.");
cs.push("public static class ProfanityFilterTestCases");
cs.push("{");
cs.push("    public static readonly string[] Profane =");
cs.push("    {");
for (var p = 0; p < all.length; p++) {
  if (all[p].profane) cs.push("        \"" + csEscape(all[p].text) + "\",");
}
cs.push("    };");
cs.push("");
cs.push("    public static readonly string[] Clean =");
cs.push("    {");
for (var c = 0; c < all.length; c++) {
  if (!all[c].profane) cs.push("        \"" + csEscape(all[c].text) + "\",");
}
cs.push("    };");
cs.push("}");
var testsDir = path.join(__dirname, "unity", "ProfanityFilter", "Tests");
fs.mkdirSync(testsDir, { recursive: true });
fs.writeFileSync(path.join(testsDir, "ProfanityFilterTestCases.cs"), cs.join("\n") + "\n", "utf8");
console.log("tests: unity/ProfanityFilter/Tests/ProfanityFilterTestCases.cs");
