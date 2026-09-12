import Foundation

/// Where a deck's material came from. Stored as a raw string on `Deck`.
enum SourceType: String, Codable, CaseIterable, Identifiable {
    case course
    case leetcode

    var id: String { rawValue }

    var label: String {
        switch self {
        case .course: "Course"
        case .leetcode: "LeetCode"
        }
    }

    var systemImage: String {
        switch self {
        case .course: "book.closed.fill"
        case .leetcode: "chevron.left.forwardslash.chevron.right"
        }
    }
}

/// Item difficulty. `Comparable` so stats can sort easy → hard.
enum Difficulty: String, Codable, CaseIterable, Identifiable, Comparable {
    case easy
    case medium
    case hard

    var id: String { rawValue }

    var label: String { rawValue.capitalized }

    private var order: Int {
        switch self {
        case .easy: 0
        case .medium: 1
        case .hard: 2
        }
    }

    static func < (lhs: Difficulty, rhs: Difficulty) -> Bool { lhs.order < rhs.order }
}

/// Question flavor. All types render identically (prompt + 4 choices); the label is
/// shown as a small badge so the learner knows what kind of recall is being tested.
enum QuestionKind: String, Codable, CaseIterable, Identifiable {
    case mcq
    case approach
    case complexity
    case trace
    case fillBlank = "fill_blank"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .mcq: "Recall"
        case .approach: "Approach"
        case .complexity: "Complexity"
        case .trace: "Trace"
        case .fillBlank: "Fill blank"
        }
    }
}
