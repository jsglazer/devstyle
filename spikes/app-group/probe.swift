// App Group probe: can sandboxed, Developer ID-signed apps share a DevStyle folder?
//   probe write <text>   write devstyle.json + a profile into the group container
//   probe read           read them back
//   probe direct         read by literal path (control: must fail without the group entitlement)
import Foundation

let group = "PWGXN26URQ.com.jsglazer.devstyle"
let fm = FileManager.default
let me = Bundle.main.bundleIdentifier ?? "?"
let args = CommandLine.arguments.dropFirst()
let mode = args.first ?? "read"
var report: [String] = ["bundle=\(me)", "mode=\(mode)", "sandboxed=\(ProcessInfo.processInfo.environment["APP_SANDBOX_CONTAINER_ID"] != nil)"]

func finish(_ ok: Bool) -> Never {
    report.append(ok ? "RESULT=PASS" : "RESULT=FAIL")
    let text = report.joined(separator: "\n") + "\n"
    print(text, terminator: "")
    // Also leave a copy in our own (sandbox) home so `open`-launched runs can be inspected.
    try? text.write(to: URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("probe-\(mode).txt"), atomically: true, encoding: .utf8)
    exit(ok ? 0 : 1)
}

if mode == "direct" {
    let real = "/Users/\(NSUserName())/Library/Group Containers/\(group)/DevStyle/devstyle.json"
    do {
        let s = try String(contentsOfFile: real, encoding: .utf8)
        report.append("direct-read=OK \(s.count) chars")
        finish(true)
    } catch {
        report.append("direct-read=DENIED \(error.localizedDescription)")
        finish(false)
    }
}

guard let base = fm.containerURL(forSecurityApplicationGroupIdentifier: group) else {
    report.append("containerURL=nil")
    finish(false)
}
report.append("container=\(base.path)")
let dir = base.appendingPathComponent("DevStyle", isDirectory: true)
let json = dir.appendingPathComponent("devstyle.json")
let profile = dir.appendingPathComponent("profiles/default-light.css")

if mode == "watch" {
    // Watch the DevStyle folder; report the first change to devstyle.json made by another app.
    let before = (try? String(contentsOf: json, encoding: .utf8)) ?? ""
    let fd = open(dir.path, O_EVTONLY)
    let src = DispatchSource.makeFileSystemObjectSource(fileDescriptor: fd, eventMask: [.write, .rename, .delete], queue: .main)
    src.setEventHandler {
        let now = (try? String(contentsOf: json, encoding: .utf8)) ?? ""
        if now != before {
            report.append("watch-saw-change=\(now.trimmingCharacters(in: .whitespacesAndNewlines))")
            finish(true)
        }
    }
    src.resume()
    DispatchQueue.main.asyncAfter(deadline: .now() + 20) { report.append("watch=timeout"); finish(false) }
    dispatchMain()
}

do {
    if mode == "write" {
        try fm.createDirectory(at: profile.deletingLastPathComponent(), withIntermediateDirectories: true)
        let stamp = args.dropFirst().first ?? "x"
        try "{ \"light\": \"default-light\", \"dark\": \"default-dark\", \"writer\": \"\(me)\", \"stamp\": \"\(stamp)\" }\n".write(to: json, atomically: true, encoding: .utf8)
        try ":root { --ds-bg: #fbfbfd; }\n".write(to: profile, atomically: true, encoding: .utf8)
        report.append("wrote=\(json.path)")
    } else {
        let s = try String(contentsOf: json, encoding: .utf8)
        let p = try String(contentsOf: profile, encoding: .utf8)
        report.append("read-json=\(s.trimmingCharacters(in: .whitespacesAndNewlines))")
        report.append("read-profile=\(p.trimmingCharacters(in: .whitespacesAndNewlines))")
    }
    finish(true)
} catch {
    report.append("error=\(error.localizedDescription)")
    finish(false)
}
