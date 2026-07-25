// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type { Router } from 'express';

import { newSuccessResponse, wrap } from '../response.js';
import type { Deps } from './index.js';

/**
 * registerMetaRoutes нь платформын мета endpoint-уудыг бүртгэнэ — API-ийн
 * хувилбар, ажиллаж буй орчны товч мэдээлэл. Эдгээр нь нэвтрэлт шаарддаггүй.
 */
export function registerMetaRoutes(router: Router, _deps: Deps): void {
  router.get(
    '/',
    wrap((req, res) => {
      newSuccessResponse(req, res, 200, 'Government Template Platform V3.0 API', {
        name: 'template-dgov-mn-nodejs',
        version: '3.0.0',
        stack: 'Node.js · Express 5 · PostgreSQL · Redis',
      });
    }),
  );
}
