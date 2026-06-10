"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// СТРЕСС-БАЗА для жёсткого тестирования фильтра мата.
//
// Формат тот же, что в tests.js: { text, profane, note?, censoredContains? }.
//   profane: true  — фильтр ОБЯЗАН поймать (реальный мат, в т.ч. через обходы).
//   profane: false — фильтр НЕ ДОЛЖЕН трогать (нормальное сообщение / слово,
//                    внутри которого корень мата срабатывает ложно).
//
// ВАЖНО: это не «проверка зелёного». Каждый FAIL здесь — реальный дефект:
//   • profane:true провалился  → мат проходит сквозь фильтр (дырка);
//   • profane:false провалился → фильтр зацензурил нормальное слово (нужен
//                                whitelist или правка корня).
// База собрана из живых паттернов рунета (2ch/Pikabu-style токсичность,
// leet-замены, транслит, фонетические искажения) — то, что реальный человек,
// включая модератора Яндекса, может написать в детском чате.
//
// Источники паттернов (ресёрч в research/ + веб):
//   • gist FredericaBernkastel — «многоэтажный» словарь рус. мата;
//   • gist imDaniX — антимат-регулярка с таблицами замен;
//   • Kaggle Russian Language Toxic Comments (2ch/Pikabu);
//   • Lurkmore/StatusName — leet и кириллические аналоги символов.
//
// Низ файла (FILTER_GREYZONE) — «серая зона»: завуалированная похабщина БЕЗ
// явного матерного корня. Текущий корневой фильтр их по дизайну не ловит;
// они вынесены отдельно, чтобы было видно границу подхода, а не чтобы пугать
// провалами. Решение «ловить ли их» — за тобой.
// ─────────────────────────────────────────────────────────────────────────────

