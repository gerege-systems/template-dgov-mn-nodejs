// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import SwiftUI

// Нэвтэрсэн хэрэглэгчийн профайл — үндсэн мэдээлэл + eID identity + PKI нэгдсэн тоо.
struct HomeView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        NavigationStack {
            List {
                if let u = state.user {
                    profileSection(u)
                    if let eid = u.eid, (eid.civilId != nil || eid.nationalId != nil) {
                        eidSection(eid)
                    }
                    if let g = u.google, let email = g.email {
                        Section("Google") {
                            row("И-мэйл", email)
                            if let v = g.emailVerified { row("Баталгаажсан", v ? "Тийм" : "Үгүй") }
                        }
                    }
                    if let s = state.summary {
                        summarySection(s)
                    }
                    Section {
                        Button(role: .destructive) {
                            Task { await state.signOut() }
                        } label: {
                            Label("Гарах", systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    }
                }
            }
            .navigationTitle("Миний профайл")
            .refreshable { await state.onAuthenticated() }
        }
    }

    private func profileSection(_ u: MeUser) -> some View {
        Section {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(Color.blue.opacity(0.15)).frame(width: 56, height: 56)
                    Text(String(u.displayName.prefix(1))).font(.title2.bold()).foregroundStyle(.blue)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(u.displayName).font(.headline)
                    Text(u.roleLabel).font(.caption)
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Color.blue.opacity(0.12)).clipShape(Capsule())
                }
            }
            .padding(.vertical, 4)
            if let e = u.email, !e.isEmpty { row("И-мэйл", e) }
            row("Нэвтрэх нэр", u.username)
        }
    }

    private func eidSection(_ eid: EidBlock) -> some View {
        Section("eID") {
            if let c = eid.civilId { row("Иргэний дугаар", c) }
            if let n = eid.nationalId, !n.isEmpty { row("Регистр", n.uppercased()) }
            if let k = eid.kycLevel, !k.isEmpty { row("KYC түвшин", k) }
            if let d = eid.documentNumber, !d.isEmpty { row("Баримтын дугаар", String(d.prefix(16)) + "…") }
        }
    }

    private func summarySection(_ s: EidSummary) -> some View {
        Section("eID PKI") {
            row("Хүчинтэй гэрчилгээ", "\(s.certificates.valid)/\(s.certificates.total)")
            row("Нэвтрэлт", "\(s.activity.authentication)")
            row("Гарын үсэг", "\(s.activity.signature)")
            row("Идэвхтэй төхөөрөмж", "\(s.devicesActive)/\(s.devicesTotal)")
            row("Төлөөлдөг байгууллага", "\(s.representationCount)")
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value).multilineTextAlignment(.trailing)
        }
    }
}
