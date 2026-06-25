"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// Испанский проход — БАЗОВЫЙ набор. Формат тот же, что в data-ru.js.
// ñ оставлена отдельной буквой (root "coño" ловит только написание с ñ:
// замена ñ→n дала бы ложняки на "cono/conozco").
// "culo", "polla", "chinga" осознанно НЕ включены: после нормализации они
// совпадают с частями обычных слов (calculo, polar, watching a...).
// ─────────────────────────────────────────────────────────────────────────────

var FILTER_DATA_ES = {
  "lang": "es",

  "alphabet": "abcdefghijklmnopqrstuvwxyzñ",

  "wildcards": "*#",

  "digraphs": {},

  "charMap": {
    "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u"
  },

  "roots": [
    "puta", "puto",
    "mierda",
    "joder",
    "cabron",
    "pendej",
    "gilipoll",
    "maricon", "marica",
    "coño"
  ],

  "whitelist": [
    "comput", "disput", "reput",
    "input", "output",
    "puton"
  ]
};

// Для node-раннера тестов (в браузере просто игнорируется).
if (typeof module !== "undefined" && module.exports) {
  module.exports = FILTER_DATA_ES;
}
