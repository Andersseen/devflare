import { renderLayout } from './layout';

export function renderForgotPage(): string {
  return renderLayout({
    title: 'Reset Password',
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
          <h1 and-text="h4 align:center color:foreground">Forgot password?</h1>
          <p and-text="p-sm align:center color:muted">Enter your email and we'll send you a reset link</p>
        </div>

        <form id="forgot-form" and-layout="vertical gap:sm">
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

          <and-button
            id="submit-btn"
            type="submit"
            variant="default"
            style="width: 100%;">
            <and-icon slot="start" name="arrow-right" size="16"></and-icon>
            Send Reset Link
          </and-button>
        </form>

        <p and-text="p-sm align:center color:muted">
          Remember your password? <a href="/login">Sign in</a>
        </p>
      </and-card>
    `,
    scripts: `
      <script>
        (function() {
          const form = document.getElementById('forgot-form');
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

            const email = (values.email || '').trim();

            if (!email) {
              toaster.present('Please enter your email', 'destructive');
              return;
            }

            submitBtn.loading = true;

            try {
              const res = await fetch('/api/auth/forget-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email })
              });

              const data = await res.json();

              if (!res.ok) {
                throw new Error(data.message || data.error || 'Failed to send reset link');
              }

              toaster.present('If an account exists, a reset link has been sent.', 'success');
            } catch (err) {
              toaster.present('If an account exists, a reset link has been sent.', 'success');
            } finally {
              submitBtn.loading = false;
            }
          });
        })();
      </script>
    `,
  });
}
