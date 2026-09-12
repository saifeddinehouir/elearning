import SwiftUI
import SwiftData

struct DeckDetailView: View {
    @Bindable var deck: Deck

    @AppStorage(AppStorageKeys.dailyGoal) private var dailyGoal = AppStorageKeys.Defaults.dailyGoal
    @AppStorage(AppStorageKeys.newLimitRatio) private var newLimitRatio = AppStorageKeys.Defaults.newLimitRatio

    @State private var studyThisDeck = false

    private var sortedItems: [Item] {
        deck.items.sorted { ($0.topic, $0.difficulty) < ($1.topic, $1.difficulty) }
    }

    var body: some View {
        List {
            Section {
                Toggle("Include in daily mix", isOn: $deck.isIncludedInDailyMix)
                Button {
                    studyThisDeck = true
                } label: {
                    Label("Study this deck only", systemImage: "play.fill")
                }
                .disabled(deck.questionCount == 0)
            }

            Section("Overview") {
                LabeledContent("Source", value: deck.sourceType.label)
                LabeledContent("Items", value: "\(deck.items.count)")
                LabeledContent("Questions", value: "\(deck.questionCount)")
                LabeledContent("Due today", value: "\(deck.dueCount())")
                LabeledContent("Studied", value: deck.studiedFraction.asPercent)
            }

            Section("Items") {
                ForEach(sortedItems) { item in
                    ItemDisclosure(item: item)
                }
            }
        }
        .navigationTitle(deck.name)
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(isPresented: $studyThisDeck) {
            SessionRunnerView(
                pool: deck.allQuestions,
                config: SessionConfig(size: dailyGoal, newLimitRatio: newLimitRatio)
            )
        }
    }
}

private struct ItemDisclosure: View {
    let item: Item

    var body: some View {
        DisclosureGroup {
            if !item.context.isEmpty {
                Text(item.context)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 4)
            }
            ForEach(item.questions) { q in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Badge(text: q.kind.label, tint: .accentColor)
                        Badge(text: stageLabel(q), tint: stageTint(q))
                        if let acc = q.accuracy {
                            Text(acc.asPercent).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    Text(q.prompt).font(.subheadline)
                }
                .padding(.vertical, 2)
            }
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title).font(.subheadline.weight(.medium))
                    Text(item.topic).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Badge(text: item.difficulty.label, tint: item.difficulty.tint)
            }
        }
    }

    private func stageLabel(_ q: Question) -> String {
        guard let rs = q.reviewState else { return "new" }
        return rs.stage.rawValue
    }

    private func stageTint(_ q: Question) -> Color {
        switch q.reviewState?.stage {
        case .review: .green
        case .learning: .orange
        case .lapsed: .red
        default: .gray
        }
    }
}
