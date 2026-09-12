import Foundation

struct SessionConfig {
    var size: Int = AppStorageKeys.Defaults.dailyGoal
    /// Upper bound on the share of the session that may be brand-new questions.
    var newLimitRatio: Double = AppStorageKeys.Defaults.newLimitRatio

    static let `default` = SessionConfig()
}

/// Breakdown of a planned session, for the "today" preview card.
struct SessionComposition {
    var due: Int = 0
    var new: Int = 0
    var ahead: Int = 0
    var total: Int { due + new + ahead }
}

/// Builds the ordered daily question queue. Pure logic over model objects so it
/// can be unit-tested with an in-memory container.
enum SessionBuilder {

    static func plan(
        questions: [Question],
        now: Date = .now,
        config: SessionConfig = .default,
        calendar: Calendar = .current
    ) -> [Question] {
        composition(questions: questions, now: now, config: config, calendar: calendar).queue
    }

    static func composition(
        questions: [Question],
        now: Date = .now,
        config: SessionConfig = .default,
        calendar: Calendar = .current
    ) -> (queue: [Question], breakdown: SessionComposition) {

        guard config.size > 0, !questions.isEmpty else { return ([], .init()) }

        let endOfToday = calendar.startOfDay(for: now).addingTimeInterval(86_400)
        let topicRate = topicSuccessRates(questions: questions)

        func weight(_ q: Question) -> Double {
            let rate = topicRate[q.topic] ?? 0.5
            return 0.5 + (1.0 - rate)   // weak topics → up to 1.5, mastered → 0.5
        }

        let dueReviews = questions
            .filter { q in
                guard let rs = q.reviewState, rs.totalReviews > 0 else { return false }
                return rs.dueDate < endOfToday
            }
            .sorted { ($0.reviewState?.dueDate ?? .distantFuture) < ($1.reviewState?.dueDate ?? .distantFuture) }

        let newQuestions = questions.filter(\.isNew)

        var breakdown = SessionComposition()
        var chosen: [Question] = []
        var chosenIDs = Set<UUID>()

        func take(_ qs: some Sequence<Question>, limit: Int) -> [Question] {
            guard limit > 0 else { return [] }
            var out: [Question] = []
            for q in qs where !chosenIDs.contains(q.id) {
                out.append(q)
                chosenIDs.insert(q.id)
                if out.count == limit { break }
            }
            return out
        }

        // 1. Due reviews first.
        let dueTaken = take(dueReviews, limit: config.size)
        chosen += dueTaken
        breakdown.due = dueTaken.count

        // 2. New questions, capped so reviews are never crowded out.
        if chosen.count < config.size {
            let remaining = config.size - chosen.count
            let newCap = max(newQuestions.isEmpty ? 0 : 1,
                             Int((Double(config.size) * config.newLimitRatio).rounded()))
            let newTaken = take(weightedShuffle(newQuestions, weight: weight),
                                limit: min(remaining, newCap))
            chosen += newTaken
            breakdown.new = newTaken.count
        }

        // 3. Pull-ahead: soonest-due future reviews, if slots remain.
        if chosen.count < config.size {
            let future = questions
                .filter { q in
                    guard let rs = q.reviewState, rs.totalReviews > 0 else { return false }
                    return rs.dueDate >= endOfToday
                }
                .sorted { $0.reviewState!.dueDate < $1.reviewState!.dueDate }
            let aheadTaken = take(future, limit: config.size - chosen.count)
            chosen += aheadTaken
            breakdown.ahead = aheadTaken.count
        }

        // 4. Any leftover new questions to fill the goal.
        if chosen.count < config.size {
            let more = take(newQuestions, limit: config.size - chosen.count)
            chosen += more
            breakdown.new += more.count
        }

        return (weightedShuffle(chosen, weight: weight), breakdown)
    }

    // MARK: - Helpers

    static func topicSuccessRates(questions: [Question]) -> [String: Double] {
        var agg: [String: (correct: Int, total: Int)] = [:]
        for q in questions {
            let topic = q.topic
            for attempt in q.attempts {
                var entry = agg[topic] ?? (0, 0)
                entry.total += 1
                if attempt.wasCorrect { entry.correct += 1 }
                agg[topic] = entry
            }
        }
        return agg.mapValues { $0.total == 0 ? 0.5 : Double($0.correct) / Double($0.total) }
    }

    /// Efraimidis–Spirakis weighted sampling: each element gets key = U^(1/w); sort descending.
    static func weightedShuffle<T>(_ items: [T], weight: (T) -> Double) -> [T] {
        items
            .map { item -> (T, Double) in
                let u = Double.random(in: 1e-9...1)
                return (item, pow(u, 1.0 / max(1e-4, weight(item))))
            }
            .sorted { $0.1 > $1.1 }
            .map(\.0)
    }
}
