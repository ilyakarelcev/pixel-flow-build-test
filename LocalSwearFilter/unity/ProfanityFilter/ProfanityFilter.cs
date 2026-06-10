using System;
using System.Collections.Generic;
using System.Globalization;

// ─────────────────────────────────────────────────────────────────────────────
// Фильтр мата: нормализация строки + поиск по корням.
//
// Чистый C# без UnityEngine и без regex — совместим с IL2CPP/WebGL и любой
// версией Unity. Это порт js/filter.js из тестового стенда (1:1 по логике);
// словари — те же текстовые файлы, что питают стенд.
//
// Использование (без Unity):
//   var filter = ProfanityFilter.FromDataTexts(ruText, enText, ...);
//   filter.IsProfane("б л я д ь");      // true
//   filter.Censor("иди нахуй отсюда");  // "иди на*** отсюда"
//
// В Unity удобнее через обёртку ChatProfanityFilter (см. рядом).
//
// Конвейер нормализации (одинаков для сообщения, корней и whitelist):
//   1. Каждый символ приводится к нижнему регистру (invariant).
//   2. Символы не из алфавита/charMap выбрасываются (пробелы, точки, эмодзи) —
//      это ломает обходы "б л я д ь", "б.л.я.д.ь".
//   3. Транслит-диграфы заменяются (ya→я, sh→ш, 314→пи ...).
//   4. Одиночные символы заменяются по charMap (a→а, 0→о, ё→е, ъ→"" ...).
//   5. Подряд идущие одинаковые символы схлопываются ("бляяяядь"→"блядь").
// Символы самоцензуры (*, #) становятся джокером: совпадают с любой буквой
// корня или пропускаются ("бл*дь", "б*л*я*д*ь").
// Для каждого нормализованного символа хранится диапазон исходных индексов
// (для Censor) и флаг "получен из латиницы" (для native-корней/whitelist).
// ─────────────────────────────────────────────────────────────────────────────

public sealed class ProfanityFilter
{
    public const char Wildcard = '\u0001';

    // ── Публичные типы ──────────────────────────────────────────────────────

    public struct Hit
    {
        public string Lang;     // язык прохода ("ru", "en", ...)
        public string Root;     // сработавший корень (как записан в словаре)
        public int SrcStart;    // диапазон в исходной строке [SrcStart, SrcEnd)
        public int SrcEnd;
    }

    public sealed class CheckResult
    {
        public bool Profane;
        public string Censored;
        public List<Hit> Hits;
    }

    // ── Внутренние структуры ────────────────────────────────────────────────

    private sealed class Root
    {
        public string Src;
        public string Norm;
        public bool Native;
    }

    private sealed class WhitelistEntry
    {
        public string Src;
        public string Norm;
        public bool Native;
    }

    private sealed class Pass
    {
        public string Lang = "";
        public Dictionary<char, string> CharMap = new Dictionary<char, string>();
        public HashSet<char> Keep = new HashSet<char>();
        public List<int[]> Ranges = new List<int[]>();           // [from, to] кодов символов
        public List<KeyValuePair<string, string>> Digraphs = new List<KeyValuePair<string, string>>();
        public List<Root> Roots = new List<Root>();
        public List<WhitelistEntry> Whitelist = new List<WhitelistEntry>();
    }

    private struct Norm
    {
        public string Str;
        public int[] SpanStart;   // нормализованный символ i ← исходные [SpanStart[i], SpanEnd[i])
        public int[] SpanEnd;
        public bool[] Latin;      // символ получен из латинской буквы
    }

    private readonly List<Pass> _passes = new List<Pass>();

    // ── Создание ────────────────────────────────────────────────────────────

    // Каждый аргумент — содержимое одного файла данных (ru.txt, en.txt, ...).
    public static ProfanityFilter FromDataTexts(params string[] dataTexts)
    {
        var filter = new ProfanityFilter();
        for (int i = 0; i < dataTexts.Length; i++)
            filter._passes.Add(CompilePass(ParseData(dataTexts[i])));
        return filter;
    }

    // ── Публичный API ───────────────────────────────────────────────────────

    public bool IsProfane(string text)
    {
        return Check(text).Profane;
    }

    public string Censor(string text)
    {
        return Check(text).Censored;
    }

