import SwiftUI
import SwiftData
import Charts

struct StatsView: View {
    @Query(sort: \Attempt.date) private var attempts: [Attempt]

    @State private var windowDays = 30

    private var overall: (answered: Int, correct: Int, rate: Double) { StatsEngine.overall(attempts) }
    private var topics: [AccuracyBucket] { StatsEngine.byTopic(attempts, ascending: true) }
    private var difficulties: [AccuracyBucket] { StatsEngine.byDifficulty(attempts) }
    private var decks: [AccuracyBucket] { StatsEngine.byDeck(attempts) }
    private var daily: [DailyPoint] { StatsEngine.daily(attempts, days: windowDays) }

    var body: some View {
        NavigationStack {
            if attempts.isEmpty {
                EmptyStateView(
                    title: "No stats yet",
                    message: "Finish a daily session and your accuracy by topic, difficulty and deck will show up here.",
                    systemImage: "chart.bar"
                )
                .navigationTitle("Stats")
            } else {
                ScrollView {
                    VStack(spacing: 20) {
                        headerTiles
                        accuracyOverTime
                        weakTopics
                        byDifficultyChart
                        byDeckChart
                    }
                    .padding()
                }
                .navigationTitle("Stats")
            }
        }
    }

    private var headerTiles: some View {
        HStack(spacing: 12) {
            StatTile(value: "\(overall.answered)", label: "Answered")
            StatTile(value: "\(overall.correct)", label: "Correct", tint: .green)
            StatTile(value: overall.rate.asPercent, label: "Accuracy", tint: .blue)
        }
    }

    private var accuracyOverTime: some View {
        card("Accuracy over time") {
            Picker("Window", selection: $windowDays) {
                Text("7d").tag(7)
                Text("30d").tag(30)
                Text("90d").tag(90)
            }
            .pickerStyle(.segmented)

            Chart(daily.filter { $0.answered > 0 }) { point in
                LineMark(x: .value("Day", point.day), y: .value("Accuracy", point.rate))
                    .interpolationMethod(.catmullRom)
                PointMark(x: .value("Day", point.day), y: .value("Accuracy", point.rate))
                    .symbolSize(40)
                    .annotation(position: .top) {
                        Text("\(point.answered)").font(.caption2).foregroundStyle(.tertiary)
                    }
            }
            .chartYScale(domain: 0...1)
            .frame(height: 180)
            .overlay {
                if daily.allSatisfy({ $0.answered == 0 }) {
                    Text("No activity in this window").font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
    }

    private var weakTopics: some View {
        card("Accuracy by topic (weakest first)") {
            Chart(topics) { bucket in
                BarMark(
                    x: .value("Accuracy", bucket.rate),
                    y: .value("Topic", bucket.label)
                )
                .foregroundStyle(color(for: bucket.rate))
                .annotation(position: .trailing) {
                    Text("\(bucket.rate.asPercent) · \(bucket.total)")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            .chartXScale(domain: 0...1)
            .frame(height: CGFloat(max(1, topics.count)) * 34 + 20)
        }
    }

    private var byDifficultyChart: some View {
        card("Accuracy by difficulty") {
            Chart(difficulties) { bucket in
                BarMark(x: .value("Difficulty", bucket.label), y: .value("Accuracy", bucket.rate))
                    .foregroundStyle(color(for: bucket.rate))
                    .annotation(position: .top) {
                        Text(bucket.rate.asPercent).font(.caption2).foregroundStyle(.secondary)
                    }
            }
            .chartYScale(domain: 0...1)
            .frame(height: 160)
        }
    }

    private var byDeckChart: some View {
        card("Accuracy by deck") {
            Chart(decks) { bucket in
                BarMark(x: .value("Accuracy", bucket.rate), y: .value("Deck", bucket.label))
                    .foregroundStyle(color(for: bucket.rate))
                    .annotation(position: .trailing) {
                        Text("\(bucket.rate.asPercent) · \(bucket.total)")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
            }
            .chartXScale(domain: 0...1)
            .frame(height: CGFloat(max(1, decks.count)) * 34 + 20)
        }
    }

    private func card<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.headline)
            content()
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private func color(for rate: Double) -> Color {
        switch rate {
        case 0.8...: .green
        case 0.6..<0.8: .yellow
        case 0.4..<0.6: .orange
        default: .red
        }
    }
}
