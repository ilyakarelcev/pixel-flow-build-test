"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// Немецкий проход — БАЗОВЫЙ набор (игра локализована, но аудитория небольшая).
// Формат тот же, что в data-ru.js. Кириллица здесь не маппится и выбрасывается,
// поэтому русские сообщения этот проход не задевает.
// Осознанно принятые редкие ложняки: "fickle", "brochure" (hure), "Marschall".
// ─────────────────────────────────────────────────────────────────────────────

var FILTER_DATA_DE = {
  "lang": "de",

  "alphabet": "abcdefghijklmnopqrstuvwxyz",

  "wildcards": "*#",

  "digraphs": {},

  "charMap": {
    "ä": "a", "ö": "o", "ü": "u", "ß": "s"
  },

  "roots": [
    "fick",
    "scheiss",
    "arsch",
    "fotze",
    "hure",
    "schlampe",
    "wichs"
  ],

  "whitelist": []
};

// Для node-раннера тестов (в браузере просто игнорируется).
if (typeof module !== "undefined" && module.exports) {
  module.exports = FILTER_DATA_DE;
}
