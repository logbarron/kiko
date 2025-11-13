export const BRAND_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, 'Noto Sans', sans-serif";
// Shared page styles matching email template aesthetic
export const pageStyles = {
  // Color palette matching emails
  colors: {
    background: '#fafafa',
    white: '#ffffff',
    // Primary colors - neutral dark
    primaryDark: '#1f2937',
    primaryLight: '#4b5563',
    // Text colors
    textHeadline: '#0f172a',
    textBody: '#334155',
    textSecondary: '#64748b',
    textMuted: '#6b7280',
    // Borders
    borderLight: '#e5e7eb',
    borderMedium: '#d1d5db',
    borderTeal: '#14b8a6',
    borderWarm: '#f2e8d5',
    borderInfo: '#bae6fd',
    // Backgrounds
    infoBackground: '#ecfeff',
    successBackground: '#d1fae5',
    successBorder: '#86efac',
    successText: '#065f46',
    errorBackground: '#fef2f2',
    errorBorder: '#fecaca',
    errorText: '#7f1d1d',
  },

  // Typography
  fonts: {
    serif: BRAND_SANS,
    sansSerif: BRAND_SANS,
  },

  // Common styles for inject into pages
  getBaseStyles(nonce?: string): string {
    return `<style${nonce ? ` nonce="${nonce}"` : ''}>

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: ${this.fonts.sansSerif};
        background: ${this.colors.background};
        color: ${this.colors.textBody};
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      /* Dark mode support for admin pages */
      html.dark body {
        background: rgb(18, 18, 18);
        color: rgb(242, 242, 242);
      }

      .container {
        background: ${this.colors.white};
        border-radius: 28px;
        padding: 48px;
        max-width: 480px;
        width: 100%;
        border: 1px solid ${this.colors.borderLight};
        position: relative;
      }

      /* Typography hierarchy - using 8px baseline grid */
      h1 {
        font-family: ${this.fonts.serif};
        color: ${this.colors.textHeadline};
        font-size: 32px;
        line-height: 40px; /* 5 * 8px */
        font-weight: 600;
        letter-spacing: 0.02em;
        margin: 0 0 16px 0; /* 2 * 8px */
        text-align: center;
      }

      h2 {
        font-family: ${this.fonts.serif};
        color: ${this.colors.textHeadline};
        font-size: 24px;
        line-height: 32px; /* 4 * 8px */
        font-weight: 600;
        letter-spacing: 0.02em;
        margin: 0 0 16px 0;
      }

      p {
        color: ${this.colors.textBody};
        font-size: 16px;
        line-height: 24px; /* 3 * 8px */
        margin: 0 0 16px 0;
        text-align: center;
      }

      p:last-child {
        margin-bottom: 0;
      }

      /* Use sparingly - only for truly secondary content */
      .text-muted {
        color: ${this.colors.textMuted};
        font-size: 14px;
        line-height: 20px;
        text-align: center;
      }

      /* Form styling */
      form {
        margin-top: 32px;
      }

      .form-group {
        margin-bottom: 24px;
        text-align: left;
      }

      label {
        display: block;
        margin-bottom: 8px;
        color: ${this.colors.textHeadline};
        font-weight: 500;
        font-size: 14px;
        letter-spacing: 0.02em;
      }

      input[type="email"],
      input[type="text"],
      input[type="tel"],
      textarea,
      select {
        width: 100%;
        padding: 14px 16px;
        border: 1px solid ${this.colors.borderLight};
        border-radius: 12px;
        font-size: 16px;
        font-family: ${this.fonts.sansSerif};
        transition: all 0.2s ease;
        background: ${this.colors.white};
        color: ${this.colors.textBody};
      }

      input:hover {
        border-color: ${this.colors.borderMedium};
      }

      input:focus, textarea:focus, select:focus {
        outline: none;
        border-color: ${this.colors.primaryDark};
        box-shadow: 0 0 0 3px rgba(31, 41, 55, 0.1);
      }

      input::placeholder {
        color: ${this.colors.textMuted};
        opacity: 0.7;
      }

      /* Button styles */
      .btn-primary, button[type="submit"] {
        background: ${this.colors.primaryDark};
        color: white;
        border: none;
        border-radius: 12px;
        padding: 14px 32px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        letter-spacing: 0.02em;
        display: inline-block;
        text-decoration: none;
        text-align: center;
        width: 100%;
        margin-top: 8px;
      }

      .btn-primary:hover, button[type="submit"]:hover {
        background: ${this.colors.primaryLight};
        transform: translateY(-1px);
      }

      .btn-primary:active, button[type="submit"]:active {
        transform: translateY(0);
      }

      /* Alert/Notice styles */
      .alert {
        padding: 16px;
        border-radius: 12px;
        margin-bottom: 24px;
        text-align: center;
        font-size: 14px;
        line-height: 1.5;
        animation: slideDown 0.3s ease;
      }

      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .alert-success {
        background: ${this.colors.successBackground};
        border: 1px solid ${this.colors.successBorder};
        color: ${this.colors.successText};
      }

      .alert-error {
        background: ${this.colors.errorBackground};
        border: 1px solid ${this.colors.errorBorder};
        color: ${this.colors.errorText};
      }

      .alert-info {
        background: ${this.colors.infoBackground};
        border: 1px solid ${this.colors.borderInfo};
        color: ${this.colors.textHeadline};
      }

      /* Details/Summary (help section) */
      details {
        margin-top: 40px; /* 5 * 8px */
        padding-top: 32px; /* 4 * 8px */
        border-top: 1px solid ${this.colors.borderLight};
      }

      summary {
        cursor: pointer;
        color: ${this.colors.textBody};
        font-weight: 600;
        font-size: 14px;
        line-height: 24px;
        text-align: center;
        padding: 0;
        transition: color 0.2s;
        user-select: none;
        list-style: none;
      }

      summary::-webkit-details-marker {
        display: none;
      }

      summary::before {
        content: '▶';
        display: inline-block;
        margin-right: 8px;
        font-size: 14px;
        transition: transform 0.2s;
      }

      details[open] summary::before {
        transform: rotate(90deg);
      }

      summary:hover {
        color: ${this.colors.textHeadline};
      }

      details[open] summary {
        margin-bottom: 24px; /* 3 * 8px */
      }

      details > div {
        text-align: left;
      }

      details > div p {
        font-size: 14px;
        line-height: 24px;
        color: ${this.colors.textBody};
        text-align: left;
        margin-bottom: 16px;
      }

      details > div p strong {
        font-weight: 600;
        color: ${this.colors.textHeadline};
      }

      details ol,
      details ul {
        margin: 0 0 24px 0; /* 3 * 8px bottom */
        padding-left: 24px; /* 3 * 8px */
        list-style-position: outside;
      }

      details ol {
        list-style-type: decimal;
      }

      details ul {
        list-style-type: disc;
      }

      details li {
        font-size: 14px;
        line-height: 24px;
        color: ${this.colors.textBody};
        margin-bottom: 8px; /* 1 * 8px */
      }

      details li:last-child {
        margin-bottom: 0;
      }

      /* Turnstile widget */
      .cf-turnstile {
        margin: 24px auto;
        display: flex;
        justify-content: center;
      }

      /* Helper text */
      .helper-text {
        margin-top: 8px; /* 1 * 8px */
        font-size: 14px;
        line-height: 20px;
        color: ${this.colors.textSecondary};
        text-align: center;
      }

      /* Responsive adjustments */
      @media (max-width: 540px) {
        body {
          padding: 16px;
        }

        .container {
          padding: 32px 24px;
          border-radius: 24px;
        }

        h1 {
          font-size: 26px;
        }

        p {
          font-size: 14px;
        }

        .btn-primary, button[type="submit"] {
          padding: 12px 24px;
          font-size: 14px;
        }
      }
    </style>`;
  }
};

export function renderNotice(type: 'success' | 'error' | 'info', message: string): string {
  const classes = {
    success: 'alert alert-success',
    error: 'alert alert-error',
    info: 'alert alert-info',
  };

  return `<div role="${type === 'error' ? 'alert' : 'status'}" aria-live="polite" class="${classes[type]}">${escapeHtml(message)}</div>`;
}

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}
