// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// openapi нь API-ийн гэрээг тайлбарладаг. Go хувилбар нь swaggo-гоор эх кодын
// тайлбараас үүсгэдэг байсан; Node дээр баримтыг ил кодоор барьдаг — үүнийг
// `npm run openapi` нь файл болгон гаргаж, CI нь drift-ийг шалгана.

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: { url: string; description: string }[];
  components: Record<string, unknown>;
  paths: Record<string, unknown>;
}

/** baseResponseSchema нь бүх endpoint-ийн нэгдсэн дугтуй. */
const baseResponseSchema = {
  type: 'object',
  properties: {
    status: { type: 'boolean' },
    message: { type: 'string' },
    data: {},
    request_id: { type: 'string' },
  },
  required: ['status'],
};

/**
 * userResponseSchema нь /users/me болон auth урсгалуудын буцаадаг хэрэглэгчийн
 * DTO. `password` талбар ХЭЗЭЭ Ч байхгүй — DTO давхарга нь илэрхий allow-list.
 */
const userResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    username: { type: 'string' },
    first_name: { type: 'string' },
    last_name: { type: 'string' },
    full_name: { type: 'string', description: 'Монгол хэлбэр: "Овог Нэр"' },
    first_name_en: { type: 'string' },
    last_name_en: { type: 'string' },
    full_name_en: { type: 'string' },
    email: { type: 'string', description: 'eID хэрэглэгчид хоосон байж болно' },
    role_id: {
      type: 'integer',
      description: '1=superadmin · 2=admin · 3=manager · 4=user',
    },
    token: { type: 'string', description: 'Зөвхөн /login · /refresh хариунд' },
    refresh_token: { type: 'string', description: 'Зөвхөн /login · /refresh хариунд' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: ['string', 'null'], format: 'date-time' },
    eid: {
      type: 'object',
      description: 'eID linkage байгаа үед л орно',
      properties: {
        civil_id: { type: 'string' },
        national_id: { type: 'string', description: 'регистрийн дугаар' },
        kyc_level: { type: 'string', description: 'сертификатын түвшин' },
        document_number: { type: 'string' },
        certificate: {
          type: 'object',
          properties: {
            serial: { type: 'string' },
            not_before: { type: 'string', format: 'date-time' },
            not_after: { type: 'string', format: 'date-time' },
            issuer: { type: 'string' },
            key_type: { type: 'string' },
          },
        },
      },
    },
    eid_proxy: {
      type: 'boolean',
      description: 'SSO eID proxy идэвхтэй — frontend eID хуудсуудыг нээнэ',
    },
    google: {
      type: 'object',
      description: 'Google account холбогдсон үед л орно',
      properties: {
        email: { type: 'string' },
        email_verified: { type: 'boolean' },
        name: { type: 'string' },
        picture: { type: 'string' },
        linked_at: { type: 'string', format: 'date-time' },
      },
    },
  },
  required: ['id', 'username', 'role_id', 'created_at'],
};

