// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import SwiftUI
import WebKit

@main
struct TemplateAppApp: App {
    @StateObject private var state = AppState()
    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
                // Universal Link — eID апп /auth/eid/callback-ыг нээхэд iOS TemplateApp
                // руу route хийнэ (browser-гүй). Хүлээж буй eID урсгалд мэдэгдэж,
                // session-ыг шууд шалгуулна.
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL, url.path.contains("/eid/callback") {
                        NotificationCenter.default.post(name: .eidReturn, object: nil)
                    }
                }
                // Custom scheme fallback (bridge хуудас → geregetemp://) болон
                // universal link-ийг мөн энд хүлээж авна.
                .onOpenURL { url in
                    if url.scheme == "geregetemp" || url.path.contains("/eid/callback") {
                        NotificationCenter.default.post(name: .eidReturn, object: nil)
                    }
                }
        }
    }
}

// AppState — session-ий эх төлөв. user байвал нэвтэрсэн, эс бол Login харуулна.
@MainActor
final class AppState: ObservableObject {
    @Published var user: MeUser?
    @Published var summary: EidSummary?
    @Published var loading = true

    // Апп нээгдэхэд cookie session хүчинтэй эсэхийг /api/me-ээр шалгана.
    func restore() async {
        loading = true
        defer { loading = false }
        if let u = try? await APIClient.shared.me() {
            user = u
            summary = try? await APIClient.shared.eidSummary()
        } else {
            user = nil
        }
    }

    // Нэвтрэлт амжилттай (cookie суусан) болсны дараа профайлыг татна.
    func onAuthenticated() async {
        if let u = try? await APIClient.shared.me() {
            user = u
            summary = try? await APIClient.shared.eidSummary()
        }
    }

    func signOut() async {
        await APIClient.shared.logout()
        // WKWebView (SSO)-ийн cookie-г цэвэрлэнэ — эс бөгөөс sso.dgov.mn-ий
        // Hydra session cookie үлдэж, дараагийн SSO login дахин баталгаажуулалгүй
        // шууд ордог. Цэвэр logout → дараагийн SSO login дахин eID шаардана.
        await Self.clearWebData()
        user = nil
        summary = nil
    }

    // WKWebView-ийн бүх cookie/storage-ыг устгана (SSO session-ыг таслах).
    static func clearWebData() async {
        let types: Set<String> = [
            WKWebsiteDataTypeCookies,
            WKWebsiteDataTypeLocalStorage,
            WKWebsiteDataTypeSessionStorage,
        ]
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            WKWebsiteDataStore.default().removeData(ofTypes: types, modifiedSince: .distantPast) {
                cont.resume()
            }
        }
    }
}

// RootView — session-ий дагуу Login эсвэл Home.
struct RootView: View {
    @EnvironmentObject var state: AppState
    var body: some View {
        Group {
            if state.loading {
                ProgressView().controlSize(.large)
            } else if state.user != nil {
                HomeView()
            } else {
                LoginView()
            }
        }
        .animation(.default, value: state.user?.id)
        .task { await state.restore() }
    }
}
