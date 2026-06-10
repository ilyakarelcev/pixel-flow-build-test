"use strict";

// UI тестового стенда. Логика фильтра — в filter.js, здесь только страница.

var filter = createProfanityFilter([
  FILTER_DATA_RU, FILTER_DATA_EN,
  FILTER_DATA_DE, FILTER_DATA_ES, FILTER_DATA_TR, FILTER_DATA_JA
]);

// Подмешиваем жёсткую стресс-базу (stress-corpus.js) к основным тестам, чтобы
// кнопка «Прогнать тесты» гоняла и её. FILTER_GREYZONE не добавляем — у её
// кейсов нет поля profane, это отдельный информативный список.
if (typeof FILTER_STRESS_TESTS !== "undefined" && typeof FILTER_TESTS !== "undefined") {
  FILTER_TESTS.push.apply(FILTER_TESTS, FILTER_STRESS_TESTS);
}

function $(id) { return document.getElementById(id); }

function plural(n, one, few, many) {
  var m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// Авто-высота textarea: растёт под контент, без ручного растягивания.
function autosize(el) {
  el.style.height = "auto";
  var max = Math.round(window.innerHeight * 0.55);
  el.style.height = Math.min(el.scrollHeight + 2, max) + "px";
  el.style.overflowY = el.scrollHeight + 2 > max ? "auto" : "hidden";
}

// Ник тестера на эту сессию — для пузырей в чате.
var CHAT_NICKS = ["xx_Tester228_xx", "banan4ik", "СуперОгурец", "ПроходимецLVL99", "КрысаТупая", "доширак2012"];
var chatNick = CHAT_NICKS[Math.floor(Math.random() * CHAT_NICKS.length)];

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Сливает пересекающиеся диапазоны попаданий [{srcStart, srcEnd, ...}]
// в отсортированный список [{s, e, roots: [..]}].
function mergeHitSpans(hits) {
  var spans = hits.map(function (h) {
    return { s: h.srcStart, e: h.srcEnd, roots: [h.lang + ": «" + h.root + "»"] };
  }).sort(function (a, b) { return a.s - b.s; });
  var merged = [];
  for (var i = 0; i < spans.length; i++) {
    var last = merged[merged.length - 1];
    if (last && spans[i].s <= last.e) {
      if (spans[i].e > last.e) last.e = spans[i].e;
      last.roots = last.roots.concat(spans[i].roots);
    } else {
      merged.push(spans[i]);
    }
  }
  return merged;
}

// Рендерит текст, подсвечивая диапазоны из merged-списка <mark>-ами.
function renderHighlighted(text, merged) {
  var html = "";
  var pos = 0;
  for (var i = 0; i < merged.length; i++) {
    var m = merged[i];
    html += escapeHtml(text.slice(pos, m.s));
    html += '<mark class="hit" title="' + escapeHtml(m.roots.join(", ")) + '">' +
      escapeHtml(text.slice(m.s, m.e)) + "</mark>";
    pos = m.e;
  }
  html += escapeHtml(text.slice(pos));
  return html;
}

// ── Живая проверка ──────────────────────────────────────────────────────────

function renderLive() {
  var text = $("live-input").value;
  var box = $("live-result");
  if (!text.trim()) {
    box.innerHTML = '<div class="muted">Начни печатать — результат появится сразу.</div>';
    return;
  }
  var r = filter.explain(text);
  var html = "";
  var merged0 = r.profane ? mergeHitSpans(r.hits) : [];
  html += '<div class="verdict ' + (r.profane ? "bad" : "good") + '">' +
    (r.profane
      ? "🚫 Поймано: " + merged0.length + " " + plural(merged0.length, "участок", "участка", "участков")
      : "✅ Чисто — пройдёт как есть") +
    "</div>";
  if (r.profane) {
    var merged = merged0;
    html += '<div class="row compare"><span class="label">Что зацензурится:</span><div class="cmp-text">' +
      renderHighlighted(text, merged) + "</div></div>";
    html += '<div class="row compare"><span class="label">На экране у игроков:</span><div class="cmp-text censored">' +
      renderHighlighted(r.censored, merged) + "</div></div>";
  } else {
    html += '<div class="row compare"><span class="label">На экране у игроков:</span><div class="cmp-text">' +
      escapeHtml(r.censored) + "</div></div>";
  }

  var details = "";
  for (var i = 0; i < r.passes.length; i++) {
    var p = r.passes[i];
    details += '<div class="row small"><span class="label">' + p.lang.toUpperCase() +
      " нормализация:</span> <code>" + escapeHtml(p.normalized || "—") + "</code></div>";
  }
  if (r.hits.length) {
    var roots = [];
    for (var j = 0; j < r.hits.length; j++) {
      roots.push(r.hits[j].lang + ": «" + r.hits[j].root + "»");
    }
    details += '<div class="row small"><span class="label">Сработавшие корни:</span> ' +
      escapeHtml(roots.join(", ")) + "</div>";
  }
  html += '<details class="debug"><summary>Отладка</summary>' + details + "</details>";
  box.innerHTML = html;
}

// ── Мини-чат ────────────────────────────────────────────────────────────────

function sendChat() {
  var input = $("chat-input");
  var text = input.value;
  if (!text.trim()) return;
  var r = filter.check(text);
  var list = $("chat-list");
  var empty = list.querySelector(".chat-empty");
  if (empty) empty.remove();
  var item = document.createElement("div");
  item.className = "msg" + (r.profane ? " filtered" : "");
  item.innerHTML = '<div class="msg-inner">' +
    '<div class="nick">' + escapeHtml(chatNick) + "</div>" +
    '<div class="bubble" title="Написано было: ' + escapeHtml(text) + '">' + escapeHtml(r.censored) + "</div>" +
    (r.profane ? '<span class="flag">🧼 отмыто фильтром</span>' : "") +
    "</div>";
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
  input.value = "";
  input.focus();
}

// ── Автотесты ───────────────────────────────────────────────────────────────

function runTestsUI() {
  var res = runFilterTests(filter);
  var summary = $("tests-summary");
  summary.textContent = "Пройдено " + res.passed + " из " + res.total +
    (res.failed ? " — провалов: " + res.failed : " — всё зелёное");
  summary.className = res.failed ? "tests-bad" : "tests-good";

  var rows = "";
  for (var i = 0; i < res.results.length; i++) {
    var r = res.results[i];
    if (!$("tests-show-all").checked && r.ok) continue;
    rows += "<tr class='" + (r.ok ? "ok" : "fail") + "'>" +
      "<td>" + (r.ok ? "✓" : "✗") + "</td>" +
      "<td>" + escapeHtml(r.text) + (r.note ? '<div class="note">' + escapeHtml(r.note) + "</div>" : "") + "</td>" +
      "<td>" + (r.expected ? "мат" : "чисто") + "</td>" +
      "<td>" + (r.got ? "мат" : "чисто") + "</td>" +
      "<td>" + escapeHtml(r.censored) + "</td>" +
      "</tr>";
  }
  $("tests-table-body").innerHTML = rows ||
    '<tr><td colspan="5" class="muted">Провалов нет. Включи «показать все», чтобы увидеть весь список.</td></tr>';
  $("tests-table").style.display = "table";
}

// ── Инициализация ───────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", function () {
  var live = $("live-input");
  live.addEventListener("input", function () { autosize(live); renderLive(); });
  autosize(live);

  // чипы с готовыми примерами
  var chips = document.querySelectorAll("#chips .chip");
  for (var i = 0; i < chips.length; i++) {
    chips[i].addEventListener("click", function () {
      live.value = this.getAttribute("data-text");
      autosize(live);
      renderLive();
      live.focus();
    });
  }

  $("chat-list").innerHTML = '<div class="chat-empty">Тут пусто.<br>Напиши что-нибудь культурное.<br>Или некультурное — мы как раз это и проверяем.</div>';
  $("chat-send").addEventListener("click", sendChat);
  $("chat-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") sendChat();
  });

  $("tests-run").textContent = "Прогнать " + FILTER_TESTS.length + " " +
    plural(FILTER_TESTS.length, "тест", "теста", "тестов");
  $("tests-run").addEventListener("click", runTestsUI);
  $("tests-show-all").addEventListener("change", runTestsUI);
  renderLive();
});
