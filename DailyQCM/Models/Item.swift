import Foundation
import SwiftData

/// One study unit: a course excerpt or a LeetCode problem, plus its questions.
@Model
final class Item {
    var id: UUID
    var title: String
    var topic: String
    private var difficultyRaw: String
    /// The course excerpt OR the LeetCode problem statement.
    var context: String
    var deck: Deck?

    @Relationship(deleteRule: .cascade, inverse: \Question.item)
    var questions: [Question]

    var difficulty: Difficulty {
        get { Difficulty(rawValue: difficultyRaw) ?? .medium }
        set { difficultyRaw = newValue.rawValue }
    }

    init(
        id: UUID = UUID(),
        title: String,
        topic: String,
        difficulty: Difficulty,
        context: String
    ) {
        self.id = id
        self.title = title
        self.topic = topic.isEmpty ? "General" : topic
        self.difficultyRaw = difficulty.rawValue
        self.context = context
        self.questions = []
    }
}
