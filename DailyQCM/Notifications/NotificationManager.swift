import Foundation
import UserNotifications

/// Schedules a single local reminder for the *next* occurrence of the user's
/// reminder time. Rescheduled on launch and after each session so the learner is
/// only nudged on days they haven't studied. No backend.
final class NotificationManager {
    static let shared = NotificationManager()
    private init() {}

    static let requestID = "dailyqcm.reminder"
    private let center = UNUserNotificationCenter.current()

    @discardableResult
    func requestAuthorization() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    /// - Parameter skipToday: pass `true` when the learner has already studied today.
    func scheduleNext(enabled: Bool, hour: Int, minute: Int, skipToday: Bool, now: Date = .now) {
        center.removePendingNotificationRequests(withIdentifiers: [Self.requestID])
        guard enabled else { return }

        let calendar = Calendar.current
        var fireDate = calendar.date(
            bySettingHour: hour, minute: minute, second: 0, of: now
        ) ?? now

        if fireDate <= now || skipToday {
            fireDate = calendar.date(byAdding: .day, value: 1, to: fireDate) ?? fireDate
        }

        let content = UNMutableNotificationContent()
        content.title = "Daily review"
        content.body = "You haven't studied yet today — keep your streak going."
        content.sound = .default

        let components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fireDate)
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        center.add(UNNotificationRequest(identifier: Self.requestID, content: content, trigger: trigger))
    }

    /// Called after a finished session — pushes the next reminder to tomorrow and
    /// reads the current reminder settings straight from `UserDefaults`.
    func rescheduleAfterSession() {
        let defaults = UserDefaults.standard
        let enabled = defaults.object(forKey: AppStorageKeys.reminderEnabled) as? Bool
            ?? AppStorageKeys.Defaults.reminderEnabled
        let hour = defaults.object(forKey: AppStorageKeys.reminderHour) as? Int
            ?? AppStorageKeys.Defaults.reminderHour
        let minute = defaults.object(forKey: AppStorageKeys.reminderMinute) as? Int
            ?? AppStorageKeys.Defaults.reminderMinute
        scheduleNext(enabled: enabled, hour: hour, minute: minute, skipToday: true)
    }

    func cancelAll() {
        center.removePendingNotificationRequests(withIdentifiers: [Self.requestID])
    }
}