    public CheckResult Check(string text)
    {
        if (text == null) text = "";
        var hits = new List<Hit>();
        for (int p = 0; p < _passes.Count; p++)
            RunPass(_passes[p], text, hits);
        var result = new CheckResult();
        result.Profane = hits.Count > 0;
        result.Censored = CensorBySpans(text, hits);
        result.Hits = hits;
        return result;
    }

    // ── Разбор файла данных ─────────────────────────────────────────────────
    // Формат (см. README): key=value до первой секции, дальше секции
    // [digraphs] / [charMap] (строки key=value), [alphabetRanges] (hex-hex),
    // [roots] / [nativeRoots] / [whitelist] / [nativeWhitelist] (по слову в строке).
    // Пустые строки и строки с # — комментарии.

    private sealed class RawData
    {
        public string Lang = "";
        public string Alphabet = "";
        public string Wildcards = "";
        public List<KeyValuePair<string, string>> Digraphs = new List<KeyValuePair<string, string>>();
        public List<KeyValuePair<string, string>> CharMap = new List<KeyValuePair<string, string>>();
        public List<int[]> Ranges = new List<int[]>();
        public List<string> Roots = new List<string>();
        public List<string> NativeRoots = new List<string>();
        public List<string> Whitelist = new List<string>();
        public List<string> NativeWhitelist = new List<string>();
    }

    private static RawData ParseData(string text)
    {
        var data = new RawData();
        string section = "";
        string[] lines = text.Replace("\r\n", "\n").Split('\n');
        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i].Trim();
            if (line.Length == 0 || line[0] == '#') continue;
            if (line[0] == '[' && line[line.Length - 1] == ']')
            {
                section = line.Substring(1, line.Length - 2);
                continue;
            }
            if (section == "")
            {
                int eq = line.IndexOf('=');
                if (eq < 0) continue;
                string key = line.Substring(0, eq).Trim();
                string val = line.Substring(eq + 1); // значение не триммим: там могут быть значимые символы
                if (key == "lang") data.Lang = val.Trim();
                else if (key == "alphabet") data.Alphabet = val.Trim();
                else if (key == "wildcards") data.Wildcards = val.Trim();
            }
            else if (section == "digraphs" || section == "charMap")
            {
                int eq = line.IndexOf('=');
                if (eq < 0) continue;
                string from = line.Substring(0, eq);
                string to = line.Substring(eq + 1);
                var pair = new KeyValuePair<string, string>(from, to);
                if (section == "digraphs") data.Digraphs.Add(pair);
                else data.CharMap.Add(pair);
            }
            else if (section == "alphabetRanges")
            {
                int dash = line.IndexOf('-');
                if (dash < 0) continue;
                int from = int.Parse(line.Substring(0, dash).Trim(), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
                int to = int.Parse(line.Substring(dash + 1).Trim(), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
                data.Ranges.Add(new int[] { from, to });
            }
            else if (section == "roots") data.Roots.Add(line);
            else if (section == "nativeRoots") data.NativeRoots.Add(line);
            else if (section == "whitelist") data.Whitelist.Add(line);
            else if (section == "nativeWhitelist") data.NativeWhitelist.Add(line);
        }
        return data;
    }

    // ── Компиляция прохода ──────────────────────────────────────────────────

    private static Pass CompilePass(RawData data)
    {
        var pass = new Pass();
        pass.Lang = data.Lang;
        pass.Ranges = data.Ranges;

        for (int i = 0; i < data.CharMap.Count; i++)
        {
            var kv = data.CharMap[i];
            if (kv.Key.Length != 1) continue;
            pass.CharMap[kv.Key[0]] = kv.Value;
        }
        // символы самоцензуры становятся джокером
        for (int i = 0; i < data.Wildcards.Length; i++)
            pass.CharMap[data.Wildcards[i]] = new string(Wildcard, 1);

        for (int i = 0; i < data.Alphabet.Length; i++) pass.Keep.Add(data.Alphabet[i]);
        foreach (var key in pass.CharMap.Keys) pass.Keep.Add(key);
        for (int i = 0; i < data.Digraphs.Count; i++)
        {
            pass.Digraphs.Add(data.Digraphs[i]);
            string k = data.Digraphs[i].Key;
            for (int j = 0; j < k.Length; j++) pass.Keep.Add(k[j]);
        }
        // длинные диграфы проверяются раньше коротких (sch раньше ch)
        pass.Digraphs.Sort(CompareDigraphs);

        AddRoots(pass, data.Roots, false);
        AddRoots(pass, data.NativeRoots, true);
        AddWhitelist(pass, data.Whitelist, false);
        AddWhitelist(pass, data.NativeWhitelist, true);
        return pass;
    }

