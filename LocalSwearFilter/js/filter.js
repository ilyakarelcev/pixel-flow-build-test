"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// Фильтр мата: нормализация строки + поиск по корням.
//
// Чистая логика: без DOM, без регулярок, без зависимостей — переносится в
// C# (Unity, IL2CPP/WebGL) практически дословно (string/char-операции).
//
// Конвейер нормализации (одинаков для сообщения, корней и whitelist):
//   1. Каждый символ приводится к нижнему регистру.
//   2. Символы не из алфавита и не из charMap выбрасываются: пробелы, точки,
//      дефисы, эмодзи и т.п. Так ломаются обходы вида "б л я д ь", "б.л.я.д.ь".
//   3. Транслит-диграфы заменяются (ya→я, sh→ш, kh→х, uy→уи ...).
//   4. Одиночные символы заменяются по charMap (a→а, 0→о, ё→е, ъ→"" ...).
//   5. Подряд идущие одинаковые символы схлопываются ("бляяяядь"→"блядь").
//
// Для каждого нормализованного символа запоминается диапазон исходных
// индексов, чтобы censor() мог поставить звёздочки в исходном тексте.
//
// Поиск: каждый корень ищется как подстрока нормализованной строки.
// Совпадение отбрасывается, если его начало попадает внутрь вхождения
// слова из whitelist (это покрывает и грамматические окончания:
// "застрахуй", "барсука", "психует").
//
// Wildcard: символы самоцензуры (*, # — поле "wildcards" в данных)
// не выбрасываются, а становятся джокером: при сравнении с корнем джокер
// совпадает с ЛЮБОЙ буквой корня или пропускается. Так ловятся и "бл*дь"
// (звёздочка вместо буквы), и "б*л*я*д*ь" (звёздочки-вставки). Джокер не может
// быть ПЕРВОЙ буквой совпадения — иначе пунктуация порождала бы ложняки.
//
// nativeRoots: корни, которые совпадают только если НИ ОДНА буква совпадения
// не получена из латиницы. Нужно для корней, совпадающих с кусками обычных
// английских слов после транслит-замен: "хер" ⊂ together/where/her,
// "манд" ⊂ command, "ебу" ⊂ "game bu(siness)". Кириллицей они ловятся как
// обычно; ценой — транслит-написания именно этих корней.
// ─────────────────────────────────────────────────────────────────────────────

// Спец-символ "любая буква" в нормализованной строке (см. charMap в data-*.js).
var WILDCARD = String.fromCharCode(1); // U+0001; в данные не пишется, см. поле wildcards

// Компилирует данные одного языка (см. data-ru.js / data-en.js):
// собирает набор «значимых» символов и нормализует корни/whitelist
// тем же конвейером, которым будут нормализоваться сообщения.
function compilePass(data) {
  // копия charMap, чтобы не трогать объект данных
  var charMap = {};
  var src = data.charMap || {};
  for (var key in src) if (Object.prototype.hasOwnProperty.call(src, key)) charMap[key] = src[key];
  // символы самоцензуры из поля "wildcards" становятся джокером
  var wc = data.wildcards || "";
  for (var w = 0; w < wc.length; w++) charMap[wc[w]] = WILDCARD;
  var keep = {};
  var i, k, ch;
  var alphabet = data.alphabet || "";
  for (i = 0; i < alphabet.length; i++) keep[alphabet[i]] = true;
  // диапазоны кодов символов (для CJK-алфавитов, которые не перечислить строкой)
  var ranges = data.alphabetRanges || [];
  for (k in charMap) if (Object.prototype.hasOwnProperty.call(charMap, k)) keep[k] = true;
  var digraphsObj = data.digraphs || {};
  var digraphs = [];
  for (k in digraphsObj) if (Object.prototype.hasOwnProperty.call(digraphsObj, k)) {
    digraphs.push([k, digraphsObj[k]]);
    for (i = 0; i < k.length; i++) keep[k[i]] = true;
  }
  // длинные диграфы проверяются раньше коротких (sch раньше ch)
  digraphs.sort(function (a, b) { return b[0].length - a[0].length; });

  var pass = {
    lang: data.lang,
    charMap: charMap,
    keep: keep,
    ranges: ranges,
    digraphs: digraphs,
    roots: [],
    whitelist: []
  };
  var list = data.roots || [];
  for (i = 0; i < list.length; i++) {
    var norm = normalizeText(pass, list[i]).str;
    if (norm) pass.roots.push({ src: list[i], norm: norm, native: false });
  }
  list = data.nativeRoots || [];
  for (i = 0; i < list.length; i++) {
    var nn = normalizeText(pass, list[i]).str;
    if (nn) pass.roots.push({ src: list[i], norm: nn, native: true });
  }
  list = data.whitelist || [];
  for (i = 0; i < list.length; i++) {
    var wn = normalizeText(pass, list[i]).str;
    if (wn) pass.whitelist.push({ src: list[i], norm: wn, native: false });
  }
  // native-whitelist: гасит только чисто кириллические совпадения. Для стыков
  // вида "чё блин" (ебл), у которых есть транслит-двойник ("che eblan"),
  // который гасить нельзя.
  list = data.nativeWhitelist || [];
  for (i = 0; i < list.length; i++) {
    var wnn = normalizeText(pass, list[i]).str;
    if (wnn) pass.whitelist.push({ src: list[i], norm: wnn, native: true });
  }
  return pass;
}

