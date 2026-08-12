import { defineEventHandler } from 'h3';
import { forward } from '../../../../lib/admin-proxy';

/** GET /api/admin/settings — GitHub sign-in status and the signup allowlist. */
export default defineEventHandler((event) => forward(event, '/admin/settings'));
