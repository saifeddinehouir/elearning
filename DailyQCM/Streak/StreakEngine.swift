import Foundation
import SwiftData

/// Streak math + the upsert that records a finished session for the day.
enum StreakEngine {

    /// Adds today's results to the `StudyDay` row, creating it if needed.
    static func recordSession(answered: Int, correct: Int, dailyGoal: Int, in context: ModelContext, now: Date = .now) {
        guard answered > 0 else { return }
        let day = now.startOfDay()
        let descriptor = FetchDescriptor<StudyDay>(predicate: #Predicate { $0.dayStart == day })

        if let existing = try? context.fetch(descriptor).first {
            existing.answered += answered
            existing.correct += correct
            existing.completedGoal = existing.completedGoal || existing.answered >= dailyGoal
        } else {
            let record = StudyDay(
                dayStart: day,
                answered: answered,
                correct: correct,
                completedGoal: answered >= dailyGoal
            )
            context.insert(record)
        }
        try? context.save()
    }

    /// Consecutive days ending today (or yesterday, if today isn't done yet) with activity.
    static func currentStreak(days: [StudyDay], now: Date = .now, calendar: Calendar = .current) -> Int {
        let active = Set(days.filter { $0.answered > 0 }.map { calendar.startOfDay(for: $0.dayStart) })
        guard !active.isEmpty else { return 0 }

        var cursor = calendar.startOfDay(for: now)
        if !active.contains(cursor) {
            cursor = calendar.date(byAdding: .day, value: -1, to: cursor) ?? cursor
        }

        var streak = 0
        while active.contains(cursor) {
            streak += 1
            guard let prev = calendar.date(byAdding: .day, value: -1, to: cursor) else { break }
            cursor = prev
        }
        return streak
    }

    static func longestStreak(days: [StudyDay], calendar: Calendar = .current) -> Int {
        let sorted = days.filter { $0.answered > 0 }
            .map { calendar.startOfDay(for: $0.dayStart) }
            .sorted()
        guard !sorted.isEmpty else { return 0 }

        var best = 1
        var run = 1
        for i in 1..<sorted.count {
            if calendar.date(byAdding: .day, value: 1, to: sorted[i - 1]) == sorted[i] {
                run += 1
            } else if sorted[i] != sorted[i - 1] {
                run = 1
            }
            best = max(best, run)
        }
        return best
    }

    static func totalDaysStudied(days: [StudyDay]) -> Int {
        days.filter { $0.answered > 0 }.count
    }
}
