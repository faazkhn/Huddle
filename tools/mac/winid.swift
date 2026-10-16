// Prints "<windowId> <owner> <x>,<y> <w>x<h> <title>" for on-screen windows (points). Used to screen-record the Vega Virtual Device.
import CoreGraphics
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
for w in list {
  let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
  print(w[kCGWindowNumber as String] ?? 0, w[kCGWindowOwnerName as String] ?? "", "\(b["X"] ?? 0),\(b["Y"] ?? 0)", "\(b["Width"] ?? 0)x\(b["Height"] ?? 0)", w[kCGWindowName as String] ?? "")
}
