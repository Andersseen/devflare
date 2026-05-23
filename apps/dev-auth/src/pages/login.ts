import { renderLayout } from './layout';

export function renderLoginPage(): string {
  return renderLayout({
    title: 'Sign In',
    body: `
      <and-card variant="elevated" padded
        and-layout="vertical gap:md"
        and-motion="fade-in slide-in-up"
        and-motion-trigger="enter"
        and-motion-duration="600ms">

        <div and-layout="horizontal justify:center align:center gap:sm">
          <and-icon name="lock" size="24"></and-icon>
          <span and-text="h6 weight:bold color:foreground">DevFlare Auth</span>
        </div>

        <div and-layout="vertical gap:xs">
          <h1 and-text="h4 align:center color:foreground">Welcome back</h1>
          <p and-text="p-sm align:center color:muted">Sign in to your account to continue</p>
        </div>

        <form id="login-form" and-layout="vertical gap:sm">
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
                placeholder="Enter your password"
                required
                style="flex:1">
              </and-input>
            </div>
          </div>

          <div and-layout="horizontal justify:end">
            <a href="/forgot" and-text="p-xs color:primary">Forgot password?</a>
          </div>

          <and-button
            id="submit-btn"
            type="submit"
            variant="default"
            style="width: 100%;">
            <and-icon slot="start" name="arrow-right" size="16"></and-icon>
            Sign In
          </and-button>
        </form>

        <p and-text="p-sm align:center color:muted">
          Don't have an account? <a href="/signup">Sign up</a>
        </p>
      </and-card>
    `,
    scripts: `
      <script>
        (function() {
          const form = document.getElementById('login-form');
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

            const email = values.email || '';
            const password = values.password || '';

            if (!email || !password) {
              toaster.present('Please fill in all fields', 'destructive');
              return;
            }

            submitBtn.loading = true;

            try {
              const res = await fetch('/api/auth/sign-in/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password })
              });

              const data = await res.json();

              if (!res.ok) {
                throw new Error(data.message || data.error || 'Invalid credentials');
              }

              toaster.present('Signed in successfully', 'success');
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
