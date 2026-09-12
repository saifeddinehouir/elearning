import Foundation

extension Date {
    func startOfDay(_ calendar: Calendar = .current) -> Date {
        calendar.startOfDay(for: self)
    }

    func adding(days: Int, _ calendar: Calendar = .current) -> Date {
        calendar.date(byAdding: .day, value: days, to: self) ?? self
    }

    func isSameDay(as other: Date, _ calendar: Calendar = .current) -> Bool {
        calendar.isDate(self, inSameDayAs: other)
    }
}

extension Calendar {
    /// Whole days from `start` (inclusive) to `end`, both normalized to start-of-day.
    func days(from start: Date, to end: Date) -> [Date] {
        var result: [Date] = []
        var cursor = startOfDay(for: start)
        let last = startOfDay(for: end)
        while cursor <= last {
            result.append(cursor)
            guard let next = date(byAdding: .day, value: 1, to: cursor) else { break }
            cursor = next
        }
        return result
    }
}

extension DateFormatter {
    static let shortDay: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f
    }()
}
