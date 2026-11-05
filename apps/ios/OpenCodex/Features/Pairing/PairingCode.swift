import Foundation

/// Typed codes, the `opencodex://pair` link, and failure text for pairing.
extension ConnectionStore.PairingInput {
  /// Codes are 10 characters from this alphabet; the computer shows them as `XXXXX-XXXXX`.
  static let codeLength = 10
  private static let alphabet = Set("23456789ABCDEFGHJKLMNPQRSTUVWXYZ")

  enum CodeProblem: Equatable {
    case length(Int)
    /// 0, 1, I and O are left out because they're easy to misread.
    case lookalike
    case characters
  }

  /// Uppercases a typed code and drops the spaces and dashes copied along with it.
  static func normalize(code: String) -> String {
    code.uppercased().filter { !$0.isWhitespace && $0 != "-" }
  }

  /// `ABCDE23456` as `ABCDE-23456`, the way the computer shows it.
  static func display(code: String) -> String {
    let code = normalize(code: code)
    guard code.count > 5 else { return code }
    return "\(code.prefix(5))-\(code.dropFirst(5))"
  }

  static func problem(code: String) -> CodeProblem? {
    let code = normalize(code: code)
    if let wrong = code.first(where: { !alphabet.contains($0) }) {
      return "01IO".contains(wrong) ? .lookalike : .characters
    }
    return code.count == codeLength ? nil : .length(code.count)
  }

  /// A host plus a code typed by hand; nil until both are valid.
  init?(host: String, typedCode: String) {
    guard Self.problem(code: typedCode) == nil else { return nil }
    self.init(host: host, code: Self.normalize(code: typedCode))
  }

  /// `opencodex://pair?link=<url-encoded https pairing link>`.
  init?(appURL: URL) {
    guard appURL.scheme == "opencodex", appURL.host() == "pair",
      let link = URLComponents(url: appURL, resolvingAgainstBaseURL: false)?.queryItems?
        .first(where: { $0.name == "link" })?.value
    else { return nil }
    self.init(link: link)
  }
}

enum PairingFailure {
  /// The gateway's own message, or a plain explanation of why it couldn't be reached.
  static func message(_ error: any Error) -> String {
    if let error = error as? GatewayError { return error.message }
    guard let error = error as? URLError else {
      return "This iPhone couldn’t be paired. Make a new code on your computer and try again."
    }
    switch error.code {
    case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed,
      .internationalRoamingOff:
      return "This iPhone is offline. Connect to the internet and try again."
    case .cannotFindHost, .dnsLookupFailed:
      return "Nothing answered at that address. Check the hostname in Remote access on your computer."
    case .timedOut:
      return "Your computer took too long to answer. Check that OpenCodex is open and remote access is on."
    case .secureConnectionFailed, .serverCertificateUntrusted, .serverCertificateHasBadDate,
      .serverCertificateNotYetValid, .serverCertificateHasUnknownRoot:
      return "The connection to that address isn’t secure. Check the hostname in Remote access."
    default:
      return "OpenCodex couldn’t be reached. Check that it’s open on your computer and remote access is on."
    }
  }
}
