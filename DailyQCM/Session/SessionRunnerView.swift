import SwiftUI
import SwiftData

/// Full-screen host that walks the coordinator through the queue.
struct SessionRunnerView: View {
    let pool: [Question]
    let config: SessionConfig

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @AppStorage(AppStorageKeys.dailyGoal) private var dailyGoal = AppStorageKeys.Defaults.dailyGoal

    @State private var coordinator = SessionCoordinator()

    var body: some View {
        NavigationStack {
            Group {
                switch coordinator.phase {
                case .idle:
                    EmptyStateView(
                        title: "Nothing to study",
                        message: "No due reviews and no new questions in this selection.",
                        systemImage: "checkmark.circle"
                    )
                case .active:
                    if let question = coordinator.current {
                        QuestionView(
                            question: question,
                            selectedChoice: coordinator.selectedChoice,
                            isRevealed: coordinator.isRevealed,
                            onSelect: { coordinator.select($0) },
                            onPrimaryAction: primaryAction
                        )
                        .id(question.id)
                        .safeAreaInset(edge: .top) {
                            ProgressView(value: coordinator.progress)
                                .padding(.horizontal)
                                .padding(.bottom, 4)
                        }
                    }
                case .finished:
                    SessionSummaryView(
                        answered: coordinator.total,
                        correct: coordinator.correctCount,
                        onDone: { dismiss() }
                    )
                }
            }
            .navigationTitle(coordinator.phase == .active ? "\(coordinator.position) / \(coordinator.total)" : "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(coordinator.phase == .finished ? "Done" : "End") { dismiss() }
                }
            }
        }
        .interactiveDismissDisabled(coordinator.phase == .active)
        .onAppear {
            if coordinator.phase == .idle { coordinator.start(from: pool, config: config) }
        }
    }

    private func primaryAction() {
        if coordinator.isRevealed {
            coordinator.advance(context: context, dailyGoal: dailyGoal)
        } else {
            coordinator.submit(context: context)
        }
    }
}
