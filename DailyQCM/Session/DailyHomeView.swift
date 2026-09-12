import SwiftUI
import SwiftData

/// The "Today" tab: shows the planned session and starts the runner.
struct DailyHomeView: View {
    @Query private var decks: [Deck]
    @Query private var studyDays: [StudyDay]

    @AppStorage(AppStorageKeys.dailyGoal) private var dailyGoal = AppStorageKeys.Defaults.dailyGoal
    @AppStorage(AppStorageKeys.newLimitRatio) private var newLimitRatio = AppStorageKeys.Defaults.newLimitRatio

    @State private var showRunner = false
    @State private var showSettings = false
    @State private var showImport = false

    private var config: SessionConfig {
        SessionConfig(size: dailyGoal, newLimitRatio: newLimitRatio)
    }

    private var pool: [Question] {
        decks.filter(\.isIncludedInDailyMix).flatMap(\.allQuestions)
    }

    private var breakdown: SessionComposition {
        SessionBuilder.composition(questions: pool, config: config).breakdown
    }

    private var todayRecord: StudyDay? {
        let today = Date().startOfDay()
        return studyDays.first { $0.dayStart.startOfDay() == today }
    }

    private var currentStreak: Int {
        StreakEngine.currentStreak(days: studyDays)
    }

    var body: some View {
        NavigationStack {
            Group {
                if decks.isEmpty {
                    EmptyStateView(
                        title: "No decks yet",
                        message: "Generate questions with ChatGPT or Claude using the fixed JSON schema, then import them here.",
                        systemImage: "square.and.arrow.down",
                        actionTitle: "Import a deck",
                        action: { showImport = true }
                    )
                } else if pool.isEmpty {
                    EmptyStateView(
                        title: "No decks in your daily mix",
                        message: "Turn on \"Include in daily mix\" for at least one deck, or study a deck on its own from the Decks tab.",
                        systemImage: "rectangle.stack.badge.minus"
                    )
                } else {
                    content
                }
            }
            .navigationTitle("Today")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSettings = true } label: { Image(systemName: "gearshape") }
                }
            }
            .sheet(isPresented: $showSettings) { NavigationStack { SettingsView() } }
            .sheet(isPresented: $showImport) { NavigationStack { ImportView(prefilledJSON: nil) } }
            .fullScreenCover(isPresented: $showRunner) {
                SessionRunnerView(pool: pool, config: config)
            }
        }
    }

    private var content: some View {
        ScrollView {
            VStack(spacing: 16) {
                HStack(spacing: 12) {
                    StatTile(value: "\(currentStreak)", label: "Day streak", systemImage: "flame.fill", tint: .orange)
                    StatTile(value: "\(todayRecord?.answered ?? 0)/\(dailyGoal)", label: "Answered today", systemImage: "checkmark.circle.fill", tint: .green)
                }

                VStack(alignment: .leading, spacing: 14) {
                    Text("Today's session").font(.headline)

                    compositionRow(count: breakdown.due, label: "Due reviews", color: .blue, icon: "clock.arrow.circlepath")
                    compositionRow(count: breakdown.new, label: "New questions", color: .purple, icon: "sparkles")
                    if breakdown.ahead > 0 {
                        compositionRow(count: breakdown.ahead, label: "Reviewed ahead", color: .teal, icon: "forward.fill")
                    }

                    Divider()

                    HStack {
                        Text("\(breakdown.total) question\(breakdown.total == 1 ? "" : "s")")
                            .font(.subheadline.weight(.semibold))
                        Spacer()
                        if let todayRecord, todayRecord.answered > 0 {
                            Label("Studied today", systemImage: "checkmark.seal.fill")
                                .font(.caption).foregroundStyle(.green)
                        }
                    }

                    Button {
                        showRunner = true
                    } label: {
                        Label((todayRecord?.answered ?? 0) > 0 ? "Study more" : "Start daily session",
                              systemImage: "play.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(breakdown.total == 0)

                    if breakdown.total == 0 {
                        Text("Nothing due and no new questions — you're all caught up. 🎉")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
                .padding()
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
            }
            .padding()
        }
    }

    private func compositionRow(count: Int, label: String, color: Color, icon: String) -> some View {
        HStack {
            Image(systemName: icon).foregroundStyle(color).frame(width: 24)
            Text(label)
            Spacer()
            Text("\(count)").font(.body.weight(.semibold).monospacedDigit())
        }
        .foregroundStyle(count == 0 ? .secondary : .primary)
    }
}
