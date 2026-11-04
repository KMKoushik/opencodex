import SwiftUI

/// Placeholder; replaced by the permission and question cards.
struct RequestsView: View {
  let model: ChatModel

  var body: some View {
    if !model.permissions.isEmpty || !model.forms.isEmpty {
      Text("\(model.permissions.count + model.forms.count) pending").padding(8)
    }
  }
}
