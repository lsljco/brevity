import Foundation
import SwiftUI
@MainActor final class HealthModel: ObservableObject {
    @Published var summary: HealthSummary?
    @Published var draft: Connection
    @Published var error = ""
    @Published var busy = false
    @Published var status = ""
    private let api = APIClient()
    private let reader = HealthReader()
    private var observedRevision: Int?
    let deviceId: String
    init() {
        let id = SecureStorage.read("device") ?? UUID().uuidString
        deviceId = id; draft = Connection(deviceId: id)
        do { try SecureStorage.save(id, key: "device") } catch { self.error = error.localizedDescription }
    }
    func restore() async {
        guard SecureStorage.read("session") != nil else { return }
        do { accept(try await api.summary()); configureObservers(); await sync() } catch { handle(error) }
    }
    func login(member: String, password: String) async {
        guard !busy else { return }; busy = true; error = ""
        do { try await api.login(member: member, password: password); accept(try await api.summary()); configureObservers() } catch { handle(error) }
        busy = false
    }
    private func accept(_ value: HealthSummary) { let editing = summary != nil && draft != summary?.connection; summary = value; if !editing { draft = value.connection ?? Connection(deviceId: deviceId) } }
    func connect() async {
        guard !busy, let current = summary else { return }; busy = true; error = ""
        do {
            var proposed = draft; proposed.deviceId = deviceId; proposed.enabled = true
            try await reader.authorize(proposed)
            let saved = try await api.settings(proposed, version: current.version); accept(saved); draft = saved.connection ?? Connection(deviceId: deviceId); observedRevision = nil; configureObservers()
            busy = false; await sync()
        } catch { handle(error); busy = false }
    }
    func sync() async {
        guard summary != nil, !busy else { return }; busy = true; error = ""
        defer { busy = false }
        do {
            let current = try await api.summary(); accept(current)
            guard let connection = current.connection, connection.enabled, connection.deviceId == deviceId else { reader.disconnect(); observedRevision = nil; status = "This iPhone is not connected. Review your connection choices."; return }
            // Fetch current consent before reading HealthKit; the server rechecks it atomically on upload.
            let snapshot = try await reader.snapshot(connection: connection, revision: current.consentRevision)
            accept(try await api.sync(snapshot)); status = "Synced. Missing or unreadable data remains Unknown."
            configureObservers()
        } catch { handle(error) }
    }
    private func configureObservers() {
        guard let current = summary, let connection = current.connection, connection.enabled, connection.deviceId == deviceId else { reader.disconnect(); observedRevision = nil; return }
        guard observedRevision != current.consentRevision else { return }
        observedRevision = current.consentRevision
        reader.observe(connection) { [weak self] completion in
            Task { @MainActor in defer { completion() }; await self?.sync() }
        }
    }
    func disconnect() async {
        guard !busy, let current = summary, var connection = current.connection else { return }; busy = true; error = ""
        do { connection.enabled = false; accept(try await api.settings(connection, version: current.version)); reader.disconnect(); observedRevision = nil; status = "Disconnected. Synced summaries were removed from Brevity." } catch { handle(error) }
        busy = false
    }
    func signOut() async { reader.disconnect(); observedRevision = nil; await api.logout(); summary = nil; draft = Connection(deviceId: deviceId); status = "" }
    private func handle(_ error: Error) {
        self.error = error.localizedDescription
        if (error as? APIProblem)?.status == 401 { reader.disconnect(); observedRevision = nil; summary = nil; try? SecureStorage.save(nil, key: "session") }
    }
}
