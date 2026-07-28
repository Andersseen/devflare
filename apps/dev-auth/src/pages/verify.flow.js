import { renderValue } from '@flowview/runtime';

export function render(context) {
  let output = '';
  output += '<!DOCTYPE html>\n';
  output += '<html';
  output += ' lang="en"';
  output += ' data-color="devflare"';
  output += '>';
    output += '\n  ';
    output += '<head>\n    <meta charset="UTF-8"/>\n    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>\n    <title>Verify Email — DevFlare Auth</title>\n    <link rel="stylesheet" href="https://unpkg.com/@andersseen/web-components@latest/dist/and-web-components/and-web-components.css"/>\n    <script type="module" src="https://unpkg.com/@andersseen/web-components@latest/dist/and-web-components/and-web-components.esm.js"></script>\n    <script src="https://unpkg.com/@andersseen/icon@latest" type="module"></script>\n    <style>\n      body { font-family: system-ui, -apple-system, sans-serif; margin: 0; min-height: 100vh; }\n    </style>\n  </head>';
    output += '\n  ';
    output += '<body';
    output += ' and-layout="vertical justify:center align:center gap:lg"';
    output += ' style="min-height:100vh;background:hsl(var(--background))"';
    output += '>';
      output += '\n    ';
      output += '<div and-layout="horizontal gap:sm align:center">\n      <and-icon name="mail" size="24"></and-icon>\n      <span and-text="h6 weight:bold color:foreground">DevFlare Auth</span>\n    </div>';
      output += '\n    ';
      output += '<and-card';
      output += ' variant="elevated"';
      output += ' padded';
      output += ' and-motion="fade-in slide-in-up"';
      output += ' and-motion-trigger="enter"';
      output += '>';
        output += '\n      ';
        output += '<h1 and-text="h4 align:center color:foreground">Verify your email</h1>';
        output += '\n      ';
        output += '<p and-text="p-sm align:center color:muted">Please check your inbox and click the verification link.</p>';
        output += '\n      ';
        if (context.error) {
          output += '\n        ';
          output += '<div';
          output += ' style="color:#ef4444;margin-bottom:1rem;text-align:center"';
          output += '>';
            output += renderValue(context.error);
          output += '</div>';
          output += '\n      ';
        }
        output += '\n      ';
        output += '<div and-layout="vertical gap:sm">\n        <p and-text="p-sm align:center color:muted">\n          Didn\'t receive it? <a href="/login">Try logging in</a> to resend.\n        </p>\n      </div>';
        output += '\n    ';
      output += '</and-card>';
      output += '\n  ';
    output += '</body>';
    output += '\n';
  output += '</html>';
  output += '\n';

  return output;
}
