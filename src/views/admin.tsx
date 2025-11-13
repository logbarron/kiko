import { renderLayout } from './layout';

export function renderAdminDashboard(nonce: string): string {
  const content = `
    <div id="root"></div>
    <link rel="stylesheet" href="/build/enhance.css">
    <script type="module" src="/build/enhance.js" defer nonce="${nonce}"></script>
  `;

  return renderLayout('Admin Dashboard', content, nonce, {
    includePageStyles: false
  });
}
