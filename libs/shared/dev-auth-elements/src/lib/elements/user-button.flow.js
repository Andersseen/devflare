import { renderValue } from '@flowview/runtime';

export function render(context) {
  let output = '';
  if (context.status === 'loading') {
    output += '\n  ';
    output += '<span class="dev-auth-avatar" role="status" aria-label="Loading account">\n    <and-skeleton width="100%" height="100%"></and-skeleton>\n  </span>';
    output += '\n';
  }   else if (context.status === 'authenticated') {
    output += '\n  ';
    output += '<div';
    output += ' class="dev-auth-menu-shell"';
    output += '>';
      output += '\n    ';
      output += '<button';
      output += ' type="button"';
      output += ' id="dev-auth-trigger"';
      output += ' class="dev-auth-trigger"';
      output += ' aria-haspopup="menu"';
      output += ' aria-expanded="false"';
      output += ' aria-label="';
      output += renderValue(context.ariaLabel);
      output += '"';
      output += '>';
        output += '\n      ';
        output += '<span';
        output += ' class="dev-auth-avatar"';
        output += ' aria-hidden="true"';
        output += '>';
          output += '\n        ';
          if (context.image) {
            output += '\n          ';
            output += '<img';
            output += ' src="';
            output += renderValue(context.image);
            output += '"';
            output += ' alt=""';
            output += '/>';
            output += '\n        ';
          }           else if (context.initial) {
            output += '\n          ';
            output += '<span';
            output += '>';
              output += renderValue(context.initial);
            output += '</span>';
            output += '\n        ';
          } else {
            output += '\n          ';
            output += '<and-icon name="user" size="16"></and-icon>';
            output += '\n        ';
          }
          output += '\n      ';
        output += '</span>';
        output += '\n    ';
      output += '</button>';
      output += '\n    ';
      output += '<and-menu-list';
      output += ' id="dev-auth-panel"';
      output += ' class="dev-auth-panel"';
      output += ' aria-menu-label="Account"';
      output += ' style="display:none"';
      output += '>';
        output += '\n      ';
        output += '<div';
        output += ' class="dev-auth-menu-identity"';
        output += ' role="presentation"';
        output += '>';
          output += '\n        ';
          output += '<p';
          output += ' class="dev-auth-name"';
          output += '>';
            output += renderValue(context.identity);
          output += '</p>';
          output += '\n        ';
          if (context.email) {
            output += '\n          ';
            output += '<p';
            output += ' class="dev-auth-email"';
            output += '>';
              output += renderValue(context.email);
            output += '</p>';
            output += '\n        ';
          }
          output += '\n      ';
        output += '</div>';
        output += '\n      ';
        output += '<hr class="dev-auth-separator" role="separator"/>';
        output += '\n      ';
        output += '<div data-dev-auth-outlet="menu-actions"></div>';
        output += '\n      ';
        output += '<button type="button" id="dev-auth-signout" class="dev-auth-menu-item" role="menuitem">\n        Sign out\n      </button>';
        output += '\n      ';
        output += '<p class="dev-auth-alert" role="alert" id="dev-auth-logout-error" hidden>\n        Unable to sign out. Please try again.\n      </p>';
        output += '\n    ';
      output += '</and-menu-list>';
      output += '\n  ';
    output += '</div>';
    output += '\n';
  } else {
    output += '\n';
  }
  output += '\n';

  return output;
}
