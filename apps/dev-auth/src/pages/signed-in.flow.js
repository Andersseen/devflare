import { renderValue } from '@flowview/runtime';

export function render(context) {
  let output = '';
  output += '<and-card';
  output += ' variant="elevated"';
  output += ' padded';
  output += ' and-layout="vertical gap:md align:center"';
  output += ' and-motion="fade-in slide-in-up"';
  output += ' and-motion-trigger="enter"';
  output += ' and-motion-duration="600ms"';
  output += '>';
    output += '\n\n  ';
    output += '<div and-layout="horizontal justify:center align:center gap:sm">\n    <and-icon name="user" size="24"></and-icon>\n    <span and-text="h6 weight:bold color:foreground">DevAuth</span>\n  </div>';
    output += '\n\n  ';
    output += '<div';
    output += ' and-layout="vertical gap:xs"';
    output += '>';
      output += '\n    ';
      output += '<h1 and-text="h4 align:center color:foreground">You are signed in</h1>';
      output += '\n    ';
      output += '<p';
      output += ' and-text="p-sm align:center color:muted"';
      output += '>';
        output += renderValue(context.email);
      output += '</p>';
      output += '\n  ';
    output += '</div>';
    output += '\n\n  ';
    output += '<p and-text="p-xs align:center color:muted">\n    This is the identity provider itself, not an application. Open the app you\n    want to use and sign in from there — it will bring you back here only if it\n    needs you to authenticate.\n  </p>';
    output += '\n\n  ';
    output += '<and-button id="signout-btn" variant="outline" data-full>\n    <and-icon slot="start" name="log-out" size="16"></and-icon>\n    Sign out\n  </and-button>';
    output += '\n';
  output += '</and-card>';
  output += '\n\n<script>\n  (function() {\n    const button = document.getElementById(\'signout-btn\');\n    const toaster = document.getElementById(\'toaster\');\n\n    button.addEventListener(\'click\', async function() {\n      button.loading = true;\n\n      try {\n        const res = await fetch(\'/api/auth/sign-out\', {\n          method: \'POST\',\n          headers: { \'Content-Type\': \'application/json\' },\n          credentials: \'include\',\n          body: \'{}\'\n        });\n\n        if (!res.ok) {\n          const data = await res.json().catch(function() { return {}; });\n          throw new Error(data.message || data.error || \'Could not sign out\');\n        }\n\n        window.location.href = \'/login\';\n      } catch (err) {\n        button.loading = false;\n        toaster.present(err.message || \'Could not sign out\', \'error\');\n      }\n    });\n  })();\n</script>\n';

  return output;
}