var FILTER_STRESS_TESTS = [

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. ХУЙ и производные — прямые
  // ═══════════════════════════════════════════════════════════════════════════
  { text: "хуй", profane: true },
  { text: "хуёво всё", profane: true },
  { text: "хуйня этот уровень", profane: true },
  { text: "хуйло", profane: true },
  { text: "нахуй", profane: true },
  { text: "иди нахуй", profane: true },
  { text: "пошёл на хуй", profane: true, note: "раздельно" },
  { text: "похуй мне", profane: true },
  { text: "по хую всё", profane: true, note: "раздельно" },
  { text: "хуесос", profane: true },
  { text: "охуеть", profane: true },
  { text: "охуел совсем", profane: true },
  { text: "охуенно вышло", profane: true },
  { text: "ни хуя себе", profane: true },
  { text: "до хуя народу", profane: true },
  { text: "хуёвый день", profane: true },
  { text: "хули ты пишешь", profane: true },

  // ХУЙ — обходы
  { text: "х у й", profane: true, note: "пробелы" },
  { text: "х.у.й", profane: true, note: "точки" },
  { text: "х-у-й", profane: true, note: "дефисы" },
  { text: "ху*й", profane: true, note: "звёздочка-вставка" },
  { text: "нах*й", profane: true },
  { text: "н@хуй", profane: true, note: "@ вместо а" },
  { text: "ххуйй", profane: true, note: "удвоение" },
  { text: "хуууй", profane: true, note: "растяжка" },
  { text: "xyй", profane: true, note: "латиница x,y" },
  { text: "xyu", profane: true, note: "полный транслит" },
  { text: "huy", profane: true },
  { text: "hui", profane: true },
  { text: "nahuy", profane: true },
  { text: "na huy", profane: true },
  { text: "pohuy", profane: true },
  { text: "ohuet", profane: true },
  { text: "ohuel", profane: true },
  { text: "идинахуй", profane: true, note: "слитно без пробелов" },
  { text: "иди на х у й уже", profane: true, note: "пробелы внутри слова в предложении" },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ПИЗДА и производные
  // ═══════════════════════════════════════════════════════════════════════════
  { text: "пизда", profane: true },
  { text: "пиздец", profane: true },
  { text: "пиздос", profane: true },
  { text: "пиздёж", profane: true },
  { text: "пиздатый уровень", profane: true },
  { text: "пиздабол", profane: true },
  { text: "спиздили", profane: true, note: "корень внутри слова" },
  { text: "распиздяй", profane: true },
  { text: "опизденеть", profane: true },
  { text: "пиздуй отсюда", profane: true },

  // ПИЗДА — обходы
  { text: "п и з д а", profane: true, note: "пробелы" },
  { text: "п.и.з.д.а", profane: true, note: "точки" },
  { text: "пи3да", profane: true, note: "3 вместо з" },
  { text: "пи3дец", profane: true },
  { text: "п1зда", profane: true, note: "1 вместо и — проверить, ловит ли" },
  { text: "пизд@", profane: true },
  { text: "пи*да", profane: true, note: "звёздочка" },
  { text: "pizda", profane: true },
  { text: "pizdec", profane: true },
  { text: "pizdato", profane: true },
  { text: "spizdili", profane: true },
  { text: "pi z d a", profane: true, note: "транслит + пробелы" },
  { text: "пезда", profane: true, note: "ОБХОД: е вместо и (фонетика) — ловит ли?" },
  { text: "пездец", profane: true, note: "е вместо и" },
  { text: "3.14здец", profane: true, note: "ОБХОД: 3.14 = пи; вряд ли ловится — проверить" },
  { text: "3,14дец", profane: true, note: "вариант 3.14 = пи" },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. БЛЯДЬ и производные
  // ═══════════════════════════════════════════════════════════════════════════
  { text: "блядь", profane: true },
  { text: "блять", profane: true },
  { text: "бля буду", profane: true },
  { text: "да блять как же", profane: true },
  { text: "блядина", profane: true },
  { text: "блядский день", profane: true },

  // БЛЯДЬ — обходы
  { text: "б л я д ь", profane: true, note: "кейс модератора: пробелы" },
  { text: "б.л.я.д.ь", profane: true },
  { text: "б-л-я-д-ь", profane: true },
  { text: "б_л_я_д_ь", profane: true, note: "подчёркивания" },
  { text: "б/л/я/д/ь", profane: true, note: "слэши" },
  { text: "бЛяДь", profane: true, note: "смешанный регистр" },
  { text: "бляяяядь", profane: true, note: "растяжка" },
  { text: "6лядь", profane: true, note: "6 вместо б" },
  { text: "6ля", profane: true },
  { text: "бл9ть", profane: true, note: "9 вместо я — проверить" },
  { text: "бл*дь", profane: true, note: "звёздочка" },
  { text: "бл@дь", profane: true },
  { text: "blyad", profane: true },
  { text: "blyat", profane: true },
  { text: "bl9d", profane: true, note: "транслит-leet" },
  { text: "bljad", profane: true, note: "j-транслит" },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. ЕБ-семейство
  // ═══════════════════════════════════════════════════════════════════════════
  { text: "ебать", profane: true },
  { text: "ёбаный", profane: true, note: "буква ё" },
  { text: "ёб твою мать", profane: true },
  { text: "ёбнутый", profane: true },
  { text: "заебал ты уже", profane: true },
  { text: "заебись", profane: true },
  { text: "наебал меня", profane: true },
  { text: "наебнулся с уровня", profane: true },
  { text: "выёбываться", profane: true },
  { text: "долбоёб", profane: true },
  { text: "далбаёб", profane: true, note: "безграмотно" },
  { text: "еблан", profane: true },
  { text: "ебанутый на голову", profane: true },
  { text: "уебок", profane: true },
  { text: "уёбок", profane: true },
  { text: "отъебись", profane: true },
  { text: "объебал", profane: true },
  { text: "проебал всё", profane: true },
  { text: "доебался", profane: true },
  { text: "въебать", profane: true },
  { text: "разъеби", profane: true },
  { text: "ебало завали", profane: true },

  // ЕБ — обходы
  { text: "е б а т ь", profane: true, note: "пробелы" },
  { text: "е6ать", profane: true, note: "6 вместо б" },
  { text: "э6ать", profane: true, note: "э+6" },
  { text: "е*ать", profane: true, note: "звёздочка" },
  { text: "ёбана в рот", profane: true },
  { text: "з@еб@л", profane: true, note: "@ вместо а" },
  { text: "ebat", profane: true },
  { text: "yebat", profane: true },
  { text: "ebal", profane: true },
  { text: "zaebal", profane: true },
  { text: "zaebis", profane: true },
  { text: "yobany", profane: true },
  { text: "dolboeb", profane: true },
  { text: "dolb0eb", profane: true, note: "0 вместо о" },
  { text: "eblan", profane: true },
  { text: "ot' ebis", profane: true, note: "транслит с апострофом/пробелом" },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. СУКА
  // ═══════════════════════════════════════════════════════════════════════════
  { text: "сука", profane: true },
  { text: "сука опять лагает", profane: true },
  { text: "сучка", profane: true },
  { text: "сукин сын", profane: true },
  { text: "сучара", profane: true },
  { text: "с у к а", profane: true, note: "пробелы" },
  { text: "с.у.к.а", profane: true },
  { text: "су4ка", profane: true, note: "4 вместо ч" },
  { text: "$ука", profane: true, note: "$ вместо с" },
  { text: "сук@", profane: true },
  { text: "cyka", profane: true, note: "латиница c,y,k" },
  { text: "suka", profane: true },
  { text: "cyka blyat", profane: true, note: "классика" },
  { text: "сцuка", profane: true, note: "ОБХОД: ц-вставка + лат. u — проверить" },

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. ПИДОР / МУДАК / ГАНДОН / ЗАЛУПА / МАНДА / прочее
  // ═══════════════════════════════════════════════════════════════════════════
  { text: "пидор", profane: true },
  { text: "пидорас", profane: true },
  { text: "пидарас", profane: true },
  { text: "ты чё пидор тупой", profane: true },
  { text: "педик", profane: true },
  { text: "пид0р", profane: true, note: "0 вместо о" },
  { text: "пид@рас", profane: true },
  { text: "п и д о р", profane: true },
  { text: "pidor", profane: true },
  { text: "pidoras", profane: true },
  { text: "мудак", profane: true },
  { text: "мудила", profane: true },
  { text: "мудозвон", profane: true },
  { text: "м у д а к", profane: true },
  { text: "mudak", profane: true },
  { text: "гандон", profane: true },
  { text: "гондон", profane: true },
  { text: "г@ндон", profane: true },
  { text: "залупа", profane: true },
  { text: "залупу соси", profane: true },
  { text: "z@lupa", profane: true },
  { text: "манда", profane: true },
  { text: "мандавошка", profane: true },
  { text: "м@нда", profane: true },
  { text: "хер с ним", profane: true },
  { text: "херня полная", profane: true },
  { text: "нихера не понятно", profane: true },
  { text: "иди на хер", profane: true },
  { text: "дрочить", profane: true },
  { text: "дрочер", profane: true },
  { text: "надрочил", profane: true },
  { text: "шлюха", profane: true },
  { text: "шлюхи", profane: true },
  { text: "шлюшка", profane: true, note: "ОБХОД: шлюшк, не шлюх — ловит ли?" },
  { text: "елда", profane: true },
  { text: "соси", profane: true },
  { text: "отсоси", profane: true },

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. ГОВНО / ДЕРЬМО / ЖОПА / СРАТЬ (грубое, но часто фильтруют)
  // ═══════════════════════════════════════════════════════════════════════════
  { text: "говно", profane: true },
  { text: "говнюк", profane: true },
  { text: "г0вно", profane: true, note: "0 вместо о" },
  { text: "дерьмо", profane: true },
  { text: "дерьмово играешь", profane: true },
  { text: "жопа", profane: true },
  { text: "пошёл в жопу", profane: true },
  { text: "жоп@", profane: true },
  { text: "срать", profane: true },
  { text: "насрать", profane: true },
  { text: "обосрался", profane: true },
  { text: "засранец", profane: true },

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Английский мат + leet
  // ═══════════════════════════════════════════════════════════════════════════
  { text: "fuck", profane: true },
  { text: "fuck you", profane: true },
  { text: "fucking hell", profane: true },
  { text: "motherfucker", profane: true },
  { text: "f u c k", profane: true, note: "пробелы" },
  { text: "f*ck", profane: true },
  { text: "fuk", profane: true, note: "без c" },
  { text: "phuck", profane: true, note: "ph вместо f — проверить" },
  { text: "fuсk", profane: true, note: "кириллическая с внутри" },
  { text: "shit", profane: true },
  { text: "sh1t", profane: true, note: "1 вместо i" },
  { text: "bullshit", profane: true },
  { text: "bitch", profane: true },
  { text: "b1tch", profane: true },
  { text: "b!tch", profane: true, note: "! вместо i — проверить" },
  { text: "asshole", profane: true },
  { text: "dick", profane: true },
  { text: "d1ck", profane: true },
  { text: "cunt", profane: true },
  { text: "pussy", profane: true },
  { text: "faggot", profane: true },
  { text: "whore", profane: true },
  { text: "фак ю", profane: true, note: "рус. написание fuck" },
  { text: "факъю", profane: true },

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. Живые фразы / предложения (как пишут в чате на эмоциях)
  // ═══════════════════════════════════════════════════════════════════════════
  { text: "ну ты и долбоёб конечно", profane: true },
  { text: "идите все на хуй уроды", profane: true },
  { text: "этот уровень полная хуйня я зол", profane: true },
  { text: "да блять как же ты меня заебал уже", profane: true },
  { text: "что за хуйню вы тут устроили", profane: true },
  { text: "пошёл ты н а х у й со своим читом", profane: true, note: "обход внутри фразы" },
  { text: "нах#я мне это надо", profane: true, note: "# вместо у" },
  { text: "сука я снова упал в лаву", profane: true },
  { text: "вы все тут пидорасы", profane: true },
  { text: "не пиши мне больше ебанат", profane: true },

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. ЧИСТЫЕ сообщения — фильтр НЕ должен трогать
  // ═══════════════════════════════════════════════════════════════════════════
  { text: "привет всем", profane: false },
  { text: "как пройти этот уровень?", profane: false },
  { text: "за мной, ребята!", profane: false },
  { text: "я тебя люблю", profane: false },
  { text: "давай играть вместе", profane: false },
  { text: "блин я проиграл", profane: false, note: "блин — не мат" },
  { text: "капец сложно", profane: false },
  { text: "ё-моё опять упал", profane: false },
  { text: "ёлки-палки", profane: false },
  { text: "да ну нафиг", profane: false },
  { text: "офигеть как круто", profane: false },
  { text: "ни фига себе постройка", profane: false },
  { text: "что за хрень происходит", profane: false, note: "хрень — не мат" },

  // Классические ложные срабатывания корней (whitelist-зона)
  { text: "команда красных победила", profane: false, note: "манд" },
  { text: "командир, жди меня", profane: false },
  { text: "мандарин вкусный", profane: false },
  { text: "получил мандат", profane: false },
  { text: "сколько рублей стоит", profane: false, note: "бля в рубль" },
  { text: "плыли на кораблях", profane: false },
  { text: "сабля острая", profane: false },
  { text: "грабли в сарае", profane: false },
  { text: "стебель растения", profane: false },
  { text: "гребля на байдарках", profane: false },
  { text: "застрахуй машину", profane: false, note: "страхуй" },
  { text: "подстрахуй меня", profane: false },
  { text: "я психую на боссе", profane: false },
  { text: "барсук в норе", profane: false },
  { text: "я несу карандаш", profane: false, note: "несу ка → сука" },
  { text: "сосиска в тесте", profane: false },
  { text: "сельдь под шубой", profane: false },
  { text: "передвинули мебель", profane: false },
  { text: "это какой-то ребус", profane: false },
  { text: "опорный прыжок", profane: false },
  { text: "хулиган отобрал мяч", profane: false },
  { text: "хлебушек свежий", profane: false },
  { text: "хлебнул воды", profane: false },
  { text: "требуется помощь", profane: false },
  { text: "потребляем электричество", profane: false, note: "требл → ебл" },
  { text: "употреблять воду полезно", profane: false },
  { text: "оскорблять нельзя", profane: false },
  { text: "колебания маятника", profane: false },
  { text: "мне нравится учёба", profane: false },
  { text: "у нас дебаты в школе", profane: false },
  { text: "погреб с картошкой", profane: false, note: "греб" },
  { text: "не буду сегодня играть", profane: false, note: "не буду → ебу" },
  { text: "тебе будет интересно", profane: false, note: "тебе бу → ебу" },
  { text: "не балуйся за столом", profane: false },
  { text: "не бывает так просто", profane: false },
  { text: "такое было вчера", profane: false, note: "такое было → ебы" },
  { text: "всё было быстро", profane: false },
  { text: "уже били по воротам", profane: false },
  { text: "не бань меня админ", profane: false },
  { text: "две банки колы", profane: false },
  { text: "победа за нами", profane: false },
  { text: "небо голубое", profane: false },

  // Хитрые ложные срабатывания (классические FP, которых может не быть в whitelist)
  { text: "скипидар воняет", profane: false, note: "ЛОЖНОЕ: содержит 'пидар' — нужен whitelist?" },
  { text: "бляшка на сосуде", profane: false, note: "ЛОЖНОЕ: 'бля' внутри мед. термина" },
  { text: "он обляпался краской", profane: false, note: "ЛОЖНОЕ: 'обля' → бля" },
  { text: "налил хереса в бокал", profane: false, note: "ЛОЖНОЕ: 'херес' содержит 'хер'" },
  { text: "херувим на иконе", profane: false, note: "ЛОЖНОЕ: 'херувим' → хер" },
  { text: "поджигаем сухую траву", profane: false, note: "ЛОЖНОЕ: 'трах' нет, но проверка трах" },
  { text: "черепаха ползёт", profane: false },
  { text: "великолепная игра", profane: false },
  { text: "достраховать имущество", profane: false },

  // Чистый английский (FP-ловушки)
  { text: "peacock walked by", profane: false },
  { text: "cocktail party", profane: false },
  { text: "fake news again", profane: false },
  { text: "such a good game", profane: false },
  { text: "pass the level please", profane: false },
  { text: "class is starting", profane: false, note: "ass внутри class" },
  { text: "grass is green", profane: false },
  { text: "assassin creed", profane: false, note: "ass внутри" },
  { text: "scunthorpe town", profane: false, note: "классическая scunthorpe-проблема: cunt внутри" },
  { text: "i analyze data", profane: false, note: "anal внутри analyze" },

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. Цензура — звёздочки именно на мате, остальное цело
  // ═══════════════════════════════════════════════════════════════════════════
  { text: "иди нахуй отсюда", profane: true, censoredContains: "отсюда" },
  { text: "ты сука понял меня", profane: true, censoredContains: "понял" },
  { text: "это полный пиздец ребята", profane: true, censoredContains: "ребята" }
];

