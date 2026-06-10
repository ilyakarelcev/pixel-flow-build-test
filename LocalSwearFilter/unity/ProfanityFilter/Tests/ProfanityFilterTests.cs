using NUnit.Framework;
using UnityEngine;

// Тесты фильтра для Unity Test Framework: Window → General → Test Runner →
// EditMode → Run All. Кейсы сгенерированы из корпуса тестового стенда
// (ProfanityFilterTestCases.cs). Папку Tests можно целиком удалить из
// проекта — на работу фильтра она не влияет.
public class ProfanityFilterTests
{
    private static ProfanityFilter _filter;

    private static ProfanityFilter Filter
    {
        get
        {
            if (_filter == null)
            {
                TextAsset[] assets = Resources.LoadAll<TextAsset>("ProfanityFilter");
                string[] texts = new string[assets.Length];
                for (int i = 0; i < assets.Length; i++) texts[i] = assets[i].text;
                _filter = ProfanityFilter.FromDataTexts(texts);
            }
            return _filter;
        }
    }

    [Test]
    public void DictionariesArePresent()
    {
        TextAsset[] assets = Resources.LoadAll<TextAsset>("ProfanityFilter");
        Assert.GreaterOrEqual(assets.Length, 2, "Нет словарей в Resources/ProfanityFilter/");
    }

    [Test]
    public void CatchesProfanityAndBypasses()
    {
        foreach (string text in ProfanityFilterTestCases.Profane)
            Assert.IsTrue(Filter.IsProfane(text), "Пропущено: \"" + text + "\"");
    }

    [Test]
    public void PassesCleanMessages()
    {
        foreach (string text in ProfanityFilterTestCases.Clean)
            Assert.IsFalse(Filter.IsProfane(text), "Ложное срабатывание: \"" + text + "\" → \"" + Filter.Censor(text) + "\"");
    }

    [Test]
    public void CensorPutsStarsAndKeepsCleanPart()
    {
        string censored = Filter.Censor("иди нахуй отсюда");
        StringAssert.Contains("*", censored);
        StringAssert.Contains("отсюда", censored);
    }
}
