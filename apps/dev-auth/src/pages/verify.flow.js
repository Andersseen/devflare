import { renderValue } from '@flowview/runtime';

export function render(context) {
  let output = '';
  output += '<and-card';
  output += ' variant="elevated"';
  output += ' padded';
  output += ' and-layout="vertical gap:md"';
  output += ' and-motion="fade-in slide-in-up"';
  output += ' and-motion-trigger="enter"';
  output += ' and-motion-duration="600ms"';
  output += '>';
    output += '\n\n  ';
    output += '<div and-layout="horizontal justify:center align:center gap:sm">\n    <and-icon name="mail" size="24"></and-icon>\n    <span and-text="h6 weight:bold color:foreground">DevFlare Auth</span>\n  </div>';
    output += '\n\n  ';
    output += '<div and-layout="vertical gap:xs">\n    <h1 and-text="h4 align:center color:foreground">Verify your email</h1>\n    <p and-text="p-sm align:center color:muted">Please check your inbox and click the verification link.</p>\n  </div>';
    output += '\n\n  ';
    if (context.error) {
      output += '\n    ';
      output += '<p';
      output += ' and-text="p-sm align:center"';
      output += ' style="color:hsl(var(--destructive))"';
      output += '>';
        output += renderValue(context.error);
      output += '</p>';
      output += '\n  ';
    }
    output += '\n\n  ';
    output += '<p and-text="p-sm align:center color:muted">\n    Didn\'t receive it? <a href="/login">Try logging in</a> to resend.\n  </p>';
    output += '\n';
  output += '</and-card>';
  output += '\n';

  return output;
}
