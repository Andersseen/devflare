import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardContent,
  VoltCardHeader,
  VoltCardTitle,
} from '@voltui/components';
import { HeaderFindingsComponent } from '../components/header-findings.component';
import { SecretNoticeComponent } from '../components/secret-notice.component';
import { SecurityHeaders } from '../tools/security-headers.service';

const SAMPLE = `HTTP/2 200
content-type: text/html; charset=utf-8
strict-transport-security: max-age=63072000; includeSubDomains
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
cache-control: public, max-age=600
set-cookie: session=abc; Secure; HttpOnly`;

@Component({
  selector: 'app-security-headers-page',
  imports: [
    FormsModule,
    LucideAngularModule,
    VoltCard,
    VoltCardContent,
    VoltCardHeader,
    VoltCardTitle,
    HeaderFindingsComponent,
    SecretNoticeComponent,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Security Headers</h1>
        <p class="mt-1 text-muted-foreground">
          Paste response headers — from
          <code class="font-mono text-sm">curl -I</code>
          or the browser's network panel — and see what each one does.
        </p>
        <p class="mt-2 text-sm text-muted-foreground">
          No score: whether a header matters depends on what the response is.
          Parsed in this tab; nothing is sent anywhere.
        </p>
      </div>

      <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <volt-card>
          <volt-card-header>
            <volt-card-title>Response headers</volt-card-title>
          </volt-card-header>
          <volt-card-content class="space-y-3">
            <label for="headers-input" class="sr-only">Response headers</label>
            <textarea
              id="headers-input"
              rows="14"
              spellcheck="false"
              autocomplete="off"
              autocapitalize="off"
              class="w-full rounded-md border border-border bg-background p-3 font-mono text-xs"
              placeholder="content-security-policy: default-src 'self'"
              [ngModel]="input()"
              (ngModelChange)="input.set($event)"
            ></textarea>
            <div class="flex flex-wrap items-center gap-3 text-sm">
              <label class="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  [ngModel]="https()"
                  (ngModelChange)="https.set($event)"
                />
                Served over HTTPS
              </label>
              <button
                type="button"
                class="text-primary hover:underline"
                (click)="input.set(sample)"
              >
                Load an example
              </button>
            </div>
            <app-secret-notice [text]="input()" />
            @if (result().parsed.ignoredLines.length > 0) {
              <p class="text-xs text-muted-foreground">
                Ignored {{ result().parsed.ignoredLines.length }} line(s) that
                are not <code>name: value</code> headers.
              </p>
            }
          </volt-card-content>
        </volt-card>

        <volt-card>
          <volt-card-header>
            <volt-card-title>
              Findings
              @if (result().parsed.statusLine) {
                <span
                  class="ml-2 font-mono text-xs font-normal text-muted-foreground"
                >
                  {{ result().parsed.statusLine }}
                </span>
              }
            </volt-card-title>
          </volt-card-header>
          <volt-card-content>
            @if (result().parsed.headers.length === 0) {
              <p class="text-sm text-muted-foreground">
                Paste headers to see the analysis.
              </p>
            } @else {
              <app-header-findings [analysis]="result().analysis" />
            }
          </volt-card-content>
        </volt-card>
      </div>
    </div>
  `,
})
export default class SecurityHeadersPage {
  readonly #securityHeaders = inject(SecurityHeaders);

  protected readonly sample = SAMPLE;
  protected readonly input = signal('');
  protected readonly https = signal(true);

  protected readonly result = computed(() =>
    this.#securityHeaders.inspect(this.input(), this.https()),
  );
}
