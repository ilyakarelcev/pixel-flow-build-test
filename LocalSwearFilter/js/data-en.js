"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// Данные английского прохода фильтра. Формат тот же, что в data-ru.js.
// charMap здесь тянет всё К ЛАТИНИЦЕ: кириллические двойники (с→c, у→y),
// leet-цифры (1→i, 3→e), символы (@→a, $→s).
// ─────────────────────────────────────────────────────────────────────────────

var FILTER_DATA_EN = {
  "lang": "en",

  "alphabet": "abcdefghijklmnopqrstuvwxyz",

  // символы самоцензуры → джокер (см. data-ru.js); "!" здесь же — ловит "b!tch",
  // в русском проходе "!" остаётся разделителем (там он дал бы ложняки на "...б! я...")
  "wildcards": "*#!",

  "digraphs": {
    "ph": "f"
  },

  "charMap": {
    "а": "a", "б": "b", "в": "b", "е": "e", "з": "z", "и": "i",
    "к": "k", "м": "m", "н": "h", "о": "o", "п": "n", "р": "p",
    "с": "c", "т": "t", "у": "y", "ф": "f", "х": "x",
    "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "6": "b", "7": "t",
    "@": "a", "$": "s"
  },

  "roots": [
    "fuck", "fuk", "fck", "fak",
    "shit",
    "bitch",
    "cunt",
    "dick",
    "cock",
    "pussy",
    "nigger", "nigga",
    "faggot",
    "whore",
    "slut",
    "asshole",
    "wank",
    "twat",
    "bastard",
    "porn",
    "sexy", "sexual"
  ],
  // голого "sex" нет осознанно: слипается со стыками "...s ex..."
  // (focus exchange, this example, is excellent)

  "whitelist": [
    "peacock", "cocktail", "cockpit",
    "shitake",
    "nigeria",
    "fake",
    "scunthorpe",
    "washit", "boshit",
    "cuntil"
  ]
};

// Для node-раннера тестов (в браузере просто игнорируется).
if (typeof module !== "undefined" && module.exports) {
  module.exports = FILTER_DATA_EN;
}
