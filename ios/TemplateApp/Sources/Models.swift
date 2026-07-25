// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import Foundation

// Backend-ийн бүх хариу дугтуй (envelope) — BFF proxyResult { ok, status, data, message }.
struct Envelope<T: Decodable>: Decodable {
    let ok: Bool?
    let status: Int?
    let message: String?
    let data: T?
}

// GET /api/me → хэрэглэгчийн профайл.
struct MeUser: Decodable, Identifiable {
    let id: String
    let username: String
    let firstName: String?
    let lastName: String?
    let fullName: String?
    let fullNameEn: String?
    let email: String?
    let roleId: Int
    let createdAt: String?
    let eid: EidBlock?
    let google: GoogleBlock?

    enum CodingKeys: String, CodingKey {
        case id, username, email, eid, google
        case firstName = "first_name"
        case lastName = "last_name"
        case fullName = "full_name"
        case fullNameEn = "full_name_en"
        case roleId = "role_id"
        case createdAt = "created_at"
    }

    var displayName: String {
        if let f = fullName, !f.trimmingCharacters(in: .whitespaces).isEmpty { return f }
        return username
    }
    var roleLabel: String {
        switch roleId {
        case 1: return "Супер админ"
        case 2: return "Админ"
        case 3: return "Менежер"
        default: return "Хэрэглэгч"
        }
    }
}

struct EidBlock: Decodable {
    let civilId: String?
    let nationalId: String?
    let kycLevel: String?
    let documentNumber: String?
    enum CodingKeys: String, CodingKey {
        case civilId = "civil_id"
        case nationalId = "national_id"
        case kycLevel = "kyc_level"
        case documentNumber = "document_number"
    }
}

struct GoogleBlock: Decodable {
    let email: String?
    let name: String?
    let picture: String?
    let emailVerified: Bool?
    enum CodingKeys: String, CodingKey {
        case email, name, picture
        case emailVerified = "email_verified"
    }
}

// POST /api/auth/eid/start(-id) → session_id + verification_code (+ QR device_link_url).
struct EidStart: Decodable {
    let sessionId: String
    let deviceLinkUrl: String?
    let verificationCode: String?
    let expiresAt: String?
    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case deviceLinkUrl = "device_link_url"
        case verificationCode = "verification_code"
        case expiresAt = "expires_at"
    }
}

// POST /api/auth/eid/poll → { state: RUNNING | COMPLETE | EXPIRED | REFUSED }.
struct PollResult: Decodable {
    let state: String
}

// GET /api/me/eid/summary → eID PKI нэгдсэн тоо.
struct EidSummary: Decodable {
    let certificates: CertCounts
    let activity: ActivityCounts
    let devicesActive: Int
    let devicesTotal: Int
    let representationCount: Int
    enum CodingKeys: String, CodingKey {
        case certificates, activity
        case devicesActive = "devices_active"
        case devicesTotal = "devices_total"
        case representationCount = "representation_count"
    }
    struct CertCounts: Decodable { let valid: Int; let total: Int }
    struct ActivityCounts: Decodable { let authentication: Int; let signature: Int }
}
