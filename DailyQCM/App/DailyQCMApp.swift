import SwiftUI
import SwiftData

@main
struct DailyQCMApp: App {
    let container: ModelContainer

    init() {
        do {
            container = try ModelContainer(
                for: Deck.self, Item.self, Question.self,
                ReviewState.self, Attempt.self, StudyDay.self
            )
        } catch {
            fatalError("Failed to create ModelContainer: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(container)
    }
}
