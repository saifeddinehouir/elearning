import SwiftUI

struct SessionSummaryView: View {
    let answered: Int
    let correct: Int
    let onDone: () -> Void

    private var accuracy: Double { answered == 0 ? 0 : Double(correct) / Double(answered) }

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: accuracy >= 0.8 ? "star.circle.fill" : "checkmark.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(accuracy >= 0.8 ? .yellow : .green)

            Text("Session complete")
                .font(.title.weight(.bold))

            HStack(spacing: 12) {
                StatTile(value: "\(answered)", label: "Answered")
                StatTile(value: "\(correct)", label: "Correct", tint: .green)
                StatTile(value: accuracy.asPercent, label: "Accuracy", tint: .blue)
            }
            .padding(.horizontal)

            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Spacer()

            Button("Done", action: onDone)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .padding()
        }
    }

    private var message: String {
        switch accuracy {
        case 0.9...: "Excellent recall — these will come back at longer intervals."
        case 0.7..<0.9: "Solid session. The ones you missed are back tomorrow."
        case 0.5..<0.7: "Keep going — the misses are rescheduled soon so they'll stick."
        default: "Tough set. Those questions reset to a 1-day interval; you'll see them again shortly."
        }
    }
}
