import AppKit

final class InstallerLogoView: NSView {
    override var intrinsicContentSize: NSSize { NSSize(width: 84, height: 84) }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        let square = bounds.insetBy(dx: 2, dy: 2)
        let background = NSBezierPath(roundedRect: square, xRadius: 20, yRadius: 20)
        NSColor(calibratedRed: 7 / 255, green: 193 / 255, blue: 96 / 255, alpha: 1).setFill()
        background.fill()

        let bubble = NSBezierPath(roundedRect: NSRect(x: 17, y: 34, width: 50, height: 32), xRadius: 14, yRadius: 14)
        NSColor.white.setFill()
        bubble.fill()
        NSColor(calibratedRed: 7 / 255, green: 184 / 255, blue: 90 / 255, alpha: 1).setFill()
        for x in [34.0, 50.0] {
            NSBezierPath(ovalIn: NSRect(x: x, y: 47, width: 6, height: 6)).fill()
        }
    }
}

final class InstallerDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private var window: NSWindow!
    private let installButton = NSButton(title: "安装并启动微信主题", target: nil, action: nil)
    private let statusLabel = NSTextField(labelWithString: "安装器不会修改 Codex.app，也不会强制退出正在运行的 Codex。")
    private let progress = NSProgressIndicator()
    private var installerProcess: Process?
    private var isInstalling = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        buildWindow()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard !isInstalling else {
            NSSound.beep()
            statusLabel.stringValue = "安装仍在进行，请等待完成后再退出。"
            return .terminateCancel
        }
        return .terminateNow
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        guard !isInstalling else {
            NSSound.beep()
            statusLabel.stringValue = "安装仍在进行，请等待完成后再关闭窗口。"
            return false
        }
        return true
    }

    private func label(_ text: String, size: CGFloat, weight: NSFont.Weight, color: NSColor) -> NSTextField {
        let field = NSTextField(labelWithString: text)
        field.font = NSFont.systemFont(ofSize: size, weight: weight)
        field.textColor = color
        field.alignment = .center
        field.maximumNumberOfLines = 0
        field.lineBreakMode = .byWordWrapping
        return field
    }

    private func buildWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 430),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Codex WeChat Skin"
        window.delegate = self
        window.center()
        window.isReleasedWhenClosed = false

        let title = label("让 Codex 看起来像微信", size: 25, weight: .semibold, color: .labelColor)
        let subtitle = label(
            "一键安装完整版主题、桌面快捷入口与匿名诊断工具\nOne-click installer for Codex WeChat Skin Studio",
            size: 13,
            weight: .regular,
            color: .secondaryLabelColor
        )
        subtitle.preferredMaxLayoutWidth = 440

        let safety = label(
            "安装前请保存工作并自行退出 Codex。安装器只会在 Codex 已退出时继续。",
            size: 12,
            weight: .medium,
            color: NSColor(calibratedRed: 0.78, green: 0.34, blue: 0.08, alpha: 1)
        )
        safety.preferredMaxLayoutWidth = 440

        installButton.target = self
        installButton.action = #selector(beginInstall)
        installButton.bezelStyle = .rounded
        installButton.controlSize = .large
        installButton.contentTintColor = NSColor(calibratedRed: 7 / 255, green: 160 / 255, blue: 78 / 255, alpha: 1)

        progress.style = .spinning
        progress.controlSize = .small
        progress.isDisplayedWhenStopped = false

        statusLabel.font = NSFont.systemFont(ofSize: 11)
        statusLabel.textColor = .tertiaryLabelColor
        statusLabel.alignment = .center
        statusLabel.maximumNumberOfLines = 2
        statusLabel.preferredMaxLayoutWidth = 450

        let actionRow = NSStackView(views: [progress, installButton])
        actionRow.orientation = .horizontal
        actionRow.alignment = .centerY
        actionRow.spacing = 10

        let stack = NSStackView(views: [InstallerLogoView(), title, subtitle, safety, actionRow, statusLabel])
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 16
        stack.edgeInsets = NSEdgeInsets(top: 28, left: 44, bottom: 26, right: 44)
        stack.translatesAutoresizingMaskIntoConstraints = false

        let content = NSView()
        content.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            stack.topAnchor.constraint(equalTo: content.topAnchor),
            stack.bottomAnchor.constraint(equalTo: content.bottomAnchor),
        ])
        window.contentView = content
    }

    @objc private func beginInstall() {
        let runningCodex = NSRunningApplication.runningApplications(withBundleIdentifier: "com.openai.codex")
            .contains { !$0.isTerminated }
        if runningCodex {
            let alert = NSAlert()
            alert.messageText = "请先保存工作并退出 Codex"
            alert.informativeText = "为了保护正在运行的任务，安装器不会替你退出 Codex。退出后再点击“安装并启动微信主题”。"
            alert.alertStyle = .warning
            alert.addButton(withTitle: "知道了")
            alert.beginSheetModal(for: window)
            return
        }

        guard let installer = Bundle.main.resourceURL?
            .appendingPathComponent("payload/scripts/install-weixin-skin-macos.sh"),
            FileManager.default.isExecutableFile(atPath: installer.path)
        else {
            showFailure("安装包不完整，请重新下载 DMG。")
            return
        }

        setInstalling(true)
        statusLabel.stringValue = "正在验证并安装主题…"
        progress.startAnimation(nil)

        let process = Process()
        let output = Pipe()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = [installer.path, "--safe-launch"]
        process.currentDirectoryURL = installer.deletingLastPathComponent().deletingLastPathComponent()
        process.standardOutput = output
        process.standardError = output
        var environment = ProcessInfo.processInfo.environment
        environment["TERM"] = "dumb"
        process.environment = environment
        installerProcess = process

        do {
            try process.run()
        } catch {
            progress.stopAnimation(nil)
            installerProcess = nil
            setInstalling(false)
            showFailure("无法启动安装程序：\(error.localizedDescription)")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            let data = output.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            let message = String(data: data, encoding: .utf8) ?? ""
            DispatchQueue.main.async { [weak self] in
                self?.finishInstall(exitCode: process.terminationStatus, output: message)
            }
        }
    }

    private func finishInstall(exitCode: Int32, output: String) {
        progress.stopAnimation(nil)
        installerProcess = nil
        setInstalling(false)
        if exitCode == 0 {
            statusLabel.stringValue = "安装完成。以后可从桌面快捷入口启动或自定义主题。"
            let alert = NSAlert()
            alert.messageText = "Codex 微信主题安装完成"
            alert.informativeText = "Codex 已使用微信主题启动。桌面快捷入口可用于再次应用、自定义、诊断和还原。"
            alert.addButton(withTitle: "完成")
            alert.beginSheetModal(for: window)
            return
        }
        let lines = output.split(whereSeparator: { $0.isNewline }).suffix(8).joined(separator: "\n")
        showFailure(lines.isEmpty ? "安装失败，请导出匿名诊断包后提交 Issue。" : String(lines))
    }

    private func showFailure(_ message: String) {
        statusLabel.stringValue = "安装未完成；部分主题文件或设置可能已经写入。"
        let alert = NSAlert()
        alert.messageText = "无法安装 Codex 微信主题"
        alert.informativeText = String(message.prefix(1400))
            + "\n\n请按错误提示处理后重新运行安装器；若桌面已有还原入口，也可以用它恢复官方外观。安装器不会替你退出正在运行的 Codex。"
        alert.alertStyle = .warning
        alert.addButton(withTitle: "关闭")
        alert.beginSheetModal(for: window)
    }

    private func setInstalling(_ installing: Bool) {
        isInstalling = installing
        installButton.isEnabled = !installing
        window.standardWindowButton(.closeButton)?.isEnabled = !installing
        window.standardWindowButton(.miniaturizeButton)?.isEnabled = !installing
    }
}

@main
enum InstallerMain {
    static func main() {
        let application = NSApplication.shared
        let delegate = InstallerDelegate()
        application.delegate = delegate
        application.run()
        _ = delegate
    }
}
