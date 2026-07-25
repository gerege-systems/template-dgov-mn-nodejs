// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import UIKit
import AuthenticationServices
import CryptoKit

// Native dgov SSO (OIDC + PKCE) — ASWebAuthenticationSession. RP-ийн стандарт
// native урсгал: public client (secret-гүй) + PKCE + custom-scheme redirect. eID
// баталгаажуулалт AS session дотор явж, дуусахад Hydra нь geregetemp://oauth2/
// callback?code=… руу буцаж, session хаагдаад код гарна. Код → BFF
// /api/auth/sso/native (backend public-client exchange) → cookie session.
@MainActor
final class SSOAuth: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    static let issuer = "https://sso.dgov.mn"
    static let clientID = "template-dgov-mn-ios"
    static let redirectURI = "geregetemp://oauth2/callback"
    static let callbackScheme = "geregetemp"
    static let scope = "openid profile email nationalid"

    @Published var busy = false
    @Published var error: String?
    private var session: ASWebAuthenticationSession?

    func start(onSuccess: @escaping () -> Void) {
        busy = true; error = nil
        let verifier = Self.randomURLSafe(32)
        let challenge = Self.codeChallenge(verifier)
        let state = Self.randomURLSafe(16)

        var comp = URLComponents(string: Self.issuer + "/oauth2/auth")!
        comp.queryItems = [
            .init(name: "client_id", value: Self.clientID),
            .init(name: "redirect_uri", value: Self.redirectURI),
            .init(name: "response_type", value: "code"),
            .init(name: "scope", value: Self.scope),
            .init(name: "state", value: state),
            .init(name: "code_challenge", value: challenge),
            .init(name: "code_challenge_method", value: "S256"),
        ]

        let sess = ASWebAuthenticationSession(url: comp.url!, callbackURLScheme: Self.callbackScheme) { [weak self] callback, err in
            guard let self else { return }
            guard err == nil, let cb = callback,
                  let items = URLComponents(url: cb, resolvingAgainstBaseURL: false)?.queryItems,
                  let code = items.first(where: { $0.name == "code" })?.value,
                  items.first(where: { $0.name == "state" })?.value == state else {
                Task { @MainActor in self.busy = false } // цуцалсан эсвэл алдаа — чимээгүй
                return
            }
            Task { @MainActor in
                do {
                    try await APIClient.shared.ssoNativeExchange(
                        code: code, codeVerifier: verifier, redirectURI: Self.redirectURI)
                    self.busy = false
                    onSuccess()
                } catch {
                    self.busy = false
                    self.error = "SSO нэвтрэлт амжилтгүй боллоо."
                }
            }
        }
        sess.presentationContextProvider = self
        // Тус бүрд шинэ session (SSO cookie хадгалахгүй) — logout хийсний дараа
        // дараагийн нэвтрэлт дахин eID баталгаажуулна.
        sess.prefersEphemeralWebBrowserSession = true
        session = sess
        sess.start()
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive } ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        return scene?.keyWindow ?? ASPresentationAnchor()
    }

    // MARK: - PKCE

    static func randomURLSafe(_ n: Int) -> String {
        var b = [UInt8](repeating: 0, count: n)
        _ = SecRandomCopyBytes(kSecRandomDefault, n, &b)
        return base64URL(Data(b))
    }
    static func codeChallenge(_ verifier: String) -> String {
        base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
    }
    static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
