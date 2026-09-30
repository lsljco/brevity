import SwiftUI
@main struct BrevityHealthApp: App {
    @StateObject private var model = HealthModel()
    @Environment(\.scenePhase) private var scenePhase
    var body: some Scene {
        WindowGroup { HealthConnectionView(model: model).preferredColorScheme(.dark).tint(Color(red: 0.77, green: 0.64, blue: 0.43)).task { await model.restore() }.onChange(of: scenePhase) { phase in if phase == .active { Task { await model.sync() } } } }
    }
}
struct HealthConnectionView: View {
    @ObservedObject var model: HealthModel
    @State private var member = "Larry"
    @State private var password = ""
    @State private var review = false
    @State private var ownsPhone = false
    @State private var disconnectReview = false
    private let members = ["Larry", "Lorenzo", "Terica", "Nyla", "Javin", "Isaiah"]
    var body: some View {
        NavigationStack {
            Form {
                Section { Text("BREVITY • HEALTH CONNECTION").font(.caption).tracking(2); Text("Your activity, with your permission.").font(.title2).fontDesign(.serif) }
                if let summary = model.summary {
                    Section("Signed in as \(summary.member)") {
                        Text("Only connect this iPhone’s personal Health data to your own Brevity profile.")
                        Text(summary.connection?.enabled == true ? "Apple Health connection enabled" : "Not connected")
                        if let connection = summary.connection, connection.enabled && connection.deviceId != model.deviceId { Text("A different iPhone is connected. Disconnect it first to replace it.").foregroundStyle(.orange) }
                    }
                    Section("Today • \(summary.today.date)") {
                        LabeledContent("Steps", value: summary.today.steps.map { $0.formatted() } ?? "Unknown")
                        LabeledContent("Daily step goal", value: (summary.connection?.stepGoal ?? model.draft.stepGoal).formatted())
                        LabeledContent("Workout sessions", value: summary.today.workoutCount.map(String.init) ?? "Unknown")
                        LabeledContent("Workout window minutes", value: summary.today.workoutMinutes.map { $0.formatted() } ?? "Unknown")
                        Text("Last sync: \(summary.lastSyncAt ?? "Not synced yet")\(summary.stale ? " • Needs a fresh sync" : "")").font(.caption)
                        Text("Days use America/New_York. Today is partial. No readable samples means Unknown, not zero. Workout windows combine overlapping recordings and may include pauses.").font(.caption)
                        Button("Sync now") { Task { await model.sync() } }.disabled(model.busy || summary.connection?.enabled != true)
                    }
                    Section("Choose what to connect") {
                        Toggle("Step totals", isOn: $model.draft.steps)
                        Toggle("Workout summaries", isOn: $model.draft.workouts)
                        Stepper("Daily step goal: \(model.draft.stepGoal.formatted())", value: $model.draft.stepGoal, in: 100...100000, step: 100)
                        Toggle("Allow Ask Brevity to use my summaries", isOn: $model.draft.assistantAccess)
                        Text("When allowed, summaries can be sent to Brevity’s AI provider when you use Ask Brevity. This does not connect your ChatGPT conversations.").font(.caption)
                        Toggle("Share daily steps with my household", isOn: $model.draft.shareSteps).disabled(!model.draft.steps)
                        Toggle("Share daily workout totals with my household", isOn: $model.draft.shareWorkouts).disabled(!model.draft.workouts)
                        Text("Private by default. No raw samples, heart rate, routes, medications, nutrition, or clinical records are requested. The last 30 days of selected totals are stored by your Brevity service. Background delivery depends on iOS.").font(.caption)
                        Button("Review connection") { ownsPhone = false; review = true }.disabled(model.busy || (!model.draft.steps && !model.draft.workouts))
                    }
                    Section {
                        Link("Open Brevity", destination: APIClient.origin)
                        Link("Health privacy details", destination: APIClient.origin.appendingPathComponent("health-privacy.html"))
                        if summary.connection?.enabled == true { Button("Disconnect and remove synced summaries", role: .destructive) { disconnectReview = true }.disabled(model.busy) }
                        Button("Sign out") { Task { await model.signOut() } }.disabled(model.busy)
                    }
                } else {
                    Section("Your Brevity account") {
                        Picker("Member", selection: $member) { ForEach(members, id: \.self) { Text($0) } }
                        SecureField("Brevity password", text: $password).textContentType(.password)
                        Button("Sign in") { let entered = password; password = ""; Task { await model.login(member: member, password: entered) } }.disabled(model.busy || password.isEmpty)
                        Text("Use your existing Brevity household password. Your password is never saved on this iPhone.").font(.caption)
                    }
                }
                if model.busy { Section { ProgressView("Working…") } }
                if !model.status.isEmpty { Section { Text(model.status).font(.callout) } }
                if !model.error.isEmpty { Section { Text(model.error).foregroundStyle(.orange).accessibilityLabel("Error: \(model.error)") } }
            }.navigationTitle("Brevity Health")
            .sheet(isPresented: $review) {
                NavigationStack { Form {
                    Section("Review \(model.summary?.member ?? "your") connection") {
                        Text("Steps: \(model.draft.steps ? "on" : "off") • Workouts: \(model.draft.workouts ? "on" : "off")")
                        Text("AI access: \(model.draft.assistantAccess ? "allowed" : "off")")
                        Text("Household steps: \(model.draft.shareSteps && model.draft.steps ? "shared" : "private") • Workouts: \(model.draft.shareWorkouts && model.draft.workouts ? "shared" : "private")")
                        Toggle("This iPhone’s Health records belong to me, \(model.summary?.member ?? "the signed-in member")", isOn: $ownsPhone)
                        Text("Apple will ask which types Brevity may read. You can revoke access in Apple Health or disconnect here. Completing Apple’s prompt does not guarantee data is readable.")
                    }
                    Button("Confirm and authorize Apple Health") { review = false; Task { await model.connect() } }.disabled(!ownsPhone)
                    Button("Cancel", role: .cancel) { review = false }
                }.navigationTitle("Review permissions") }
            }
            .confirmationDialog("Disconnect Apple Health?", isPresented: $disconnectReview, titleVisibility: .visible) {
                Button("Disconnect and remove summaries", role: .destructive) { Task { await model.disconnect() } }
            } message: { Text("Stops future syncing, household sharing and assistant access, and removes synced summaries from Brevity. This cannot be undone. Apple Health originals remain. Information already viewed or discussed cannot be recalled.") }
        }
    }
}
