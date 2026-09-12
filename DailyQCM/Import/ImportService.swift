import Foundation
import SwiftData

enum DuplicateResolution: String, CaseIterable, Identifiable {
    case importAsCopy
    case replaceExisting

    var id: String { rawValue }
    var label: String {
        switch self {
        case .importAsCopy: "Import as a copy (recommended)"
        case .replaceExisting: "Replace existing deck"
        }
    }
    var hint: String {
        switch self {
        case .importAsCopy: "Keeps both — the new one is renamed automatically."
        case .replaceExisting: "Deletes its items, questions, review schedule and history."
        }
    }
}

/// Turns a validated DTO into persisted SwiftData models.
enum ImportService {
    static func existingDeck(named name: String, in context: ModelContext) -> Deck? {
        let descriptor = FetchDescriptor<Deck>(predicate: #Predicate { $0.name == name })
        return (try? context.fetch(descriptor))?.first
    }

    @discardableResult
    static func save(
        _ dto: DeckDTO,
        resolution: DuplicateResolution,
        in context: ModelContext
    ) throws -> Deck {
        let name: String
        if let clash = existingDeck(named: dto.deckName, in: context) {
            switch resolution {
            case .replaceExisting:
                context.delete(clash)          // cascades to items / questions / review state / attempts
                name = dto.deckName
            case .importAsCopy:
                name = uniqueName(base: dto.deckName, in: context)
            }
        } else {
            name = dto.deckName
        }

        let deck = Deck(name: name, sourceType: SourceType(rawValue: dto.sourceType) ?? .course)
        context.insert(deck)

        for itemDTO in dto.items {
            let item = Item(
                id: parsedUUID(itemDTO.id),
                title: itemDTO.title,
                topic: (itemDTO.topic ?? "").trimmingCharacters(in: .whitespaces),
                difficulty: Difficulty(rawValue: itemDTO.difficulty) ?? .medium,
                context: itemDTO.context ?? ""
            )
            item.deck = deck
            context.insert(item)

            for qDTO in itemDTO.questions {
                let question = Question(
                    id: parsedUUID(qDTO.id),
                    kind: QuestionKind(rawValue: qDTO.type) ?? .mcq,
                    prompt: qDTO.prompt,
                    choices: qDTO.choices,
                    correctIndex: qDTO.correctIndex,
                    explanation: qDTO.explanation ?? ""
                )
                question.item = item
                context.insert(question)
            }
        }

        try context.save()
        return deck
    }

    private static func parsedUUID(_ string: String?) -> UUID {
        guard let string, let uuid = UUID(uuidString: string) else { return UUID() }
        return uuid
    }

    private static func uniqueName(base: String, in context: ModelContext) -> String {
        var candidate = "\(base) (copy)"
        var n = 2
        while existingDeck(named: candidate, in: context) != nil {
            candidate = "\(base) (copy \(n))"
            n += 1
        }
        return candidate
    }
}
