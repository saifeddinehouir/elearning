import Foundation

/// Codable mirror of the unified JSON schema. Kept separate from the SwiftData
/// models so import parsing never touches the persistent store.
struct DeckDTO: Codable {
    let deckName: String
    let sourceType: String
    let items: [ItemDTO]

    enum CodingKeys: String, CodingKey {
        case deckName = "deck_name"
        case sourceType = "source_type"
        case items
    }
}

struct ItemDTO: Codable {
    let id: String?
    let title: String
    let topic: String?
    let difficulty: String
    let context: String?
    let questions: [QuestionDTO]
}

struct QuestionDTO: Codable {
    let id: String?
    let type: String
    let prompt: String
    let choices: [String]
    let correctIndex: Int
    let explanation: String?

    enum CodingKeys: String, CodingKey {
        case id, type, prompt, choices, explanation
        case correctIndex = "correct_index"
    }
}
