import { render as renderVerifyBody } from './verify.flow.js';

export function renderVerifyPage(error?: string): string {
  return renderVerifyBody({ error });
}
