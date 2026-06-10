using UnityEngine;

// ─────────────────────────────────────────────────────────────────────────────
// Unity-обёртка фильтра мата. Использование — одна строка:
//
//   string safe = ChatProfanityFilter.Censor(message);   // мат → ***
//   bool bad   = ChatProfanityFilter.IsProfane(message); // только проверка
//
// Вызывайте Censor В ОБЕ СТОРОНЫ: и для отправляемого сообщения, и для
// каждого входящего перед отображением — тогда мат не отрисуется, даже если
// у отправителя старый билд без фильтра.
//
// Словари грузятся один раз (лениво) из Resources/ProfanityFilter/*.txt.
// Чтобы не ловить миллисекундную задержку на первом сообщении, можно
// прогреть фильтр на старте: ChatProfanityFilter.Warmup();
// ─────────────────────────────────────────────────────────────────────────────

public static class ChatProfanityFilter
{
    private static ProfanityFilter _filter;

    public static ProfanityFilter Instance
    {
        get
        {
            if (_filter == null) _filter = Load();
            return _filter;
        }
    }

    public static string Censor(string message)
    {
        return Instance.Censor(message);
    }

    public static bool IsProfane(string message)
    {
        return Instance.IsProfane(message);
    }

    // Полный результат: что найдено и где (для логов/отладки).
    public static ProfanityFilter.CheckResult Check(string message)
    {
        return Instance.Check(message);
    }

    // Загрузить словари заранее (например, в загрузочной сцене).
    public static void Warmup()
    {
        Instance.IsProfane("warmup");
    }

    private static ProfanityFilter Load()
    {
        // Все .txt из любой папки Resources/ProfanityFilter/ — добавили файл
        // нового языка рядом с остальными, и он подхватится сам.
        TextAsset[] assets = Resources.LoadAll<TextAsset>("ProfanityFilter");
        if (assets == null || assets.Length == 0)
        {
            Debug.LogError("[ChatProfanityFilter] Не найдены словари в Resources/ProfanityFilter/ — фильтр будет пропускать всё!");
            return ProfanityFilter.FromDataTexts();
        }
        string[] texts = new string[assets.Length];
        for (int i = 0; i < assets.Length; i++) texts[i] = assets[i].text;
        return ProfanityFilter.FromDataTexts(texts);
    }
}
