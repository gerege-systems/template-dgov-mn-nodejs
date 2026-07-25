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
      schemas: { BaseResponse: baseResponseSchema },
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
    },
  };
}
