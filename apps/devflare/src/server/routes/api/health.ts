import { defineEventHandler } from 'h3';

/**
 * Health check endpoint for the DevFlare application.
 * Returns service status and basic metadata.
 */
export default defineEventHandler(() => {
  return {
    status: 'ok',
    service: 'devflare',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  };
});
