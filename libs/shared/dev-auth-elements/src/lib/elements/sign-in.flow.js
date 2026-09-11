import { renderValue } from '@flowview/runtime';

export function render(context) {
  let output = '';
  if (context.status === 'loading') {
    output += '\n  ';
    output += '<and-card variant="elevated" padded class="dev-auth-card" role="status" aria-live="polite">\n    <and-skeleton height="1.25rem" width="60%"></and-skeleton>\n    <and-skeleton height="0.875rem" width="90%"></and-skeleton>\n    <and-skeleton height="2.5rem" width="100%"></and-skeleton>\n    <span class="dev-auth-visually-hidden">Checking your session…</span>\n  </and-card>';
    output += '\n';
  }   else if (context.status === 'authenticated') {
    output += '\n  ';
    output += '<and-card';
    output += ' variant="elevated"';
    output += ' padded';
    output += ' class="dev-auth-card"';
    output += ' role="status"';
    output += '>';
      output += '\n    ';
      output += '<div';
      output += ' class="dev-auth-identity-row"';
      output += '>';
        output += '\n      ';
        output += '<span';
        output += ' class="dev-auth-avatar"';
        output += ' aria-hidden="true"';
        output += '>';
          output += renderValue(context.initial);
        output += '</span>';
        output += '\n      ';
        output += '<div';
        output += '>';
          output += '\n        ';
          output += '<p class="dev-auth-description">Already signed in</p>';
          output += '\n        ';
          output += '<p';
          output += '>';
            output += renderValue(context.identity);
          output += '</p>';
          output += '\n      ';
        output += '</div>';
        output += '\n    ';
      output += '</div>';
      output += '\n  ';
    output += '</and-card>';
    output += '\n';
  } else {
    output += '\n  ';
    output += '<and-card';
    output += ' variant="elevated"';
    output += ' padded';
    output += ' class="dev-auth-card"';
    output += '>';
      output += '\n    ';
      output += '<and-card-header';
      output += '>';
        output += '\n      ';
        output += '<and-card-title';
        output += '>';
          output += renderValue(context.heading);
        output += '</and-card-title>';
        output += '\n      ';
        output += '<and-card-description';
        output += '>';
          output += renderValue(context.description);
        output += '</and-card-description>';
        output += '\n    ';
      output += '</and-card-header>';
      output += '\n    ';
      output += '<and-card-content';
      output += '>';
        output += '\n      ';
        if (context.errorMessage) {
          output += '\n        ';
          output += '<p';
          output += ' class="dev-auth-alert"';
          output += ' role="alert"';
          output += '>';
            output += renderValue(context.errorMessage);
          output += '</p>';
          output += '\n      ';
        }
        output += '\n      ';
        output += '<p class="dev-auth-alert" role="alert" id="dev-auth-action-error" hidden></p>';
        output += '\n      ';
        output += '<and-button';
        output += ' id="dev-auth-action"';
        output += ' variant="default"';
        output += ' data-full';
        output += '>';
          output += '\n        ';
          output += '<and-icon slot="start" name="external-link" size="16"></and-icon>';
          output += '\n        ';
          output += renderValue(context.actionLabel);
          output += '\n      ';
        output += '</and-button>';
        output += '\n    ';
      output += '</and-card-content>';
      output += '\n  ';
    output += '</and-card>';
    output += '\n';
  }
  output += '\n';

  return output;
}
