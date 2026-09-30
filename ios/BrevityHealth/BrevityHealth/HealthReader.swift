import Foundation
import HealthKit
// HealthCore.swift is included in the app target and also tested as a standalone package.
final class HealthReader {
    private let store = HKHealthStore()
    private var observers: [HKObserverQuery] = []
    private let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount)!
    func authorize(_ connection: Connection) async throws {
        guard HKHealthStore.isHealthDataAvailable() else { throw APIProblem(message: "Apple Health is unavailable on this device.") }
        var types = Set<HKObjectType>()
        if connection.steps { types.insert(stepType) }
        if connection.workouts { types.insert(HKObjectType.workoutType()) }
        try await store.requestAuthorization(toShare: [], read: types)
        // Completing this request does not prove read permission was granted.
    }
    func snapshot(connection: Connection, revision: Int, now: Date = Date()) async throws -> HealthSnapshot {
        let dates = HealthDates.days(through: now), start = dates[0]
        var stepValues: [String: Int] = [:]
        if connection.steps {
            stepValues = try await withCheckedThrowingContinuation { continuation in
                let predicate = HKQuery.predicateForSamples(withStart: start, end: now, options: [])
                var interval = DateComponents(); interval.day = 1; interval.calendar = HealthDates.calendar; interval.timeZone = HealthDates.calendar.timeZone
                let query = HKStatisticsCollectionQuery(quantityType: stepType, quantitySamplePredicate: predicate, options: .cumulativeSum, anchorDate: start, intervalComponents: interval)
                query.initialResultsHandler = { _, result, error in
                    if let error { continuation.resume(throwing: error); return }
                    var values: [String: Int] = [:]
                    result?.enumerateStatistics(from: start, to: now) { statistic, _ in
                        if let quantity = statistic.sumQuantity() { values[HealthDates.key(statistic.startDate)] = Int(quantity.doubleValue(for: .count()).rounded()) }
                    }
                    continuation.resume(returning: values)
                }
                store.execute(query)
            }
        }
        var workoutIntervals: [DateInterval] = []
        if connection.workouts {
            workoutIntervals = try await withCheckedThrowingContinuation { continuation in
                let predicate = HKQuery.predicateForSamples(withStart: start, end: now, options: [])
                let query = HKSampleQuery(sampleType: .workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                    if let error { continuation.resume(throwing: error); return }
                    var seen = Set<UUID>()
                    let spans = (samples as? [HKWorkout] ?? []).filter { seen.insert($0.uuid).inserted && $0.endDate > $0.startDate }.map { DateInterval(start: $0.startDate, end: min($0.endDate, now)) }
                    continuation.resume(returning: spans)
                }
                store.execute(query)
            }
        }
        let days = dates.map { day -> HealthDay in
            let workouts = HealthDates.workouts(workoutIntervals, during: day)
            return HealthDay(date: HealthDates.key(day), steps: stepValues[HealthDates.key(day)], workoutCount: workouts?.count, workoutMinutes: workouts?.minutes)
        }
        return HealthSnapshot(deviceId: connection.deviceId, consentRevision: revision, capturedAt: ISO8601DateFormatter().string(from: now), days: days)
    }
    func observe(_ connection: Connection, onChange: @escaping (@escaping () -> Void) -> Void) {
        stop()
        var types: [HKSampleType] = []
        if connection.steps { types.append(stepType) }
        if connection.workouts { types.append(.workoutType()) }
        for type in types {
            let query = HKObserverQuery(sampleType: type, predicate: nil) { _, completion, error in
                guard error == nil else { completion(); return }; onChange(completion)
            }
            observers.append(query); store.execute(query)
            store.enableBackgroundDelivery(for: type, frequency: .hourly) { _, _ in }
        }
    }
    func stop() { observers.forEach(store.stop); observers.removeAll() }
    func disconnect() { stop(); store.disableAllBackgroundDelivery { _, _ in } }
}
