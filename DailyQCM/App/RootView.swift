import SwiftUI
import SwiftData

struct RootView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.scenePhase) private var scenePhase
    @Query private var studyDays: [StudyDay]

    @AppStorage(AppStorageKeys.reminderEnabled) private var reminderEnabled = AppStorageKeys.Defaults.reminderEnabled
    @AppStorage(AppStorageKeys.reminderHour) private var reminderHour = AppStorageKeys.Defaults.reminderHour
    @AppStorage(AppStorageKeys.reminderMinute) private var reminderMinute = AppStorageKeys.Defaults.reminderMinute
    @AppStorage(AppStorageKeys.didRequestNotifications) private var didRequestNotifications = false

    @State private var incomingJSON: String?
    @State private var showImport = false

    var body: some View {
        TabView {
            DailyHomeView()
                .tabItem { Label("Today", systemImage: "bolt.fill") }
            StatsView()
                .tabItem { Label("Stats", systemImage: "chart.bar.fill") }
            StreakView()
                .tabItem { Label("Streak", systemImage: "flame.fill") }
            DeckListView()
                .tabItem { Label("Decks", systemImage: "rectangle.stack.fill") }
        }
        .onOpenURL(perform: handleIncomingFile)
        .sheet(isPresented: $showImport) {
            NavigationStack {
                ImportView(prefilledJSON: incomingJSON)
            }
        }
        .task {
            if reminderEnabled && !didRequestNotifications {
                _ = await NotificationManager.shared.requestAuthorization()
                didRequestNotifications = true
            }
            refreshReminder()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { refreshReminder() }
        }
    }

    private func handleIncomingFile(_ url: URL) {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return }
        incomingJSON = text
        showImport = true
    }

    private func studiedToday() -> Bool {
        let today = Date().startOfDay()
        return studyDays.contains { $0.dayStart.startOfDay() == today && $0.answered > 0 }
    }

    private func refreshReminder() {
        NotificationManager.shared.scheduleNext(
            enabled: reminderEnabled,
            hour: reminderHour,
            minute: reminderMinute,
            skipToday: studiedToday()
        )
    }
}