// ─────────────────────────────────────────────────────────────────────────────
// СЕРАЯ ЗОНА: завуалированная похабщина БЕЗ явного матерного корня.
// Корневой фильтр их по дизайну НЕ ловит. Это не баги — это граница подхода.
// Прогоняются отдельно и просто показываются: решай, нужно ли с ними бороться
// (потребует семантики/списка фраз, чего бриф пока не требует).
// ─────────────────────────────────────────────────────────────────────────────
var FILTER_GREYZONE = [
  { text: "ху$й", note: "осознанно не ловим: $ занят как замена «с» ($ука) и не может одновременно быть джокером-вставкой" },
  { text: "сядь на бутылку", note: "оскорбление без мата" },
  { text: "иди в задницу", note: "задница — не корень" },
  { text: "я твою мамку вспоминал", note: "намёк" },
  { text: "поимел я тебя", note: "эвфемизм" },
  { text: "засунь себе сам знаешь куда", note: "иносказание" },
  { text: "три точка четырнадцать", note: "пи прописью" },
  { text: "отвали придурок", note: "грубо, но не мат" },
  { text: "ты тупой как пробка", note: "оскорбление" },
  { text: "сосал?", note: "намёк через нейтральное слово (но 'сос' тут не корень)" },
  { text: "иди лесом", note: "посыл без мата" }
];

