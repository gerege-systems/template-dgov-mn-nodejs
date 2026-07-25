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
      schemas: { BaseResponse: baseResponseSchema, UserResponse: userResponseSchema },
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
