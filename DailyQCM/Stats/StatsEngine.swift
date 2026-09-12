import Foundation

/// Accuracy for one grouping key (a topic, difficulty, or deck).
struct AccuracyBucket: Identifiable {
    let label: String
    let correct: Int
    let total: Int
    var id: String { label }
    var rate: Double { total == 0 ? 0 : Double(correct) / Double(total) }
}

/// One day on the accuracy-over-time chart.
struct DailyPoint: Identifiable {
    let day: Date
    let answered: Int
    let correct: Int
    var id: Date { day }
    var rate: Double { answered == 0 ? 0 : Double(correct) / Double(answered) }
}

/// Pure aggregation over `Attempt` records.
enum StatsEngine {

    static func overall(_ attempts: [Attempt]) -> (answered: Int, correct: Int, rate: Double) {
        let correct = attempts.filter(\.wasCorrect).count
        let rate = attempts.isEmpty ? 0 : Double(correct) / Double(attempts.count)
        return (attempts.count, correct, rate)
    }

    static func byTopic(_ attempts: [Attempt], ascending: Bool = true) -> [AccuracyBucket] {
        buckets(attempts, key: \.topic)
            .sorted { ascending ? $0.rate < $1.rate : $0.rate > $1.rate }
    }

    static func byDifficulty(_ attempts: [Attempt]) -> [AccuracyBucket] {
        let order: [Difficulty] = [.easy, .medium, .hard]
        return order.compactMap { diff in
            let subset = attempts.filter { $0.difficulty == diff }
            guard !subset.isEmpty else { return nil }
            return AccuracyBucket(label: diff.label,
                                  correct: subset.filter(\.wasCorrect).count,
                                  total: subset.count)
        }
    }

    static func byDeck(_ attempts: [Attempt]) -> [AccuracyBucket] {
        buckets(attempts, key: \.deckName).sorted { $0.label < $1.label }
    }

    /// Per-day accuracy for the last `days` days, oldest first, days with no
    /// activity included as zero so the x-axis is continuous.
    static func daily(_ attempts: [Attempt], days: Int, now: Date = .now, calendar: Calendar = .current) -> [DailyPoint] {
        let start = calendar.startOfDay(for: now).adding(days: -(days - 1), calendar)
        var grouped: [Date: (correct: Int, total: Int)] = [:]
        for a in attempts {
            let day = calendar.startOfDay(for: a.date)
            guard day >= start else { continue }
            var entry = grouped[day] ?? (0, 0)
            entry.total += 1
            if a.wasCorrect { entry.correct += 1 }
            grouped[day] = entry
        }
        return calendar.days(from: start, to: now).map { day in
            let e = grouped[day] ?? (0, 0)
            return DailyPoint(day: day, answered: e.total, correct: e.correct)
        }
    }

    private static func buckets(_ attempts: [Attempt], key: (Attempt) -> String) -> [AccuracyBucket] {
        var agg: [String: (correct: Int, total: Int)] = [:]
        for a in attempts {
            var entry = agg[key(a)] ?? (0, 0)
            entry.total += 1
            if a.wasCorrect { entry.correct += 1 }
            agg[key(a)] = entry
        }
        return agg.map { AccuracyBucket(label: $0.key, correct: $0.value.correct, total: $0.value.total) }
    }
}
