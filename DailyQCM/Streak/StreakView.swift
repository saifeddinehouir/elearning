import SwiftUI
import SwiftData

struct StreakView: View {
    @Query private var studyDays: [StudyDay]

    private let weeksShown = 20

    private var byDay: [Date: StudyDay] {
        Dictionary(studyDays.map { ($0.dayStart.startOfDay(), $0) }, uniquingKeysWith: { a, _ in a })
    }
    private var current: Int { StreakEngine.currentStreak(days: studyDays) }
    private var longest: Int { StreakEngine.longestStreak(days: studyDays) }
    private var totalDays: Int { StreakEngine.totalDaysStudied(days: studyDays) }
    private var maxAnswered: Int { max(1, studyDays.map(\.answered).max() ?? 1) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    HStack(spacing: 12) {
                        StatTile(value: "\(current)", label: "Current streak", systemImage: "flame.fill", tint: .orange)
                        StatTile(value: "\(longest)", label: "Longest streak", systemImage: "trophy.fill", tint: .yellow)
                        StatTile(value: "\(totalDays)", label: "Days studied", systemImage: "calendar", tint: .blue)
                    }

                    heatmapCard

                    if studyDays.isEmpty {
                        Text("Finish a session today to start your streak.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
                .padding()
            }
            .navigationTitle("Streak")
        }
    }

    private var heatmapCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Last \(weeksShown) weeks").font(.headline)
            HeatmapGrid(
                weeks: weeksShown,
                byDay: byDay,
                maxAnswered: maxAnswered
            )
            HStack(spacing: 6) {
                Text("Less").font(.caption2).foregroundStyle(.secondary)
                ForEach(0..<5) { level in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(HeatmapGrid.color(forLevel: level))
                        .frame(width: 11, height: 11)
                }
                Text("More").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    }
}

/// GitHub-style contribution grid: one column per week, Sunday at the top.
struct HeatmapGrid: View {
    let weeks: Int
    let byDay: [Date: StudyDay]
    let maxAnswered: Int

    private let cell: CGFloat = 13
    private let spacing: CGFloat = 3
    private let calendar = Calendar.current

    @State private var selected: SelectedDay?

    struct SelectedDay: Identifiable {
        let date: Date
        let answered: Int
        let correct: Int
        var id: Date { date }
        var accuracy: Double? { answered > 0 ? Double(correct) / Double(answered) : nil }
    }

    private var columns: [[Date]] {
        let today = calendar.startOfDay(for: .now)
        // Start on the Sunday of the earliest visible week.
        let weekday = calendar.component(.weekday, from: today) - 1 // 0 = Sunday
        let lastSunday = calendar.date(byAdding: .day, value: -weekday, to: today)!
        let firstSunday = calendar.date(byAdding: .day, value: -7 * (weeks - 1), to: lastSunday)!

        return (0..<weeks).map { w in
            (0..<7).map { d in
                calendar.date(byAdding: .day, value: 7 * w + d, to: firstSunday)!
            }
        }
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: spacing) {
                ForEach(Array(columns.enumerated()), id: \.offset) { _, week in
                    VStack(spacing: spacing) {
                        ForEach(week, id: \.self) { date in
                            cellView(for: date)
                        }
                    }
                }
            }
            .padding(.vertical, 4)
        }
        .popover(item: $selected) { sel in
            VStack(alignment: .leading, spacing: 4) {
                Text(sel.date.formatted(date: .abbreviated, time: .omitted)).font(.headline)
                if sel.answered > 0 {
                    Text("\(sel.answered) answered · \(sel.correct) correct")
                    if let acc = sel.accuracy { Text("\(acc.asPercent) accuracy").foregroundStyle(.secondary) }
                } else {
                    Text("No study").foregroundStyle(.secondary)
                }
            }
            .padding()
            .presentationCompactAdaptation(.popover)
        }
    }

    @ViewBuilder
    private func cellView(for date: Date) -> some View {
        let isFuture = date > calendar.startOfDay(for: .now)
        let record = byDay[date]
        RoundedRectangle(cornerRadius: 2)
            .fill(isFuture ? Color.clear : HeatmapGrid.color(forLevel: level(for: record)))
            .frame(width: cell, height: cell)
            .overlay(
                RoundedRectangle(cornerRadius: 2)
                    .stroke(Color.primary.opacity(isFuture ? 0 : 0.06), lineWidth: 1)
            )
            .onTapGesture {
                if !isFuture {
                    selected = SelectedDay(date: date,
                                           answered: record?.answered ?? 0,
                                           correct: record?.correct ?? 0)
                }
            }
    }

    private func level(for record: StudyDay?) -> Int {
        guard let record, record.answered > 0 else { return 0 }
        let fraction = Double(record.answered) / Double(maxAnswered)
        switch fraction {
        case ..<0.25: return 1
        case ..<0.5: return 2
        case ..<0.75: return 3
        default: return 4
        }
    }

    static func color(forLevel level: Int) -> Color {
        switch level {
        case 1: .green.opacity(0.30)
        case 2: .green.opacity(0.50)
        case 3: .green.opacity(0.72)
        case 4: .green
        default: .gray.opacity(0.15)
        }
    }
}
