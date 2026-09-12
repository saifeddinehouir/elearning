import Foundation
import SwiftData

/// A single multiple-choice question. SM-2 state lives one-to-one on `reviewState`.
@Model
final class Question {
    var id: UUID
    private var kindRaw: String
    var prompt: String
    var choices: [String]
    var correctIndex: Int
    var explanation: String
    var item: Item?

    @Relationship(deleteRule: .cascade, inverse: \ReviewState.question)
    var reviewState: ReviewState?

    @Relationship(deleteRule: .cascade, inverse: \Attempt.question)
    var attempts: [Attempt]

    var kind: QuestionKind {
        get { QuestionKind(rawValue: kindRaw) ?? .mcq }
        set { kindRaw = newValue.rawValue }
    }

    init(
        id: UUID = UUID(),
        kind: QuestionKind,
        prompt: String,
        choices: [String],
        correctIndex: Int,
        explanation: String
    ) {
        self.id = id
        self.kindRaw = kind.rawValue
        self.prompt = prompt
        self.choices = choices
        self.correctIndex = correctIndex
        self.explanation = explanation
        self.attempts = []
    }
}

extension Question {
    var topic: String { item?.topic ?? "General" }
    var difficulty: Difficulty { item?.difficulty ?? .medium }
    var deckName: String { item?.deck?.name ?? "Unknown" }

    var isNew: Bool { (reviewState?.totalReviews ?? 0) == 0 }

    var correctChoice: String { choices.indices.contains(correctIndex) ? choices[correctIndex] : "" }

    var accuracy: Double? {
        guard !attempts.isEmpty else { return nil }
        return Double(attempts.filter(\.wasCorrect).count) / Double(attempts.count)
    }
}
