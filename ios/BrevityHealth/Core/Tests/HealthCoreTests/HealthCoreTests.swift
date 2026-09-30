import XCTest
@testable import HealthCore
final class HealthCoreTests: XCTestCase {
    func testHouseholdDayAndDST() {
        let now = ISO8601DateFormatter().date(from: "2026-11-02T02:00:00Z")!
        let days = HealthDates.days(through: now)
        XCTAssertEqual(days.count, 30); XCTAssertEqual(HealthDates.key(days.last!), "2026-11-01")
        XCTAssertEqual(Set(days.map(HealthDates.key)).count, 30)
        XCTAssertEqual(HealthDates.calendar.date(byAdding: .day, value: 1, to: days.last!)!.timeIntervalSince(days.last!), 25 * 3600)
    }
    func testWorkoutOverlapAndUnknown() {
        let day = HealthDates.calendar.startOfDay(for: Date())
        let intervals = [DateInterval(start: day.addingTimeInterval(3600), duration: 1800), DateInterval(start: day.addingTimeInterval(3900), duration: 1800)]
        let result = HealthDates.workouts(intervals, during: day)
        XCTAssertEqual(result?.count, 1); XCTAssertEqual(result?.minutes, 35)
        XCTAssertNil(HealthDates.workouts([], during: day))
    }
}
