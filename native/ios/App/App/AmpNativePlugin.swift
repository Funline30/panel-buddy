import UIKit
import WebKit
import Capacitor

/// Native helpers the web app calls when it runs inside the iPhone app:
///  - print(): the iOS print sheet for the current page (stickers, QR sheets, panel directory),
///    which also offers "Save to Files" as PDF. WKWebView does not handle window.print() itself.
///  - share({ title, text, url }): the iOS share sheet.
///  - shareFile({ filename, data (base64), mimeType }): share sheet for an exported file (CSV, backup),
///    since a web download link does nothing inside the app.
@objc(AmpNativePlugin)
public class AmpNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AmpNativePlugin"
    public let jsName = "AmpNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "print", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareFile", returnType: CAPPluginReturnPromise)
    ]

    @objc func print(_ call: CAPPluginCall) {
        let jobName = call.getString("name") ?? "AmpMap"
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView else {
                call.reject("The page is not ready")
                return
            }
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.jobName = jobName
            let controller = UIPrintInteractionController.shared
            controller.printInfo = info
            controller.printFormatter = webView.viewPrintFormatter()
            controller.present(animated: true) { _, completed, error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["completed": completed])
                }
            }
        }
    }

    @objc func share(_ call: CAPPluginCall) {
        var items: [Any] = []
        if let text = call.getString("text"), !text.isEmpty { items.append(text) }
        if let link = call.getString("url"), let url = URL(string: link) { items.append(url) }
        if items.isEmpty {
            call.reject("Nothing to share")
            return
        }
        present(items: items, subject: call.getString("title"), call: call)
    }

    @objc func shareFile(_ call: CAPPluginCall) {
        guard let b64 = call.getString("data"), let data = Data(base64Encoded: b64) else {
            call.reject("No file data")
            return
        }
        let raw = call.getString("filename") ?? "AmpMap-export"
        let name = raw.replacingOccurrences(of: "/", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            call.reject(error.localizedDescription)
            return
        }
        present(items: [url], subject: call.getString("title"), call: call)
    }

    private func present(items: [Any], subject: String?, call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else {
                call.reject("The page is not ready")
                return
            }
            let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
            if let subject = subject { sheet.setValue(subject, forKey: "subject") }
            sheet.popoverPresentationController?.sourceView = vc.view
            sheet.popoverPresentationController?.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.maxY - 40, width: 1, height: 1)
            sheet.completionWithItemsHandler = { activity, completed, _, error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["completed": completed, "activity": activity?.rawValue ?? ""])
                }
            }
            vc.present(sheet, animated: true)
        }
    }
}