// Нормализация. Возвращает { str, spans }, где spans[i] = [srcStart, srcEnd, latin):
// диапазон исходных индексов, из которых получился i-й символ str, и флаг
// "получен из латинской буквы" (для nativeRoots).
function normalizeText(pass, text) {
  var i, j;

  // Этапы 1–2: нижний регистр, отсев разделителей.
  var raw = [];      // значимые символы
  var rawSpan = [];  // их позиции в исходной строке
  var rawLatin = []; // исходный символ — латинская буква?
  for (i = 0; i < text.length; i++) {
    var ch = text[i].toLowerCase();
    var keepIt = pass.keep[ch] === true;
    if (!keepIt && pass.ranges.length > 0) {
      var code = ch.charCodeAt(0);
      for (j = 0; j < pass.ranges.length; j++) {
        if (code >= pass.ranges[j][0] && code <= pass.ranges[j][1]) { keepIt = true; break; }
      }
    }
    if (keepIt) {
      raw.push(ch);
      rawSpan.push([i, i + 1]);
      rawLatin.push(ch >= "a" && ch <= "z");
    }
  }

  // Этапы 3–4: диграфы, затем замена одиночных символов.
  var out = [];
  var spans = [];
  i = 0;
  while (i < raw.length) {
    var repl = null, adv = 1;
    for (j = 0; j < pass.digraphs.length; j++) {
      var key = pass.digraphs[j][0];
      if (i + key.length > raw.length) continue;
      var ok = true;
      for (var t = 0; t < key.length; t++) {
        if (raw[i + t] !== key[t]) { ok = false; break; }
      }
      if (ok) { repl = pass.digraphs[j][1]; adv = key.length; break; }
    }
    if (repl === null) {
      var c = raw[i];
      repl = Object.prototype.hasOwnProperty.call(pass.charMap, c) ? pass.charMap[c] : c;
    }
    var srcS = rawSpan[i][0];
    var srcE = rawSpan[i + adv - 1][1];
    var lat = false;
    for (j = 0; j < adv; j++) if (rawLatin[i + j]) { lat = true; break; }
    for (j = 0; j < repl.length; j++) {
      out.push(repl[j]);
      spans.push([srcS, srcE, lat]);
    }
    i += adv;
  }

  // Этап 5: схлопывание повторов ("бллляяя" → "бля").
  var resChars = [];
  var resSpans = [];
  for (i = 0; i < out.length; i++) {
    if (resChars.length > 0 && resChars[resChars.length - 1] === out[i]) {
      var last = resSpans[resSpans.length - 1];
      if (spans[i][1] > last[1]) last[1] = spans[i][1];
      if (spans[i][2]) last[2] = true;
    } else {
      resChars.push(out[i]);
      resSpans.push([spans[i][0], spans[i][1], spans[i][2]]);
    }
  }
  return { str: resChars.join(""), spans: resSpans };
}

// Все вхождения needle в hay (индексы начала). Строгое сравнение, без
// джокеров — используется для whitelist.
function findAllOccurrences(hay, needle) {
  var res = [];
  var i = hay.indexOf(needle);
  while (i !== -1) {
    res.push(i);
    i = hay.indexOf(needle, i + 1);
  }
  return res;
}

// Сопоставление корня с позиции i строки (j — позиция в корне) с учётом
// джокеров. Джокер в тексте поглощает одну букву корня ЛИБО пропускается.
// Возвращает индекс конца совпадения в строке или -1.
function matchRootFrom(str, i, root, j) {
  if (j >= root.length) return i;
  if (i >= str.length) return -1;
  var c = str[i];
  if (c === WILDCARD) {
    var r = matchRootFrom(str, i + 1, root, j + 1); // джокер = буква корня
    if (r !== -1) return r;
    return matchRootFrom(str, i + 1, root, j);      // джокер-вставка, пропуск
  }
  if (c === root[j]) return matchRootFrom(str, i + 1, root, j + 1);
  return -1;
}