/** openapiDocument нь одоогийн route гадаргуугийн OpenAPI 3.1 тодорхойлолт. */
export function openapiDocument(): OpenApiDocument {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Government Template Platform V3.0 API',
      version: '3.0.0',
      description:
        'Цахим засаглалыг бүтээх суурь — eID нэвтрэлт, RBAC, AI туслах бүхий төрийн үйлчилгээний платформын API (Node.js · Express 5 · PostgreSQL · Redis).',
    },
    servers: [
      { url: 'https://node.template.dgov.mn/api/v1', description: 'Production' },
      { url: 'http://localhost:8080/api/v1', description: 'Local development' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        BaseResponse: baseResponseSchema,
        RelayWebhookEnvelope: {
          type: 'object',
          description:
            'Peer платформ хооронд дамжуулах webhook-ийн бие. Гарын үсэг нь ЯГ энэ байтуудын дээр тооцогддог.',
          properties: {
            event: {
              type: 'string',
              description: 'received|dispatched|fulfilled|breach_notified|forwarded_up',
            },
            source_code: { type: 'string', description: 'Илгээгч платформын code' },
            service_code: { type: 'string' },
            external_ref: { type: 'string' },
            title: { type: 'string' },
            priority: { type: 'string' },
            payload: { type: 'object', additionalProperties: true },
            result: { type: 'object', additionalProperties: true },
            due_at: { type: 'string', format: 'date-time' },
            sent_at: { type: 'string', format: 'date-time' },
          },
          required: ['event', 'source_code', 'sent_at'],
        },
        AIAudioIn: {
          type: 'object',
          description:
            'Base64 кодлогдсон оролтын дуу (browser MediaRecorder chunk). ~700 KB base64 ≈ 30 секунд opus.',
          properties: {
            mime: {
              type: 'string',
              enum: [
                'audio/webm',
                'audio/ogg',
                'audio/wav',
                'audio/mpeg',
                'audio/mp3',
                'audio/mp4',
                'audio/m4a',
                'audio/aac',
                'audio/flac',
              ],
            },
            data: { type: 'string', maxLength: 716800, description: 'base64' },
          },
          required: ['mime', 'data'],
        },
        AIAudioOut: {
          type: 'object',
          description: 'Base64 кодлогдсон дуут гаралт (ихэвчлэн audio/wav).',
          properties: {
            mime: { type: 'string' },
            data: { type: 'string', description: 'base64' },
          },
          required: ['mime', 'data'],
        },
        AIChatResult: {
          type: 'object',
          properties: {
            reply: { type: 'string' },
            steps: {
              type: 'array',
              description: 'Backend дээр гүйцэтгэсэн tool дуудлагуудын ул мөр.',
              items: {
                type: 'object',
                properties: {
                  tool: { type: 'string' },
                  args: { type: 'object', additionalProperties: true },
                  result: { type: 'object', additionalProperties: true },
                },
                required: ['tool'],
              },
            },
            degraded: {
              type: 'boolean',
              description: 'Gemini унасан тул fallback мессеж буцсаныг заана.',
            },
          },
          required: ['reply'],
        },
        UserResponse: userResponseSchema,
        Role: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            key: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            is_system: {
              type: 'boolean',
              description: 'Системийн эрх — устгаж/түлхүүрийг өөрчилж болохгүй',
            },
            permissions: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'key', 'name', 'is_system', 'permissions'],
        },
        AuditEntry: {
          type: 'object',
          description:
            'hash-chained audit бүртгэлийн нэг мөр. chain_hash = SHA-256(prev_hash || canonical-json(entry)).',
          properties: {
            id: { type: 'integer' },
            occurred_at: { type: 'string', format: 'date-time' },
            actor_user_id: { type: 'string', format: 'uuid' },
            action: { type: 'string' },
            category: { type: 'string' },
            target: { type: 'string' },
            request_id: { type: 'string' },
            metadata: { type: 'object', additionalProperties: true },
            prev_hash: {
              type: 'string',
              description: 'Өмнөх мөрийн chain_hash; genesis мөрд байхгүй',
            },
            chain_hash: { type: 'string' },
          },
          required: ['id', 'occurred_at', 'action', 'chain_hash'],
        },
        SiteAppearance: {
          type: 'object',
          properties: {
            accent: {
              type: 'string',
              description: 'preset нэр (cobalt · teal · violet · emerald · amber) эсвэл #rrggbb',
            },
            font: { type: 'string', enum: ['inter', 'serif', 'system'] },
            style: { type: 'string', enum: ['comfortable', 'compact'] },
            theme: { type: 'string', enum: ['light', 'dark', 'system'] },
            updated_at: { type: 'string', format: 'date-time' },
          },
          required: ['accent', 'font', 'style', 'theme'],
        },
        Theme: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', maxLength: 80 },
            config: {
              type: 'object',
              additionalProperties: true,
              description: 'Чөлөөт JSONB: appearance (enum/hex-ээр шалгагдана) + landing текст/цэс',
            },
            is_active: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: ['string', 'null'], format: 'date-time' },
          },
          required: ['id', 'name', 'config', 'is_active', 'created_at'],
        },
        ThemeUpsert: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80 },
            config: { type: 'object', additionalProperties: true },
          },
          required: ['name'],
        },
        SecurityEvent: {
          type: 'object',
          description: 'RASP-style security event-ийн нэг мөр. Хоосон талбарууд хариунд ОРОХГҮЙ.',
          properties: {
            id: { type: 'integer', format: 'int64' },
            received_at: { type: 'string', format: 'date-time' },
            user_id: { type: 'string', format: 'uuid' },
            kind: {
              type: 'string',
              maxLength: 80,
              description: 'жишээ: rasp.jailbreak · integrity.tamper · anomaly.timing',
            },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            source: { type: 'string', maxLength: 80 },
            user_agent: { type: 'string', description: 'серверийн тэмдэглэсэн User-Agent' },
            ip: { type: 'string', description: 'trusted-proxy-aware клиент IP' },
            detail: {
              type: 'object',
              additionalProperties: true,
              description: 'PII-гүй нэмэлт нотолгоо',
            },
          },
          required: ['id', 'received_at', 'kind'],
        },
        Permission: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            label: { type: 'string' },
            category: { type: 'string' },
          },
          required: ['key', 'label', 'category'],
        },
      },
      parameters: {
        IntegrationProvider: {
          name: 'provider',
          in: 'path',
          required: true,
          schema: { type: 'string', enum: ['google-drive', 'dropbox', 'google-meet'] },
        },
        AppId: {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Апп-ын client_id (танигч)',
        },
        OrgId: {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Байгууллагын UUID',
        },
        OrgRegNo: {
          name: 'regNo',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Байгууллагын улсын бүртгэлийн дугаар',
        },
        GovAppId: {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Төрийн үйлчилгээний хүсэлтийн UUID',
        },
        RegistryServiceId: {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Бүртгэлийн үйлчилгээний UUID',
        },
      },
      requestBodies: {
        RegistryService: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  code: { type: 'string', maxLength: 64, description: 'зөвхөн үүсгэхэд; A-Z0-9_-' },
                  name: { type: 'string', minLength: 1, maxLength: 300 },
                  name_en: { type: 'string', maxLength: 300 },
                  description: { type: 'string', maxLength: 4000 },
                  authority: { type: 'string', maxLength: 300 },
                  legal_basis: { type: 'string', maxLength: 4000 },
                  channels: {
                    type: 'array',
                    items: {
                      type: 'string',
                      enum: ['office', 'e-mongolia', 'mobile', 'phone', 'post'],
                    },
                  },
                  fee: { type: 'integer' },
                  max_days: { type: 'integer', maximum: 3650 },
                  steps_count: { type: 'integer', maximum: 500 },
                  annual_volume: { type: 'integer' },
                  proactivity: {
                    type: 'string',
                    enum: ['information', 'online', 'once_only', 'proactive'],
                  },
                  life_event_id: { type: ['string', 'null'], format: 'uuid' },
                  assurance_level: { type: 'string', enum: ['low', 'substantial', 'high'] },
                  fulfilment: { type: 'string', enum: ['auto', 'manual'] },
                  has_discretion: { type: 'boolean' },
                  has_assessment: { type: 'boolean' },
                  sla_hours: { type: 'integer' },
                  tacit_approval: { type: 'boolean' },
                  online: { type: 'boolean' },
                },
                required: ['name', 'authority'],
              },
            },
          },
        },
        Application: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 128 },
                  app_type: { type: 'string', enum: ['web', 'spa', 'native', 'm2m'] },
                  redirect_uris: {
                    type: 'array',
                    items: { type: 'string', maxLength: 400 },
                    description:
                      'https заавал (эсвэл loopback дээр http); fragment хориотой. native төрөлд private-use scheme зөвшөөрөгдөнө. m2m-д хэрэггүй.',
                  },
                  tags: { type: 'array', items: { type: 'string', maxLength: 40 } },
                  service_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
                  enabled: { type: 'boolean' },
                },
                required: ['name', 'app_type'],
              },
            },
          },
        },
        GatewayService: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', minLength: 2, maxLength: 80 },
                  protocol: { type: 'string', enum: ['http', 'https'] },
                  host: { type: 'string', maxLength: 255 },
                  port: { type: 'integer', minimum: 1, maximum: 65535 },
                  path: { type: 'string', maxLength: 255 },
                  retries: { type: 'integer', minimum: 0, maximum: 10 },
                  connect_timeout_ms: { type: 'integer', minimum: 100, maximum: 600000 },
                  tags: { type: 'array', items: { type: 'string', maxLength: 40 } },
                  enabled: { type: 'boolean' },
                },
                required: ['name', 'host'],
              },
            },
          },
        },
        AssetURL: {
          required: true,
          description: 'Google Drive-д байршуулсан зургийн URL',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { url: { type: 'string', format: 'uri', maxLength: 1000 } },
                required: ['url'],
              },
            },
          },
        },
        RegistryEvidence: {
          required: true,
          description: 'Нотлох баримтын мета мэдээлэл (ХУР-т байгаа эсэх + эзэмшигч байгууллага).',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  code: { type: 'string', maxLength: 64 },
                  name: { type: 'string', minLength: 1, maxLength: 300 },
                  description: { type: 'string', maxLength: 4000 },
                  holder_agency: { type: 'string', maxLength: 300 },
                  source_system: { type: 'string', maxLength: 300 },
                  in_khur: { type: 'boolean' },
                  khur_service_code: { type: 'string', maxLength: 120 },
                },
                required: ['name'],
              },
            },
          },
        },
        Base64Upload: {
          required: true,
          description:
            'Файлын агуулга base64-оор (`data:` угтваргүй). Дээд хэмжээ 10 MiB — түүнээс дээш бол 400.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'string', description: 'base64 агуулга' },
                  mime: { type: 'string', maxLength: 255 },
                  name: { type: 'string', maxLength: 255 },
                },
                required: ['data'],
              },
            },
          },
        },
      },
      responses: {
        Ok: {
          description: 'OK',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/BaseResponse' } },
          },
        },
        Error: {
          description: 'Алдааны нэгдсэн дугтуй',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/BaseResponse' } },
          },
        },
        EIDStart: {
          description: 'eID session started',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/BaseResponse' },
                  {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          session_id: { type: 'string' },
                          device_link_url: {
                            type: 'string',
                            description: 'QR-д кодлох агуулга (session UUID). Push урсгалд хоосон.',
                          },
                          verification_code: { type: 'string' },
                          expires_at: { type: 'string' },
                        },
                        required: ['session_id'],
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },
    paths: {
      '/': {
        get: {
          summary: 'API-ийн мета мэдээлэл',
          tags: ['core'],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/BaseResponse' } },
              },
            },
          },
        },
      },
      '/config': {
        get: {
          summary: 'Нийтийн (нууц БИШ) тохиргоо',
          description:
            'SPA-д ажиллах үед хэрэгтэй тохиргоо: Google-ийн client_id (угаасаа ил утга), issuer, идэвхтэй боломжууд, болон аль гуравдагч талын интеграц ХОЛБОХ боломжтой нь. Нууц утга ЭНД ХЭЗЭЭ Ч ОРОХГҮЙ. Нэвтрэлт шаардахгүй.',
          tags: ['core'],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/BaseResponse' } },
              },
            },
          },
        },
      },
      '/audit': {
        get: {
          summary: 'Audit бүртгэлийг жагсаах',
          description:
            'hash-chained audit бүртгэлийг id БУУРАХААР (сүүлийнх эхэндээ) хуудаслан буцаана. `action` болон `actor` query-гээр шүүнэ. prev_hash/chain_hash-г оруулдаг тул ГАДНЫ аудитор гинжийг сервертэй харилцахгүйгээр өөрөө дахин тооцоолж шалгах боломжтой.',
          tags: ['audit'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'action', in: 'query', schema: { type: 'string' } },
            { name: 'actor', in: 'query', schema: { type: 'string', format: 'uuid' } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 50, maximum: 200 },
            },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: {
            '200': {
              description: 'Audit бүртгэл',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/AuditEntry' },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/audit/verify': {
        get: {
          summary: 'Audit гинжийн бүрэн бүтэн байдлыг шалгах',
          description:
            'Гинжийг genesis-ээс эхлэн ДАХИН ТООЦООЛЖ шалгана. Хоёр төрлийн эвдрэлийг ялгаж барина: (1) prev_hash нь өмнөх мөрийн chain_hash-тай таарахгүй — мөр устсан/оруулсан; (2) дахин тооцоолсон hash нь хадгалагдсантай таарахгүй — агуулга засварласан. Эвдэрсэн бол эвдрэл гарсан ЭХНИЙ мөрийн id-г буцаана.',
          tags: ['audit'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Гинжийн төлөв',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: {
                            type: 'object',
                            properties: {
                              ok: { type: 'boolean' },
                              broken_id: {
                                type: 'integer',
                                description: 'ok=false үед эвдэрсэн эхний мөрийн id',
                              },
                            },
                            required: ['ok'],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/auth/eid/start': {
        post: {
          summary: 'eID нэвтрэлт эхлүүлэх (QR / deep-link)',
          description:
            'Гадаад eID identity provider дээр QR/deep-link нэвтрэлтийг эхлүүлж, клиент харуулах session мэдээллийг буцаана. Body сонголттой: callbackUrl өгвөл SAME-DEVICE (утасны browser App2App), хоосон бол CROSS-DEVICE (desktop QR). Дараа нь /auth/eid/poll руу session_id-г дамжуулна.',
          tags: ['auth'],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { callbackUrl: { type: 'string', maxLength: 2048 } },
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/EIDStart' },
            '400': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
            '500': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/auth/eid/start-id': {
        post: {
          summary: 'eID нэвтрэлт эхлүүлэх (РД-аар push)',
          description:
            'Иргэний РД (national_id)-аар нэвтрэлтийг эхлүүлж, тухайн РД-тэй холбоотой бүртгэлтэй төхөөрөмж рүү баталгаажуулах prompt push хийлгэнэ. QR/device_link шаардлагагүй тул device_link_url хоосон буцна.',
          tags: ['auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    national_id: { type: 'string', minLength: 1, maxLength: 64 },
                    callbackUrl: { type: 'string', maxLength: 2048 },
                  },
                  required: ['national_id'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/EIDStart' },
            '400': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
            '500': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/auth/eid/poll': {
        post: {
          summary: 'eID session-ийн төлвийг асуух (long-poll)',
          description:
            'session_id-ийн төлвийг IdP-ээс long-poll-оор (≤25с) асууна. state нь RUNNING/COMPLETE/EXPIRED/REFUSED. COMPLETE үед identity-аар хэрэглэгчийг бүртгэж/шинэчилж, access+refresh токен хосыг буцаана. COMPLETE БИШ төлөвт токен ч, хэрэглэгчийн мэдээлэл ч БУЦААХГҮЙ. Тусдаа сул rate limiter (~120/мин) — long-poll-ийг 429-дэхгүй.',
          tags: ['auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    session_id: { type: 'string', minLength: 1, maxLength: 256 },
                    google_link_token: { type: 'string', maxLength: 128 },
                  },
                  required: ['session_id'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Session state (COMPLETE үед токентой)',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: {
                            allOf: [
                              { $ref: '#/components/schemas/UserResponse' },
                              {
                                type: 'object',
                                properties: {
                                  state: {
                                    type: 'string',
                                    enum: ['RUNNING', 'COMPLETE', 'EXPIRED', 'REFUSED'],
                                  },
                                  mfa_required: { type: 'boolean' },
                                  mfa_token: { type: 'string' },
                                },
                                required: ['state'],
                              },
                            ],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
            '500': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/auth/google': {
        post: {
          summary: 'Google OAuth callback',
          description:
            'Google authorization code-ийг боловсруулна. Холбогдсон account бол шууд нэвтрүүлж токен олгоно (linked=true); эхний удаа бол eID-ээр баталгаажуулах link_token буцаана (linked=false) — түүнийг /auth/eid/poll руу дамжуулна. mfa_required=true (super admin) бол токен БАЙХГҮЙ.',
          tags: ['auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    code: { type: 'string', minLength: 1, maxLength: 2048 },
                    redirect_uri: { type: 'string', minLength: 1, maxLength: 2048 },
                  },
                  required: ['code', 'redirect_uri'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Google login processed',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: {
                            type: 'object',
                            properties: {
                              linked: { type: 'boolean' },
                              user: { $ref: '#/components/schemas/UserResponse' },
                              link_token: { type: 'string' },
                              email: { type: 'string' },
                              mfa_required: { type: 'boolean' },
                              mfa_token: { type: 'string' },
                            },
                            required: ['linked'],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
            '500': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/auth/password/change': {
        put: {
          summary: 'Нууц үг солих',
          description:
            'Одоогийн нууц үгийг шалгаж шинээр сольж, цуцлалтын тасалбарыг тэмдэглэнэ — түүнээс ӨМНӨ олгогдсон бүх access/refresh токен татгалзагдана. Амжилтын дараа session cookie цэвэрлэгддэг тул хэрэглэгч дахин нэвтэрнэ. Шинэ нууц үг: 12–72 тэмдэгт, том/жижиг үсэг · цифр · тусгай тэмдэгт.',
          tags: ['auth'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    current_password: { type: 'string', minLength: 1, maxLength: 72 },
                    new_password: { type: 'string', minLength: 12, maxLength: 72 },
                  },
                  required: ['current_password', 'new_password'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/auth/google/link': {
        delete: {
          summary: 'Google холболтыг салгах',
          description:
            'Нэвтэрсэн хэрэглэгчийн Google холболтыг арилгана — Google-ээр дахин нэвтрэх боломжгүй болно. Холбох нь зөвхөн login урсгалаар хийгддэг.',
          tags: ['auth'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/auth/refresh': {
        post: {
          summary: 'Session-ийг эргүүлэх',
          description:
            'refresh токеныг ЭРГҮҮЛНЭ: шинэ access+refresh хос олгож, хуучин jti-г хүчингүй болгоно. Токен НЭГ л удаа хэрэглэгдэнэ (атом GetDel) тул replay амжилтгүй. Идэвхгүй бүртгэл (403), устгагдсан хэрэглэгч (401) болон credential эргүүлэхээс өмнөх токен (401) татгалзагдана.',
          tags: ['auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { refresh_token: { type: 'string', minLength: 1, maxLength: 4096 } },
                  required: ['refresh_token'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Шинэ токен хос',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: { data: { $ref: '#/components/schemas/UserResponse' } },
                      },
                    ],
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/auth/logout': {
        post: {
          summary: 'Session-ийг хаах',
          description:
            'refresh токены jti-г устгана. access_token өгвөл түүний jti-г мөн deny-list-д нэмж, хугацаа дуусахаас өмнө ШУУД хүчингүй болгоно (auth middleware хүсэлт бүрд шалгадаг).',
          tags: ['auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    refresh_token: { type: 'string', minLength: 1, maxLength: 4096 },
                    access_token: { type: 'string', maxLength: 4096 },
                  },
                  required: ['refresh_token'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/rbac/me': {
        get: {
          summary: 'Өөрийн эрхүүдийг авах',
          description:
            'Нэвтэрсэн хэрэглэгчийн эрхийн түлхүүрүүдийг буцаана — frontend цэсээ шүүхэд хэрэглэнэ. Нэвтэрсэн хэрэглэгч БҮРТ нээлттэй. admin/superadmin нь каталогийн бүх эрхийг автоматаар авна.',
          tags: ['rbac'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Эрхийн түлхүүрүүд',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: { data: { type: 'array', items: { type: 'string' } } },
                      },
                    ],
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/rbac/roles': {
        get: {
          summary: 'Эрхүүдийг оноогдсон permission-уудтай нь жагсаах (RBAC matrix)',
          tags: ['rbac'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Эрхийн жагсаалт',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: { type: 'array', items: { $ref: '#/components/schemas/Role' } },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
        post: {
          summary: 'Шинэ эрх үүсгэх',
          description:
            'Системийн БИШ (is_system=false) эрх үүсгэнэ. key хоосон бол name-ээс slugify хийнэ ("Sales Manager" → "sales_manager"). Латин/тоо биш тэмдэгт хасагдана.',
          tags: ['rbac'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    key: { type: 'string', maxLength: 40 },
                    name: { type: 'string', minLength: 2, maxLength: 50 },
                    description: { type: 'string', maxLength: 200 },
                    permissions: { type: 'array', items: { type: 'string', maxLength: 40 } },
                  },
                  required: ['name'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Үүсгэгдсэн эрх',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: { data: { $ref: '#/components/schemas/Role' } },
                      },
                    ],
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/rbac/permissions': {
        get: {
          summary: 'Эрхийн каталог',
          tags: ['rbac'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Каталог',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Permission' },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/rbac/roles/{id}': {
        put: {
          summary: 'Эрхийн нэр/тайлбарыг шинэчлэх',
          description:
            'key болон is_system ХӨНДӨГДӨХГҮЙ. `permissions` талбар БАЙХГҮЙ бол эрхийн багцыг хөндөхгүй; хоосон массив бол бүх эрхийг хасна.',
          tags: ['rbac'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', minLength: 2, maxLength: 50 },
                    description: { type: 'string', maxLength: 200 },
                    permissions: { type: 'array', items: { type: 'string', maxLength: 40 } },
                  },
                  required: ['name'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
        delete: {
          summary: 'Эрхийг устгах',
          description:
            'Системийн эрх (409) болон ХЭРЭГЛЭГЧИД ОНООГДСОН эрх (409) устгагдахгүй — эс бөгөөс хэрэглэгчид эрхгүй болно.',
          tags: ['rbac'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/rbac/roles/{id}/permissions': {
        put: {
          summary: 'Эрхийн permission багцыг бүхэлд нь солих',
          description:
            'Багцыг БҮХЭЛД НЬ солино (replace) — нэг транзакцид хуучныг устгаж шинийг оруулна. Хоосон массив нь бүх эрхийг хасна. Каталогт байхгүй түлхүүр нь 400.',
          tags: ['rbac'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    permissions: { type: 'array', items: { type: 'string', maxLength: 40 } },
                  },
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/core/users': {
        get: {
          summary: 'Gerege Core — иргэн хайх',
          description:
            'core.gerege.mn `/api/user/find` руу `search_text`-ээр (core_id эсвэл регистрийн дугаар) хайж, Core-ийн хариуг ДАМЖУУЛНА. ҮНДЭСНИЙ БҮРТГЭЛИЙН PII-д хүрдэг тул `users.manage` эрх шаардана. CORE_API_TOKEN тохируулаагүй бол домэйн инерт: 500 биш, `data.message`-д тохируулах зааврыг буцаана.',
          tags: ['core'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'search_text',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'core_id эсвэл регистрийн дугаар',
            },
          ],
          responses: {
            '200': {
              description: 'Core-ийн хариу (pass-through)',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/BaseResponse' } },
              },
            },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '500': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/core/organizations': {
        get: {
          summary: 'Gerege Core — байгууллага хайх',
          description:
            'core.gerege.mn `/api/organization/find` руу `search_text`-ээр (регистр эсвэл нэр) хайж, хариуг ДАМЖУУЛНА. `users.manage` эрх шаардана.',
          tags: ['core'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'search_text',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'регистр эсвэл байгууллагын нэр',
            },
          ],
          responses: {
            '200': {
              description: 'Core-ийн хариу (pass-through)',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/BaseResponse' } },
              },
            },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '500': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/org': {
        post: {
          summary: 'Байгууллага үүсгэх',
          description:
            'Үүсгэгч АВТОМАТААР owner гишүүн болно (ижил транзакцид) — "эзэнгүй байгууллага" төлөв үүсэхгүй. reg_no давхцвал 409.',
          tags: ['org'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    reg_no: { type: 'string', maxLength: 40 },
                    name: { type: 'string', minLength: 2, maxLength: 200 },
                    name_latin: { type: 'string', maxLength: 200 },
                  },
                  required: ['reg_no', 'name'],
                },
              },
            },
          },
          responses: {
            '201': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
        get: {
          summary: 'Миний байгууллагууд',
          description: 'Дуудагч гишүүн болсон бүх идэвхтэй байгууллага (шинэ нь эхэндээ).',
          tags: ['org'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/org/lookup/{regNo}': {
        get: {
          summary: 'Байгууллагыг регистрээр хайх',
          description:
            'RLS-ийн гишүүнчлэлийн харагдах байдалд захирагдана — гишүүн биш бол 404 (байгууллага байгаа эсэхийг илчлэхгүй).',
          tags: ['org'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/OrgRegNo' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/org/{id}': {
        get: {
          summary: 'Байгууллага харах',
          description: '"Байхгүй" ба "эрхгүй" НЭГ ижил 404 болно (нууцлал).',
          tags: ['org'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/OrgId' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/org/{id}/members': {
        get: {
          summary: 'Байгууллагын гишүүд',
          description: 'Дуудагч тухайн байгууллагын гишүүн байх ЁСТОЙ — эс бөгөөс 403.',
          tags: ['org'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/OrgId' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
        post: {
          summary: 'Гишүүн нэмэх',
          description:
            'Дуудагч owner эсвэл admin байх ЁСТОЙ. `owner` дүрийг ЗӨВХӨН owner олгоно — org admin өөрөөсөө дээш дүр олгож эрх ахиулахаас сэргийлнэ. role хоосон бол `member`.',
          tags: ['org'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/OrgId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user_id: { type: 'string', format: 'uuid' },
                    role: { type: 'string', enum: ['owner', 'admin', 'member'] },
                  },
                  required: ['user_id'],
                },
              },
            },
          },
          responses: {
            '201': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/org/{id}/members/{userID}': {
        put: {
          summary: 'Гишүүний дүр солих',
          description:
            'OWNER-ийн дүрийг ӨӨРЧИЛЖ БОЛОХГҮЙ (400) — эс бөгөөс admin owner-ыг member болгож бууруулаад дараа нь хасч, "owner-ыг хасахгүй" хамгаалалтыг тойрно.',
          tags: ['org'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { $ref: '#/components/parameters/OrgId' },
            {
              name: 'userID',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { role: { type: 'string', enum: ['owner', 'admin', 'member'] } },
                  required: ['role'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
        delete: {
          summary: 'Гишүүн хасах',
          description: 'OWNER-ийг хасаж БОЛОХГҮЙ (400) — байгууллага эзэнгүй үлдэхээс сэргийлнэ.',
          tags: ['org'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { $ref: '#/components/parameters/OrgId' },
            {
              name: 'userID',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/users/me/eid/organizations': {
        get: {
          summary: 'Төлөөлдөг байгууллагууд (eID)',
          description:
            'Нэвтэрсэн иргэний eID-д бүртгэлтэй, төлөөлж чадах байгууллагууд. eID-ээр нэвтрээгүй (Google) хэрэглэгчид ХООСОН жагсаалт — алдаа биш.',
          tags: ['eid-profile'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
        post: {
          summary: 'Байгууллага холбох (eID)',
          description:
            'Улсын бүртгэлээс (XYP) байгууллагыг регистрээр хайж, иргэнийг eID дээр төлөөлөл болгон холбоно. ЭРХИЙН шалгалт eidmongolia талд: иргэний РД нь захирал / үүсгэн байгуулагч / хувь эзэмшигчийн жагсаалтад байх ёстой — эс бөгөөс 403.',
          tags: ['eid-profile'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { reg_no: { type: 'string', minLength: 4, maxLength: 16 } },
                  required: ['reg_no'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/users/me/eid/organizations/{regNo}': {
        delete: {
          summary: 'Байгууллага салгах (eID)',
          description: 'Өөрийн төлөөллийг цуцлана. Зөвхөн ADMIN эрхтэй хүн салгаж чадна.',
          tags: ['eid-profile'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/OrgRegNo' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/users/me/eid/organizations/{regNo}/signers': {
        get: {
          summary: 'Байгууллагын гарын үсэг зурагчид (eID)',
          tags: ['eid-profile'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/OrgRegNo' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
        post: {
          summary: 'Гарын үсэг зурагч нэмэх (eID)',
          description:
            'Өөр eID иргэнийг MANAGER эрхтэй зурагч болгож нэмнэ. Тэр хүн рүү sign-push илгээгдэж, ӨӨРӨӨ PIN-ээрээ баталгаажуулах хүртэл төлөөлөл нь PENDING (хүчингүй) — нэг талын нэмэлт болохгүй. Хариунд pending_confirmation ирнэ.',
          tags: ['eid-profile'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/OrgRegNo' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    signer_reg_no: { type: 'string', minLength: 8, maxLength: 20 },
                    role: { type: 'string', maxLength: 100 },
                  },
                  required: ['signer_reg_no'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
          },
        },
        delete: {
          summary: 'Гарын үсэг зурагч хасах (eID)',
          tags: ['eid-profile'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { $ref: '#/components/parameters/OrgRegNo' },
            {
              name: 'signer',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Хасах зурагчийн РД',
            },
          ],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/users/me/eid/organizations/{regNo}/signers/resend': {
        post: {
          summary: 'Баталгаажуулах хүсэлт дахин илгээх (eID)',
          description: 'PENDING зурагч руу eID sign-push баталгаажуулалтыг дахин илгээнэ.',
          tags: ['eid-profile'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { $ref: '#/components/parameters/OrgRegNo' },
            {
              name: 'signer',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Зурагчийн РД',
            },
          ],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/users/me/eid/summary': {
        get: {
          summary: 'eID PKI самбарын нэгдсэн тоо',
          description:
            'Гэрчилгээ / auth-sign / төхөөрөмж / байгууллагын нэгдсэн тоолол. RP-д PKI_READ эрх олгогдоогүй бол 403 (UI "эрх хүлээгдэж байна" харуулна). SSO eID proxy тохируулагдсан бол энэ өгөгдөл SSO-гоор дамжина — RP-д PKI_READ шаардахгүй.',
          tags: ['eid-profile'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/users/me/eid/certificates': {
        get: {
          summary: 'eID гэрчилгээний жагсаалт + тоо',
          tags: ['eid-profile'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/users/me/eid/devices': {
        get: {
          summary: 'eID холбоотой төхөөрөмжүүд',
          tags: ['eid-profile'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/users/me/eid/activity': {
        get: {
          summary: 'eID үйлдлийн түүх (RP-scoped)',
          tags: ['eid-profile'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/applications': {
        get: {
          summary: 'Апп-уудыг жагсаах',
          description:
            'API Gateway consumer + SSO RP-ийг нэгтгэсэн бүртгэл. Апп бүр яг НЭГ OAuth2 client-тэй (client_id нь танигч). `secret` талбар энд ХЭЗЭЭ Ч орохгүй.',
          tags: ['applications'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
        post: {
          summary: 'Апп үүсгэх',
          description:
            'Confidential (web/m2m) апп-ын `client_secret` хариунд НЭГ УДАА буцна — DB-д зөвхөн Argon2id hash хадгалагдана. Public (spa/native) апп-д secret ОГТ үүсэхгүй (auth method нь `none`, PKCE заавал). Зөвшөөрсөн gateway service-үүд нь `svc:*` OAuth scope болно.',
          tags: ['applications'],
          security: [{ bearerAuth: [] }],
          requestBody: { $ref: '#/components/requestBodies/Application' },
          responses: {
            '201': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/applications/{id}': {
        get: {
          summary: 'Апп харах',
          tags: ['applications'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/AppId' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
        put: {
          summary: 'Апп шинэчлэх',
          description: 'client_secret-д ХҮРЭХГҮЙ — түүнийг зөвхөн rotate-secret / secret сольно.',
          tags: ['applications'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/AppId' }],
          requestBody: { $ref: '#/components/requestBodies/Application' },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
        delete: {
          summary: 'Апп устгах',
          description: 'ИДЕМПОТЕНТ — аль хэдийн байхгүй бол ч 200.',
          tags: ['applications'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/AppId' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/applications/{id}/rotate-secret': {
        post: {
          summary: 'client_secret эргүүлэх',
          description:
            'Шинэ secret хариунд НЭГ УДАА буцна. Public (spa/native) апп-д secret байхгүй тул 400.',
          tags: ['applications'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/AppId' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/applications/{id}/secret': {
        put: {
          summary: 'client_secret-ыг гараар оноох',
          description:
            'Гадаад RP-ийн аль хэдийн тохируулсан secret-тэй тулгах хэрэгцээнд. 16–128 тэмдэгт.',
          tags: ['applications'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/AppId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { secret: { type: 'string', minLength: 16, maxLength: 128 } },
                  required: ['secret'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/applications/{id}/services': {
        put: {
          summary: 'Апп-ын зөвшөөрсөн service-үүдийг солих',
          description: 'Service-үүд нь client-ийн `svc:*` OAuth scope болж хадгалагдана.',
          tags: ['applications'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/AppId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    service_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
                  },
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gateway/overview': {
        get: {
          summary: 'API Gateway dashboard (сүүлийн 24 цаг)',
          description:
            'Хүсэлтийн тоо/алдааны хувь/дундаж ба p95 хоцролт, статусын хуваарилалт, хамгийн их хүсэлттэй замууд. Тоологдох утгууд (services/applications/эрх) нь бүх хугацааных; телеметр нь 24 цагийнх.',
          tags: ['gateway'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gateway/logs': {
        get: {
          summary: 'Gateway хүсэлтийн лог',
          description:
            'ЗӨВХӨН гуравдагч талын RP-ийн зам (`/rp/sign`, `/api/v1/provider`) лог-д ордог — платформын өөрийн дотоод API трафик телеметрийг бохирдуулахгүй.',
          tags: ['gateway'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 100, maximum: 200 },
            },
          ],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gateway/services': {
        get: {
          summary: 'Upstream service-үүд',
          tags: ['gateway'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
        post: {
          summary: 'Upstream service үүсгэх',
          description:
            'Дутуу талбарууд хэвийшинэ: протокол http/https биш бол `https`, порт хүрээнээс гадуур бол протоколын өгөгдмөл (80/443), зам хоосон бол `/`, timeout тэг бол 60000мс. Нэрээс OAuth scope (`svc:<нэр>`) автоматаар үүснэ — тэр нь application-д оноогдох эрх болно.',
          tags: ['gateway'],
          security: [{ bearerAuth: [] }],
          requestBody: { $ref: '#/components/requestBodies/GatewayService' },
          responses: {
            '201': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gateway/services/{id}': {
        put: {
          summary: 'Upstream service шинэчлэх',
          tags: ['gateway'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: { $ref: '#/components/requestBodies/GatewayService' },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
        delete: {
          summary: 'Upstream service устгах',
          tags: ['gateway'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/ai/chat': {
        post: {
          summary: 'AI туслахтай чатлах (текст/дуут мессеж)',
          description:
            'Хэрэглэгчийн мессежийг (текст эсвэл audio — дуут мессежийг AI шууд ойлгоно) Gemini pipeline-аар боловсруулж Монгол хариулт буцаана. AI шаардлагатай үед backend tool-уудыг (function calling) ашигладаг — гүйцэтгэлийг СЕРВЕР хийнэ, model зөвхөн сонголт хийнэ; алхмууд `steps`-д ил гарна. AI үйлчилгээ түр унавал `degraded=true` + fallback мессеж буцаана (5xx БИШ). Rate limit ~20 req/мин.',
          tags: ['ai'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', maxLength: 4000 },
                    audio: { $ref: '#/components/schemas/AIAudioIn' },
                    history: {
                      type: 'array',
                      maxItems: 20,
                      items: {
                        type: 'object',
                        properties: {
                          role: { type: 'string', enum: ['user', 'model'] },
                          text: { type: 'string', maxLength: 4000 },
                        },
                        required: ['role', 'text'],
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'AI хариулт',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: { data: { $ref: '#/components/schemas/AIChatResult' } },
                      },
                    ],
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/ai/stt': {
        post: {
          summary: 'Яриаг текст болгох (STT)',
          description:
            'Base64 кодлогдсон audio (webm/ogg/wav/mp3 г.м.)-г Gemini-ээр текст болгоно. Яриа илрээгүй бол хоосон `text` буцаана.',
          tags: ['ai'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { audio: { $ref: '#/components/schemas/AIAudioIn' } },
                  required: ['audio'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/ai/tts': {
        post: {
          summary: 'Текстийг яриа болгох (TTS)',
          description:
            'Текстийг Gemini TTS model-ээр дуут (audio/wav, base64) болгоно. Түүхий PCM гаралтад WAV толгой сервер талд нэмэгддэг тул browser шууд тоглуулна. `voice` нь сонголттой prebuilt дуу хоолой (өгөгдмөл: Kore).',
          tags: ['ai'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    text: { type: 'string', minLength: 1, maxLength: 2000 },
                    voice: { type: 'string', maxLength: 40, pattern: '^[a-zA-Z0-9]*$' },
                  },
                  required: ['text'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'WAV audio (base64)',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: { data: { $ref: '#/components/schemas/AIAudioOut' } },
                      },
                    ],
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/ai/translate': {
        post: {
          summary: 'Шууд (live) орчуулга',
          description:
            'Текст эсвэл audio-г зорилтот хэл рүү орчуулна. Audio өгвөл ЭХЛЭЭД STT хийгээд орчуулдаг; `speak=true` бол орчуулгын дуут (TTS) хувилбарыг хамт буцаана. Live орчуулга = богино audio chunk-уудыг энэ endpoint руу дараалан илгээх урсгал. Чимээгүй chunk-д хоосон үр дүн (алдаа БИШ) буцна.',
          tags: ['ai'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    text: { type: 'string', maxLength: 4000 },
                    audio: { $ref: '#/components/schemas/AIAudioIn' },
                    target_lang: { type: 'string', minLength: 2, maxLength: 20 },
                    speak: { type: 'boolean' },
                  },
                  required: ['target_lang'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Орчуулга',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: {
                            type: 'object',
                            properties: {
                              source_text: { type: 'string' },
                              translated: { type: 'string' },
                              audio: { $ref: '#/components/schemas/AIAudioOut' },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/admin/users': {
        get: {
          summary: 'Хэрэглэгчдийг жагсаах',
          description: '`users.manage` эрхээр. Query: `offset`, `limit` (≤200), `role`, `active`.',
          tags: ['admin'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
            { name: 'role', in: 'query', schema: { type: 'integer' } },
            { name: 'active', in: 'query', schema: { type: 'string', enum: ['true'] } },
          ],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
        post: {
          summary: 'Иргэнийг регистрээр урьдчилан бүртгэх (private платформ)',
          description:
            'Private горимд ЗӨВХӨН ингэж бүртгэсэн иргэн Government SSO-оор нэвтэрнэ. Иргэн хожим нэвтрэхэд энэ мөр civil_id/sso_sub-оор холбогдоно. admin/superadmin role-ыг ЗӨВХӨН super admin ононо (шалгалт usecase давхаргад — `users.manage` эрхтэй энгийн admin өөрийгөө дэвшүүлж чадахгүй).',
          tags: ['admin'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    register: { type: 'string', minLength: 8, maxLength: 20 },
                    first_name: { type: 'string', maxLength: 100 },
                    last_name: { type: 'string', maxLength: 100 },
                    first_name_en: { type: 'string', maxLength: 100 },
                    last_name_en: { type: 'string', maxLength: 100 },
                    role_id: { type: 'integer', minimum: 1, maximum: 4 },
                  },
                  required: ['register'],
                },
              },
            },
          },
          responses: {
            '201': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/admin/users/{id}/role': {
        put: {
          summary: 'Хэрэглэгчийн эрхийг солих',
          description:
            'Дуудагчийн role нь usecase руу ДАМЖИНА: энгийн admin нь зөвхөн manager ↔ user солино, admin эрхийг ЗӨВХӨН super admin олгож/хасна.',
          tags: ['admin'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { role_id: { type: 'integer', minimum: 1, maximum: 4 } },
                  required: ['role_id'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/admin/users/{id}/active': {
        put: {
          summary: 'Хэрэглэгчийг идэвхжүүлэх/идэвхгүй болгох',
          tags: ['admin'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { active: { type: 'boolean' } },
                  required: ['active'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/admin/users/{id}': {
        delete: {
          summary: 'Хэрэглэгчийг зөөлөн устгах',
          tags: ['admin'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/auth/superadmin/onboard/google': {
        post: {
          summary: 'Super admin бүртгэл — Google алхам (урилгын хаалга)',
          description:
            'OAuth code-ийг солиж и-мэйлийг **урилгын allow-list**-ийн эсрэг шалгана. Урилгагүй / аль хэдийн ашигласан урилга / баталгаажаагүй Google и-мэйл нь **403**. Цаашдын бүх алхам УРИЛГЫН и-мэйл дээр ажиллана (Google-ийн буцаасан утгад итгэхгүй). Хариунд `onboard_token`.',
          tags: ['superadmin'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    code: {
                      type: 'string',
                    },
                    redirect_uri: {
                      type: 'string',
                    },
                  },
                  required: ['code'],
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
            '429': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/auth/superadmin/onboard/eid/start': {
        post: {
          summary: 'Бүртгэлийн eID алхмыг QR-аар эхлүүлэх',
          description:
            '`callback_url` хоосон бол cross-device (desktop QR); өгвөл same-device (mobile deep link).',
          tags: ['superadmin'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    onboard_token: {
                      type: 'string',
                    },
                    callback_url: {
                      type: 'string',
                    },
                  },
                  required: ['onboard_token'],
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
            '429': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/auth/superadmin/onboard/eid/start-id': {
        post: {
          summary: 'Бүртгэлийн eID алхмыг РД-аар эхлүүлэх (push)',
          description: 'Иргэний регистрийн дугаараар бүртгэлтэй төхөөрөмж рүү push илгээнэ.',
          tags: ['superadmin'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    onboard_token: {
                      type: 'string',
                    },
                    national_id: {
                      type: 'string',
                    },
                    callback_url: {
                      type: 'string',
                    },
                  },
                  required: ['onboard_token', 'national_id'],
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
            '429': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/auth/superadmin/onboard/eid/poll': {
        post: {
          summary: 'Бүртгэлийн eID session-ийг long-poll хийх',
          description:
            '⚠️ Энэ алхамд **session ОЛГОГДОХГҮЙ, хэрэглэгч ҮҮСЭХГҮЙ** — eID нь зөвхөн "урьсан хүн бодитоор хэн бэ" гэдгийг тогтооно. COMPLETE үед identity нь pending session-д баригдаж алхам `email` болно. ~2.5с тутам дуудагддаг тул тусдаа СУЛ rate limiter-тэй.',
          tags: ['superadmin'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    onboard_token: {
                      type: 'string',
                    },
                    session_id: {
                      type: 'string',
                    },
                  },
                  required: ['onboard_token', 'session_id'],
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
            '429': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/auth/superadmin/onboard/email/send': {
        post: {
          summary: 'Урилгын и-мэйл рүү OTP илгээх',
          description:
            'OTP-г Verify API үүсгэж илгээнэ; сервер зөвхөн request_id-г богино TTL-тэй хадгална.',
          tags: ['superadmin'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    onboard_token: {
                      type: 'string',
                    },
                  },
                  required: ['onboard_token'],
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
            '429': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/auth/superadmin/onboard/email/verify': {
        post: {
          summary: 'И-мэйлийн OTP-г шалгах',
          description:
            'Буруу код нь 400. Оролдлого хэтэрвэл кодыг цуцалж 403 өгнө (дахин илгээх шаардлагатай).',
          tags: ['superadmin'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    onboard_token: {
                      type: 'string',
                    },
                    code: {
                      type: 'string',
                    },
                  },
                  required: ['onboard_token', 'code'],
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
            '429': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/auth/superadmin/onboard/totp/init': {
        post: {
          summary: 'TOTP тохируулга эхлүүлэх (otpauth URI)',
          description:
            'Дахин дуудвал ШИНЭ secret үүснэ (QR алдсан тохиолдолд). Secret нь ХАРААХАН идэвхжээгүй — зөвхөн `totp/verify` амжилттай болоход л шифрлэгдэж DB-д бичигдэнэ.',
          tags: ['superadmin'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    onboard_token: {
                      type: 'string',
                    },
                  },
                  required: ['onboard_token'],
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
            '429': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/auth/superadmin/onboard/totp/verify': {
        post: {
          summary: 'TOTP кодыг шалгаж бүртгэлийг ТӨГСГӨХ',
          description:
            'Амжилттай бол super admin үүсч session олгогдоно. **Энгийн текст нөөц кодууд ЗӨВХӨН энэ хариунд, ЗӨВХӨН НЭГ УДАА** буцна (DB-д зөвхөн SHA-256 hash; дахин авах зам БАЙХГҮЙ). Урилга `accepted` болж дахин ашиглагдахгүй.',
          tags: ['superadmin'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    onboard_token: {
                      type: 'string',
                    },
                    code: {
                      type: 'string',
                    },
                  },
                  required: ['onboard_token', 'code'],
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
            '429': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/auth/superadmin/mfa': {
        post: {
          summary: 'Super admin нэвтрэлтийн 2 дахь шат (MFA)',
          description:
            '`/auth/google` эсвэл `/auth/eid/poll`-ийн буцаасан `mfa_token`-ийг TOTP код ЭСВЭЛ нөөц кодоор баталгаажуулж session олгоно. Нөөц код НЭГ УДААГИЙН. Токен тус бүрийн буруу оролдлого хязгаарт хүрмэгц токен ЦУЦЛАГДАНА (дахин нэвтрэх шаардлагатай). MFA идэвхгүй / super admin биш бол 403 (fail-closed).',
          tags: ['superadmin'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    mfa_token: {
                      type: 'string',
                    },
                    code: {
                      type: 'string',
                    },
                  },
                  required: ['mfa_token', 'code'],
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
            '429': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/admin/ai/prompts': {
        get: {
          summary: 'AI prompt давхаргуудыг жагсаах',
          description:
            'Тохируулдаг prompt давхаргуудыг (`scope` — хамрах хүрээ, `instructions` — нэмэлт заавар) буцаана. Suurь (base) дүрэм — хэл, хамрах хүрээний сахилт, prompt-injection эсэргүүцэл — КОДОД хатуу бичигдсэн тул энд харагдахгүй, ХЭЗЭЭ Ч өөрчлөгдөхгүй.',
          tags: ['admin'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/admin/ai/prompts/{key}': {
        put: {
          summary: 'AI prompt давхаргыг шинэчлэх',
          description:
            'Нэг давхаргын (`scope` | `instructions`) агуулгыг солино. Өөрчлөлт нэн даруй үйлчилнэ (prompt кэш хүчингүй болдог). Танихгүй key нь 400 — давхаргын жагсаалт хаалттай (migration-д seed хийгдсэн мөрүүд л шинэчлэгдэнэ).',
          tags: ['admin'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'key',
              in: 'path',
              required: true,
              schema: { type: 'string', enum: ['scope', 'instructions'] },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { content: { type: 'string', maxLength: 4000 } },
                  required: ['content'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/life-events': {
        get: {
          summary: 'Амьдралын үйл явдлууд (иргэнд)',
          description: 'Нийтлэгдсэн үйлчилгээг амьдралын үйл явдлаар бүлэглэж харуулна.',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/applications/{id}/cancel': {
        post: {
          summary: 'Хүсэлтээ цуцлах',
          description:
            'ЗӨВХӨН өөрийн хүсэлт (RLS + WHERE user_id). Аль хэдийн шийдвэрлэгдсэн хүсэлтийг цуцлах нь төлөвийн машины зөрчил — 409.',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/GovAppId' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/notifications': {
        get: {
          summary: 'Мэдэгдлүүд',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/notifications/read-all': {
        post: {
          summary: 'Бүх мэдэгдлийг уншсанд тооцох',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/notifications/{id}/read': {
        post: {
          summary: 'Мэдэгдлийг уншсанд тооцох',
          description: 'ИДЕМПОТЕНТ. ЗӨВХӨН өөрийн мэдэгдэл (RLS).',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/payments': {
        get: {
          summary: 'Төлбөрүүд',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/payments/{id}/pay': {
        post: {
          summary: 'Төлбөр төлөх (симуляц)',
          description:
            'ЗАГВАР төлбөр — бодит төлбөрийн систем холбогдоогүй. Аль хэдийн төлөгдсөн дээр 409.',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/appointments': {
        get: {
          summary: 'Цаг захиалгууд',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
        post: {
          summary: 'Цаг захиалах',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    service_id: { type: 'string', format: 'uuid' },
                    scheduled_at: { type: 'string', description: 'ISO-8601' },
                    location: { type: 'string', maxLength: 300 },
                    note: { type: 'string', maxLength: 2000 },
                  },
                  required: ['scheduled_at'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/appointments/{id}/cancel': {
        post: {
          summary: 'Цаг захиалгаа цуцлах',
          description: 'ЗӨВХӨН өөрийн захиалга (RLS).',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/officer/stats': {
        get: {
          summary: 'Дарааллын статистик',
          description: '`gov.review` эрх + `officer` RLS үүрэг.',
          tags: ['gov-officer'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/officer/queue/{id}': {
        get: {
          summary: 'Дарааллын нэг хүсэлтийн дэлгэрэнгүй',
          tags: ['gov-officer'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/GovAppId' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/officer/queue/{id}/complete': {
        post: {
          summary: 'Хүсэлтийг дуусгах',
          description:
            'Зөвшөөрөгдсөн (approved) хүсэлтийг ГАРАЛТ хүргэгдсэний дараа дуусгана. Төлөвийн машин зөрчигдвөл 409.',
          tags: ['gov-officer'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/GovAppId' }],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { note: { type: 'string', maxLength: 2000 } },
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/officer/queue/{id}/request-info': {
        post: {
          summary: 'Нэмэлт мэдээлэл шаардах',
          description:
            'Хүсэлтийг `info_requested` төлөвт оруулж иргэнд мэдэгдэнэ; иргэн `/gov/applications/{id}/provide-info`-оор хариулна.',
          tags: ['gov-officer'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/GovAppId' }],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { note: { type: 'string', maxLength: 2000 } },
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/services': {
        get: {
          summary: 'Иргэний үйлчилгээний каталог',
          description:
            'Идэвхтэй (`enabled` + `lifecycle=active`) үйлчилгээнүүд. Амьдралын үйл явдлын мастер нь РЕГИСТР — паспорт дээрх өөрчлөлт энд шууд тусна.',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/overview': {
        get: {
          summary: 'Иргэний нүүр хуудасны нэгтгэл',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/applications': {
        get: {
          summary: 'Миний хүсэлтүүд',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
        post: {
          summary: 'Хүсэлт илгээх',
          description:
            'ГОЛ САЛААЛТ: `fulfilment=auto` үйлчилгээ НЭГ транзакцид шууд биелж лавлагаа олгогдоно (`auto_issued=true`) — менежерийн дараалалд ОРОХГҮЙ. `manual` бол хүсэлт бүртгэгдэж SLA цаг эхэлж, EU 2018/1724 Art.6(2)(b)-ийн дагуу "хүлээн авсан" мэдэгдэл өгнө. Үнэлэх эрх/үнэлгээний зайтай гэж тэмдэглэгдсэн `auto` үйлчилгээ автоматаар биелэхгүй — гараар хянуулах руу буурна.',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    service_id: { type: 'string', format: 'uuid' },
                    note: { type: 'string', maxLength: 2000 },
                    payload: { type: 'object', additionalProperties: true },
                  },
                  required: ['service_id'],
                },
              },
            },
          },
          responses: {
            '201': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/applications/{id}/timeline': {
        get: {
          summary: 'Хүсэлтийн явц (timeline)',
          description:
            'Эзэмшлийг ЭХЛЭЭД шалгана — "байхгүй" ба "чинийх биш" хоёр ИЖИЛ 404 (өөр хүний хүсэлт байгаа эсэхийг тандах боломжгүй).',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/GovAppId' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/applications/{id}/provide-info': {
        post: {
          summary: 'Нэмэлт мэдээлэл өгөх',
          description:
            '`info_required` төлөвт байгаа хүсэлтэд иргэн мэдээлэл өгснийг бүртгэж SLA цагийг ҮРГЭЛЖЛҮҮЛНЭ — `due_at` нь зогссон хугацаагаар хойшилно (иргэний удаашрал байгууллагын зөрчил болж бүртгэгдэхгүй).',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/GovAppId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { note: { type: 'string', maxLength: 2000 } },
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/officer/queue': {
        get: {
          summary: 'Менежерийн дараалал',
          description:
            'ХОЁР давхар хамгаалалт: `gov.review` эрх + DB давхаргад `officer` RLS үүрэг (эрхийн шалгалт алдаатай байсан ч users/payments/appointments ХААЛТТАЙ). `assigned_to` нь ЗӨВХӨН `me` — өөр хүний ID шургуулах боломжгүй.',
          tags: ['gov-officer'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'assigned_to', in: 'query', schema: { type: 'string', enum: ['me'] } },
            { name: 'overdue', in: 'query', schema: { type: 'boolean' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/officer/queue/{id}/assign': {
        post: {
          summary: 'Хүсэлтийг өөртөө авах',
          description:
            'SQL WHERE guard нь зэрэг ирсэн 2 дахь оролдлогыг 409-ээр таслана (өөр менежерийнхийг булаах боломжгүй).',
          tags: ['gov-officer'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/GovAppId' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/officer/queue/{id}/decide': {
        post: {
          summary: 'Шийдвэр гаргах',
          description:
            'ТАТГАЛЗАХ шийдвэр нь ҮНДЭСЛЭЛГҮЙ гарахгүй (400) — иргэн юунд татгалзсаныг мэдэж гомдол гаргах боломжтой байх ёстой. Зөвшөөрсний дараа гаралтын төрөл шийднэ: лавлагаа бол ШУУД `completed` + лавлагаа олгогдоно; биет зүйл бол `approved` (хүргэгдэх хүртэл). Төлөвийн машин зөрчигдвөл 409.',
          tags: ['gov-officer'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/GovAppId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    approve: { type: 'boolean' },
                    note: { type: 'string', maxLength: 2000 },
                    result: { type: 'string', maxLength: 64 },
                  },
                  required: ['approve'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gov/references': {
        get: {
          summary: 'Миний лавлагаанууд',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
        post: {
          summary: 'Лавлагаа авах',
          description:
            'Танигдсан төрлүүд: residence · birth · marriage · tax · social_ins · criminal. 30 хоног хүчинтэй.',
          tags: ['gov'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { type: { type: 'string', maxLength: 64 } },
                  required: ['type'],
                },
              },
            },
          },
          responses: {
            '201': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gspace': {
        get: {
          summary: 'Gerege Space товч (файлууд + квот)',
          description:
            'Хэрэглэгчийн өөрийн SFTP хадгалалт. Хэрэглэгчийн ID нь ЗӨВХӨН JWT-ээс гардаг тул өөр хүний хавтас руу хандах боломжгүй; файлын нэр нь замын сегмент болж ариутгагдана (path traversal хаалттай). Тохируулаагүй бол 500 (тодорхой мессежтэй).',
          tags: ['gspace'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '500': { $ref: '#/components/responses/Error' },
          },
        },
        delete: {
          summary: 'Gerege Space-с файл устгах',
          tags: ['gspace'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'name', in: 'query', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gspace/upload': {
        post: {
          summary: 'Gerege Space-д файл оруулах',
          description:
            'Файл base64-ээр JSON body-д ирнэ (энэ зам 4 MiB body хязгаартай — глобал 1 MiB биш). Квотыг сервер шалгана: ижил нэртэй файл байвал ОРЛУУЛАГДАХ тул түүний хэмжээ квотоос хасагдана. Квот хэтэрвэл 400.',
          tags: ['gspace'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', minLength: 1, maxLength: 200 },
                    data: { type: 'string', description: 'base64' },
                  },
                  required: ['name', 'data'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '413': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/gspace/download': {
        get: {
          summary: 'Gerege Space-с файл татах',
          description:
            'Хариу нь `application/octet-stream` + `Content-Disposition: attachment` + `nosniff` — байт нь ТАТАГДАНА, HTML болж рендерлэгдэхгүй. Олдоогүй бүх шалтгаан 404 (өөр хэрэглэгчийн файлын оршихуйг илчлэхгүй).',
          tags: ['gspace'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'name', in: 'query', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Файлын агуулга',
              content: {
                'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/integrations': {
        get: {
          summary: 'Холбосон интеграцууд',
          description:
            'Хэрэглэгчийн холбосон гуравдагч талын үйлчилгээнүүд. Хариунд ТОКЕН ОРОХГҮЙ — зөвхөн provider + хугацаа.',
          tags: ['integrations'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
        post: {
          summary: 'Интеграцийн токеныг хадгалах',
          description:
            'OAuth token exchange хийсний дараа токеныг backend-д AES-256-GCM-ээр ШИФРЛҮҮЛЖ хадгална. Ижил provider давхцвал шинэчилнэ. Танигдсан provider-ууд: google-drive · dropbox · google-meet.',
          tags: ['integrations'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    provider: { type: 'string', maxLength: 32 },
                    access_token: { type: 'string', maxLength: 4096 },
                    refresh_token: { type: 'string', maxLength: 4096 },
                    expires_at_ms: {
                      type: 'integer',
                      description: 'epoch мс (0 бол хугацаагүй)',
                    },
                  },
                  required: ['provider', 'access_token'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/integrations/{provider}/connect': {
        get: {
          summary: 'OAuth холболтыг эхлүүлэх (302)',
          description:
            'Провайдерын зөвшөөрлийн хуудас руу 302 хийж, CSRF-ийн state-ийг богино настай httpOnly cookie-д тавина. Энэ нь JSON БИШ, top-level NAVIGATION — SPA нь энэ хаяг руу шууд шилжинэ. client_secret нь ЗӨВХӨН серверт үлдэнэ. Тохируулаагүй/танихгүй провайдер бол `/me/integrations?error=…` руу буцаана.',
          tags: ['integrations'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/IntegrationProvider' }],
          responses: {
            '302': { description: 'Провайдер руу эсвэл алдаатай буцах чиглүүлэлт' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/integrations/{provider}/callback': {
        get: {
          summary: 'OAuth буцах цэг (302)',
          description:
            'state-ийг cookie-той тулгаж (CSRF), authorization code-ийг токен болгон солилцоод ШИФРЛҮҮЛЖ хадгална. Дараа нь `/me/integrations?connected=…` руу буцаана. Токен browser-т ХЭЗЭЭ Ч хүрэхгүй.',
          tags: ['integrations'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { $ref: '#/components/parameters/IntegrationProvider' },
            { name: 'code', in: 'query', schema: { type: 'string' } },
            { name: 'state', in: 'query', schema: { type: 'string' } },
            { name: 'error', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '302': { description: 'Холболтын хуудас руу буцах чиглүүлэлт' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/integrations/google-drive/files': {
        get: {
          summary: 'Google Drive «Gerege» хавтасны файлууд',
          description:
            'Токеныг СЕРВЕР талд ашиглаж (шаардвал refresh хийж) файлуудыг жагсаана. drive.file scope тул зөвхөн апп-ын өөрийн үүсгэсэн файл харагдана.',
          tags: ['integrations'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/integrations/google-drive/upload': {
        post: {
          summary: 'Файлыг Google Drive руу хуулах',
          description:
            'Файл нь base64-оор (multipart БИШ) ирнэ — ингэснээр биеийн ерөнхий хязгаар, CSRF шалгалт, алдааны дугтуй хэвээр үйлчилнэ. Дээд хэмжээ 10 MiB.',
          tags: ['integrations'],
          security: [{ bearerAuth: [] }],
          requestBody: { $ref: '#/components/requestBodies/Base64Upload' },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/integrations/google-drive/image': {
        post: {
          summary: 'Зургийг Drive-д хуулж НИЙТЭД харагдах URL авах',
          description:
            'Гарын үсэг/тамганы зургийг хуулж, "холбоос бүхий хэн ч харах" эрхтэйгээр URL буцаана. Дуудагч тэр URL-ийг `PUT /me/signature` эсвэл `PUT /me/orgstamp/{regNo}` рүү хадгална — assets-ийн гэрээ өөрчлөгдөөгүй.',
          tags: ['integrations'],
          security: [{ bearerAuth: [] }],
          requestBody: { $ref: '#/components/requestBodies/Base64Upload' },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/integrations/google-drive/files/{id}': {
        put: {
          summary: 'Drive файлын нэрийг солих',
          tags: ['integrations'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { name: { type: 'string', maxLength: 255 } },
                  required: ['name'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
        delete: {
          summary: 'Drive файлыг устгах',
          tags: ['integrations'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/integrations/dropbox/files': {
        get: {
          summary: 'Dropbox «/Gerege» хавтасны файлууд',
          tags: ['integrations'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/integrations/dropbox/preview': {
        get: {
          summary: 'Dropbox файлын түр линк',
          description:
            'Зам нь «/Gerege» хавтас доторх байх ЁСТОЙ — эс бөгөөс 400. Ингэснээр энэ endpoint хэрэглэгчийн бусад Dropbox файлын линкийг гаргахгүй.',
          tags: ['integrations'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'path', in: 'query', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/integrations/dropbox/upload': {
        post: {
          summary: 'Файлыг Dropbox руу хуулах',
          tags: ['integrations'],
          security: [{ bearerAuth: [] }],
          requestBody: { $ref: '#/components/requestBodies/Base64Upload' },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/integrations/google-meet/create-space': {
        post: {
          summary: 'Google Meet уулзалт үүсгэх',
          description:
            'accessType: TRUSTED — нэвтэрсэн хэрэглэгч шууд орно, бусад нь хост зөвшөөрөх хүртэл хүлээнэ. meetings.space.created scope нь зөвхөн АПП-ЫН үүсгэсэн уулзалтыг хөнддөг.',
          tags: ['integrations'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/integrations/{provider}': {
        delete: {
          summary: 'Интеграцийг салгах',
          description: 'ИДЕМПОТЕНТ — холбоогүй байсан ч 200.',
          tags: ['integrations'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/IntegrationProvider' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/integrations/{provider}/token': {
        get: {
          summary: 'Провайдерын токеныг авах (ЗӨВХӨН server-тал)',
          description:
            '⚠️ Шифргүй токен буцаана — зөвхөн серверийн талаас (BFF) провайдерын API руу хандахад ашиглана, browser руу ХЭЗЭЭ Ч гаргаж болохгүй. Холбоогүй бол 404.',
          tags: ['integrations'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/IntegrationProvider' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/me/signature': {
        get: {
          summary: 'Гарын үсгийн зураг авах',
          description:
            'Гарын үсгийн зураг нь Google Drive-д байршдаг; API зөвхөн URL хадгална. Хэрэглэгчийн ID нь ЗӨВХӨН JWT-ээс гардаг тул өөр хүний гарын үсэг рүү хандах боломжгүй.',
          tags: ['assets'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
        put: {
          summary: 'Гарын үсгийн зураг хадгалах',
          tags: ['assets'],
          security: [{ bearerAuth: [] }],
          requestBody: { $ref: '#/components/requestBodies/AssetURL' },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
          },
        },
        delete: {
          summary: 'Гарын үсгийн зураг устгах',
          tags: ['assets'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/me/latin-name': {
        put: {
          summary: 'Латин нэрээ гараар засах',
          description: 'eID-ийн автомат галиглалт заримдаа буруу гардаг тул гараар засах гарц.',
          tags: ['assets'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    first_name_en: { type: 'string', maxLength: 120 },
                    last_name_en: { type: 'string', maxLength: 120 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/me/org-name-latin/{regNo}': {
        put: {
          summary: 'Байгууллагын латин нэр засах (ADMIN)',
          description:
            'ADMIN эрхийг eID (улсын бүртгэл) шалгана — энэ template өөрөө эрх шийддэггүй. Эрхгүй бол 403.',
          tags: ['assets'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/OrgRegNo' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { name_latin: { type: 'string', maxLength: 200 } },
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/me/orgstamp/{regNo}': {
        get: {
          summary: 'Байгууллагын тамганы дардас авах',
          description:
            'Тухайн байгууллагын АЛЬ НЭГ эрхийн төлөөлөгч байхад хангалттай. Төлөөлөгч биш бол 403 — регистрийн дугаар таамаглаж бусдын тамгыг татахаас (IDOR) хамгаална.',
          tags: ['assets'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/OrgRegNo' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
        put: {
          summary: 'Байгууллагын тамганы дардас хадгалах (ADMIN)',
          description: 'Зөвхөн ADMIN эрхтэй төлөөлөгч. MANAGER эрхтэй хүн 403 авна.',
          tags: ['assets'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/OrgRegNo' }],
          requestBody: { $ref: '#/components/requestBodies/AssetURL' },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
          },
        },
        delete: {
          summary: 'Байгууллагын тамганы дардас устгах (ADMIN)',
          tags: ['assets'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/OrgRegNo' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/.well-known/openid-configuration': {
        get: {
          summary: 'OpenID Connect discovery баримт',
          description:
            '⚠️ Энэ зам нь `/api/v1`-ээс ГАДУУР, ҮНДЭС дээр сууна (OIDC стандартаар тогтоогдсон). Хариу нь платформын `BaseResponse` дугтуйг ХЭРЭГЛЭХГҮЙ — RP-ийн сангууд стандарт JSON хүлээдэг.',
          tags: ['oidc'],
          security: [],
          responses: {
            '200': {
              description: 'Discovery баримт',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: true,
                  },
                },
              },
            },
          },
        },
      },
      '/.well-known/jwks.json': {
        get: {
          summary: 'id_token шалгах нийтийн түлхүүрүүд (JWK Set)',
          description:
            'Тэтгэвэрт гарсан түлхүүрүүд ч ЭНД ҮЛДЭНЭ — тэдгээрээр зурсан, хараахан хүчинтэй id_token-ууд шалгагдсаар байх ёстой. `/api/v1`-ээс гадуур.',
          tags: ['oidc'],
          security: [],
          responses: {
            '200': {
              description: 'JWK Set',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: true,
                  },
                },
              },
            },
          },
        },
      },
      '/oauth2/auth': {
        get: {
          summary: 'OAuth2 authorization endpoint',
          description:
            '`redirect_uri` нь бүртгэлтэйтэй ЯГ (тэмдэгт бүрээр) тулгагдана — prefix/wildcard ХЭЗЭЭ Ч биш. Client эсвэл redirect_uri буруу бол алдааг RP руу ЧИГЛҮҮЛЭХГҮЙ, шууд харуулна (баталгаажаагүй хаяг руу чиглүүлэх боломжгүй). Public client-д PKCE (`S256`) ЗААВАЛ. Амжилттай бол нэвтрэх хуудас руу 302. `/api/v1`-ээс гадуур.',
          tags: ['oidc'],
          security: [],
          parameters: [
            {
              name: 'client_id',
              in: 'query',
              required: true,
              schema: {
                type: 'string',
              },
              description: 'Client ID',
            },
            {
              name: 'redirect_uri',
              in: 'query',
              required: true,
              schema: {
                type: 'string',
              },
              description: 'Бүртгэгдсэн redirect URI',
            },
            {
              name: 'response_type',
              in: 'query',
              required: true,
              schema: {
                type: 'string',
              },
              description: 'code (өөр утга дэмжигдэхгүй)',
            },
            {
              name: 'scope',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
              },
              description: 'Зайгаар тусгаарласан scope-ууд',
            },
            {
              name: 'state',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
              },
              description: 'RP-ийн opaque төлөв',
            },
            {
              name: 'nonce',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
              },
              description: 'id_token-д давтагдана',
            },
            {
              name: 'code_challenge',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
              },
              description: 'PKCE challenge (base64url)',
            },
            {
              name: 'code_challenge_method',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
              },
              description: 'Зөвхөн S256',
            },
            {
              name: 'prompt',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
              },
              description: 'OIDC prompt',
            },
          ],
          responses: {
            '302': {
              description: 'Нэвтрэх хуудас эсвэл RP руу (алдааны үед)',
            },
            '400': {
              description: 'RFC 6749 §5.2 алдаа',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: {
                        type: 'string',
                      },
                      error_description: {
                        type: 'string',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/oauth2/token': {
        post: {
          summary: 'OAuth2 token endpoint',
          description:
            '`authorization_code` (PKCE-тэй), `refresh_token` (эргэлттэй) болон `client_credentials` grant-уудыг үйлчилнэ. Authorization code НЭГ УДААГИЙН — дахин ирвэл тухайн иргэн+апп-ийн БҮХ token цуцлагдана. Хэрэглэгдсэн refresh token дахин ирвэл ГЭР БҮЛ бүхэлдээ цуцлагдана (RFC 9700 §4.14.2). Client-ийн зарласан auth method ХАТУУ (downgrade боломжгүй). `offline_access` scope-гүй бол refresh token ГАРАХГҮЙ. `/api/v1`-ээс гадуур.',
          tags: ['oidc'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  properties: {
                    grant_type: {
                      type: 'string',
                      enum: ['authorization_code', 'refresh_token', 'client_credentials'],
                    },
                    code: {
                      type: 'string',
                    },
                    redirect_uri: {
                      type: 'string',
                    },
                    code_verifier: {
                      type: 'string',
                    },
                    refresh_token: {
                      type: 'string',
                    },
                    scope: {
                      type: 'string',
                    },
                    client_id: {
                      type: 'string',
                    },
                    client_secret: {
                      type: 'string',
                    },
                  },
                  required: ['grant_type'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Token хариу (RFC 6749 §5.1)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: true,
                  },
                },
              },
            },
            '400': {
              description: 'RFC 6749 §5.2 алдаа',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: {
                        type: 'string',
                      },
                      error_description: {
                        type: 'string',
                      },
                    },
                  },
                },
              },
            },
            '401': {
              description: 'RFC 6749 §5.2 алдаа',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: {
                        type: 'string',
                      },
                      error_description: {
                        type: 'string',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/oauth2/introspect': {
        post: {
          summary: 'OAuth2 token introspection (RFC 7662)',
          description:
            'Дуудагч client-ийг ЗААВАЛ баталгаажуулна; ӨӨР client-ийн token нь `{"active": false}` (эзэн иргэн/RP-ийн мэдээлэл алдагдахгүй). Public client (auth method = none) энэ endpoint-ыг ашиглаж БОЛОХГҮЙ. `/api/v1`-ээс гадуур.',
          tags: ['oidc'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  properties: {
                    token: {
                      type: 'string',
                    },
                    client_id: {
                      type: 'string',
                    },
                    client_secret: {
                      type: 'string',
                    },
                  },
                  required: ['token'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Token-ий төлөв',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: true,
                  },
                },
              },
            },
            '401': {
              description: 'RFC 6749 §5.2 алдаа',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: {
                        type: 'string',
                      },
                      error_description: {
                        type: 'string',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/oauth2/revoke': {
        post: {
          summary: 'OAuth2 token revocation (RFC 7009)',
          description:
            'Танигдаагүй token ч АМЖИЛТТАЙ хариулна (RFC 7009 §2.2) — client нь token хүчинтэй байсан эсэхийг мэдэх ёсгүй. ӨӨР client-ийн token-ыг цуцлах боломжгүй. Refresh token цуцлах нь тухайн session-ий БҮХ эргэлтийг цуцална. `/api/v1`-ээс гадуур.',
          tags: ['oidc'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  properties: {
                    token: {
                      type: 'string',
                    },
                    token_type_hint: {
                      type: 'string',
                      enum: ['access_token', 'refresh_token'],
                    },
                    client_id: {
                      type: 'string',
                    },
                    client_secret: {
                      type: 'string',
                    },
                  },
                  required: ['token'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Хоосон 200',
            },
            '401': {
              description: 'RFC 6749 §5.2 алдаа',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: {
                        type: 'string',
                      },
                      error_description: {
                        type: 'string',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/oauth2/sessions/logout': {
        get: {
          summary: 'RP-initiated logout',
          description:
            '`post_logout_redirect_uri` нь тухайн client-д БҮРТГЭГДСЭН байх ёстой (open redirect хаалт). `id_token_hint`-ийн ГАРЫН ҮСЭГ шалгагдана — өөр апп-ийн нэрийн өмнөөс logout эхлүүлэх боломжгүй; хугацаа дууссан hint зөвшөөрөгдөнө (өнгөрсөн session-ий тухай сануулга). `/api/v1`-ээс гадуур.',
          tags: ['oidc'],
          security: [],
          parameters: [
            {
              name: 'client_id',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
              },
              description: 'Client ID',
            },
            {
              name: 'id_token_hint',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
              },
              description: 'Өмнө гаргасан id_token',
            },
            {
              name: 'post_logout_redirect_uri',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
              },
              description: 'Бүртгэгдсэн буцах хаяг',
            },
            {
              name: 'state',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
              },
              description: 'RP-ийн opaque төлөв',
            },
          ],
          responses: {
            '302': {
              description: 'Гарах хуудас руу',
            },
            '400': {
              description: 'RFC 6749 §5.2 алдаа',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: {
                        type: 'string',
                      },
                      error_description: {
                        type: 'string',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/userinfo': {
        get: {
          summary: 'OIDC userinfo',
          description:
            'Bearer access token-оор эрхшээгдэнэ. `openid` scope-гүй token эсвэл хэрэглэгчгүй (client_credentials) token нь ТАТГАЛЗАНА. Claims нь token гаргах мөчийн БИШ, дуудлагын мөчийн бодит өгөгдлөөр угсрагдана. `/api/v1`-ээс гадуур.',
          tags: ['oidc'],
          security: [],
          responses: {
            '200': {
              description: 'Claims',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: true,
                  },
                },
              },
            },
            '401': {
              description: 'RFC 6749 §5.2 алдаа',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: {
                        type: 'string',
                      },
                      error_description: {
                        type: 'string',
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'OIDC userinfo (POST)',
          tags: ['oidc'],
          security: [],
          responses: {
            '200': {
              description: 'Claims',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: true,
                  },
                },
              },
            },
            '401': {
              description: 'RFC 6749 §5.2 алдаа',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: {
                        type: 'string',
                      },
                      error_description: {
                        type: 'string',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/provider/login': {
        get: {
          summary: 'Login challenge-ийн товч мэдээлэл',
          description:
            '⚠️ `data` талбарууд нь Go хувилбартай ЯГ ижил PascalCase (`Challenge`, `ClientID`, `ClientName`, `RequestedScope`, `Subject`, `Skip`) — frontend түүгээр уншдаг тул нэр өөрчлөх нь эвдрэл болно.',
          tags: ['provider'],
          security: [],
          parameters: [
            {
              name: 'login_challenge',
              in: 'query',
              required: true,
              schema: {
                type: 'string',
              },
              description: 'authorize-аас ирсэн challenge',
            },
          ],
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '404': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/provider/consent': {
        get: {
          summary: 'Consent challenge-ийн товч мэдээлэл',
          description:
            '`Skip` нь first-party апп эсвэл өмнө нь санагдсан зөвшөөрөл хүссэн БҮХ scope-ыг хамарсан үед true.',
          tags: ['provider'],
          security: [],
          parameters: [
            {
              name: 'consent_challenge',
              in: 'query',
              required: true,
              schema: {
                type: 'string',
              },
              description: 'Challenge',
            },
          ],
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '404': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/provider/login/accept': {
        post: {
          summary: 'Нэвтрэлтийг баталгаажуулах',
          description:
            'НЭВТЭРСЭН иргэнийг шаардана — subject нь платформын user UUID (тогтвортой, opaque). Хариунд consent хуудасны `redirect_to`.',
          tags: ['provider'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    login_challenge: {
                      type: 'string',
                    },
                    consent_challenge: {
                      type: 'string',
                    },
                    logout_challenge: {
                      type: 'string',
                    },
                    grant_scope: {
                      type: 'array',
                      items: {
                        type: 'string',
                      },
                    },
                    reason: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '404': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/provider/consent/accept': {
        post: {
          summary: 'Зөвшөөрлийг баталгаажуулах',
          description:
            'Challenge дээрх subject нь нэвтэрсэн иргэнтэй ТААРАХ ёстой (өөр хүний нээлттэй challenge-ыг дуусгах боломжгүй → 403). Олгох scope нь хүссэнээс ХЭТРЭХГҮЙ; иргэний бүртгэл олдохгүй бол code огт олгогдохгүй (fail-closed).',
          tags: ['provider'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    login_challenge: {
                      type: 'string',
                    },
                    consent_challenge: {
                      type: 'string',
                    },
                    logout_challenge: {
                      type: 'string',
                    },
                    grant_scope: {
                      type: 'array',
                      items: {
                        type: 'string',
                      },
                    },
                    reason: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '404': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/provider/login/reject': {
        post: {
          summary: 'Нэвтрэлтийг цуцлах',
          tags: ['provider'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    login_challenge: {
                      type: 'string',
                    },
                    consent_challenge: {
                      type: 'string',
                    },
                    logout_challenge: {
                      type: 'string',
                    },
                    grant_scope: {
                      type: 'array',
                      items: {
                        type: 'string',
                      },
                    },
                    reason: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '404': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/provider/consent/reject': {
        post: {
          summary: 'Зөвшөөрлийг цуцлах',
          tags: ['provider'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    login_challenge: {
                      type: 'string',
                    },
                    consent_challenge: {
                      type: 'string',
                    },
                    logout_challenge: {
                      type: 'string',
                    },
                    grant_scope: {
                      type: 'array',
                      items: {
                        type: 'string',
                      },
                    },
                    reason: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '404': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/provider/logout/accept': {
        post: {
          summary: 'RP-initiated logout-ыг баталгаажуулах',
          description:
            'Бүртгэгдсэн `post_logout_redirect_uri` байхгүй бол issuer-ийн нүүр рүү буцаана.',
          tags: ['provider'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    login_challenge: {
                      type: 'string',
                    },
                    consent_challenge: {
                      type: 'string',
                    },
                    logout_challenge: {
                      type: 'string',
                    },
                    grant_scope: {
                      type: 'array',
                      items: {
                        type: 'string',
                      },
                    },
                    reason: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '404': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/relay/webhook': {
        post: {
          summary: 'Peer platform-оос webhook хүлээж авах (HMAC гарын үсэгтэй)',
          description:
            '`X-Relay-Source` (илгээгчийн code) + `X-Relay-Signature` (`sha256=<HMAC-SHA256>`) header-ээр баталгаажуулж, шинэ хүсэлт болгон ingest хийнэ. **JWT ШААРДАХГҮЙ** — итгэлийн үндэс нь гарын үсэг бөгөөд ТҮҮХИЙ body дээр шалгагдана. Бүртгэлгүй эх ба буруу гарын үсэг ИЖИЛ 401 (peer жагсаалтыг тандах боломжгүй); идэвхгүй peer нь 403.',
          tags: ['relay'],
          parameters: [
            {
              name: 'X-Relay-Source',
              in: 'header',
              required: true,
              schema: {
                type: 'string',
              },
              description: 'Илгээгч platform-ын code',
            },
            {
              name: 'X-Relay-Signature',
              in: 'header',
              required: true,
              schema: {
                type: 'string',
              },
              description: 'sha256=<HMAC-SHA256>',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/RelayWebhookEnvelope',
                },
              },
            },
          },
          responses: {
            '201': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/relay/requests': {
        get: {
          summary: 'Хүсэлтүүдийн жагсаалт',
          tags: ['relay'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: {
                type: 'integer',
                default: 50,
                maximum: 200,
              },
            },
          ],
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
          },
        },
        post: {
          summary: 'Дээд platform-оос хугацаатай хүсэлт хүлээж авах',
          description:
            '`service_code`-ийн routing дүрмээр доод platform-ууд руу дамжуулж SLA хяналтад авна. Чиглүүлэлт тохируулаагүй `service_code` нь **400** — даалгаваргүй хүсэлт үүсэхгүй. Даалгавар бүрийн `due_at` нь хүсэлтийн эцсийн хугацаанаас ХЭТРЭХГҮЙ; `due_at` өгөөгүй бол хамгийн урт SLA-аар тооцно.',
          tags: ['relay'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    source_platform: {
                      type: 'string',
                      maxLength: 120,
                    },
                    external_ref: {
                      type: 'string',
                      maxLength: 120,
                    },
                    service_code: {
                      type: 'string',
                      maxLength: 120,
                    },
                    title: {
                      type: 'string',
                      maxLength: 300,
                    },
                    payload: {
                      type: 'object',
                      additionalProperties: true,
                    },
                    priority: {
                      type: 'string',
                      maxLength: 40,
                    },
                    due_at: {
                      type: 'string',
                      format: 'date-time',
                    },
                  },
                  required: ['service_code'],
                },
              },
            },
          },
          responses: {
            '201': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/relay/requests/{id}': {
        get: {
          summary: 'Хүсэлтийн дэлгэрэнгүй (даалгаврууд + timeline)',
          tags: ['relay'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
                format: 'uuid',
              },
              description: 'Request ID',
            },
          ],
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '404': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/relay/requests/{id}/forward': {
        post: {
          summary: 'Хүсэлтийг дээд (upstream) platform руу дамжуулах',
          description:
            'Зөвхөн `direction=upstream` peer рүү дамжуулна — доод platform руу дамжуулах оролдлого **400**.',
          tags: ['relay'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
                format: 'uuid',
              },
              description: 'Request ID',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    platform_code: {
                      type: 'string',
                      maxLength: 120,
                    },
                  },
                  required: ['platform_code'],
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '404': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/relay/assignments/{id}/respond': {
        post: {
          summary: 'Доод platform-ын callback — даалгаврын хариу',
          description:
            '`status` нь `done` эсвэл `rejected`. Бүх даалгавар терминал болмогц хүсэлт `fulfilled` болж, эх нь бүртгэлтэй дээд platform бол нэгтгэсэн хариу webhook-оор дээш илгээгдэнэ. Давхар хариу нь **409** (SQL `WHERE` guard уралдааныг барина).',
          tags: ['relay'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
                format: 'uuid',
              },
              description: 'Assignment ID',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['done', 'rejected'],
                    },
                    result: {
                      type: 'object',
                      additionalProperties: true,
                    },
                  },
                  required: ['status'],
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '409': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/relay/overview': {
        get: {
          summary: 'SLA хяналтын самбарын нэгтгэл',
          description:
            'Хүсэлтийн төлөвийн хуваарилалт, platform тус бүрийн SLA гүйцэтгэл болон сүүлийн 20 event.',
          tags: ['relay'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/relay/platforms': {
        get: {
          summary: 'Peer platform-уудыг жагсаах',
          tags: ['relay'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
          },
        },
        post: {
          summary: 'Peer platform бүртгэх',
          description:
            '`webhook_secret` өгөөгүй бол сервер 64-hex нууц ӨӨРӨӨ үүсгэнэ — нууцгүй peer нь webhook-ийг баталгаажуулж чадахгүй (шалгалт нь хоосон нууц дээр ҮРГЭЛЖ false).',
          tags: ['relay'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    code: {
                      type: 'string',
                      maxLength: 120,
                    },
                    name: {
                      type: 'string',
                      maxLength: 300,
                    },
                    direction: {
                      type: 'string',
                      enum: ['upstream', 'downstream'],
                    },
                    endpoint_url: {
                      type: 'string',
                      maxLength: 500,
                      description: 'demo:// эсвэл хоосон бол гадаад webhook явахгүй',
                    },
                    supervisor_contact: {
                      type: 'string',
                      maxLength: 300,
                    },
                    webhook_secret: {
                      type: 'string',
                      maxLength: 200,
                    },
                    enabled: {
                      type: 'boolean',
                    },
                  },
                  required: ['code', 'name'],
                },
              },
            },
          },
          responses: {
            '201': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '409': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/relay/platforms/{id}': {
        delete: {
          summary: 'Peer platform устгах',
          tags: ['relay'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
                format: 'uuid',
              },
              description: 'Platform ID',
            },
          ],
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '404': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/relay/routes': {
        get: {
          summary: 'Чиглүүлэлтийн дүрмүүдийг жагсаах',
          tags: ['relay'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
          },
        },
        post: {
          summary: 'Чиглүүлэлт үүсгэх (service_code → platform)',
          description:
            '`sla_minutes` 0 бол өгөгдмөл 60 минут. Ижил (service_code, platform) хос давхардвал **409**.',
          tags: ['relay'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    service_code: {
                      type: 'string',
                      maxLength: 120,
                    },
                    platform_id: {
                      type: 'string',
                      format: 'uuid',
                    },
                    sla_minutes: {
                      type: 'integer',
                    },
                  },
                  required: ['service_code', 'platform_id'],
                },
              },
            },
          },
          responses: {
            '201': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '409': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/relay/routes/{id}': {
        delete: {
          summary: 'Чиглүүлэлт устгах',
          tags: ['relay'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
                format: 'uuid',
              },
              description: 'Route ID',
            },
          ],
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '404': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/registry/catalog': {
        get: {
          summary: 'Бүртгэлийн каталог',
          description: 'Нийтлэгдсэн үйлчилгээний каталог (дотоод харагдац). `registry.view` эрх.',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/registry/services/{id}/versions': {
        get: {
          summary: 'Үйлчилгээний хувилбарын түүх',
          description:
            'Нийтлэлт бүр дээр шинэ хувилбар үүсдэг — өөрчлөлтийг буцаан харах боломжтой.',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/RegistryServiceId' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/registry/services/{id}/archive': {
        post: {
          summary: 'Үйлчилгээг архивлах',
          description: 'Устгахын оронд архивлана — нийтлэгдсэн үйлчилгээний түүх хадгалагдана.',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/RegistryServiceId' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/registry/services/{id}/evidences': {
        put: {
          summary: 'Үйлчилгээний нотлох баримтуудыг тогтоох',
          description:
            'Бүтэн ОРЛУУЛАЛТ (жагсаалт бүхэлдээ солигдоно). `from_citizen: true` нь иргэнээс дахин нэхэж буй баримт — once-only зөрчлийн шинжилгээ үүн дээр тулгуурладаг.',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/RegistryServiceId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    evidences: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          evidence_id: { type: 'string', format: 'uuid' },
                          required: { type: 'boolean' },
                          from_citizen: { type: 'boolean' },
                          note: { type: 'string', maxLength: 4000 },
                        },
                        required: ['evidence_id'],
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/registry/evidences': {
        get: {
          summary: 'Нотлох баримтуудыг жагсаах',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
        post: {
          summary: 'Нотлох баримт үүсгэх',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          requestBody: { $ref: '#/components/requestBodies/RegistryEvidence' },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/registry/evidences/{id}': {
        put: {
          summary: 'Нотлох баримтыг засах',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: { $ref: '#/components/requestBodies/RegistryEvidence' },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
        delete: {
          summary: 'Нотлох баримтыг устгах',
          description: 'Үйлчилгээнд ашиглагдаж байгаа баримтыг устгах нь 409.',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/registry/life-events': {
        get: {
          summary: 'Амьдралын үйл явдлуудыг жагсаах',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
        post: {
          summary: 'Амьдралын үйл явдал үүсгэх',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    code: { type: 'string', maxLength: 64 },
                    name: { type: 'string', minLength: 1, maxLength: 300 },
                    kind: { type: 'string', enum: ['life', 'business'] },
                    description: { type: 'string', maxLength: 4000 },
                    lead_agency: { type: 'string', maxLength: 300 },
                    eu_code: { type: 'string', maxLength: 32 },
                    en_label: { type: 'string', maxLength: 300 },
                    sort_order: { type: 'integer' },
                  },
                  required: ['code', 'name'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/registry/life-events/{id}': {
        delete: {
          summary: 'Амьдралын үйл явдлыг устгах',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/registry/overview': {
        get: {
          summary: 'Регистрийн нэгтгэл (Ring R1)',
          description:
            '"Төрийн үйлчилгээний инвентар хэр бүрэн, хэр дижитал, once-only-д хэр ойрхон вэ" — паспортын тоо, ХУР-д байгаа нотолгоо, once-only зөрчил ба тэдгээрийн жилийн давтамж, проактив байдлын шатны хуваарилалт.',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/registry/services': {
        get: {
          summary: 'Үйлчилгээний паспортууд',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'status',
              in: 'query',
              schema: { type: 'string', enum: ['draft', 'published', 'archived'] },
            },
            { name: 'authority', in: 'query', schema: { type: 'string' } },
            { name: 'life_event_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'proactivity', in: 'query', schema: { type: 'string' } },
            {
              name: 'q',
              in: 'query',
              schema: { type: 'string' },
              description: 'нэр/код дотор хайх',
            },
          ],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
        post: {
          summary: 'Паспорт үүсгэх',
          description:
            'Шинэ паспорт ҮРГЭЛЖ `draft`-аар эхэлнэ. `fulfilment=auto` нь `has_discretion`/`has_assessment` аль нэг нь үнэн байхад ТАТГАЛЗАГДАНА (Германы VwVfG §35a-ийн загвар: үнэлэх эрх/үнэлгээний зайтай шийдвэрийг бүрэн автоматжуулж болохгүй).',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          requestBody: { $ref: '#/components/requestBodies/RegistryService' },
          responses: {
            '201': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/registry/services/{id}': {
        get: {
          summary: 'Паспорт харах (нотолгоотой)',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/RegistryServiceId' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
        put: {
          summary: 'Паспорт засах',
          description: 'Архивласан паспорт ЗАСАГДАХГҮЙ (409). Код өөрчлөгддөггүй.',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/RegistryServiceId' }],
          requestBody: { $ref: '#/components/requestBodies/RegistryService' },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
        delete: {
          summary: 'Паспорт устгах',
          description:
            'НИЙТЛЭГДСЭН паспорт устгагдахгүй (409) — түүхэн мөрдөлт (хувилбар, delta, once-only статистик) тасарна. Оронд нь архивлана.',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/RegistryServiceId' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/registry/services/{id}/publish': {
        post: {
          summary: 'Паспорт нийтлэх (хувилбар бэхлэх)',
          description:
            'Одоогийн төлөвийг шинэ хувилбар болгон бэхэлж, baseline-тай харьцуулсан delta-г хадгална (СӨРӨГ = сайжралт). ЭХНИЙ нийтлэлт нь өөрөө baseline. Зарласан проактив байдал нь БОДИТ once-only байдалтай зөрчилдвөл **409** — регистр өөрөө худал мэдээлэл агуулахгүй. Амжилттай бол иргэний порталын каталог руу автоматаар буудаг.',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/RegistryServiceId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { change_note: { type: 'string', maxLength: 4000 } },
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '409': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/registry/services/{id}/once-only': {
        get: {
          summary: 'Нэг үйлчилгээний once-only шалгалт',
          description:
            'Иргэнээс шаардаж буй баримтуудаас ХУР-д АЛЬ ХЭДИЙН байгааг нь (=устгах боломжтой) илрүүлж, хүрч болох дээд проактив шатыг хэлнэ.',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/RegistryServiceId' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/registry/once-only': {
        get: {
          summary: 'Бүх once-only зөрчил',
          tags: ['registry'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'authority', in: 'query', schema: { type: 'string' } }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/catalog/life-events': {
        get: {
          summary: 'Нийтийн амьдралын үйл явдлууд (иргэн)',
          description:
            'ТУСГАЙ ЭРХ ШААРДАХГҮЙ — нэвтэрсэн дурын иргэн үзнэ. Зөвхөн НИЙТЛЭГДСЭН үйлчилгээтэй холбоотой үйл явдлууд буцна.',
          tags: ['catalog'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/catalog/services': {
        get: {
          summary: 'Нийтийн үйлчилгээний каталог (иргэн)',
          description:
            'ТУСГАЙ ЭРХ ШААРДАХГҮЙ — нэвтэрсэн дурын иргэн үзнэ. Зөвхөн НИЙТЛЭГДСЭН паспорт буцна: `status` query-гээр ноорог гуйхыг үл тоомсорлоно.',
          tags: ['catalog'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/catalog/services/{id}': {
        get: {
          summary: 'Нийтийн үйлчилгээний дэлгэрэнгүй',
          description: 'Нийтлэгдээгүй паспорт нь иргэнд ОГТ БАЙХГҮЙ мэт харагдана.',
          tags: ['catalog'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/RegistryServiceId' }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/security/events': {
        post: {
          summary: 'Security event илгээх',
          description:
            'Нэвтэрсэн хэрэглэгч RASP-style security event илгээнэ. `user_id`-г СЕРВЕР JWT-ээс авдаг тул клиент өөрчилж чадахгүй; RLS бодлого нь бас `user_id = app.user_id`-г баталгаажуулна. IP + User-Agent-г сервер тэмдэглэнэ.',
          tags: ['security'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    kind: { type: 'string', minLength: 1, maxLength: 80 },
                    severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                    source: { type: 'string', maxLength: 80 },
                    detail: { type: 'object', additionalProperties: true },
                  },
                  required: ['kind'],
                },
              },
            },
          },
          responses: {
            '202': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
        get: {
          summary: 'Security event жагсаах (admin)',
          description:
            'Event-үүдийг id БУУРАХААР (шинээс хуучин) хуудаслан буцаана. Зөвхөн admin — хэрэглэгчид уншихыг зөвшөөрөх RLS бодлого БАЙХГҮЙ.',
          tags: ['security'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 50, maximum: 200 },
            },
            {
              name: 'offset',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 0 },
            },
          ],
          responses: {
            '200': {
              description: 'Security event-үүд',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/SecurityEvent' },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/sso/start': {
        post: {
          summary: 'SSO нэвтрэлт эхлүүлэх',
          description:
            'Гадаад SSO provider (OIDC)-ийн authorize URL-ийг state-тэй буцаана. State нь Redis-д 10 минутын НЭГ УДААГИЙН түлхүүрээр хадгалагдаж, callback дээр устгагдана (CSRF/replay хаалт).',
          tags: ['sso'],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '429': { $ref: '#/components/responses/Error' },
            '500': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/sso/callback': {
        post: {
          summary: 'SSO callback (authorization code)',
          description:
            'state+code-ийг шалгаж, code-ийг токен болгож солин, иргэнийг `civil_id` (иргэний дугаар) эсвэл pairwise `sub`-ээр upsert хийж, ӨӨРИЙН JWT хос олгоно. Иргэний дугаар ирсэн бол eID-ээр урьд бүртгэгдсэн дансанд НЭГТГЭНЭ (давхардал үүсэхгүй). Private платформд урьдчилан бүртгээгүй иргэн 403 — данс ч үүсэхгүй.',
          tags: ['sso'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    state: { type: 'string', maxLength: 256 },
                    code: { type: 'string', maxLength: 4096 },
                  },
                  required: ['state', 'code'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/sso/native': {
        post: {
          summary: 'SSO native (mobile PKCE) нэвтрэлт',
          description:
            'Mobile апп-ын PKCE code-ийг public client-ээр (client_secret-ГҮЙ, code_verifier-тэй) солино. State шалгалтГҮЙ — PKCE нь interception/replay-аас хамгаална. Native урсгал нь refresh_token хадгалахгүй.',
          tags: ['sso'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    code: { type: 'string', maxLength: 4096 },
                    code_verifier: { type: 'string', minLength: 43, maxLength: 128 },
                    redirect_uri: { type: 'string', maxLength: 400 },
                  },
                  required: ['code', 'code_verifier', 'redirect_uri'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
            '429': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/sso/logout': {
        post: {
          summary: 'SSO logout URL',
          description:
            'callback-д олгосон богино `ref`-ээр id_token-ыг Redis-ээс авч (нэг удаагийн), RP-initiated logout URL байгуулна. id_token нь cookie/header-т ХЭЗЭЭ Ч ордоггүй — зөвхөн 32 hex ref. ref байхгүй/хугацаа дууссан бол хоосон мөр (алдаа биш).',
          tags: ['sso'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { ref: { type: 'string', maxLength: 64 } },
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/superadmin/admins': {
        get: {
          summary: 'Админуудыг жагсаах',
          description:
            'Админ түвшний бүх бүртгэл (super admin + admin). Зөвхөн super admin — энгийн admin ч ХҮРЭХГҮЙ.',
          tags: ['superadmin'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
          },
        },
        post: {
          summary: 'Шинэ админ үүсгэх',
          description:
            'Шинэ, ИДЭВХТЭЙ admin бүртгэл. Энэ давхарга super admin зэрэглэлийг ХЭЗЭЭ Ч үүсгэдэггүй (bootstrap/onboarding-оор л).',
          tags: ['superadmin'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    username: {
                      type: 'string',
                      minLength: 3,
                      maxLength: 50,
                    },
                    email: {
                      type: 'string',
                      format: 'email',
                    },
                    password: {
                      type: 'string',
                      minLength: 8,
                      maxLength: 128,
                    },
                    first_name: {
                      type: 'string',
                      maxLength: 100,
                    },
                    last_name: {
                      type: 'string',
                      maxLength: 100,
                    },
                    first_name_en: {
                      type: 'string',
                      maxLength: 100,
                    },
                    last_name_en: {
                      type: 'string',
                      maxLength: 100,
                    },
                  },
                  required: ['username', 'email', 'password'],
                },
              },
            },
          },
          responses: {
            '201': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '409': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/superadmin/admins/by-register': {
        get: {
          summary: 'Регистрээр хэрэглэгч хайх (preview)',
          description:
            'Эрх ОЛГОХГҮЙ — зөвхөн нэр/эрхийг харуулна. Тухайн регистрээр платформд хэрэглэгч байхгүй бол **404** (шинэ хэрэглэгч үүсгэхгүй: тэр хүн эхлээд eID-ээр нэвтэрсэн байх ёстой).',
          tags: ['superadmin'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              name: 'register',
              in: 'query',
              required: true,
              schema: {
                type: 'string',
              },
            },
          ],
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '404': {
              $ref: '#/components/responses/Error',
            },
          },
        },
        post: {
          summary: 'Регистрээр админ нэмэх',
          description:
            'БАЙГАА хэрэглэгчийг admin болгоно; үндэсний бүртгэл рүү ХАНДАХГҮЙ. Аль хэдийн админ бол 409.',
          tags: ['superadmin'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    register: {
                      type: 'string',
                      minLength: 8,
                      maxLength: 20,
                    },
                  },
                  required: ['register'],
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '404': {
              $ref: '#/components/responses/Error',
            },
            '409': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/superadmin/admins/{id}/grant': {
        put: {
          summary: 'Хэрэглэгчид админ эрх олгох',
          description:
            'ЗӨВХӨН admin зэрэглэл олгоно. Аль хэдийн админ (admin эсвэл super admin) бол 409.',
          tags: ['superadmin'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
                format: 'uuid',
              },
            },
          ],
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '404': {
              $ref: '#/components/responses/Error',
            },
            '409': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/superadmin/admins/{id}': {
        delete: {
          summary: 'Админ эрхийг хасах',
          description:
            'Lockout хаалт: super admin ӨӨРИЙГӨӨ хасаж БОЛОХГҮЙ (403), super admin-г API-аар хасаж БОЛОХГҮЙ (403). Админ биш хэрэглэгчийг "хасах" нь 400.',
          tags: ['superadmin'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
                format: 'uuid',
              },
            },
          ],
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '404': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/superadmin/invites': {
        get: {
          summary: 'Super admin урилгуудыг жагсаах',
          tags: ['superadmin'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
          },
        },
        post: {
          summary: 'Super admin урилга үүсгэх',
          description:
            '⚠️ Урилга нь super admin эрхийг **ШУУД ОЛГОДОГГҮЙ** — зөвхөн onboarding шидтэнг (Google + eID + и-мэйл OTP + TOTP) эхлүүлэх хаалгыг нээнэ. И-мэйл нормчлогдоно (жижиг үсэг); давхардвал 409.',
          tags: ['superadmin'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    email: {
                      type: 'string',
                      format: 'email',
                      maxLength: 200,
                    },
                  },
                  required: ['email'],
                },
              },
            },
          },
          responses: {
            '201': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '409': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/superadmin/invites/{email}': {
        delete: {
          summary: 'Урилгыг цуцлах',
          tags: ['superadmin'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              name: 'email',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
              },
            },
          ],
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '404': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/superadmin/access-mode': {
        get: {
          summary: 'Платформын хандалтын горим',
          tags: ['superadmin'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
          },
        },
        put: {
          summary: 'Хандалтын горим тохируулах',
          description:
            '`public`: хэн ч Government SSO-оор нэвтэрнэ; `private`: зөвхөн админаас урьдчилан бүртгэсэн хэрэглэгч. Горим уншигдахгүй бол SSO нэвтрэлт ЗОГСОНО (fail-open биш).',
          tags: ['superadmin'],
          security: [
            {
              bearerAuth: [],
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    mode: {
                      type: 'string',
                      enum: ['public', 'private'],
                    },
                  },
                  required: ['mode'],
                },
              },
            },
          },
          responses: {
            '200': {
              $ref: '#/components/responses/Ok',
            },
            '400': {
              $ref: '#/components/responses/Error',
            },
            '401': {
              $ref: '#/components/responses/Error',
            },
            '403': {
              $ref: '#/components/responses/Error',
            },
            '422': {
              $ref: '#/components/responses/Error',
            },
          },
        },
      },
      '/sign/init': {
        post: {
          summary: 'PDF гарын үсэг эхлүүлэх (eID PIN2)',
          description:
            'Нэвтэрсэн иргэний eID РЕГИСТРЭЭР eidmongolia /v3 PIN2 гарын үсгийн session эхлүүлж, `session_id` + `verification_code` буцаана. Иргэн утсан дээрээ PIN2-оор зөвшөөрнө (ХУУЛЬ ЗҮЙН зөвшөөрөл). Гарын үсэг/тамганы зураг эх PDF-д давхарлагдаж, digest ТҮҮНЭЭС тооцогдоно — иргэний зөвшөөрсөн байт болон эцсийн файлын суурь байт ижил. `onBehalfOf` (NTRMN-<РД>) өгвөл байгууллагын нэрийн өмнөөс; төлөөллийн эрхийг eidmongolia шалгаж, эрхгүй бол **403**.',
          tags: ['sign'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    file: { type: 'string', format: 'binary', description: 'PDF (≤25 MB)' },
                    onBehalfOf: {
                      type: 'string',
                      description: 'NTRMN-<РД> — байгууллагын нэрийн өмнөөс (сонголттой)',
                    },
                  },
                  required: ['file'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/sign/{id}': {
        get: {
          summary: 'Гарын үсгийн session-ийн төлөв',
          description:
            'Төлөв: `running` | `completed` | `failed` | `rejected`. Зөвхөн session-ийг эхлүүлсэн иргэн хандана — "байхгүй" ба "чинийх биш" ИЖИЛ 404 (IDOR хаалт).',
          tags: ['sign'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/sign/{id}/download': {
        get: {
          summary: 'Гарын үсэгтэй PDF татах',
          description:
            'eidmongolia-ийн албан ёсны PAdES-T stamp (timestamp + verify хуудас); боломжгүй бол СЕРВЕРИЙН Document-Signer-ээр PDF-д гарын үсэг шигтгэнэ. Дуусаагүй session нь 400; өөр иргэний session нь 404.',
          tags: ['sign'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Гарын үсэгтэй PDF',
              content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
            },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/site/appearance': {
        get: {
          summary: 'Сайтын нийтийн харагдац',
          description:
            'НЭВТРЭЛТГҮЙ — нэвтрээгүй зочны landing үүнийг уншдаг. accent нь preset нэр ("cobalt" г.м.) эсвэл "#rrggbb" custom hex. Богино TTL (60с) кэштэй; админ өөрчлөлт кэшийг шууд цэвэрлэнэ.',
          tags: ['site'],
          responses: {
            '200': {
              description: 'Харагдацын default',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: { data: { $ref: '#/components/schemas/SiteAppearance' } },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        put: {
          summary: 'Сайтын нийтийн харагдацыг шинэчлэх',
          description:
            'Утгын шалгалт: accent нь preset нэр эсвэл #rrggbb (3-оронтой hex ЗӨВШӨӨРӨХГҮЙ); font/style/theme нь тогтсон enum. Буруу утга DB-д хүрэхгүй.',
          tags: ['site'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    accent: { type: 'string', maxLength: 32 },
                    font: { type: 'string', enum: ['inter', 'serif', 'system'] },
                    style: { type: 'string', enum: ['comfortable', 'compact'] },
                    theme: { type: 'string', enum: ['light', 'dark', 'system'] },
                  },
                  required: ['accent', 'font', 'style', 'theme'],
                },
              },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/themes/active': {
        get: {
          summary: 'Идэвхтэй landing загвар',
          description:
            'НЭВТРЭЛТГҮЙ — landing SSR уншдаг. Идэвхтэй theme байхгүй бол 404. Богино TTL кэштэй.',
          tags: ['themes'],
          responses: {
            '200': {
              description: 'Идэвхтэй theme',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: { data: { $ref: '#/components/schemas/Theme' } },
                      },
                    ],
                  },
                },
              },
            },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/themes': {
        get: {
          summary: 'Загваруудыг жагсаах',
          tags: ['themes'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Загварууд',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: { type: 'array', items: { $ref: '#/components/schemas/Theme' } },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
          },
        },
        post: {
          summary: 'Шинэ загвар үүсгэх',
          description:
            'config нь ЧӨЛӨӨТ JSONB (landing-ийн текст/цэс хоёр хэлээр). appearance хэсэг нь enum/hex-ээр шалгагдана; нийт хэмжээ ≤128 KiB (DoS хамгаалалт).',
          tags: ['themes'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ThemeUpsert' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Үүсгэгдсэн загвар',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: { data: { $ref: '#/components/schemas/Theme' } },
                      },
                    ],
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/themes/{id}': {
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        get: {
          summary: 'Загварыг авах',
          tags: ['themes'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Загвар',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: { data: { $ref: '#/components/schemas/Theme' } },
                      },
                    ],
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
        put: {
          summary: 'Загварыг шинэчлэх',
          tags: ['themes'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ThemeUpsert' } },
            },
          },
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
            '422': { $ref: '#/components/responses/Error' },
          },
        },
        delete: {
          summary: 'Загварыг устгах',
          description:
            'ИДЭВХТЭЙ загварыг устгах боломжгүй (400) — landing эх сурвалжгүй болно. Эхлээд өөр загварыг идэвхжүүлнэ.',
          tags: ['themes'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '400': { $ref: '#/components/responses/Error' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/themes/{id}/active': {
        put: {
          summary: 'Загварыг идэвхжүүлэх',
          description:
            'Нэг загварыг идэвхтэй болгож БУСДЫГ идэвхгүй болгоно. Partial unique index-ийн улмаас алхмууд НЭГ транзакцид явна.',
          tags: ['themes'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { $ref: '#/components/responses/Ok' },
            '401': { $ref: '#/components/responses/Error' },
            '403': { $ref: '#/components/responses/Error' },
            '404': { $ref: '#/components/responses/Error' },
          },
        },
      },
      '/users/me': {
        get: {
          summary: 'Одоогийн хэрэглэгчийн профайлыг буцаах',
          description:
            'Authorization header дахь JWT-ээс баталгаажуулагдсан хэрэглэгчийг уншиж, тохирох бичлэгийг буцаана. Хэрэглэгчийг тогтвортой primary key-ээр (email-ээр БИШ) хайна — eID хэрэглэгчид email-гүй байдаг.',
          tags: ['users'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'User profile',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/BaseResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: {
                            type: 'object',
                            properties: { user: { $ref: '#/components/schemas/UserResponse' } },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '401': {
              description: 'Missing or invalid token',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/BaseResponse' } },
              },
            },
            '404': {
              description: 'User no longer exists',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/BaseResponse' } },
              },
            },
          },
        },
      },
    },
  };
}
