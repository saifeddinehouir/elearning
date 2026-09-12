import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss

    @AppStorage(AppStorageKeys.dailyGoal) private var dailyGoal = AppStorageKeys.Defaults.dailyGoal
    @AppStorage(AppStorageKeys.newLimitRatio) private var newLimitRatio = AppStorageKeys.Defaults.newLimitRatio
    @AppStorage(AppStorageKeys.reminderEnabled) private var reminderEnabled = AppStorageKeys.Defaults.reminderEnabled
    @AppStorage(AppStorageKeys.reminderHour) private var reminderHour = AppStorageKeys.Defaults.reminderHour
    @AppStorage(AppStorageKeys.reminderMinute) private var reminderMinute = AppStorageKeys.Defaults.reminderMinute

    private var reminderTime: Binding<Date> {
        Binding(
            get: {
                Calendar.current.date(bySettingHour: reminderHour, minute: reminderMinute, second: 0, of: .now) ?? .now
            },
            set: { newValue in
                let c = Calendar.current.dateComponents([.hour, .minute], from: newValue)
                reminderHour = c.hour ?? 19
                reminderMinute = c.minute ?? 0
                refreshReminder()
            }
        )
    }

    var body: some View {
        Form {
            Section("Daily session") {
                Stepper("Daily goal: \(dailyGoal) questions", value: $dailyGoal, in: 5...50, step: 5)
                VStack(alignment: .leading) {
                    Text("Max new questions: \(Int(newLimitRatio * 100))% of a session")
                    Slider(value: $newLimitRatio, in: 0.2...1.0, step: 0.1)
                }
            }

            Section("Reminder") {
                Toggle("Evening reminder", isOn: $reminderEnabled)
                    .onChange(of: reminderEnabled) { _, on in
                        if on { Task { _ = await NotificationManager.shared.requestAuthorization() } }
                        refreshReminder()
                    }
                if reminderEnabled {
                    DatePicker("Time", selection: reminderTime, displayComponents: .hourAndMinute)
                }
                Text("A local notification fires only on days you haven't studied yet. No account, no server.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
        }
    }

    private func refreshReminder() {
        NotificationManager.shared.scheduleNext(
            enabled: reminderEnabled,
            hour: reminderHour,
            minute: reminderMinute,
            skipToday: false
        )
    }
}
