"use strict";

// UI тестового стенда. Логика фильтра — в filter.js, здесь только страница.

var filter = createProfanityFilter([
  FILTER_DATA_RU, FILTER_DATA_EN,
  FILTER_DATA_DE, FILTER_DATA_ES, FILTER_DATA_TR, FILTER_DATA_JA
]);

var DEFAULT_TEXT = [
  "Вася: бляяяя сyka кто опять эту Х У Й Н Ю нажал я щас сгорю наxуй",
  "Петя: ты нажал е6лан я ВИДЕЛ ты своим кривым пальцем тыкал лол",
  "Вася: нихyя я не тыкал ты сам там прыгал как обocpaнный NOOB",
  "Петя: да иди н,а,х,у,й у меня LAG был я не виноват сyкa",
  "Вася: lag у него бл9ть, у тебя МОЗГИ lag, а не игра, ало",
  "Петя: сам ты лаганый кусок г0вна ты ХИЛКУ сожрал и умер как бот",
  "Вася: я умер потому что ты меня пушкой eбнул, придyрок"
].join("\n");

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
    box.innerHTML = '<div class="scan-empty">Начни печатать — здесь появится разбор.</div>';
    return;
  }
  var r = filter.explain(text);
  var html = "";
  var merged0 = r.profane ? mergeHitSpans(r.hits) : [];
  html += '<div class="scan-summary"><div class="verdict ' + (r.profane ? "bad" : "good") + '">' +
    (r.profane
      ? "Заблокировано: " + merged0.length + " " + plural(merged0.length, "участок", "участка", "участков")
      : "Чисто: пройдет как есть") +
    '</div><div class="scan-count">' + r.hits.length + " " + plural(r.hits.length, "совпадение", "совпадения", "совпадений") + '</div></div>';
  html += '<div class="scan-flow">';

  html += '<div class="flow-step"><div class="flow-label"><span>исходник</span><span>как написал игрок</span></div><div class="cmp-text">' +
    (r.profane ? renderHighlighted(text, merged0) : escapeHtml(text)) + "</div></div>";

  if (r.profane) {
    var merged = merged0;
    html += '<div class="flow-step"><div class="flow-label"><span>маска</span><span>как увидят игроки</span></div><div class="cmp-text censored">' +
      renderHighlighted(r.censored, merged) + "</div></div>";
  } else {
    html += '<div class="flow-step"><div class="flow-label"><span>маска</span><span>не нужна</span></div><div class="cmp-text">' +
      escapeHtml(r.censored) + "</div></div>";
  }
  html += "</div>";

  var details = "";
  if (r.hits.length) {
    var roots = [];
    for (var j = 0; j < r.hits.length; j++) {
      roots.push(r.hits[j].lang + ": «" + r.hits[j].root + "»");
    }
    details += '<div class="row small"><span class="label">Сработавшие корни:</span> ' +
      escapeHtml(roots.join(", ")) + "</div>";
  }
  if (details) html += '<details class="debug"><summary>Сработавшие корни</summary>' + details + "</details>";
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
    (r.profane ? '<span class="flag">замаскировано фильтром</span>' : "") +
    "</div>";
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
  input.value = "";
  input.focus();
}

function openChat() {
  $("chat-widget").classList.add("open");
  $("chat-input").focus();
}

function closeChat() {
  $("chat-widget").classList.remove("open");
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
  live.value = DEFAULT_TEXT;
  live.addEventListener("input", function () { autosize(live); renderLive(); });
  autosize(live);
  $("clear-input").addEventListener("click", function () {
    live.value = "";
    autosize(live);
    renderLive();
    live.focus();
  });

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

  $("chat-list").innerHTML = '<div class="chat-empty">Пустой чат.<br>Отправь фразу и посмотри, что дойдет до игроков.</div>';
  $("chat-toggle").addEventListener("click", function () {
    var widget = $("chat-widget");
    if (widget.classList.contains("open")) closeChat();
    else openChat();
  });
  $("chat-close").addEventListener("click", closeChat);
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
