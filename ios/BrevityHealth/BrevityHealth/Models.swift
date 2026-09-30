import Foundation
struct Connection: Codable {
    var deviceId: String
    var enabled = true
    var steps = true
    var workouts = false
    var assistantAccess = false
    var shareSteps = false
    var shareWorkouts = false
    var stepGoal = 12000
}
struct HealthDay: Codable, Identifiable {
    var date: String
    var steps: Int?
    var workoutCount: Int?
    var workoutMinutes: Double?
    var id: String { date }
    enum CodingKeys: String, CodingKey { case date, steps, workoutCount, workoutMinutes }
    // Explicit nulls distinguish unknown/denied from a real zero.
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(date, forKey: .date)
        try container.encode(steps, forKey: .steps)
        try container.encode(workoutCount, forKey: .workoutCount)
        try container.encode(workoutMinutes, forKey: .workoutMinutes)
    }
}
struct HealthSummary: Decodable {
    var member: String
    var version: Int
    var consentRevision: Int
    var connection: Connection?
    var today: HealthDay
    var days: [HealthDay]
    var lastSyncAt: String?
    var stale: Bool
}
struct HealthSnapshot: Encodable {
    var deviceId: String
    var consentRevision: Int
    var capturedAt: String
    var timeZone = "America/New_York"
    var days: [HealthDay]
}
struct APIProblem: Error, LocalizedError {
    var message: String
    var status: Int = 0
    var errorDescription: String? { message }
}
