import { pageStyles } from '../lib/pageStyles';

// HTML escape function to prevent XSS in title
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

interface RenderLayoutOptions {
  includePageStyles?: boolean;
}

export function renderLayout(
  title: string,
  content: string,
  nonce: string,
  options: RenderLayoutOptions = {}
): string {
  const { includePageStyles = true } = options;
  const pageStylesBlock = includePageStyles ? pageStyles.getBaseStyles(nonce) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <script nonce="${nonce}">
      // Prevent flash of unstyled content by applying theme immediately
      (function() {
        try {
          var theme = localStorage.getItem('admin-theme');
          var systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
          var resolvedTheme = theme === 'system' || !theme ? systemTheme : theme;

          if (resolvedTheme === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        } catch (e) {
          // Fallback to light theme if localStorage is not available
        }
      })();
    </script>
    ${pageStylesBlock}
    <meta name="robots" content="noindex,nofollow">
    <meta name="referrer" content="no-referrer">
</head>
<body>
    ${content}
</body>
</html>`;
}
