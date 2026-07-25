// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Энэ модуль нь зөвхөн жинхэнэ тогтмол утгуудад зориулагдсан — бүтэцлэгдсэн
// DomainError төрөл нь apperror дотор байрладаг.

export const EndpointV1 = '/api/v1';

export const EnvironmentProduction = 'production';
export const EnvironmentDevelopment = 'development';

// Config loader-ийн ашигладаг sentinel алдаанууд.
export const ErrLoadConfig = new Error('failed to load config file');
export const ErrParseConfig = new Error('failed to parse env to config struct');
export const ErrEmptyVar = new Error('required variable environment is empty');

// Логийн бүтэцлэгдсэн талбаруудын нэрс.
export const LoggerCategory = 'category';
export const LoggerCategoryServer = 'server';
export const LoggerCategoryConfig = 'config';
export const LoggerCategoryDatabase = 'database';
export const LoggerCategoryHTTP = 'http';
export const LoggerCategoryMigration = 'migration';
export const LoggerCategoryCORS = 'cors';
export const LoggerCategorySeeder = 'seeder';
export const LoggerCategoryCache = 'cache';
export const LoggerCategoryAI = 'ai';

export const LoggerFile = 'file';
