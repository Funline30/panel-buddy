import UIKit
import Capacitor

/// Capacitor's web view controller plus AmpMap's own native plugins
/// (they live in this target, so they are registered by hand instead of through npm).
class AmpBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AmpNativePlugin())
    }
}
