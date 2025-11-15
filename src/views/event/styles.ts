export interface EventStyleFonts {
  serif: string;
  sans: string;
}

export function renderEventStyles(nonce: string | undefined, fonts: EventStyleFonts): string {
  return `<style${nonce ? ` nonce="${nonce}"` : ''}>
${getEventCss(fonts)}
  </style>`;
}

function getEventCss({ serif, sans }: EventStyleFonts): string {
  return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      --color-background: #fafafa;
      --color-surface-elevated: #fafafa;
      --color-surface-card: transparent;
      --color-surface-muted: #f3f4f6;
      --color-input-background: rgba(255, 255, 255, 0.96);
      --color-ink-rgb: 15, 23, 42;
      --color-border-rgb: 17, 24, 39;
      --color-overlay-rgb: 15, 23, 42;
      --color-shadow-rgb: 17, 24, 39;
      --color-accent: #1f2937;
      --color-accent-hover: #374151;
      --color-accent-strong: #111827;
      --color-gold-rgb: 220, 198, 130;
      --color-cta-bg: var(--color-accent);
      --color-cta-bg-hover: var(--color-accent-hover);
      --color-cta-ink: var(--inverse-1000);
      --chip-selected-bg: var(--color-accent);
      --chip-selected-hover-bg: var(--color-accent-hover);
      --chip-selected-ink: var(--inverse-1000);
      --divider-soft: var(--overlay-12);
      --color-inverse-rgb: 255, 253, 247;
      --color-success-rgb: 6, 95, 70;
      --color-error-rgb: 127, 29, 29;
      --color-success: rgb(var(--color-success-rgb));
      --color-error: rgb(var(--color-error-rgb));

      --ink-1000: rgba(var(--color-ink-rgb), 1);
      --ink-950: rgba(var(--color-ink-rgb), 0.95);
      --ink-920: rgba(var(--color-ink-rgb), 0.92);
      --ink-900: rgba(var(--color-ink-rgb), 0.9);
      --ink-850: rgba(var(--color-ink-rgb), 0.85);
      --ink-800: rgba(var(--color-ink-rgb), 0.8);
      --ink-780: rgba(var(--color-ink-rgb), 0.78);
      --ink-700: rgba(var(--color-ink-rgb), 0.7);
      --ink-650: rgba(var(--color-ink-rgb), 0.65);
      --ink-620: rgba(var(--color-ink-rgb), 0.62);
      --ink-600: rgba(var(--color-ink-rgb), 0.6);
      --ink-550: rgba(var(--color-ink-rgb), 0.55);

      --border-30: rgba(var(--color-border-rgb), 0.3);
      --border-25: rgba(var(--color-border-rgb), 0.25);
      --border-18: rgba(var(--color-border-rgb), 0.18);
      --border-15: rgba(var(--color-border-rgb), 0.15);
      --border-12: rgba(var(--color-border-rgb), 0.12);
      --border-08: rgba(var(--color-border-rgb), 0.08);
      --border-06: rgba(var(--color-border-rgb), 0.06);
      --border-04: rgba(var(--color-border-rgb), 0.04);
      --border-03: rgba(var(--color-border-rgb), 0.03);
      --border-02: rgba(var(--color-border-rgb), 0.02);

      --overlay-45: rgba(var(--color-overlay-rgb), 0.45);
      --overlay-35: rgba(var(--color-overlay-rgb), 0.35);
      --overlay-20: rgba(var(--color-overlay-rgb), 0.2);
      --overlay-18: rgba(var(--color-overlay-rgb), 0.18);
      --overlay-12: rgba(var(--color-overlay-rgb), 0.12);
      --overlay-06: rgba(var(--color-overlay-rgb), 0.06);
      --overlay-04: rgba(var(--color-overlay-rgb), 0.04);

      --shadow-20: rgba(var(--color-shadow-rgb), 0.2);
      --shadow-18: rgba(var(--color-shadow-rgb), 0.18);
      --shadow-15: rgba(var(--color-shadow-rgb), 0.15);
      --shadow-14: rgba(var(--color-shadow-rgb), 0.14);
      --shadow-08: rgba(var(--color-shadow-rgb), 0.08);
      --shadow-06: rgba(var(--color-shadow-rgb), 0.06);
      --shadow-05: rgba(var(--color-shadow-rgb), 0.05);

      --inverse-1000: rgba(var(--color-inverse-rgb), 1);
      --inverse-850: rgba(var(--color-inverse-rgb), 0.85);
      --inverse-700: rgba(var(--color-inverse-rgb), 0.7);
      --inverse-600: rgba(var(--color-inverse-rgb), 0.6);

      color-scheme: light;
      font-family: ${sans};
      background: var(--color-background);
      color: var(--ink-850);
      min-height: 100vh;
      position: relative;
      overflow-x: hidden;
      --top-bar-height: 42px;
      --hero-offset: var(--top-bar-height);
      padding-top: var(--top-bar-height);
    }

    @media (prefers-color-scheme: dark) {
      body:not([data-theme]) {
        --color-background: #05070f;
        --color-surface-elevated: rgba(8, 12, 20, 0.96);
        --color-surface-card: rgba(255, 255, 255, 0.05);
        --color-surface-muted: rgba(255, 255, 255, 0.08);
        --color-input-background: rgba(12, 18, 30, 0.75);
        --color-ink-rgb: 239, 245, 253;
        --color-border-rgb: 148, 163, 184;
        --color-overlay-rgb: 2, 6, 14;
        --color-shadow-rgb: 2, 6, 14;
        --color-accent: #e2e8f0;
        --color-accent-hover: #cbd5f5;
        --color-accent-strong: #f8fafc;
        --color-inverse-rgb: 255, 253, 247;
        --color-gold-rgb: 232, 197, 121;
        --color-cta-bg: rgba(var(--color-inverse-rgb), 1);
        --color-cta-bg-hover: rgba(var(--color-inverse-rgb), 0.9);
        --color-cta-ink: rgb(var(--color-overlay-rgb));
        --chip-selected-bg: rgba(var(--color-inverse-rgb), 1);
        --chip-selected-hover-bg: rgba(var(--color-inverse-rgb), 0.9);
        --chip-selected-ink: rgb(var(--color-overlay-rgb));
        --divider-soft: rgba(var(--color-inverse-rgb), 0.24);
        --color-success-rgb: 110, 231, 183;
        --color-error-rgb: 248, 113, 113;
        --color-success: rgb(var(--color-success-rgb));
        --color-error: rgb(var(--color-error-rgb));
        color-scheme: dark;
        background: var(--color-background);
        color: var(--ink-850);
      }
    }

    body[data-theme="light"] {
      --color-background: #fafafa;
      --color-surface-elevated: #fafafa;
      --color-surface-card: transparent;
      --color-surface-muted: #f3f4f6;
      --color-input-background: rgba(255, 255, 255, 0.96);
      --color-ink-rgb: 15, 23, 42;
      --color-border-rgb: 17, 24, 39;
      --color-overlay-rgb: 15, 23, 42;
      --color-shadow-rgb: 17, 24, 39;
      --color-accent: #1f2937;
      --color-accent-hover: #374151;
      --color-accent-strong: #111827;
      --color-inverse-rgb: 255, 253, 247;
      --color-gold-rgb: 220, 198, 130;
      --color-cta-bg: var(--color-accent);
      --color-cta-bg-hover: var(--color-accent-hover);
      --color-cta-ink: var(--inverse-1000);
      --chip-selected-bg: var(--color-accent);
      --chip-selected-hover-bg: var(--color-accent-hover);
      --chip-selected-ink: var(--inverse-1000);
      --divider-soft: var(--overlay-12);
      --color-success-rgb: 6, 95, 70;
      --color-error-rgb: 127, 29, 29;
      --color-success: rgb(var(--color-success-rgb));
      --color-error: rgb(var(--color-error-rgb));
      color-scheme: light;
      background: var(--color-background);
      color: var(--ink-850);
    }

    body[data-theme="dark"] {
      --color-background: #05070f;
      --color-surface-elevated: rgba(8, 12, 20, 0.96);
      --color-surface-card: rgba(255, 255, 255, 0.05);
      --color-surface-muted: rgba(255, 255, 255, 0.08);
      --color-input-background: rgba(12, 18, 30, 0.75);
      --color-ink-rgb: 239, 245, 253;
      --color-border-rgb: 148, 163, 184;
      --color-overlay-rgb: 2, 6, 14;
      --color-shadow-rgb: 2, 6, 14;
      --color-accent: #e2e8f0;
      --color-accent-hover: #cbd5f5;
      --color-accent-strong: #f8fafc;
      --color-inverse-rgb: 255, 253, 247;
      --color-gold-rgb: 232, 197, 121;
      --color-cta-bg: rgba(var(--color-inverse-rgb), 1);
      --color-cta-bg-hover: rgba(var(--color-inverse-rgb), 0.9);
      --color-cta-ink: rgb(var(--color-overlay-rgb));
      --chip-selected-bg: rgba(var(--color-inverse-rgb), 1);
      --chip-selected-hover-bg: rgba(var(--color-inverse-rgb), 0.9);
      --chip-selected-ink: rgb(var(--color-overlay-rgb));
      --divider-soft: rgba(var(--color-inverse-rgb), 0.24);
      --color-success-rgb: 110, 231, 183;
      --color-error-rgb: 248, 113, 113;
      --color-success: rgb(var(--color-success-rgb));
      --color-error: rgb(var(--color-error-rgb));
      color-scheme: dark;
      background: var(--color-background);
      color: var(--ink-850);
    }

    body.nav-open {
      overflow: hidden;
    }

    .page-fade {
      opacity: 1;
    }

    @keyframes fadeInUp {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .page-fade {
        animation: none;
        opacity: 1;
      }
    }

    @media (prefers-reduced-motion: no-preference) {
      .page-fade {
        opacity: 0;
        animation: fadeInUp 0.8s ease-out forwards;
        will-change: opacity;
      }
    }

    .top-bar {
      position: fixed;
      inset: 0 0 auto 0;
      height: var(--top-bar-height);
      background: var(--color-surface-elevated);
      z-index: 1200;
      border-bottom: 1px solid var(--border-06);
      display: flex;
      align-items: center;
      padding: 0;
    }

    .top-bar-inner {
      width: 100%;
      padding: 0 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      height: 100%;
    }

    .names-header {
      font-family: 'ivybodoni', sans-serif;
      font-size: 20px;
      font-weight: 500;
      font-style: normal;
      letter-spacing: 0.04em;
      text-transform: none;
      color: var(--ink-900);
      cursor: pointer;
      transition: opacity 0.3s ease;
      display: inline-flex;
      align-items: center;
      height: 100%;
    }

    .names-header:hover {
      opacity: 0.7;
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 24px;
    }

    .nav-item {
      position: relative;
      display: inline-flex;
      align-items: center;
    }

    .nav-trigger,
    .nav-links a {
      font-family: 'ivybodoni', sans-serif;
      font-size: 20px;
      font-weight: 500;
      font-style: normal;
      letter-spacing: 0.04em;
      text-transform: none;
      color: var(--ink-780);
      text-decoration: none;
      transition: color 0.2s ease, opacity 0.2s ease;
      cursor: pointer;
      background: transparent;
      border: none;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      line-height: 1;
    }

    .nav-trigger:hover,
    .nav-links a:hover {
      color: var(--ink-1000);
    }

    .nav-trigger:focus-visible,
    .nav-links a:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--shadow-14);
      border-radius: 4px;
    }

    .nav-dropdown {
      position: absolute;
      top: calc(100% + 10px);
      left: 50%;
      transform: translateX(-50%);
      background: var(--color-surface-elevated);
      border: 1px solid var(--border-06);
      border-radius: 12px;
      box-shadow: 0 16px 32px var(--overlay-14);
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
      width: max-content;
      max-width: 250px;
      text-align: center;
      z-index: 1250;
    }

    .nav-dropdown[hidden] {
      display: none;
    }

    .nav-dropdown-link {
      font-family: 'ivybodoni', sans-serif;
      font-size: 16px;
      letter-spacing: 0.02em;
      color: var(--ink-860);
      text-decoration: none;
      transition: color 0.2s ease;
    }

    .nav-dropdown-link:hover {
      color: var(--ink-1000);
    }

    .theme-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      color: var(--ink-850);
      cursor: pointer;
      transition: color 0.2s ease;
      vertical-align: middle;
    }

    .theme-toggle:hover {
      color: var(--ink-1000);
    }

    .theme-toggle:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--shadow-14);
    }

    .theme-toggle-icon {
      width: 20px;
      height: 20px;
      stroke-width: 1.7;
      stroke: currentColor;
      fill: none;
      pointer-events: none;
    }

    .theme-icon-moon {
      display: none;
    }

    @media (prefers-color-scheme: dark) {
      body:not([data-theme]) .theme-icon-sun {
        display: none;
      }
      body:not([data-theme]) .theme-icon-moon {
        display: inline-flex;
      }
    }

    body[data-theme="dark"] .theme-icon-sun {
      display: none;
    }

    body[data-theme="dark"] .theme-icon-moon {
      display: inline-flex;
    }

    body[data-theme="light"] .theme-icon-sun {
      display: inline-flex;
    }

    body[data-theme="light"] .theme-icon-moon {
      display: none;
    }

    body[data-theme="dark"] .theme-toggle {
      color: var(--inverse-850);
    }

    .nav-toggle {
      display: none;
      background: transparent;
      border: none;
      padding: 0;
      cursor: pointer;
      height: 40px;
      width: 40px;
      position: relative;
    }

    .nav-toggle span {
      position: absolute;
      left: 8px;
      right: 8px;
      height: 1px;
      background: var(--ink-920);
      transition: transform 0.2s ease, opacity 0.2s ease;
    }

    .nav-toggle span:nth-child(1) {
      top: 12px;
    }

    .nav-toggle span:nth-child(2) {
      top: 19px;
    }

    .nav-toggle span:nth-child(3) {
      top: 26px;
    }

    .nav-toggle[aria-expanded="true"] span:nth-child(1) {
      transform: translateY(7px) rotate(45deg);
    }

    .nav-toggle[aria-expanded="true"] span:nth-child(2) {
      opacity: 0;
    }

    .nav-toggle[aria-expanded="true"] span:nth-child(3) {
      transform: translateY(-7px) rotate(-45deg);
    }

    .nav-drawer {
      position: fixed;
      top: var(--top-bar-height);
      left: 0;
      right: 0;
      background: var(--color-surface-elevated);
      color: var(--ink-920);
      transform: translateY(-16px);
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s ease, transform 0.2s ease;
      z-index: 1100;
      box-shadow: 0 20px 30px var(--overlay-12);
    }

    .nav-drawer.is-open {
      transform: translateY(0);
      opacity: 1;
      visibility: visible;
    }

    .nav-drawer .nav-links {
      flex-direction: column;
      align-items: center;
      gap: 28px;
      padding: 32px 20px 48px;
    }

    .nav-drawer .nav-links a {
      color: var(--ink-920);
    }

    .nav-overlay {
      position: fixed;
      inset: var(--top-bar-height) 0 0 0;
      background: var(--overlay-35);
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s ease;
      z-index: 1000;
    }

    .nav-overlay.is-open {
      opacity: 1;
      visibility: visible;
    }

    .top-bar-divider {
      height: 1px;
      background: var(--border-06);
    }

    .timeline-layout {
      --timeline-pad-top: 120px;
      --timeline-pad-bottom: 160px;
      width: min(1200px, calc(100% - 64px));
      margin: 0 auto 160px;
      padding: var(--timeline-pad-top) 0 var(--timeline-pad-bottom);
      position: relative;
      display: flex;
      flex-direction: column;
      gap: clamp(96px, 12vw, 160px);
    }

    .timeline-layout::before {
      content: '';
      position: absolute;
      top: var(--timeline-pad-top);
      bottom: var(--timeline-pad-bottom);
      left: 50%;
      transform: translateX(-1px);
      width: 2px;
      background: rgba(var(--color-gold-rgb), 0.85);
      pointer-events: none;
    }

    .info-section {
      position: relative;
      padding-top: 12px;
    }

    .info-section::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 18px;
      height: 18px;
      border-radius: 999px;
      border: 2px solid rgba(var(--color-gold-rgb), 0.9);
      background: var(--color-background);
      box-shadow: 0 0 0 6px var(--color-background);
      z-index: 2;
    }

    .timeline-section-inner {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-areas: "header content";
      column-gap: clamp(48px, 10vw, 180px);
      align-items: start;
    }

    .timeline-section-inner > .timeline-header {
      grid-area: header;
    }

    .timeline-section-inner > .timeline-content {
      grid-area: content;
    }

    .timeline-section--flip .timeline-section-inner {
      grid-template-areas: "content header";
    }

    .timeline-header {
      display: flex;
      flex-direction: column;
      gap: 14px;
      align-items: flex-end;
      text-align: right;
    }

    .timeline-heading-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
      width: 100%;
    }

    .timeline-section--flip .timeline-heading-row {
      justify-content: flex-start;
    }

    .timeline-section-toggle {
      display: none;
    }

    .timeline-toggle-icon {
      display: none;
    }

    .timeline-section--flip .timeline-header {
      align-items: flex-start;
      text-align: left;
    }

    .timeline-eyebrow {
      font-family: 'ivybodoni', ${sans};
      font-size: 13px;
      letter-spacing: 0.32em;
      text-transform: uppercase;
      color: rgb(var(--color-gold-rgb));
    }

    .timeline-heading {
      font-family: 'ivybodoni', ${sans};
      font-size: clamp(34px, 5vw, 48px);
      font-weight: 400;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--ink-900);
    }

    .timeline-summary {
      font-family: 'ivybodoni', ${sans};
      font-size: 15px;
      letter-spacing: 0.04em;
      text-transform: none;
      color: var(--ink-620);
      line-height: 1.7;
      max-width: 32ch;
    }

    .timeline-header-media {
      margin-top: clamp(24px, 5vw, 48px);
      display: flex;
    }

    .timeline-header-media-img {
      width: 100%;
      height: auto;
      border: none;
      border-radius: 0;
      object-fit: cover;
      box-shadow: none;
    }

    .timeline-content {
      display: flex;
      flex-direction: column;
      width: min(540px, 48vw);
      max-width: 100%;
    }

    .timeline-section--flip .timeline-content {
      align-items: flex-end;
      margin-left: auto;
      text-align: right;
    }

    .timeline-card {
      background: transparent;
      border: none;
      border-radius: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: clamp(24px, 5vw, 36px);
    }

    .timeline-note {
      font-family: ${sans};
      font-size: 16px;
      line-height: 1.7;
      letter-spacing: 0.02em;
      color: var(--ink-780);
    }

    .rsvp-closed {
      font-family: ${sans};
      font-size: 16px;
      line-height: 1.8;
      letter-spacing: 0.02em;
      color: var(--ink-780);
      max-width: 520px;
    }

    .schedule-list {
      display: flex;
      flex-direction: column;
      gap: clamp(32px, 6vw, 52px);
      width: 100%;
      align-self: stretch;
    }

    .schedule-meta {
      display: inline-block;
    }

    .schedule-location-name,
    .schedule-address,
    .schedule-address-link {
      margin-bottom: 8px;
    }

    .schedule-address-link {
      display: inline-block;
      text-decoration: underline;
      text-underline-offset: 4px;
      color: inherit;
    }

    /* Schedule Card Tabbed Layout */
    .schedule-card {
      background: transparent;
      border: none;
      border-radius: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: clamp(20px, 4vw, 28px);
      overflow-anchor: none;
    }

    .schedule-card .event-attendees {
      border-top: none;
      padding-top: 0;
      margin-top: 0;
    }

    .schedule-desktop-content {
      width: 100%;
      align-self: stretch;
    }

    .timeline-section--flip .schedule-card {
      align-items: flex-end;
      width: 100%;
    }

    .ceremony-card {
      padding: 0;
    }

    .rich-text {
      font-family: ${sans};
      font-size: 15px;
      line-height: 1.75;
      letter-spacing: 0.02em;
      color: var(--ink-850);
      display: grid;
      gap: 16px;
    }

    .rich-text-inline {
      font-family: ${sans};
      font-size: 15px;
      line-height: 1.7;
      letter-spacing: 0.02em;
      color: var(--ink-780);
    }

    .gold {
      color: rgb(var(--color-gold-rgb));
    }

    .rich-text > p {
      margin: 0;
    }

    .rich-text h4,
    .rich-text h5,
    .rich-text h6 {
      font-family: ${sans};
      font-size: 18px;
      font-weight: 400;
      letter-spacing: 0.02em;
      text-transform: none;
      color: var(--ink-920);
      margin: 0;
    }

    .rich-text .rich-list {
      padding-left: 22px;
      margin: 0;
      display: grid;
      gap: 10px;
    }

    .rich-text .rich-list li {
      font-family: ${sans};
      font-size: 15px;
      line-height: 1.7;
      color: var(--ink-850);
    }

    .rich-text ul.rich-list {
      list-style: disc;
    }

    .rich-text ol.rich-list {
      list-style: decimal;
    }

    .rich-text code {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 14px;
      background: var(--overlay-04);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .rich-text a,
    .rich-text-inline a {
      color: var(--ink-780);
      text-decoration: none;
      transition: color 0.2s ease;
    }

    .rich-text a:hover,
    .rich-text-inline a:hover {
      color: var(--ink-920);
      text-decoration: underline;
    }

    .schedule-card-header {
      display: flex;
      flex-direction: column;
      gap: 6px;
      text-align: left;
      width: 100%;
    }

    .schedule-card-summary {
      display: grid;
      gap: 6px;
      cursor: default;
    }

    .schedule-card-summary[data-schedule-trigger],
    .schedule-card-summary[data-travel-trigger] {
      cursor: pointer;
    }

    .schedule-card-toggle {
      display: none;
      background: none;
      border: none;
      color: var(--ink-850);
      cursor: pointer;
      padding: 8px;
      transition: color 0.2s ease;
    }

    .schedule-card-toggle:focus-visible {
      outline: 2px solid var(--ink-700);
      outline-offset: 2px;
    }

    .schedule-card-toggle-icon {
      display: block;
      font-size: 32px;
      line-height: 1;
      transform: rotate(0deg);
      transition: transform 0.2s ease;
    }

    .schedule-card-toggle[aria-expanded="true"] .schedule-card-toggle-icon {
      transform: rotate(90deg);
    }

    .timeline-section--flip .schedule-card-header {
      align-items: flex-start;
      text-align: right;
    }

    .timeline-section--flip .schedule-card-summary {
      text-align: inherit;
    }

    .timeline-section--flip .schedule-card-toggle-icon {
      transform: rotate(180deg);
    }

    .timeline-section--flip .schedule-card-toggle[aria-expanded="true"] .schedule-card-toggle-icon {
      transform: rotate(90deg);
    }

    .schedule-card-title {
      font-family: 'ivybodoni', ${sans};
      font-size: 24px;
      font-weight: 400;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--ink-900);
    }

    .schedule-card-meta {
      font-family: ${sans};
      font-size: 14px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ink-600);
      line-height: 1.5;
      display: block;
    }
    .schedule-card-meta .schedule-card-date,
    .schedule-card-meta .schedule-card-time {
      display: inline;
    }
    .schedule-meta-separator {
      display: inline-block;
      margin: 0 8px;
      color: var(--ink-450);
    }

    /* Desktop Tabs */
    .schedule-tabs {
      display: flex;
      gap: 24px;
      border-bottom: 1px solid var(--divider-soft);
      margin-bottom: 24px;
    }

    .timeline-section--flip .schedule-tabs {
      justify-content: flex-end;
    }

    .schedule-tabs button {
      padding: 12px 0;
      background: none;
      border: none;
      font-family: ${sans};
      font-size: 15px;
      letter-spacing: 0.02em;
      color: var(--ink-550);
      cursor: pointer;
      position: relative;
      transition: color 0.2s ease;
    }

    .schedule-tabs button:hover {
      color: var(--ink-850);
    }

    .schedule-tabs button[aria-selected="true"] {
      color: var(--ink-950);
      font-weight: 400;
    }

    .schedule-tabs button[aria-selected="true"]::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--ink-920);
    }

    .schedule-panels {
      overflow: hidden;
      transition: height 0.25s ease;
    }

    .schedule-tab-panel {
      display: none;
    }

    .timeline-section--flip .schedule-tab-panel {
      text-align: right;
    }

    .schedule-tab-panel[data-active] {
      display: block;
    }

    .schedule-location-name {
      font-family: ${sans};
      font-size: 15px;
      font-weight: 400;
      letter-spacing: 0.02em;
      text-transform: none;
      color: inherit;
      margin-bottom: 8px;
      line-height: 1.7;
    }

    .schedule-address-link {
      color: inherit;
      text-decoration: none;
      display: inline-block;
      margin-bottom: 12px;
      border-bottom: 1px dotted var(--border-30);
      font-size: 15px;
      letter-spacing: 0.02em;
      text-transform: none;
      line-height: 1.7;
    }

    .schedule-address-link:hover {
      border-bottom-style: solid;
    }

    .schedule-address {
      margin-bottom: 12px;
      font-size: 15px;
      letter-spacing: 0.02em;
      text-transform: none;
      color: inherit;
      line-height: 1.7;
    }

    .schedule-detail {
      margin-bottom: 16px;
    }

    .schedule-detail:last-child {
      margin-bottom: 0;
    }

    .schedule-detail .rich-text {
      font-family: ${sans};
      font-size: 15px;
      line-height: 1.7;
      letter-spacing: 0.02em;
      text-transform: none;
      color: var(--ink-850);
      gap: 16px;
    }

    /* Mobile Sections - Hidden on Desktop */
    .schedule-mobile-sections {
      display: none;
    }

    .local-guide-panel,
    .transportation-panel {
      font-family: ${sans};
      font-size: 15px;
      line-height: 1.7;
      letter-spacing: 0.02em;
      text-transform: none;
      color: var(--ink-850);
    }

    .local-guide-panel .rich-text,
    .transportation-panel .rich-text {
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      letter-spacing: 0.02em;
      text-transform: inherit;
      color: inherit;
      gap: 12px;
    }

    .local-guide-panel[data-active],
    .transportation-panel[data-active] {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .local-guide-panel p,
    .transportation-panel p {
      margin: 0;
    }

    /* Hotel Panel Content */
    .hotel-panel {
      display: none;
    }

    .hotel-panel[data-active] {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .hotel-details {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .hotel-address,
    .hotel-notes {
      margin: 0;
    }

    /* Travel List Container */
    .travel-list {
      display: flex;
      flex-direction: column;
      gap: 42px;
    }

    .registry-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 24px;
      border-bottom: 1px solid var(--border-08);
      padding-bottom: 24px;
      margin-bottom: 24px;
    }

    .registry-item {
      gap: 16px;
    }

    .registry-link {
      display: inline-block;
      text-decoration: underline;
      text-underline-offset: 4px;
      color: inherit;
      font-family: 'ivybodoni', ${sans};
      font-weight: 300;
      font-size: 32px;
      letter-spacing: 0.02em;
    }

    .registry-link:hover {
      text-decoration-color: var(--ink-600);
    }

    .registry-description {
      margin: 0;
    }

    .registry-honeymoon {
      display: flex;
      flex-direction: column;
      gap: clamp(16px, 4vw, 28px);
    }

    .honeymoon-widget {
      display: flex;
      flex-direction: column;
      gap: clamp(16px, 4vw, 24px);
    }

    .honeymoon-heading {
      font-family: 'ivybodoni', ${sans};
      font-size: 35px;
      font-weight: 300;
      letter-spacing: 0.04em;
      margin: 0;
    }

    .honeymoon-fields {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .honeymoon-presets {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-self: flex-end;
    }

    .honeymoon-preset {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 82px;
      padding: 10px 16px;
      border-radius: 999px;
      border: 1px solid var(--border-12);
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
      transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
    }

    .honeymoon-preset[aria-pressed="true"] {
      background: var(--chip-selected-bg);
      color: var(--chip-selected-ink);
      border-color: transparent;
    }

    .honeymoon-label {
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 14px;
      line-height: 1.4;
    }

    .honeymoon-amount-input {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0;
      border: none;
      background: transparent;
    }

    .honeymoon-amount-input > span {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 400;
      font-size: 18px;
      min-width: 28px;
      color: var(--ink-850);
      user-select: none;
    }

    .honeymoon-amount-input input {
      border: none;
      background: var(--color-input-background);
      font: inherit;
      outline: none;
      color: inherit;
      width: 100%;
      border-radius: 999px;
      border: 1px solid var(--border-12);
      padding: 12px 18px;
      appearance: textfield;
      -moz-appearance: textfield;
      transition: border-color 0.2s ease;
    }

    .honeymoon-amount-input input:focus {
      border-color: var(--border-18);
    }

    .honeymoon-amount-input input::placeholder {
      color: var(--ink-620);
      opacity: 0.7;
    }

    .honeymoon-amount-input input::-webkit-outer-spin-button,
    .honeymoon-amount-input input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    .honeymoon-button {
      display: flex;
      align-items: center;
      align-self: flex-end;
      padding: 12px 28px;
      border-radius: 999px;
      border: 1px solid transparent;
      background: var(--color-cta-bg);
      color: var(--color-cta-ink);
      font: inherit;
      cursor: pointer;
      transition: background-color 0.2s ease, opacity 0.2s ease;
    }

    .honeymoon-button:hover:not(:disabled) {
      background: var(--color-cta-bg-hover);
    }

    .honeymoon-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .honeymoon-checkout:not([hidden]),
    .honeymoon-success:not([hidden]) {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .honeymoon-checkout[hidden],
    .honeymoon-success[hidden] {
      display: none;
    }

    .honeymoon-email-wrapper {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 18px;
      background: var(--color-input-background);
      border: 1px solid var(--border-12);
      border-radius: 12px 12px 0 0;
      border-bottom: none;
    }

    .honeymoon-email-label {
      font-size: 16px;
      line-height: 1.4;
      color: var(--ink-850);
      white-space: nowrap;
      flex-shrink: 0;
      font-weight: 400;
    }

    .honeymoon-email-wrapper input[type="email"] {
      border: none;
      background: transparent;
      font: inherit;
      outline: none;
      color: inherit;
      width: 100%;
      padding: 0;
      transition: none;
    }

    .honeymoon-email-wrapper input[type="email"]:focus {
      outline: none;
    }

    .honeymoon-email-wrapper input[type="email"]::placeholder {
      color: var(--ink-620);
      opacity: 0.7;
    }

    .honeymoon-payment-element {
      width: 100%;
      min-height: 380px;
    }

    .honeymoon-button-mount {
      display: flex;
      justify-content: flex-end;
      margin-top: 16px;
    }

    .honeymoon-success-message {
      margin: 0;
    }

    .honeymoon-receipt {
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 4px;
      display: inline-block;
      margin-top: 16px;
    }

    .honeymoon-error {
      margin: 0;
      color: var(--color-error);
      font-size: 14px;
    }

    .hero-section {
      position: relative;
      margin-top: 0;
      width: 100%;
      max-width: 100%;
    }

    .hero-art-wrapper {
      display: block;
      position: relative;
    }

    .hero-art {
      display: block;
      width: 100%;
      height: auto;
      transition: opacity 0.5s ease, transform 0.5s ease;
    }

    .hero-art.is-switching {
      opacity: 0;
      transform: scale(0.985);
    }

    .hero-content {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0;
      text-align: center;
      padding: clamp(24px, 6vw, 80px);
      z-index: 1;
    }

    .names-display {
      padding-left: clamp(0px, 4.8vw, 80px);
    }

    .name-large {
      font-family: 'cofo-raffine', ${sans};
      font-size: clamp(12px, 12vw, 180px);
      font-weight: 400;
      font-style: normal;
      line-height: 1.2;
      color: var(--ink-920);
      display: inline-block;
    }

    .event-date {
      font-family: 'ivybodoni', ${serif};
      font-weight: 400;
      font-style: normal;
      font-size: clamp(19px, 3vw, 52px);
      letter-spacing: 0.02em;
      color: var(--ink-920);
    }

    .rsvp-box {
      display: inline-block;
      background: var(--color-cta-bg);
      color: var(--color-cta-ink);
      padding: clamp(6.6px, 1.04vw, 15px) clamp(15.8px, 2.5vw, 36px);
      font-family: 'ivybodoni', ${serif};
      font-weight: 400;
      font-style: normal;
      font-size: clamp(12px, 2vw, 35px);
      letter-spacing: clamp(0.5px, 0.08vw, 1.8px);
      margin-top: clamp(12px, 2vw, 32px);
      cursor: pointer;
      text-decoration: none;
      transition: background 0.3s ease;
    }

    .rsvp-box:hover {
      background: var(--color-cta-bg-hover);
    }

    .rsvp-box:visited {
      color: var(--color-cta-ink);
    }

    main {
      padding: 0;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 48px;
      width: 100%;
    }

    fieldset {
      border: none;
      margin: 0;
      padding: 0;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      border: 0;
    }

    .event-list {
      display: flex;
      flex-direction: column;
      gap: 32px;
    }

    .event-list .schedule-card + .schedule-card {
      padding-top: 32px;
      border-top: 1px solid var(--border-08);
    }

    .attendance-options {
      display: inline-flex;
      gap: 12px;
      justify-content: center;
      align-items: center;
      margin: 0;
      padding: 0 4px;
    }

    .attendance-option {
      position: relative;
      flex: 0 0 auto;
    }

    .attendance-option input {
      position: absolute;
      inset: 0;
      opacity: 0;
      pointer-events: none;
    }

    .attendance-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 16px;
      background: transparent;
      border: 2px solid var(--border-15);
      border-radius: 16px;
      cursor: pointer;
      font-family: ${sans};
      font-size: 14px;
      letter-spacing: 0.02em;
      text-transform: none;
      font-weight: 400;
      color: var(--ink-550);
      transition: all 0.2s ease;
      min-width: 100px;
    }

    .attendance-pill-label-full {
      display: inline;
    }

    .attendance-pill-label-short {
      display: none;
    }

    .attendance-pill:hover {
      border-color: var(--border-30);
      color: var(--ink-850);
      transform: translateY(-2px);
      box-shadow: 0 8px 16px var(--shadow-06);
    }

    .attendance-option input:checked + .attendance-pill {
      background: var(--chip-selected-bg);
      border-color: var(--chip-selected-bg);
      color: var(--chip-selected-ink);
      font-weight: 400;
    }

    .attendance-option input:checked + .attendance-pill:hover {
      background: var(--chip-selected-hover-bg);
      border-color: var(--chip-selected-hover-bg);
      color: var(--chip-selected-ink);
    }

    .form-field {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      font-size: 14px;
    }

    .meal-field {
      width: 100%;
      max-width: 320px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 12px auto 0;
    }

    .meal-options {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
      width: 100%;
    }

    .meal-option-pill {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 16px;
      border-radius: 16px;
      border: 2px solid var(--border-12);
      background: transparent;
      box-shadow: none;
      font-family: ${sans};
      font-size: 14px;
      letter-spacing: 0.02em;
      text-transform: none;
      color: var(--ink-550);
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, color 0.2s ease;
      min-width: 100px;
      text-decoration: none;
    }

    .meal-option-pill.is-disabled {
      opacity: 0.4;
      cursor: not-allowed;
      border-color: var(--border-08);
      box-shadow: none;
    }

    .meal-option-pill.is-disabled:hover {
      color: var(--ink-600);
      border-color: var(--border-08);
      transform: none;
      box-shadow: none;
    }

    .meal-option-pill:hover {
      border-color: var(--border-25);
      color: var(--ink-800);
      transform: translateY(-1px);
      box-shadow: 0 4px 8px var(--shadow-05);
    }

    .meal-option-pill.is-selected {
      background: var(--chip-selected-bg);
      border-color: var(--chip-selected-bg);
      color: var(--chip-selected-ink);
      font-weight: 400;
    }

    .meal-option-pill.is-selected:hover {
      background: var(--chip-selected-hover-bg);
      border-color: var(--chip-selected-hover-bg);
      color: var(--chip-selected-ink);
    }

      .event-attendees {
        margin-top: 8px;
        display: flex;
        flex-direction: column;
        gap: 24px;
        align-items: center;
        width: 100%;
        padding-top: 32px;
        border-top: 1px solid var(--border-08);
      }

      .event-attendee {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        width: 100%;
      }

    .attendee-header {
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: center;
    }

    .attendee-name {
      font-family: ${sans};
      font-size: 16px;
      letter-spacing: 0.02em;
      text-transform: none;
      font-weight: 400;
      color: var(--ink-920);
    }

    .meal-option-pill input {
      position: absolute;
      inset: 0;
      opacity: 0;
      pointer-events: none;
    }

    .meal-option-pill span {
      pointer-events: none;
    }

    .dietary-field {
      width: 100%;
      max-width: 340px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0 auto;
    }

    .dietary-field[hidden] {
      display: none;
    }

    .field-label {
      font-family: ${sans};
      font-size: 14px;
      letter-spacing: 0.02em;
      text-transform: none;
      font-weight: 400;
      color: var(--ink-650);
      text-align: left;
    }

    .dietary-person-field {
      margin-top: 18px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      width: 100%;
      transition: transform 0.2s ease;
    }

    .dietary-person-field.is-disabled .dietary-toggle {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .dietary-person-field.is-disabled textarea {
      background: var(--color-surface-muted);
      cursor: not-allowed;
    }

    .dietary-person-field.is-open {
      transform: translateY(0);
    }

    .dietary-toggle {
      font-family: ${sans};
      font-size: 14px;
      letter-spacing: 0.02em;
      text-transform: none;
      font-weight: 400;
      color: var(--ink-600);
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 0;
    }

    .dietary-toggle:hover {
      color: var(--ink-850);
    }

    select,
    textarea,
    input[type="text"],
    input[type="number"] {
      font-family: ${sans};
      font-size: 14px;
      padding: 13px 18px;
      border-radius: 18px;
      border: 1px solid var(--border-12);
      background: var(--color-input-background);
      transition: border 0.2s ease, box-shadow 0.2s ease;
      width: 100%;
    }

    select {
      appearance: none;
      background-image: url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="10" height="6" viewBox="0 0 10 6" fill="none"%3E%3Cpath d="M1 1L5 5L9 1" stroke="%230f172a" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/%3E%3C/svg%3E');
      background-repeat: no-repeat;
      background-position: right 20px center;
      background-size: 10px 6px;
      padding-right: 46px;
    }

    input:focus,
    select:focus,
    textarea:focus {
      outline: none;
      border-color: var(--ink-920);
      box-shadow: 0 0 0 3px var(--shadow-14);
    }

    textarea {
      min-height: 108px;
      resize: none;
    }

    .form-status {
      font-size: 14px;
      letter-spacing: 0.02em;
      text-transform: none;
      color: var(--ink-650);
      min-height: 18px;
      text-align: center;
    }

    .form-status.pending {
      color: var(--color-accent);
    }

    .form-status.success {
      color: var(--color-success);
    }

    .form-status.error {
      color: var(--color-error);
    }

    button[type="submit"] {
      align-self: center;
      padding: 16px 48px;
      background: var(--color-accent-strong);
      color: var(--inverse-1000);
      font-size: 14px;
      letter-spacing: 0.02em;
      text-transform: none;
      border: none;
      border-radius: 999px;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    button[type="submit"]:hover {
      transform: translateY(-1px);
      box-shadow: 0 16px 28px var(--shadow-18);
    }

    button[type="submit"]:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      box-shadow: none;
    }

    @media (min-width: 768px) {
      .schedule-card--collapsible .schedule-card-header {
        flex-direction: row;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .schedule-card--collapsible .schedule-card-summary {
        flex: 1;
      }

      .schedule-card--collapsible .schedule-card-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        align-self: flex-start;
        color: var(--ink-850);
      }

      .schedule-card--collapsible .schedule-card-toggle:hover {
        color: var(--ink-950);
      }

      .timeline-section--flip .schedule-card--collapsible .schedule-card-header {
        flex-direction: row-reverse;
      }

      .timeline-card {
        gap: 32px;
      }

      .registry-item {
        gap: 16px;
      }

      .registry-list {
        gap: 28px;
        padding-bottom: 40px;
        margin-bottom: 40px;
      }

      form {
        padding: 0;
      }

      .event-list {
        display: flex;
        flex-direction: column;
        gap: 32px;
      }

      .event-attendees {
        display: flex;
        flex-direction: row;
        gap: 64px;
        align-items: start;
        justify-content: center;
        width: 100%;
        margin-top: 8px;
        padding-top: 32px;
        border-top: 1px solid var(--border-08);
      }

      .event-attendee {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 20px;
        align-items: center;
        max-width: 400px;
      }

      .attendee-header {
        display: flex;
        flex-direction: column;
        gap: 4px;
        align-items: center;
        text-align: center;
      }

      .attendee-name {
        font-family: ${sans};
        font-size: 16px;
        letter-spacing: 0.02em;
        text-transform: none;
        font-weight: 400;
        color: var(--ink-920);
      }

      .attendance-options {
        display: inline-flex;
        gap: 16px;
        justify-content: center;
        flex-wrap: nowrap;
        width: fit-content;
      }

      .attendance-option {
        position: relative;
      }

      .attendance-pill {
        display: inline-flex;
        align-items: center;
        padding: 10px 16px;
        background: transparent;
        border: 2px solid var(--border-15);
        border-radius: 16px;
        cursor: pointer;
        font-family: ${sans};
        font-size: 14px;
        letter-spacing: 0.02em;
        text-transform: none;
        font-weight: 400;
        color: var(--ink-550);
        transition: all 0.2s ease;
        min-width: 100px;
        justify-content: center;
      }

      .attendance-pill:hover {
        border-color: var(--border-30);
        color: var(--ink-850);
        transform: translateY(-2px);
        box-shadow: 0 8px 16px var(--shadow-06);
      }

      .attendance-option input:checked + .attendance-pill {
        background: var(--chip-selected-bg);
        border-color: var(--chip-selected-bg);
        color: var(--chip-selected-ink);
        font-weight: 400;
      }

      .attendance-option input:checked + .attendance-pill:hover {
        background: var(--chip-selected-hover-bg);
        border-color: var(--chip-selected-hover-bg);
        transform: translateY(-2px);
        color: var(--chip-selected-ink);
      }

      /* Accept button gets special treatment */
      .attendance-option:first-child input:checked + .attendance-pill {
        background: linear-gradient(135deg, var(--chip-selected-bg) 0%, var(--chip-selected-hover-bg) 100%);
        border-color: var(--chip-selected-bg);
        color: var(--chip-selected-ink);
      }

      .meal-field {
        width: 100%;
        margin-top: 4px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }

      .field-label {
        font-family: ${sans};
        font-size: 14px;
        letter-spacing: 0.02em;
        text-transform: none;
        font-weight: 400;
        color: var(--ink-600);
        margin-bottom: 12px;
        display: block;
      }

      .meal-options {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        justify-content: center;
      }

      .meal-option-pill {
        padding: 10px 16px;
        border: 2px solid var(--border-12);
        border-radius: 16px;
        background: transparent;
        font-family: ${sans};
        font-size: 14px;
        letter-spacing: 0.02em;
        text-transform: none;
        color: var(--ink-550);
        cursor: pointer;
        transition: all 0.2s ease;
        min-width: 100px;
      }

      .meal-option-pill.is-disabled {
        opacity: 0.4;
        cursor: not-allowed;
        border-color: var(--border-08);
        box-shadow: none;
      }

      .meal-option-pill:hover {
        border-color: var(--border-25);
        transform: translateY(-1px);
        color: var(--ink-800);
        box-shadow: 0 4px 8px var(--shadow-05);
      }

      .meal-option-pill.is-selected {
        background: var(--chip-selected-bg);
        border-color: var(--chip-selected-bg);
        color: var(--chip-selected-ink);
        font-weight: 400;
      }

      .meal-option-pill.is-selected:hover {
        background: var(--chip-selected-hover-bg);
        border-color: var(--chip-selected-hover-bg);
        color: var(--chip-selected-ink);
      }

      .meal-option-pill.is-disabled:hover {
        color: var(--ink-600);
        border-color: var(--border-08);
        transform: none;
        box-shadow: none;
      }

      .dietary-person-field {
        align-items: center;
        margin-top: 24px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 100%;
      }

      .dietary-person-field.is-disabled .dietary-toggle {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .dietary-person-field.is-disabled textarea {
        background: var(--color-surface-muted);
        cursor: not-allowed;
      }

      .dietary-field {
        max-width: 480px;
        margin: 0 auto;
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
    }

    @media (min-width: 768px) and (max-width: 1100px) {
      #rsvp .event-attendees {
        gap: 40px;
      }

      #rsvp .attendance-options {
        gap: 10px;
      }

      #rsvp .attendance-pill {
        padding: 10px 10px;
        min-width: 80px;
      }

      #rsvp .attendance-pill-label-full {
        display: none;
      }

      #rsvp .attendance-pill-label-short {
        display: inline;
      }
    }

    @media (max-width: 767px) {
      .timeline-layout {
        --timeline-pad-top: 80px;
        --timeline-pad-bottom: 120px;
        width: calc(100% - 40px);
        margin: 0 auto 120px;
        gap: 96px;
      }

      .timeline-layout::before {
        left: 28px;
      }

      .info-section {
        padding-top: 28px;
      }

      .info-section::before {
        left: 28px;
      }

      .timeline-section-inner {
        grid-template-columns: minmax(0, 1fr);
        grid-template-areas:
          "header"
          "content";
        row-gap: 32px;
      }

      .timeline-section--flip .timeline-section-inner {
        grid-template-areas:
          "header"
          "content";
      }

      .timeline-header,
      .timeline-content {
        padding-left: 56px;
        align-items: flex-start;
        text-align: left;
      }

      .timeline-heading-row {
        position: relative;
        justify-content: flex-start;
        padding-right: 48px;
        cursor: pointer;
      }

      .timeline-section--flip .timeline-heading-row {
        justify-content: flex-start;
      }

      .timeline-section-toggle {
        display: inline-flex;
        position: absolute;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        cursor: pointer;
        padding: 6px;
        background: none;
        border: none;
        margin: 0;
        color: var(--ink-620);
        touch-action: manipulation;
      }

      .timeline-section-toggle:focus-visible {
        outline: 2px solid rgba(var(--color-ink-rgb), 0.4);
        outline-offset: 2px;
      }

      .timeline-toggle-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        position: relative;
        transition: transform 0.2s ease, color 0.2s ease;
      }

      .timeline-toggle-icon::before {
        content: '';
        position: absolute;
        width: 6px;
        height: 6px;
        border-right: 2px solid currentColor;
        border-bottom: 2px solid currentColor;
        transform: rotate(-45deg);
        transition: inherit;
      }

      .timeline-section-toggle[aria-expanded="false"] .timeline-toggle-icon::before {
        transform: rotate(-45deg);
      }

      .timeline-section-toggle[aria-expanded="true"] {
        color: var(--ink-850);
      }

      .timeline-section-toggle[aria-expanded="true"] .timeline-toggle-icon::before {
        transform: rotate(45deg);
      }

      .timeline-section[data-collapsed] .timeline-content {
        height: 0;
        overflow: hidden;
      }

      .timeline-summary {
        max-width: 100%;
      }

      .timeline-content {
        gap: 28px;
        max-width: 100%;
        width: 100%;
      }

      .timeline-section--flip .timeline-content {
        margin-left: 0;
        align-items: flex-start;
        text-align: left;
      }

      .timeline-card {
        gap: 20px;
        width: 100%;
      }

      .timeline-section--flip .schedule-card {
        align-items: stretch;
      }

      .timeline-section--flip .schedule-card-header {
        align-items: flex-start;
        text-align: left;
      }

      .timeline-header-media {
        display: none;
      }

      .top-bar-inner {
        padding: 0 20px;
      }

      .nav-links[data-nav-links] {
        display: none;
      }

      .nav-links {
        gap: 16px;
        width: 100%;
      }

      .nav-item {
        width: 100%;
      }

      .nav-trigger,
      .nav-links a {
        justify-content: center;
        width: 100%;
      }

      .nav-dropdown {
        display: none !important;
      }

      .nav-toggle {
        display: inline-block;
      }

      .event-list {
        gap: 24px;
        padding: 0;
      }

      .event-attendees {
        gap: 24px;
      }

      .attendance-options {
        max-width: 340px;
        margin: 0 auto;
        justify-content: center;
        gap: 20px;
        padding: 0;
      }

      .schedule-desktop-content {
        display: none;
      }

      .schedule-mobile-sections {
        display: block;
      }

      .schedule-mobile-section {
        border-bottom: 1px solid var(--border-08);
        padding: 16px 0;
      }

      .schedule-mobile-section:last-child {
        border-bottom: none;
        padding-bottom: 0;
      }

      .schedule-section-toggle {
        width: 100%;
        text-align: left;
        background: none;
        border: none;
        font-family: ${sans};
        font-size: 15px;
        letter-spacing: 0.02em;
        color: var(--ink-800);
        padding: 0;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .schedule-section-toggle::after {
        content: '›';
        font-size: 16px;
        transition: transform 0.2s ease;
        transform: rotate(0deg);
      }

      .schedule-section-toggle[aria-expanded="true"]::after {
        transform: rotate(90deg);
      }

      .schedule-section-content {
        padding-top: 16px;
      }

      .schedule-section-content[hidden] {
        display: none;
      }
    }

    @media (max-width: 480px) {
      .timeline-layout {
        width: calc(100% - 28px);
      }

      .timeline-header,
      .timeline-content {
        padding-left: 52px;
      }

      .nav-links {
        flex-direction: column;
        gap: 12px;
        align-items: center;
        text-align: center;
      }

      .attendance-options {
        flex-wrap: wrap;
        gap: 12px;
        padding: 0;
      }
    }
  `;
}
