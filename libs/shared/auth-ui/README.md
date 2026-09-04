# @org/auth-ui

Optional Angular UI for DevAuth consumers. It sits above the signals-first
`@org/auth` adapter and never implements OAuth/OIDC itself.

```ts
import { inject } from '@angular/core';
import { DevAuth } from '@org/auth';
import { DevAuthSignIn, DevAuthUserButton } from '@org/auth-ui';

const auth = inject(DevAuth); // Headless usage remains available.
```

```html
<dev-auth-sign-in returnTo="/projects" /> <dev-auth-user-button />
```

Application actions can be projected into the account menu. Give each projected
action `role="menuitem"` so it joins keyboard navigation:

```html
<dev-auth-user-button>
  <a devAuthUserMenuActions role="menuitem" routerLink="/settings">Settings</a>
</dev-auth-user-button>
```

Use the `--dev-auth-*` CSS custom properties on either component to align it with
the consumer's design system. The main tokens are `--dev-auth-surface`,
`--dev-auth-foreground`, `--dev-auth-muted`, `--dev-auth-border`,
`--dev-auth-primary`, `--dev-auth-primary-foreground`, `--dev-auth-focus`,
`--dev-auth-radius`, and `--dev-auth-shadow`.

The UI SDK is optional. Angular consumers may use `@org/auth` without it;
non-Angular servers may use `@org/dev-auth-core`; any application may integrate
through raw OAuth 2.1/OIDC without either SDK.

## Publication readiness

The components are standalone, directly exported, and have no import-time side
effects. This workspace currently resolves libraries to TypeScript source and does
not give them package manifests or Angular package build targets. Independent npm
publication therefore still requires package exports/build output, emitted types,
and explicit Angular, `@org/auth`, Lucide, and Quartz peer dependency metadata.
