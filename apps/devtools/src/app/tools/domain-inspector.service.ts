import { Injectable } from '@angular/core';
import type { InspectionReport } from '../../server/lib/domain-inspector/inspect';
import { apiRequest } from '../connected/api';

export type { InspectionReport };

/** Client for DevTools' Domain Inspector endpoint. */
@Injectable({ providedIn: 'root' })
export class DomainInspector {
  inspect(target: string): Promise<InspectionReport> {
    return apiRequest('/api/v1/domain-inspector', {
      method: 'POST',
      body: { target },
    });
  }
}
