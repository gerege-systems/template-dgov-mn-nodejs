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
