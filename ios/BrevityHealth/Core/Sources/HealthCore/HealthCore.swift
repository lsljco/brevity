import Foundation
public enum HealthDates {
    public static var calendar: Calendar { var result = Calendar(identifier: .gregorian); result.timeZone = TimeZone(identifier: "America/New_York")!; return result }
    public static func key(_ date: Date) -> String { let formatter = DateFormatter(); formatter.calendar = calendar; formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = calendar.timeZone; formatter.dateFormat = "yyyy-MM-dd"; return formatter.string(from: date) }
    public static func days(through now: Date) -> [Date] { let today = calendar.startOfDay(for: now); return (0..<30).reversed().map { calendar.date(byAdding: .day, value: -$0, to: today)! } }
    // Count overlapping workout recordings as one session and union their durations.
    public static func workouts(_ intervals: [DateInterval], during day: Date) -> (count: Int, minutes: Double)? {
        let end = calendar.date(byAdding: .day, value: 1, to: day)!
        let clipped = intervals.compactMap { span -> DateInterval? in let start = max(day, span.start), stop = min(end, span.end); return stop > start ? DateInterval(start: start, end: stop) : nil }.sorted { $0.start < $1.start }
        guard var current = clipped.first else { return nil }
        var total: TimeInterval = 0, count = 1
        for span in clipped.dropFirst() { if span.start < current.end { current = DateInterval(start: current.start, end: max(current.end, span.end)) } else { total += current.duration; current = span; count += 1 } }
        total += current.duration
        return (count, (total / 60 * 10).rounded() / 10)
    }
}
