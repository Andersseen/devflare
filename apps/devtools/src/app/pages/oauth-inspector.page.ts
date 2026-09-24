import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JsonPipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltButton,
  VoltCard,
  VoltCardContent,
  VoltCardHeader,
  VoltCardTitle,
  VoltTabs,
  VoltTabsContent,
  VoltTabsList,
  VoltTabsTrigger,
} from '@voltui/components';
import { CheckListComponent } from '../components/check-list.component';
import { CopyButtonComponent } from '../components/copy-button.component';
import { SecretNoticeComponent } from '../components/secret-notice.component';
import { OAuthInspector } from '../tools/oauth-inspector.service';

const TEXTAREA =
  'w-full rounded-md border border-border bg-background p-3 font-mono text-xs';

@Component({
  selector: 'app-oauth-inspector-page',
  imports: [
    FormsModule,
    JsonPipe,
    LucideAngularModule,
    VoltButton,
    VoltCard,
    VoltCardContent,
    VoltCardHeader,
    VoltCardTitle,
    VoltTabs,
    VoltTabsContent,
    VoltTabsList,
    VoltTabsTrigger,
    CheckListComponent,
    CopyButtonComponent,
    SecretNoticeComponent,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">
          OAuth / OIDC Inspector
        </h1>
        <p class="mt-1 text-muted-foreground">
          Debug an authorization request, read a JWT and check PKCE values.
        </p>
        <p class="mt-2 text-sm text-muted-foreground">
          An inspector, not a client: nothing here contacts a server. Tokens are
          decoded in this tab and never sent anywhere.
        </p>
      </div>

      <volt-tabs [(value)]="tab">
        <volt-tabs-list>
          <volt-tabs-trigger value="url">Authorization URL</volt-tabs-trigger>
          <volt-tabs-trigger value="jwt">JWT</volt-tabs-trigger>
          <volt-tabs-trigger value="pkce">PKCE</volt-tabs-trigger>
        </volt-tabs-list>

        <!-- Authorization URL -->
        <volt-tabs-content value="url">
          <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <volt-card>
              <volt-card-content class="space-y-3">
                <label for="auth-url" class="text-sm font-medium"
                  >Authorization URL</label
                >
                <textarea
                  id="auth-url"
                  rows="6"
                  spellcheck="false"
                  autocomplete="off"
                  [class]="textarea"
                  placeholder="https://auth.example.com/oauth2/authorize?client_id=…&response_type=code&…"
                  [ngModel]="authUrl()"
                  (ngModelChange)="authUrl.set($event)"
                ></textarea>
                <app-secret-notice [text]="authUrl()" />
              </volt-card-content>
            </volt-card>

            <volt-card>
              <volt-card-header
                ><volt-card-title>Request</volt-card-title></volt-card-header
              >
              <volt-card-content class="space-y-4">
                @if (urlReport(); as r) {
                  @if (r.error) {
                    <p class="text-sm text-red-600" role="alert">
                      {{ r.error }}
                    </p>
                  } @else if (r.report; as report) {
                    <dl
                      class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm"
                    >
                      <dt class="text-muted-foreground">Endpoint</dt>
                      <dd class="break-all font-mono text-xs">
                        {{ report.endpoint }}
                      </dd>
                      @for (row of paramRows(); track row[0]) {
                        <dt class="text-muted-foreground">{{ row[0] }}</dt>
                        <dd class="break-all font-mono text-xs">
                          {{ row[1] }}
                        </dd>
                      }
                      @for (other of report.otherParams; track $index) {
                        <dt class="text-muted-foreground">{{ other.name }}</dt>
                        <dd class="break-all font-mono text-xs">
                          {{ other.value }}
                        </dd>
                      }
                    </dl>
                    @if (report.isOidc) {
                      <p class="text-xs text-muted-foreground">
                        OpenID Connect request (scope includes openid).
                      </p>
                    }
                    <app-check-list [checks]="report.checks" />
                    <p class="text-xs text-muted-foreground">
                      These checks read the URL only. Whether the server
                      enforces PKCE or validates the redirect URI cannot be seen
                      from here.
                    </p>
                  }
                } @else {
                  <p class="text-sm text-muted-foreground">
                    Paste an authorization URL.
                  </p>
                }
              </volt-card-content>
            </volt-card>
          </div>
        </volt-tabs-content>

        <!-- JWT -->
        <volt-tabs-content value="jwt">
          <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <volt-card>
              <volt-card-content class="space-y-3">
                <label for="jwt" class="text-sm font-medium">Token</label>
                <textarea
                  id="jwt"
                  rows="8"
                  spellcheck="false"
                  autocomplete="off"
                  [class]="textarea"
                  placeholder="eyJhbGciOi…"
                  [ngModel]="jwt()"
                  (ngModelChange)="jwt.set($event)"
                ></textarea>
                <p class="text-xs text-muted-foreground">
                  A "Bearer " prefix is ignored. The token is only decoded in
                  this tab.
                </p>
              </volt-card-content>
            </volt-card>

            <volt-card>
              <volt-card-header>
                <volt-card-title>
                  Decoded
                  <span
                    class="ml-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-normal"
                  >
                    not verified
                  </span>
                </volt-card-title>
              </volt-card-header>
              <volt-card-content class="space-y-4">
                @if (jwtReport(); as r) {
                  @if (r.error) {
                    <p class="text-sm text-red-600" role="alert">
                      {{ r.error }}
                    </p>
                  } @else if (r.report; as report) {
                    <div
                      class="rounded-md p-3 text-sm"
                      [class]="timeClass(report.timeState)"
                    >
                      {{ timeLabel(report.timeState) }}
                    </div>
                    <dl
                      class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm"
                    >
                      <dt class="text-muted-foreground">Issuer</dt>
                      <dd class="break-all font-mono text-xs">
                        {{ report.issuer ?? '—' }}
                      </dd>
                      <dt class="text-muted-foreground">Subject</dt>
                      <dd class="break-all font-mono text-xs">
                        {{ report.subject ?? '—' }}
                      </dd>
                      <dt class="text-muted-foreground">Audience</dt>
                      <dd class="break-all font-mono text-xs">
                        {{ report.audience.join(', ') || '—' }}
                      </dd>
                      @for (time of report.times; track time.claim) {
                        <dt class="text-muted-foreground">{{ time.claim }}</dt>
                        <dd class="font-mono text-xs">
                          {{ time.iso }}
                          <span class="text-muted-foreground"
                            >({{ time.relative }})</span
                          >
                        </dd>
                      }
                    </dl>
                    <app-check-list [checks]="report.checks" />
                    <div class="space-y-1">
                      <p class="text-xs font-medium text-muted-foreground">
                        Header
                      </p>
                      <pre
                        class="overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-xs"
                        >{{ report.header | json }}</pre
                      >
                    </div>
                    <div class="space-y-1">
                      <p class="text-xs font-medium text-muted-foreground">
                        Payload
                      </p>
                      <pre
                        class="overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-xs"
                        >{{ report.payload | json }}</pre
                      >
                    </div>
                  }
                } @else {
                  <p class="text-sm text-muted-foreground">Paste a JWT.</p>
                }
              </volt-card-content>
            </volt-card>
          </div>
        </volt-tabs-content>

        <!-- PKCE -->
        <volt-tabs-content value="pkce">
          <volt-card>
            <volt-card-content class="space-y-5">
              <div class="space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <label for="verifier" class="text-sm font-medium"
                    >code_verifier</label
                  >
                  <div class="flex gap-2">
                    <volt-button
                      size="sm"
                      variant="outline"
                      (click)="generate()"
                    >
                      <lucide-icon name="refresh-cw" class="mr-1 h-4 w-4" />
                      Generate
                    </volt-button>
                    <app-copy-button [value]="verifier()" />
                  </div>
                </div>
                <input
                  id="verifier"
                  spellcheck="false"
                  autocomplete="off"
                  class="h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-xs"
                  [ngModel]="verifier()"
                  (ngModelChange)="setVerifier($event)"
                />
                @if (verifier()) {
                  <p
                    class="text-xs"
                    [class]="
                      verifierCheck().valid ? 'text-green-600' : 'text-red-600'
                    "
                  >
                    {{ verifierCheck().message }}
                  </p>
                }
              </div>

              <div class="space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-sm font-medium">code_challenge (S256)</span>
                  <app-copy-button [value]="challenge()" />
                </div>
                <output
                  class="block min-h-10 break-all rounded-md border border-border bg-muted/40 px-3 py-2.5 font-mono text-xs"
                >
                  {{ challenge() || '—' }}
                </output>
                <p class="text-xs text-muted-foreground">
                  BASE64URL(SHA-256(verifier)) — RFC 7636 §4.2, computed with
                  Web Crypto.
                </p>
              </div>

              <div class="space-y-2 border-t border-border pt-4">
                <label for="expected" class="text-sm font-medium"
                  >Check against a code_challenge</label
                >
                <input
                  id="expected"
                  spellcheck="false"
                  autocomplete="off"
                  class="h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-xs"
                  placeholder="The challenge sent in the authorization URL"
                  [ngModel]="expected()"
                  (ngModelChange)="expected.set($event)"
                />
                @if (expected() && challenge()) {
                  <p
                    class="text-sm"
                    [class]="matches() ? 'text-green-600' : 'text-red-600'"
                    role="status"
                  >
                    {{
                      matches()
                        ? 'The verifier produces this challenge.'
                        : 'The verifier does not produce this challenge.'
                    }}
                  </p>
                }
              </div>
            </volt-card-content>
          </volt-card>
        </volt-tabs-content>
      </volt-tabs>
    </div>
  `,
})
export default class OAuthInspectorPage {
  readonly #inspector = inject(OAuthInspector);

  protected readonly textarea = TEXTAREA;
  protected readonly tab = signal<'url' | 'jwt' | 'pkce'>('url');

  protected readonly authUrl = signal('');
  protected readonly jwt = signal('');
  protected readonly verifier = signal('');
  protected readonly challenge = signal('');
  protected readonly expected = signal('');

  protected readonly urlReport = computed(() => {
    const value = this.authUrl().trim();
    if (!value) return null;
    try {
      return {
        report: this.#inspector.inspectAuthorizationUrl(value),
        error: null,
      };
    } catch (error) {
      return { report: null, error: (error as Error).message };
    }
  });

  protected readonly paramRows = computed<[string, string][]>(() => {
    const report = this.urlReport()?.report;
    if (!report) return [];
    const p = report.params;
    const rows: [string, string | undefined][] = [
      ['client_id', p.clientId],
      ['redirect_uri', p.redirectUri],
      ['response_type', p.responseType],
      ['scope', p.scopes.join(' ') || undefined],
      ['state', p.state],
      ['nonce', p.nonce],
      ['code_challenge', p.codeChallenge],
      ['code_challenge_method', p.codeChallengeMethod],
      ['prompt', p.prompt],
      ['response_mode', p.responseMode],
    ];
    return rows.filter((row): row is [string, string] => row[1] !== undefined);
  });

  protected readonly jwtReport = computed(() => {
    const value = this.jwt().trim();
    if (!value) return null;
    try {
      return { report: this.#inspector.decodeJwt(value), error: null };
    } catch (error) {
      return { report: null, error: (error as Error).message };
    }
  });

  protected readonly verifierCheck = computed(() =>
    this.#inspector.checkVerifier(this.verifier()),
  );
  protected readonly matches = computed(
    () => this.challenge() === this.expected().trim(),
  );

  protected generate(): void {
    void this.setVerifier(this.#inspector.generateVerifier());
  }

  protected async setVerifier(value: string): Promise<void> {
    this.verifier.set(value);
    this.challenge.set(
      value ? await this.#inspector.deriveChallenge(value) : '',
    );
  }

  protected timeLabel(state: string): string {
    return (
      {
        valid: 'Within its validity window (by the clock of this device).',
        expired: 'Expired: "exp" is in the past.',
        'not-yet-valid': 'Not valid yet: "nbf" is in the future.',
        'future-issued':
          '"iat" is in the future — clock skew or a forged token.',
      } as Record<string, string>
    )[state];
  }

  protected timeClass(state: string): string {
    return state === 'valid'
      ? 'border border-green-600/30 bg-green-600/5'
      : 'border border-amber-500/40 bg-amber-500/10';
  }
}
