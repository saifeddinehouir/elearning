import SwiftUI

/// Renders a single question: context, prompt, four tappable choices, then feedback.
struct QuestionView: View {
    let question: Question
    let selectedChoice: Int?
    let isRevealed: Bool
    let onSelect: (Int) -> Void
    let onPrimaryAction: () -> Void

    @State private var contextExpanded = false

    private var isCorrect: Bool { selectedChoice == question.correctIndex }
    private var itemContext: String { question.item?.context ?? "" }
    private var itemTitle: String { question.item?.title ?? "Context" }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header

                    if !itemContext.isEmpty {
                        contextSection
                    }

                    Text(question.prompt)
                        .font(.title3.weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)

                    VStack(spacing: 10) {
                        ForEach(Array(question.choices.enumerated()), id: \.offset) { idx, choice in
                            ChoiceRow(
                                text: choice,
                                state: rowState(for: idx),
                                onTap: { if !isRevealed { onSelect(idx) } }
                            )
                        }
                    }

                    if isRevealed {
                        feedback
                    }
                }
                .padding()
            }

            primaryButton
        }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Badge(text: question.kind.label, systemImage: "questionmark.circle")
            Badge(text: question.difficulty.label, tint: question.difficulty.tint)
            Badge(text: question.topic, tint: .accentColor)
            Spacer()
        }
    }

    private var contextSection: some View {
        DisclosureGroup(isExpanded: $contextExpanded) {
            Text(itemContext)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)
        } label: {
            Label(itemTitle, systemImage: "doc.text")
                .font(.subheadline.weight(.medium))
        }
        .padding(12)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private var feedback: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(isCorrect ? "Correct" : "Incorrect",
                  systemImage: isCorrect ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.headline)
                .foregroundStyle(isCorrect ? .green : .red)

            if !isCorrect {
                Text("Answer: \(question.correctChoice)")
                    .font(.subheadline.weight(.semibold))
            }

            if !question.explanation.isEmpty {
                Text(question.explanation)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background((isCorrect ? Color.green : Color.red).opacity(0.1),
                    in: RoundedRectangle(cornerRadius: 12))
    }

    private var primaryButton: some View {
        Button(action: onPrimaryAction) {
            Text(isRevealed ? "Next" : "Check answer")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(!isRevealed && selectedChoice == nil)
        .padding()
        .background(.bar)
    }

    private func rowState(for index: Int) -> ChoiceRow.State {
        guard isRevealed else {
            return selectedChoice == index ? .selected : .idle
        }
        if index == question.correctIndex { return .correct }
        if index == selectedChoice { return .wrong }
        return .idle
    }
}

struct ChoiceRow: View {
    enum State { case idle, selected, correct, wrong }

    let text: String
    let state: State
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .foregroundStyle(tint)
                Text(text)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding()
            .background(tint.opacity(background), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(tint.opacity(border), lineWidth: 1.5))
        }
        .buttonStyle(.plain)
    }

    private var symbol: String {
        switch state {
        case .idle: "circle"
        case .selected: "largecircle.fill.circle"
        case .correct: "checkmark.circle.fill"
        case .wrong: "xmark.circle.fill"
        }
    }

    private var tint: Color {
        switch state {
        case .idle: .gray
        case .selected: .accentColor
        case .correct: .green
        case .wrong: .red
        }
    }

    private var background: Double { state == .idle ? 0.06 : 0.14 }
    private var border: Double { state == .idle ? 0.25 : 0.9 }
}
