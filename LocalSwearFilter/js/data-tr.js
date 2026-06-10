"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// Турецкий проход — БАЗОВЫЙ набор. Формат тот же, что в data-ru.js.
// ç оставлена отдельной буквой (ç→c дало бы ложняк "piç" на picture/epic).
// "yarak" и "göt" осознанно НЕ включены: "yarak" совпадает с частью обычного
// деепричастного суффикса -(y)arak (oynayarak), "göt" — с götürmek.
// ─────────────────────────────────────────────────────────────────────────────

var FILTER_DATA_TR = {
  "lang": "tr",

  "alphabet": "abcdefghijklmnopqrstuvwxyzç",

  "wildcards": "*#",

  "digraphs": {},

  "charMap": {
    "ı": "i", "ğ": "g", "ş": "s", "ö": "o", "ü": "u"
  },

  "roots": [
    "amk",
    "amcik",
    "aminakoy",
    "siktir",
    "orospu",
    "piç"
  ],

  "whitelist": [
    "teamk"
  ]
};

// Для node-раннера тестов (в браузере просто игнорируется).
if (typeof module !== "undefined" && module.exports) {
  module.exports = FILTER_DATA_TR;
}
