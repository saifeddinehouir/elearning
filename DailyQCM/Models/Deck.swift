import Foundation
import SwiftData

/// A collection of study items imported from one JSON file.
@Model
final class Deck {
    /// Matches `deck_name` uniqueness is on the app-generated id, not the name,
    /// so two decks may share a display name (see "Import as copy").
    @Attribute(.unique) var id: UUID
    var name: String
    private var sourceTypeRaw: String
    var createdAt: Date
    /// Whether this deck feeds the combined daily queue. A deck can still be
    /// studied in isolation from its detail screen even when this is off.
    var isIncludedInDailyMix: Bool

    @Relationship(deleteRule: .cascade, inverse: \Item.deck)
    var items: [Item]

    var sourceType: SourceType {
        get { SourceType(rawValue: sourceTypeRaw) ?? .course }
        set { sourceTypeRaw = newValue.rawValue }
    }

    init(
        id: UUID = UUID(),
        name: String,
        sourceType: SourceType,
        createdAt: Date = .now,
        isIncludedInDailyMix: Bool = true
    ) {
        self.id = id
        self.name = name
        self.sourceTypeRaw = sourceType.rawValue
        self.createdAt = createdAt
        self.isIncludedInDailyMix = isIncludedInDailyMix
        self.items = []
    }
}

extension Deck {
    var allQuestions: [Question] { items.flatMap(\.questions) }

    var questionCount: Int { items.reduce(0) { $0 + $1.questions.count } }

    /// Questions with recorded attempts, over all questions.
    var studiedFraction: Double {
        let qs = allQuestions
        guard !qs.isEmpty else { return 0 }
        let studied = qs.filter { ($0.reviewState?.totalReviews ?? 0) > 0 }.count
        return Double(studied) / Double(qs.count)
    }

    func dueCount(on date: Date = .now, calendar: Calendar = .current) -> Int {
        let end = calendar.startOfDay(for: date).addingTimeInterval(86_400)
        return allQuestions.filter { q in
            guard let rs = q.reviewState, rs.totalReviews > 0 else { return false }
            return rs.dueDate < end
        }.count
    }
}
