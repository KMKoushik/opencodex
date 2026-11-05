import SwiftUI

/// Pending approvals, stacked above the composer. Compact: at most about 45% of the screen,
/// scrolling inside. Questions take the composer's place (`QuestionDock`), as on the desktop.
struct RequestsView: View {
  let model: ChatModel

  @State private var contentHeight: CGFloat = 0
  @State private var screenHeight: CGFloat = 800
  @State private var keyboardHeight: CGFloat = 0

  var body: some View {
    if !model.permissions.isEmpty {
      ScrollView {
        VStack(spacing: 8) {
          ForEach(model.permissions) { request in
            PermissionCard(model: model, request: request)
          }
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 4)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
      }
      .scrollBounceBehavior(.basedOnSize)
      .scrollEdgeEffectStyle(.soft, for: .top)
      .scrollDismissesKeyboard(.interactively)
      .frame(height: min(contentHeight, max(160, (screenHeight - keyboardHeight) * 0.45)))
      .background {
        // Measures the screen without taking part in layout.
        Color.clear
          .containerRelativeFrame(.vertical)
          .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { screenHeight = $0 }
      }
      .onReceive(
        NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)
      ) { note in
        guard let frame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
        keyboardHeight = max(0, screenHeight - frame.minY)
      }
      .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
        keyboardHeight = 0
      }
      .transition(.move(edge: .bottom).combined(with: .opacity))
      .animation(.snappy(duration: 0.25), value: model.permissions.map(\.id))
    }
  }
}