    private static int CompareDigraphs(KeyValuePair<string, string> a, KeyValuePair<string, string> b)
    {
        return b.Key.Length.CompareTo(a.Key.Length);
    }

    private static void AddRoots(Pass pass, List<string> list, bool native)
    {
        for (int i = 0; i < list.Count; i++)
        {
            var norm = NormalizeText(pass, list[i]).Str;
            if (norm.Length == 0) continue;
            var root = new Root();
            root.Src = list[i];
            root.Norm = norm;
            root.Native = native;
            pass.Roots.Add(root);
        }
    }

    private static void AddWhitelist(Pass pass, List<string> list, bool native)
    {
        for (int i = 0; i < list.Count; i++)
        {
            var norm = NormalizeText(pass, list[i]).Str;
            if (norm.Length == 0) continue;
            var entry = new WhitelistEntry();
            entry.Src = list[i];
            entry.Norm = norm;
            entry.Native = native;
            pass.Whitelist.Add(entry);
        }
    }

    // ── Нормализация ────────────────────────────────────────────────────────

    private static Norm NormalizeText(Pass pass, string text)
    {
        int i, j;

        // Этапы 1–2: нижний регистр, отсев разделителей.
        var raw = new List<char>(text.Length);
        var rawPos = new List<int>(text.Length);
        var rawLatin = new List<bool>(text.Length);
        for (i = 0; i < text.Length; i++)
        {
            char ch = char.ToLowerInvariant(text[i]);
            bool keepIt = pass.Keep.Contains(ch);
            if (!keepIt && pass.Ranges.Count > 0)
            {
                int code = ch;
                for (j = 0; j < pass.Ranges.Count; j++)
                {
                    if (code >= pass.Ranges[j][0] && code <= pass.Ranges[j][1]) { keepIt = true; break; }
                }
            }
            if (keepIt)
            {
                raw.Add(ch);
                rawPos.Add(i);
                rawLatin.Add(ch >= 'a' && ch <= 'z');
            }
        }

        // Этапы 3–4: диграфы, затем замена одиночных символов.
        var outChars = new List<char>(raw.Count);
        var outStart = new List<int>(raw.Count);
        var outEnd = new List<int>(raw.Count);
        var outLatin = new List<bool>(raw.Count);
        i = 0;
        while (i < raw.Count)
        {
            string repl = null;
            int adv = 1;
            for (j = 0; j < pass.Digraphs.Count; j++)
            {
                string key = pass.Digraphs[j].Key;
                if (i + key.Length > raw.Count) continue;
                bool ok = true;
                for (int t = 0; t < key.Length; t++)
                {
                    if (raw[i + t] != key[t]) { ok = false; break; }
                }
                if (ok) { repl = pass.Digraphs[j].Value; adv = key.Length; break; }
            }
            if (repl == null)
            {
                char c = raw[i];
                string mapped;
                repl = pass.CharMap.TryGetValue(c, out mapped) ? mapped : new string(c, 1);
            }
            int srcS = rawPos[i];
            int srcE = rawPos[i + adv - 1] + 1;
            bool lat = false;
            for (j = 0; j < adv; j++)
            {
                if (rawLatin[i + j]) { lat = true; break; }
            }
            for (j = 0; j < repl.Length; j++)
            {
                outChars.Add(repl[j]);
                outStart.Add(srcS);
                outEnd.Add(srcE);
                outLatin.Add(lat);
            }
            i += adv;
        }

        // Этап 5: схлопывание повторов ("бллляяя" → "бля").
        var resChars = new List<char>(outChars.Count);
        var resStart = new List<int>(outChars.Count);
        var resEnd = new List<int>(outChars.Count);
        var resLatin = new List<bool>(outChars.Count);
        for (i = 0; i < outChars.Count; i++)
        {
            int last = resChars.Count - 1;
            if (last >= 0 && resChars[last] == outChars[i])
            {
                if (outEnd[i] > resEnd[last]) resEnd[last] = outEnd[i];
                if (outLatin[i]) resLatin[last] = true;
            }
            else
            {
                resChars.Add(outChars[i]);
                resStart.Add(outStart[i]);
                resEnd.Add(outEnd[i]);
                resLatin.Add(outLatin[i]);
            }
        }

        var norm = new Norm();
        norm.Str = new string(resChars.ToArray());
        norm.SpanStart = resStart.ToArray();
        norm.SpanEnd = resEnd.ToArray();
        norm.Latin = resLatin.ToArray();
        return norm;
    }

