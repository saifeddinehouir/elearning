import Foundation
import SwiftData

/// One calendar day of study activity. Drives the streak counter and heatmap.
/// Independent of decks — deleting a deck never erases your streak history.
@Model
final class StudyDay {
    /// Start-of-day timestamp; unique so there is exactly one row per day.
    @Attribute(.unique) var dayStart: Date
    var answered: Int
    var correct: Int
    /// Whether the daily goal was reached at least once on this day.
    var completedGoal: Bool

    init(dayStart: Date, answered: Int = 0, correct: Int = 0, completedGoal: Bool = false) {
        self.dayStart = dayStart
        self.answered = answered
        self.correct = correct
        self.completedGoal = completedGoal
    }
}

extension StudyDay {
    var accuracy: Double? {
        guard answered > 0 else { return nil }
        return Double(correct) / Double(answered)
    }
}