// Все совпадения корня в строке: [{start, end}]. Первая буква совпадения —
// всегда настоящая (не джокер).
function findRootMatches(str, root) {
  var res = [];
  var first = root[0];
  for (var s = 0; s < str.length; s++) {
    if (str[s] !== first) continue;
    var e = matchRootFrom(str, s + 1, root, 1);
    if (e !== -1) res.push({ start: s, end: e });
  }
  return res;
}

// Проверка одним языковым проходом. Возвращает массив совпадений
// с привязкой к исходным индексам текста.
function runPass(pass, text) {
  var norm = normalizeText(pass, text);
  var str = norm.str;
  var spans = norm.spans;
  var i, j, n;

  // Вхождения whitelist-слов: [start, end) в нормализованной строке.
  var wl = [];
  for (i = 0; i < pass.whitelist.length; i++) {
    var w = pass.whitelist[i];
    var occ = findAllOccurrences(str, w.norm);
    for (j = 0; j < occ.length; j++) {
      var ws = occ[j];
      var we = ws + w.norm.length;
      if (w.native) {
        // native-whitelist не действует, если вхождение собрано из латиницы
        var wlLatin = false;
        for (n = ws; n < we; n++) {
          if (spans[n][2]) { wlLatin = true; break; }
        }
        if (wlLatin) continue;
      }
      wl.push([ws, we, w.src]);
    }
  }

  var hits = [];
  for (i = 0; i < pass.roots.length; i++) {
    var root = pass.roots[i];
    var found = findRootMatches(str, root.norm);
    for (j = 0; j < found.length; j++) {
      var start = found[j].start;
      var end = found[j].end; // из-за джокеров длина совпадения может отличаться от длины корня
      // native-корень: ни одна буква совпадения не должна прийти из латиницы
      if (root.native) {
        var hasLatin = false;
        for (n = start; n < end; n++) {
          if (spans[n][2]) { hasLatin = true; break; }
        }
        if (hasLatin) continue;
      }
      var suppressedBy = null;
      for (n = 0; n < wl.length; n++) {
        if (start >= wl[n][0] && start < wl[n][1]) { suppressedBy = wl[n][2]; break; }
      }
      if (suppressedBy !== null) continue;
      hits.push({
        lang: pass.lang,
        root: root.src,
        srcStart: spans[start][0],
        srcEnd: spans[end - 1][1]
      });
    }
  }
  return { hits: hits, normalized: str };
}

// Замена найденных диапазонов исходного текста звёздочками.
function censorBySpans(text, hits) {
  if (hits.length === 0) return text;
  var arr = text.split("");
  for (var i = 0; i < hits.length; i++) {
    for (var j = hits[i].srcStart; j < hits[i].srcEnd && j < arr.length; j++) arr[j] = "*";
  }
  return arr.join("");
}

// Публичный API.
//   var filter = createProfanityFilter([FILTER_DATA_RU, FILTER_DATA_EN]);
//   filter.isProfane("...") -> bool
//   filter.censor("...")    -> string со звёздочками
//   filter.check("...")     -> { profane, censored, hits }
//   filter.explain("...")   -> то же + нормализованный вид по каждому языку (для отладки)
function createProfanityFilter(dataList) {
  var passes = [];
  for (var i = 0; i < dataList.length; i++) passes.push(compilePass(dataList[i]));

  function check(text) {
    text = text == null ? "" : String(text);
    var hits = [];
    for (var p = 0; p < passes.length; p++) {
      var r = runPass(passes[p], text);
      for (var j = 0; j < r.hits.length; j++) hits.push(r.hits[j]);
    }
    return {
      profane: hits.length > 0,
      censored: censorBySpans(text, hits),
      hits: hits
    };
  }

  function explain(text) {
    text = text == null ? "" : String(text);
    var result = { passes: [], hits: [] };
    for (var p = 0; p < passes.length; p++) {
      var r = runPass(passes[p], text);
      result.passes.push({ lang: passes[p].lang, normalized: r.normalized, hits: r.hits });
      for (var j = 0; j < r.hits.length; j++) result.hits.push(r.hits[j]);
    }
    result.profane = result.hits.length > 0;
    result.censored = censorBySpans(text, result.hits);
    return result;
  }

  return {
    check: check,
    explain: explain,
    isProfane: function (t) { return check(t).profane; },
    censor: function (t) { return check(t).censored; }
  };
}

// Для node-раннера тестов (в браузере просто игнорируется).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { createProfanityFilter: createProfanityFilter };
}
