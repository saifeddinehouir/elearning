import SwiftUI

/// Small pill label used for source type, difficulty, question kind.
struct Badge: View {
    let text: String
    var systemImage: String? = nil
    var tint: Color = .gray

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage { Image(systemName: systemImage) }
            Text(text)
        }
        .font(.caption2.weight(.semibold))
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(tint.opacity(0.15), in: Capsule())
        .foregroundStyle(tint)
    }
}

extension Difficulty {
    var tint: Color {
        switch self {
        case .easy: .green
        case .medium: .orange
        case .hard: .red
        }
    }
}

/// A labelled number tile for the stats and streak headers.
struct StatTile: View {
    let value: String
    let label: String
    var systemImage: String? = nil
    var tint: Color = .accentColor

    var body: some View {
        VStack(spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage).font(.title3).foregroundStyle(tint)
            }
            Text(value).font(.title2.weight(.bold)).contentTransition(.numericText())
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

/// Full-screen empty state with an optional call to action.
struct EmptyStateView: View {
    let title: String
    let message: String
    var systemImage: String = "tray"
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            Text(message)
        } actions: {
            if let actionTitle, let action {
                Button(actionTitle, action: action).buttonStyle(.borderedProminent)
            }
        }
    }
}

extension Double {
    /// `0.0...1.0` → `"73%"`.
    var asPercent: String { "\(Int((self * 100).rounded()))%" }
}
