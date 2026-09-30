// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "HealthCore", products: [.library(name: "HealthCore", targets: ["HealthCore"])], targets: [.target(name: "HealthCore"), .testTarget(name: "HealthCoreTests", dependencies: ["HealthCore"])])
