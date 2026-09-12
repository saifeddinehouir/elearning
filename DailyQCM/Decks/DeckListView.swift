import SwiftUI
import SwiftData

struct DeckListView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Deck.createdAt, order: .reverse) private var decks: [Deck]

    @State private var showImport = false
    @State private var pendingDelete: Deck?

    var body: some View {
        NavigationStack {
            Group {
                if decks.isEmpty {
                    EmptyStateView(
                        title: "No decks",
                        message: "Import a JSON deck generated from your course notes or LeetCode problems.",
                        systemImage: "rectangle.stack.badge.plus",
                        actionTitle: "Import a deck",
                        action: { showImport = true }
                    )
                } else {
                    List {
                        ForEach(decks) { deck in
                            NavigationLink(value: deck.id) {
                                DeckRow(deck: deck)
                            }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) { pendingDelete = deck } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Decks")
            .navigationDestination(for: UUID.self) { id in
                if let deck = decks.first(where: { $0.id == id }) {
                    DeckDetailView(deck: deck)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showImport = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showImport) {
                NavigationStack { ImportView(prefilledJSON: nil) }
            }
            .confirmationDialog(
                "Delete \(pendingDelete?.name ?? "deck")?",
                isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
                titleVisibility: .visible
            ) {
                Button("Delete deck and its history", role: .destructive) {
                    if let deck = pendingDelete { context.delete(deck); try? context.save() }
                    pendingDelete = nil
                }
                Button("Cancel", role: .cancel) { pendingDelete = nil }
            } message: {
                Text("This removes the deck's items, questions, review schedule and attempt history. Your streak is kept.")
            }
        }
    }
}

private struct DeckRow: View {
    @Bindable var deck: Deck

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(deck.name).font(.headline)
                Spacer()
                Badge(text: deck.sourceType.label, systemImage: deck.sourceType.systemImage, tint: .accentColor)
            }

            HStack(spacing: 12) {
                Label("\(deck.items.count) items", systemImage: "doc.text")
                Label("\(deck.questionCount) Qs", systemImage: "questionmark.circle")
                if deck.dueCount() > 0 {
                    Label("\(deck.dueCount()) due", systemImage: "clock.arrow.circlepath")
                        .foregroundStyle(.blue)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            ProgressView(value: deck.studiedFraction) {
                Text("\(deck.studiedFraction.asPercent) studied").font(.caption2).foregroundStyle(.secondary)
            }

            Toggle("Include in daily mix", isOn: $deck.isIncludedInDailyMix)
                .font(.caption)
                .toggleStyle(.switch)
        }
        .padding(.vertical, 4)
    }
}
