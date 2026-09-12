import Foundation

struct ImportIssue: Identifiable {
    enum Severity { case error, warning }
    let id = UUID()
    let severity: Severity
    let path: String
    let message: String
}

/// Result of parsing + validating a pasted / opened JSON string.
struct ValidatedImport {
    let dto: DeckDTO
    let issues: [ImportIssue]

    var errors: [ImportIssue] { issues.filter { $0.severity == .error } }
    var warnings: [ImportIssue] { issues.filter { $0.severity == .warning } }
    var isImportable: Bool { errors.isEmpty }

    var itemCount: Int { dto.items.count }
    var questionCount: Int { dto.items.reduce(0) { $0 + $1.questions.count } }
    var topics: [String] { Array(Set(dto.items.map { ($0.topic ?? "General") })).sorted() }
}

enum ImportError: LocalizedError {
    case empty
    case notJSON(String)
    case schemaMismatch(String)

    var errorDescription: String? {
        switch self {
        case .empty:
            return "Nothing to import — paste JSON or choose a file first."
        case .notJSON(let detail):
            return "That doesn't look like valid JSON.\n\(detail)"
        case .schemaMismatch(let detail):
            return "The JSON is valid but doesn't match the deck schema.\n\(detail)"
        }
    }
}

enum ImportValidator {
    static let minChoices = 2
    static let maxChoices = 6

    static func parse(_ raw: String) -> Result<DeckDTO, ImportError> {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .failure(.empty) }
        guard let data = trimmed.data(using: .utf8) else { return .failure(.notJSON("Could not read text as UTF-8.")) }

        do {
            let dto = try JSONDecoder().decode(DeckDTO.self, from: data)
            return .success(dto)
        } catch DecodingError.keyNotFound(let key, let ctx) {
            return .failure(.schemaMismatch("Missing key \"\(key.stringValue)\" at \(pathString(ctx.codingPath))."))
        } catch DecodingError.typeMismatch(_, let ctx) {
            return .failure(.schemaMismatch("Wrong type at \(pathString(ctx.codingPath)): \(ctx.debugDescription)"))
        } catch DecodingError.valueNotFound(_, let ctx) {
            return .failure(.schemaMismatch("Null value at \(pathString(ctx.codingPath)): \(ctx.debugDescription)"))
        } catch DecodingError.dataCorrupted(let ctx) {
            return .failure(.notJSON(ctx.debugDescription))
        } catch {
            return .failure(.notJSON(error.localizedDescription))
        }
    }

    static func validate(_ dto: DeckDTO) -> ValidatedImport {
        var issues: [ImportIssue] = []

        if dto.deckName.trimmingCharacters(in: .whitespaces).isEmpty {
            issues.append(.init(severity: .error, path: "deck_name", message: "Deck name is empty."))
        }
        if SourceType(rawValue: dto.sourceType) == nil {
            issues.append(.init(severity: .error, path: "source_type",
                                message: "\"\(dto.sourceType)\" is not one of: course, leetcode."))
        }
        if dto.items.isEmpty {
            issues.append(.init(severity: .error, path: "items", message: "Deck has no items."))
        }

        for (i, item) in dto.items.enumerated() {
            let base = "items[\(i)]"
            if item.title.trimmingCharacters(in: .whitespaces).isEmpty {
                issues.append(.init(severity: .error, path: "\(base).title", message: "Item title is empty."))
            }
            if Difficulty(rawValue: item.difficulty) == nil {
                issues.append(.init(severity: .error, path: "\(base).difficulty",
                                    message: "\"\(item.difficulty)\" is not easy / medium / hard."))
            }
            if (item.topic ?? "").trimmingCharacters(in: .whitespaces).isEmpty {
                issues.append(.init(severity: .warning, path: "\(base).topic",
                                    message: "No topic — will be grouped under \"General\"."))
            }
            if (item.context ?? "").trimmingCharacters(in: .whitespaces).isEmpty {
                issues.append(.init(severity: .warning, path: "\(base).context", message: "No context provided."))
            }
            if item.id != nil && UUID(uuidString: item.id!) == nil {
                issues.append(.init(severity: .warning, path: "\(base).id",
                                    message: "\"\(item.id!)\" is not a UUID — a new id will be generated."))
            }
            if item.questions.isEmpty {
                issues.append(.init(severity: .error, path: "\(base).questions", message: "Item has no questions."))
            }

            for (j, q) in item.questions.enumerated() {
                let qbase = "\(base).questions[\(j)]"
                if QuestionKind(rawValue: q.type) == nil {
                    issues.append(.init(severity: .error, path: "\(qbase).type",
                                        message: "\"\(q.type)\" is not a known question type."))
                }
                if q.prompt.trimmingCharacters(in: .whitespaces).isEmpty {
                    issues.append(.init(severity: .error, path: "\(qbase).prompt", message: "Prompt is empty."))
                }
                if q.choices.count < minChoices || q.choices.count > maxChoices {
                    issues.append(.init(severity: .error, path: "\(qbase).choices",
                                        message: "Expected \(minChoices)–\(maxChoices) choices, got \(q.choices.count)."))
                }
                if q.choices.contains(where: { $0.trimmingCharacters(in: .whitespaces).isEmpty }) {
                    issues.append(.init(severity: .error, path: "\(qbase).choices", message: "A choice is blank."))
                }
                if q.correctIndex < 0 || q.correctIndex >= q.choices.count {
                    issues.append(.init(severity: .error, path: "\(qbase).correct_index",
                                        message: "correct_index \(q.correctIndex) is outside 0…\(max(0, q.choices.count - 1))."))
                }
                if (q.explanation ?? "").trimmingCharacters(in: .whitespaces).isEmpty {
                    issues.append(.init(severity: .warning, path: "\(qbase).explanation", message: "No explanation."))
                }
            }
        }

        return ValidatedImport(dto: dto, issues: issues)
    }

    private static func pathString(_ path: [any CodingKey]) -> String {
        path.map { key in
            if let idx = key.intValue { return "[\(idx)]" }
            return ".\(key.stringValue)"
        }.joined().trimmingCharacters(in: CharacterSet(charactersIn: "."))
    }
}