    // ── Поиск ───────────────────────────────────────────────────────────────

    // Сопоставление корня с позиции i (j — позиция в корне) с учётом джокеров:
    // джокер поглощает одну букву корня ЛИБО пропускается. Возвращает индекс
    // конца совпадения или -1.
    private static int MatchRootFrom(string str, int i, string root, int j)
    {
        if (j >= root.Length) return i;
        if (i >= str.Length) return -1;
        char c = str[i];
        if (c == Wildcard)
        {
            int r = MatchRootFrom(str, i + 1, root, j + 1); // джокер = буква корня
            if (r != -1) return r;
            return MatchRootFrom(str, i + 1, root, j);      // джокер-вставка, пропуск
        }
        if (c == root[j]) return MatchRootFrom(str, i + 1, root, j + 1);
        return -1;
    }

    private static void RunPass(Pass pass, string text, List<Hit> hits)
    {
        var norm = NormalizeText(pass, text);
        string str = norm.Str;
        int i, n;

        // Вхождения whitelist-слов: [start, end) в нормализованной строке.
        var wlStart = new List<int>();
        var wlEnd = new List<int>();
        for (i = 0; i < pass.Whitelist.Count; i++)
        {
            var w = pass.Whitelist[i];
            int from = 0;
            while (true)
            {
                int at = str.IndexOf(w.Norm, from, StringComparison.Ordinal);
                if (at < 0) break;
                from = at + 1;
                int end = at + w.Norm.Length;
                if (w.Native)
                {
                    // native-whitelist не действует, если вхождение собрано из латиницы
                    bool wlLatin = false;
                    for (n = at; n < end; n++)
                    {
                        if (norm.Latin[n]) { wlLatin = true; break; }
                    }
                    if (wlLatin) continue;
                }
                wlStart.Add(at);
                wlEnd.Add(end);
            }
        }

        for (i = 0; i < pass.Roots.Count; i++)
        {
            var root = pass.Roots[i];
            char first = root.Norm[0];
            for (int s = 0; s < str.Length; s++)
            {
                if (str[s] != first) continue; // первая буква совпадения — всегда настоящая, не джокер
                int end = MatchRootFrom(str, s + 1, root.Norm, 1);
                if (end == -1) continue;

                // native-корень: ни одна буква совпадения не из латиницы
                if (root.Native)
                {
                    bool hasLatin = false;
                    for (n = s; n < end; n++)
                    {
                        if (norm.Latin[n]) { hasLatin = true; break; }
                    }
                    if (hasLatin) continue;
                }

                // совпадение, начавшееся внутри whitelist-слова, отбрасывается
                bool suppressed = false;
                for (n = 0; n < wlStart.Count; n++)
                {
                    if (s >= wlStart[n] && s < wlEnd[n]) { suppressed = true; break; }
                }
                if (suppressed) continue;

                var hit = new Hit();
                hit.Lang = pass.Lang;
                hit.Root = root.Src;
                hit.SrcStart = norm.SpanStart[s];
                hit.SrcEnd = norm.SpanEnd[end - 1];
                hits.Add(hit);
            }
        }
    }

    private static string CensorBySpans(string text, List<Hit> hits)
    {
        if (hits.Count == 0) return text;
        var chars = text.ToCharArray();
        for (int i = 0; i < hits.Count; i++)
        {
            for (int j = hits[i].SrcStart; j < hits[i].SrcEnd && j < chars.Length; j++)
                chars[j] = '*';
        }
        return new string(chars);
    }
}
