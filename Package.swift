// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "DevStyleKit",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        .library(name: "DevStyleKit", targets: ["DevStyleKit"]),
    ],
    targets: [
        .target(name: "DevStyleKit", path: "swift/Sources/DevStyleKit"),
        .testTarget(name: "DevStyleKitTests", dependencies: ["DevStyleKit"], path: "swift/Tests/DevStyleKitTests"),
    ]
)
