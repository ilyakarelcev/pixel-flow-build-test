using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;

// Локальный раннер C#-порта (без Unity): компилируется вместе с
// ../unity/ProfanityFilter/ProfanityFilter.cs, гоняет корпус tests.txt
// и сверяет вердикты. Запуск: build-and-test.cmd
public static class RunTests
{
    public static int Main(string[] args)
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string dataDir = Path.Combine(baseDir, @"..\unity\ProfanityFilter\Resources\ProfanityFilter");
        string[] langs = { "ru", "en", "de", "es", "tr", "ja" };
        var dataTexts = new List<string>();
        foreach (string lang in langs)
            dataTexts.Add(File.ReadAllText(Path.Combine(dataDir, lang + ".txt")));

        var filter = ProfanityFilter.FromDataTexts(dataTexts.ToArray());

        string[] lines = File.ReadAllLines(Path.Combine(baseDir, "tests.txt"));
        int total = 0, passed = 0;
        var failures = new StringBuilder();
        var corpus = new List<string>();
        foreach (string line in lines)
        {
            if (line.Length == 0) continue;
            int tab = line.IndexOf('\t');
            bool expected = line.Substring(0, tab) == "1";
            string text = line.Substring(tab + 1);
            corpus.Add(text);
            total++;
            var result = filter.Check(text);
            if (result.Profane == expected)
            {
                passed++;
            }
            else
            {
                failures.AppendLine("FAIL: \"" + text + "\" expected=" + expected + " got=" + result.Profane);
                failures.AppendLine("  censored: " + result.Censored);
            }
        }

        File.WriteAllText(Path.Combine(baseDir, "test-output-cs.txt"), failures.ToString(), Encoding.UTF8);
        Console.WriteLine("tests=" + total + " passed=" + passed + " failed=" + (total - passed));

        // бенчмарк
        for (int w = 0; w < 20; w++)
            foreach (string msg in corpus) filter.Check(msg);
        var sw = Stopwatch.StartNew();
        const int repeats = 200;
        for (int r = 0; r < repeats; r++)
            foreach (string msg in corpus) filter.Check(msg);
        sw.Stop();
        double usPerMsg = sw.Elapsed.TotalMilliseconds * 1000.0 / (repeats * corpus.Count);
        Console.WriteLine("bench: avg " + usPerMsg.ToString("F1") + " us/message");

        return total == passed ? 0 : 1;
    }
}
