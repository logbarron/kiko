import { BRAND_SANS } from '../../lib/pageStyles';
import type { EventPageViewModel } from './view-models';
import { renderNavigation } from './components/navigation';
import { renderHeroSection } from './components/hero';
import { renderCeremonySection } from './components/ceremony';
import { renderScheduleSection } from './components/schedule';
import { renderTravelSection } from './components/travel';
import { renderRegistrySection } from './components/registry';
import { renderRsvpSection } from './components/rsvp';
import { renderEventStyles } from './styles';
import { renderEventScripts } from './scripts/interactions';
import { renderThemeScript } from '../shared/themeToggle';
import { escapeHtml } from './utils/escape';
import { renderRichTextInline } from './utils/rich-text';

export type { EventPageViewModel } from './view-models';

const FONT_STACK = BRAND_SANS;

export function renderEventPage(view: EventPageViewModel, nonce: string): string {
  const navLinks = renderNavigation(view);
  const ceremonySection = renderCeremonySection(view);
  const scheduleSection = renderScheduleSection(view);
  const travelSection = renderTravelSection(view);
  const registrySection = renderRegistrySection(view);
  const rsvpSection = renderRsvpSection(view);
  const navHeadline = renderRichTextInline(view.hero.headline).replace(/<br>/g, ' ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(view.title)}</title>
  <meta name="robots" content="noindex,nofollow">
  <meta name="referrer" content="no-referrer">
  <link rel="stylesheet" href="/build/enhance.css">
  <!-- TODO: Add your Adobe Typekit or custom font link here -->
  <!-- <link rel="stylesheet" href="https://use.typekit.net/YOUR_TYPEKIT_ID.css"> -->
    ${renderEventStyles(nonce, { serif: FONT_STACK, sans: FONT_STACK })}

</head>
<body class="page-fade">
  <nav class="top-bar" data-top-bar>
    <div class="top-bar-inner">
      <div class="names-header" data-scroll-to-top>${navHeadline}</div>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="event-nav-drawer" data-nav-toggle>
        <span></span>
        <span></span>
        <span></span>
        <span class="sr-only">Toggle navigation</span>
      </button>
      <div class="nav-links" data-nav-links>
        ${navLinks}
      </div>
    </div>
    <div class="nav-drawer" id="event-nav-drawer" role="dialog" aria-modal="true" data-nav-drawer>
      <div class="nav-links">
        ${navLinks}
      </div>
    </div>
    <div class="nav-overlay" data-nav-overlay></div>
    <div class="top-bar-divider"></div>
  </nav>

  ${renderHeroSection(view)}

  <main class="timeline-layout">
    ${ceremonySection}
    ${scheduleSection}
    ${travelSection}
    ${registrySection}
    ${rsvpSection}
  </main>

  ${renderThemeScript(nonce, { storageKey: 'guest-theme' })}
  ${renderEventScripts(nonce)}

</body>
</html>`;
}
