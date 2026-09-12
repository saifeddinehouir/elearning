import Foundation

/// Centralized `@AppStorage` keys and their defaults.
enum AppStorageKeys {
    static let dailyGoal = "settings.dailyGoal"
    static let newLimitRatio = "settings.newLimitRatio"
    static let reminderEnabled = "settings.reminderEnabled"
    static let reminderHour = "settings.reminderHour"
    static let reminderMinute = "settings.reminderMinute"
    static let didRequestNotifications = "settings.didRequestNotifications"

    enum Defaults {
        static let dailyGoal = 15
        static let newLimitRatio = 0.6
        static let reminderEnabled = true
        static let reminderHour = 19
        static let reminderMinute = 0
    }
}
