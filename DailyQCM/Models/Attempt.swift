import Foundation
import SwiftData

/// One answered question, kept for stats and weak-topic weighting.
/// Topic / difficulty / deck are denormalized so charts don't have to walk
/// relationships for every attempt (and so history survives light edits).
@Model
final class Attempt {
    var id: UUID
    var date: Date
    var wasCorrect: Bool
    var chosenIndex: Int
    var topic: String
    private var difficultyRaw: String
    var deckName: String

    var question: Question?

    var difficulty: Difficulty {
        get { Difficulty(rawValue: difficultyRaw) ?? .medium }
        set { difficultyRaw = newValue.rawValue }
    }

    init(
        id: UUID = UUID(),
        date: Date = .now,
        wasCorrect: Bool,
        chosenIndex: Int,
        topic: String,
        difficulty: Difficulty,
        deckName: String
    ) {
        self.id = id
        self.date = date
        self.wasCorrect = wasCorrect
        self.chosenIndex = chosenIndex
        self.topic = topic
        self.difficultyRaw = difficulty.rawValue
        self.deckName = deckName
    }
}
