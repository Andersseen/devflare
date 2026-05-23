import { renderLayout } from './layout';

export function renderSignupPage(): string {
  return renderLayout({
    title: 'Sign Up',
    body: `
      <and-card variant="elevated" padded
        and-layout="vertical gap:md"
        and-motion="fade-in slide-in-up"
        and-motion-trigger="enter"
        and-motion-duration="600ms"
        and-motion-delay="100ms">

        <div and-layout="horizontal justify:center align:center gap:sm">
          <and-icon name="lock" size="24"></and-icon>
          <span and-text="h6 weight:bold color:foreground">DevFlare Auth</span>
        </div>

        <div and-layout="vertical gap:xs">
          <h1 and-text="h4 align:center color:foreground">Create an account</h1>
          <p and-text="p-sm align:center color:muted">Enter your details to get started</p>
        </div>

        <form id="signup-form" and-layout="vertical gap:sm">
          <div and-layout="vertical gap:xs">
            <label for="name" and-text="p-xs color:foreground weight:medium">Full name</label>
            <div and-layout="horizontal gap:sm align:center">
              <and-icon name="user" size="16" color="hsl(var(--muted-foreground))"></and-icon>
              <and-input
                id="name"
                data-field="name"
                type="text"
                placeholder="John Doe"
                required
                style="flex:1">
              </and-input>
            </div>
          </div>

          <div and-layout="vertical gap:xs">
            <label for="email" and-text="p-xs color:foreground weight:medium">Email</label>
            <div and-layout="horizontal gap:sm align:center">
              <and-icon name="mail" size="16" color="hsl(var(--muted-foreground))"></and-icon>
              <and-input
                id="email"
                data-field="email"
                type="email"
                placeholder="you@example.com"
                required
                style="flex:1">
              </and-input>
            </div>
          </div>

          <div and-layout="vertical gap:xs">
            <label for="password" and-text="p-xs color:foreground weight:medium">Password</label>
            <div and-layout="horizontal gap:sm align:center">
              <and-icon name="lock" size="16" color="hsl(var(--muted-foreground))"></and-icon>
              <and-input
                id="password"
                data-field="password"
                type="password"
                placeholder="Min. 8 characters"
                required
                style="flex:1">
              </and-input>
            </div>
          </div>

          <div and-layout="vertical gap:xs">
            <label for="confirm-password" and-text="p-xs color:foreground weight:medium">Confirm password</label>
            <div and-layout="horizontal gap:sm align:center">
              <and-icon name="lock" size="16" color="hsl(var(--muted-foreground))"></and-icon>
              <and-input
                id="confirm-password"
                data-field="confirmPassword"
                type="password"
                placeholder="Repeat your password"
                required
                style="flex:1">
              </and-input>
            </div>
          </div>

          <and-button
            id="submit-btn"
            type="submit"
            variant="default"
            style="width: 100%;">
            <and-icon slot="start" name="plus" size="16"></and-icon>
            Create Account
          </and-button>
        </form>

        <p and-text="p-sm align:center color:muted">
          Already have an account? <a href="/login">Sign in</a>
        </p>
      </and-card>
    `,
    scripts: `
      <script>
        (function() {
          const form = document.getElementById('signup-form');
          const submitBtn = document.getElementById('submit-btn');
          const toaster = document.getElementById('toaster');
          const values = {};

          form.querySelectorAll('and-input[data-field]').forEach(function(input) {
            input.addEventListener('andInput', function(e) {
              values[input.dataset.field] = e.detail;
            });
          });

          form.addEventListener('submit', async function(e) {
            e.preventDefault();

            const name = (values.name || '').trim();
            const email = (values.email || '').trim();
            const password = values.password || '';
            const confirmPassword = values.confirmPassword || '';

            if (!name || !email || !password || !confirmPassword) {
              toaster.present('Please fill in all fields', 'destructive');
              return;
            }

            if (password.length < 8) {
              toaster.present('Password must be at least 8 characters', 'destructive');
              return;
            }

            if (password !== confirmPassword) {
              toaster.present('Passwords do not match', 'destructive');
              return;
            }

            submitBtn.loading = true;

            try {
              const res = await fetch('/api/auth/sign-up/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name, email, password })
              });

              const data = await res.json();

              if (!res.ok) {
                throw new Error(data.message || data.error || 'Registration failed');
              }

              toaster.present('Account created successfully', 'success');
              const params = new URLSearchParams(window.location.search);
              const callback = params.get('callback') || '/';
              setTimeout(function() { window.location.href = callback; }, 600);
            } catch (err) {
              submitBtn.loading = false;
              toaster.present(err.message || 'Something went wrong. Please try again.', 'destructive');
            }
          });
        })();
      </script>
    `,
  });
}