// Прогон. Поддерживает censoredContains. Возвращает { total, passed, failed, results }.
function runStressTests(filter, cases) {
  cases = cases || FILTER_STRESS_TESTS;
  var results = [];
  var passed = 0;
  for (var i = 0; i < cases.length; i++) {
    var tc = cases[i];
    var r = filter.check(tc.text);
    var ok = r.profane === tc.profane;
    if (ok && tc.censoredContains !== undefined) {
      ok = r.censored.indexOf(tc.censoredContains) !== -1 && r.censored.indexOf("*") !== -1;
    }
    if (ok) passed++;
    results.push({
      text: tc.text,
      note: tc.note || "",
      expected: tc.profane,
      got: r.profane,
      censored: r.censored,
      hits: r.hits,
      ok: ok
    });
  }
  return { total: cases.length, passed: passed, failed: cases.length - passed, results: results };
}

// Прогон серой зоны: чисто информативный (показывает, что ловится, что нет).
function runGreyzone(filter, cases) {
  cases = cases || FILTER_GREYZONE;
  var results = [];
  for (var i = 0; i < cases.length; i++) {
    var r = filter.check(cases[i].text);
    results.push({
      text: cases[i].text,
      note: cases[i].note || "",
      caught: r.profane,
      censored: r.censored
    });
  }
  return results;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FILTER_STRESS_TESTS: FILTER_STRESS_TESTS,
    FILTER_GREYZONE: FILTER_GREYZONE,
    runStressTests: runStressTests,
    runGreyzone: runGreyzone
  };
}
