import Foundation
import Security
final class SecureStorage {
    static let service = "app.brevity.health"
    static func read(_ key: String) -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func save(_ value: String?, key: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
        SecItemDelete(query as CFDictionary)
        guard let value else { return }
        var record = query
        record[kSecValueData as String] = Data(value.utf8)
        record[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(record as CFDictionary, nil) == errSecSuccess else { throw APIProblem(message: "Secure storage is unavailable. Unlock this iPhone and try again.") }
    }
}
final class APIClient: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    static let origin = URL(string: "https://brevityoflife.netlify.app")!
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.urlCache = nil
        config.timeoutIntervalForRequest = 25
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    func send(path: String, body: Data? = nil, includeSession: Bool = true) async throws -> (Data, HTTPURLResponse) {
        let url = Self.origin.appendingPathComponent(".netlify/functions/" + path.components(separatedBy: "?")[0])
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        if let query = path.split(separator: "?", maxSplits: 1).dropFirst().first { components.percentEncodedQuery = String(query) }
        var request = URLRequest(url: components.url!); request.httpMethod = body == nil ? "GET" : "POST"; request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if includeSession, let token = SecureStorage.read("session") { request.setValue("brevity_household_session=" + token, forHTTPHeaderField: "Cookie") }
        let (data, rawResponse) = try await session.data(for: request)
        guard let response = rawResponse as? HTTPURLResponse else { throw APIProblem(message: "Brevity returned an invalid response.") }
        guard (200..<300).contains(response.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIProblem(message: message ?? "Brevity is temporarily unavailable.", status: response.statusCode)
        }
        return (data, response)
    }
    func login(member: String, password: String) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["member": member, "password": password])
        let (_, response) = try await send(path: "household-auth?action=login", body: body, includeSession: false)
        let fields = response.allHeaderFields.reduce(into: [String: String]()) { if let key = $1.key as? String, let value = $1.value as? String { $0[key] = value } }
        guard let cookie = HTTPCookie.cookies(withResponseHeaderFields: fields, for: Self.origin).first(where: { $0.name == "brevity_household_session" }) else { throw APIProblem(message: "Brevity did not return a secure session.") }
        try SecureStorage.save(cookie.value, key: "session")
    }
    func summary() async throws -> HealthSummary { let (data, _) = try await send(path: "member-health"); return try JSONDecoder().decode(HealthSummary.self, from: data) }
    func settings(_ connection: Connection, version: Int) async throws -> HealthSummary {
        var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(connection)) as! [String: Any]
        object["expectedVersion"] = version; object["confirmed"] = true
        let (data, _) = try await send(path: "member-health?action=settings", body: JSONSerialization.data(withJSONObject: object))
        return try JSONDecoder().decode(HealthSummary.self, from: data)
    }
    func sync(_ snapshot: HealthSnapshot) async throws -> HealthSummary {
        let (data, _) = try await send(path: "member-health?action=sync", body: JSONEncoder().encode(snapshot))
        return try JSONDecoder().decode(HealthSummary.self, from: data)
    }
    func logout() async { _ = try? await send(path: "household-auth?action=logout", body: Data("{}".utf8)); try? SecureStorage.save(nil, key: "session") }
}
