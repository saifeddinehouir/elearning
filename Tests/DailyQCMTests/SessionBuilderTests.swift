import XCTest
import SwiftData
@testable import DailyQCM

@MainActor
final class SessionBuilderTests: XCTestCase {

    private var container: ModelContainer!
    private var context: ModelContext { container.mainContext }

    override func setUpWithError() throws {
        container = try ModelContainer(
            for: Deck.self, Item.self, Question.self, ReviewState.self, Attempt.self, StudyDay.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
    }

    override func tearDownWithError() throws {
        container = nil
    }

    @discardableResult
    private func makeQuestion(topic: String, deck: Deck) -> Question {
        let item = Item(title: "T-\(topic)", topic: topic, difficulty: .medium, context: "ctx")
        item.deck = deck
        context.insert(item)
        let q = Question(kind: .mcq, prompt: "p", choices: ["a", "b", "c", "d"], correctIndex: 0, explanation: "e")
        q.item = item
        context.insert(q)
        return q
    }

    private func makeDeck() -> Deck {
        let d = Deck(name: "D", sourceType: .course)
        context.insert(d)
        return d
    }

    func testEmptyPoolProducesEmptyQueue() {
        XCTAssertTrue(SessionBuilder.plan(questions: []).isEmpty)
    }

    func testQueueIsCappedAtConfiguredSize() {
        let deck = makeDeck()
        let questions = (0..<40).map { _ in makeQuestion(topic: "Arrays", deck: deck) }
        let queue = SessionBuilder.plan(questions: questions, config: SessionConfig(size: 15, newLimitRatio: 1.0))
        XCTAssertEqual(queue.count, 15)
    }

    func testDueReviewsArePreferredOverNew() {
        let deck = makeDeck()
        let due = (0..<5).map { _ -> Question in
            let q = makeQuestion(topic: "DP", deck: deck)
            let rs = ReviewState(dueDate: Date().adding(days: -1))
            rs.totalReviews = 3
            rs.repetitions = 3
            rs.question = q
            q.reviewState = rs
            context.insert(rs)
            return q
        }
        let new = (0..<20).map { _ in makeQuestion(topic: "DP", deck: deck) }

        let (_, breakdown) = SessionBuilder.composition(
            questions: due + new,
            config: SessionConfig(size: 10, newLimitRatio: 0.6)
        )
        XCTAssertEqual(breakdown.due, 5)
        XCTAssertLessThanOrEqual(breakdown.new, 6) // 60% of 10
        XCTAssertEqual(breakdown.total, 10)
    }

    func testShortReviewPoolStillFillsSessionFromNew() {
        let deck = makeDeck()
        // Only 2 due reviews but plenty of new: the session should still reach its size,
        // topping up past the "new ratio" soft cap rather than serving a short queue.
        let due = (0..<2).map { _ -> Question in
            let q = makeQuestion(topic: "Graphs", deck: deck)
            let rs = ReviewState(dueDate: Date().adding(days: -2))
            rs.totalReviews = 1; rs.question = q; q.reviewState = rs
            context.insert(rs)
            return q
        }
        let new = (0..<30).map { _ in makeQuestion(topic: "Graphs", deck: deck) }
        let (_, breakdown) = SessionBuilder.composition(
            questions: due + new,
            config: SessionConfig(size: 10, newLimitRatio: 0.5)
        )
        XCTAssertEqual(breakdown.due, 2)
        XCTAssertEqual(breakdown.new, 8)
        XCTAssertEqual(breakdown.total, 10)
    }

    func testNewRatioCapsNewWhenEnoughDueExist() {
        let deck = makeDeck()
        // 8 due, plenty new; size 10, ratio 0.4 → 8 due + 2 new (capped), no top-up needed.
        let due = (0..<8).map { _ -> Question in
            let q = makeQuestion(topic: "Graphs", deck: deck)
            let rs = ReviewState(dueDate: Date().adding(days: -2))
            rs.totalReviews = 2; rs.repetitions = 2; rs.question = q; q.reviewState = rs
            context.insert(rs)
            return q
        }
        let new = (0..<30).map { _ in makeQuestion(topic: "Graphs", deck: deck) }
        let (_, breakdown) = SessionBuilder.composition(
            questions: due + new,
            config: SessionConfig(size: 10, newLimitRatio: 0.4)
        )
        XCTAssertEqual(breakdown.due, 8)
        XCTAssertEqual(breakdown.new, 2)
    }

    func testWeakTopicsGetHigherWeight() {
        let deck = makeDeck()
        let weak = makeQuestion(topic: "Weak", deck: deck)
        let strong = makeQuestion(topic: "Strong", deck: deck)

        for _ in 0..<10 {
            let a = Attempt(wasCorrect: false, chosenIndex: 1, topic: "Weak", difficulty: .medium, deckName: "D")
            a.question = weak; context.insert(a)
        }
        for _ in 0..<10 {
            let a = Attempt(wasCorrect: true, chosenIndex: 0, topic: "Strong", difficulty: .medium, deckName: "D")
            a.question = strong; context.insert(a)
        }

        let rates = SessionBuilder.topicSuccessRates(questions: [weak, strong])
        XCTAssertEqual(rates["Weak"] ?? -1, 0.0, accuracy: 0.001)
        XCTAssertEqual(rates["Strong"] ?? -1, 1.0, accuracy: 0.001)
    }

    func testStreakCountsConsecutiveDays() {
        let cal = Calendar.current
        let today = Date().startOfDay()
        let days = [0, 1, 2, 4].map { offset in
            StudyDay(dayStart: today.adding(days: -offset), answered: 5, correct: 4)
        }
        XCTAssertEqual(StreakEngine.currentStreak(days: days, now: Date(), calendar: cal), 3)
        XCTAssertEqual(StreakEngine.longestStreak(days: days, calendar: cal), 3)
    }

    func testStreakAllowsTodayNotYetStudied() {
        let today = Date().startOfDay()
        let days = [1, 2, 3].map { StudyDay(dayStart: today.adding(days: -$0), answered: 3, correct: 3) }
        XCTAssertEqual(StreakEngine.currentStreak(days: days), 3)
    }
}
