import { Injectable } from '@angular/core';
import type { ShortLink } from '../../server/lib/short-links/store';
import { apiRequest } from '../connected/api';

export type { ShortLink };

/** Client for DevTools' short-link API. Every rule is enforced server side. */
@Injectable({ providedIn: 'root' })
export class ShortLinks {
  list(): Promise<{ links: ShortLink[]; baseUrl: string | null }> {
    return apiRequest('/api/v1/short-links');
  }

  async create(slug: string, destination: string): Promise<ShortLink> {
    return (
      await apiRequest<{ link: ShortLink }>('/api/v1/short-links', {
        method: 'POST',
        body: { slug, destination },
      })
    ).link;
  }

  async update(
    id: string,
    patch: { slug?: string; destination?: string; active?: boolean },
  ): Promise<ShortLink> {
    return (
      await apiRequest<{ link: ShortLink }>(
        `/api/v1/short-links/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: patch,
        },
      )
    ).link;
  }

  remove(id: string): Promise<void> {
    return apiRequest(`/api/v1/short-links/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  /** Mirrors the server's slug rule for instant feedback; not a check. */
  looksLikeSlug(value: string): boolean {
    return /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(
      value.trim().toLowerCase(),
    );
  }

  /** Opens QR Code Studio on this link instead of drawing a code here. */
  qrLink(shortUrl: string): { path: string; queryParams: { text: string } } {
    return { path: '/qr-generator', queryParams: { text: shortUrl } };
  }
}
