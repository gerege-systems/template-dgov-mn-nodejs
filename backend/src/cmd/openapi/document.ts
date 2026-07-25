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
      },
      requestBodies: {
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
