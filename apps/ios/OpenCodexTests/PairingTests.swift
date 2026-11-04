import Foundation
import Testing

@testable import OpenCodex

@MainActor struct PairingTests {
  typealias Input = ConnectionStore.PairingInput

  @Test func parsesLinksHostsAndCodes() throws {
    let link = try #require(Input(link: " https://ox.example.com/#pair=ABCDE23456\n"))
    #expect(link.host.absoluteString == "https://ox.example.com")
    #expect(link.code == "ABCDE23456")
    #expect(Input(link: "http://ox.example.com/#pair=ABCDE23456") == nil)
    #expect(Input(link: "https://ox.example.com/#other") == nil)

    let deep = URL(string: "opencodex://pair?link=https%3A%2F%2Fox.example.com%2F%23pair%3DABCDE23456")!
    #expect(Input(appURL: deep) == link)

    // Typed codes ignore case, spaces and dashes; hosts default to https.
    let typed = try #require(Input(host: "OX.example.com", typedCode: "abcde-234 56"))
    #expect(typed == link)
    #expect(Input(host: "http://127.0.0.1:4310", typedCode: "ABCDE23456")?.host.absoluteString
      == "http://127.0.0.1:4310")
    #expect(Input(host: "http://ox.example.com", typedCode: "ABCDE23456") == nil)
    #expect(Input(host: "ox.example.com", typedCode: "ABCDE2345") == nil)
    #expect(Input.problem(code: "ABCDE2345O") == .lookalike)
    #expect(Input.display(code: "abcde23456") == "ABCDE-23456")
  }
}
