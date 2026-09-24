import { Injectable } from '@angular/core';
import {
  analyzeHeaders,
  parseRawHeaders,
  type HeaderAnalysis,
  type ParsedHeaders,
} from './security-headers.analyzer';

/**
 * Security Headers Inspector — pasted headers only, analysed in the tab. The
 * rules live in ./security-headers.analyzer.ts, shared with Domain Inspector.
 */
@Injectable({ providedIn: 'root' })
export class SecurityHeaders {
  inspect(
    text: string,
    https?: boolean,
  ): { parsed: ParsedHeaders; analysis: HeaderAnalysis } {
    const parsed = parseRawHeaders(text);
    return { parsed, analysis: analyzeHeaders(parsed.headers, { https }) };
  }
}
