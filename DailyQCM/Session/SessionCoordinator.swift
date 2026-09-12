import Foundation
import SwiftData
import SwiftUI

/// Drives one run through a question queue: selection, feedback, SM-2 update,
/// attempt logging, and end-of-session bookkeeping.
@Observable
final class SessionCoordinator {
    enum Phase: Equatable { case idle, active, finished }

    private(set) var phase: Phase = .idle
    private(set) var queue: [Question] = []
    private(set) var index = 0
    private(set) var correctCount = 0

    private(set) var selectedChoice: Int?
    private(set) var isRevealed = false

    var current: Question? { queue.indices.contains(index) ? queue[index] : nil }
    var total: Int { queue.count }
    var position: Int { min(index + 1, max(total, 1)) }
    var progress: Double { total == 0 ? 0 : Double(index) / Double(total) }

    // MARK: - Lifecycle

    func start(from questions: [Question], config: SessionConfig) {
        queue = SessionBuilder.plan(questions: questions, config: config)
        index = 0
        correctCount = 0
        selectedChoice = nil
        isRevealed = false
        phase = queue.isEmpty ? .idle : .active
    }

    func reset() {
        phase = .idle
        queue = []
        index = 0
        correctCount = 0
        selectedChoice = nil
        isRevealed = false
    }

    // MARK: - Answering

    func select(_ choice: Int) {
        guard !isRevealed else { return }
        selectedChoice = choice
    }

    var isCurrentCorrect: Bool {
        guard let current, let selectedChoice else { return false }
        return selectedChoice == current.correctIndex
    }

    func submit(context: ModelContext) {
        guard let question = current, let choice = selectedChoice, !isRevealed else { return }
        isRevealed = true

        let correct = choice == question.correctIndex
        if correct { correctCount += 1 }

        let state: ReviewState
        if let existing = question.reviewState {
            state = existing
        } else {
            let created = ReviewState(dueDate: .now)
            created.question = question
            question.reviewState = created
            context.insert(created)
            state = created
        }
        SM2.apply(to: state, grade: .forBinary(correct: correct))

        let attempt = Attempt(
            wasCorrect: correct,
            chosenIndex: choice,
            topic: question.topic,
            difficulty: question.difficulty,
            deckName: question.deckName
        )
        attempt.question = question
        context.insert(attempt)

        try? context.save()
    }

    func advance(context: ModelContext, dailyGoal: Int) {
        selectedChoice = nil
        isRevealed = false
        index += 1
        if index >= queue.count {
            finish(context: context, dailyGoal: dailyGoal)
        }
    }

    private func finish(context: ModelContext, dailyGoal: Int) {
        phase = .finished
        StreakEngine.recordSession(
            answered: queue.count,
            correct: correctCount,
            dailyGoal: dailyGoal,
            in: context
        )
        NotificationManager.shared.rescheduleAfterSession()
    }
}
