import Foundation

/// Answer quality on the SM-2 0…5 scale. MCQ answers are binary, so only two are
/// used in the app (`good` / `again`); `hard` and `easy` exist for future grading UI.
enum ReviewGrade: Int {
    case again = 0   // incorrect
    case hard  = 3
    case good  = 4   // correct
    case easy  = 5

    static func forBinary(correct: Bool) -> ReviewGrade { correct ? .good : .again }
}

/// The classic SM-2 spaced-repetition algorithm, as a pure mutation of `ReviewState`.
///
/// - Correct (quality ≥ 3): interval grows 1 → 6 → round(interval × EF); `repetitions` increments.
/// - Incorrect (quality < 3): `repetitions` resets to 0, interval to 1, a lapse is recorded.
/// - Ease factor: EF += 0.1 − (5 − q)(0.08 + (5 − q)·0.02), floored at 1.3.
enum SM2 {
    static let minEaseFactor = 1.3

    static func apply(
        to state: ReviewState,
        grade: ReviewGrade,
        on date: Date = .now,
        calendar: Calendar = .current
    ) {
        let q = grade.rawValue
        state.totalReviews += 1

        if q < 3 {
            state.repetitions = 0
            state.interval = 1
            state.lapses += 1
        } else {
            switch state.repetitions {
            case 0: state.interval = 1
            case 1: state.interval = 6
            default: state.interval = Int((Double(state.interval) * state.easeFactor).rounded())
            }
            state.repetitions += 1
        }

        let delta = 0.1 - Double(5 - q) * (0.08 + Double(5 - q) * 0.02)
        state.easeFactor = max(minEaseFactor, state.easeFactor + delta)

        state.lastReviewedAt = date
        let interval = max(1, state.interval)
        state.dueDate = calendar.date(byAdding: .day, value: interval, to: calendar.startOfDay(for: date)) ?? date
    }

    /// Non-mutating preview of the next interval — handy for tests / a "next in N days" hint.
    static func projectedInterval(
        easeFactor: Double,
        interval: Int,
        repetitions: Int,
        grade: ReviewGrade
    ) -> Int {
        guard grade.rawValue >= 3 else { return 1 }
        switch repetitions {
        case 0: return 1
        case 1: return 6
        default: return Int((Double(interval) * easeFactor).rounded())
        }
    }
}
