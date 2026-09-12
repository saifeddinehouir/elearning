import Foundation
import SwiftData

/// Per-question SM-2 scheduling state. Created lazily the first time a question is answered.
@Model
final class ReviewState {
    /// SM-2 ease factor. Starts at 2.5, floored at 1.3.
    var easeFactor: Double
    /// Current inter-repetition interval in days.
    var interval: Int
    /// Number of consecutive successful reviews (SM-2 `n`).
    var repetitions: Int
    /// Start-of-day date this question is next due.
    var dueDate: Date
    var lastReviewedAt: Date?
    /// Total reviews ever (used to distinguish "new" from "seen").
    var totalReviews: Int
    /// Times the learner lapsed (answered incorrectly after learning it).
    var lapses: Int

    var question: Question?

    init(dueDate: Date = .now) {
        self.easeFactor = 2.5
        self.interval = 0
        self.repetitions = 0
        self.dueDate = dueDate
        self.lastReviewedAt = nil
        self.totalReviews = 0
        self.lapses = 0
    }
}

extension ReviewState {
    enum Stage: String {
        case new, learning, review, lapsed
    }

    var stage: Stage {
        if totalReviews == 0 { return .new }
        if lapses > 0 && repetitions == 0 { return .lapsed }
        if repetitions < 2 { return .learning }
        return .review
    }
}
