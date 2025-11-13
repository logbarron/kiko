import type { EventPageViewModel } from '../view-models';
import { escapeHtml } from '../utils/escape';
import { renderRichTextInline } from '../utils/rich-text';
import { renderThemePicture } from './theme-picture';

function renderHeroHeadline(value: string): string {
  if (!value) return '';
  return renderRichTextInline(value);
}

export function renderHeroSection(view: EventPageViewModel): string {
  const ctaContent = renderRichTextInline(view.hero.rsvpDeadlineText);
  const heroMedia = renderThemePicture({
    lightSrc: '/assets/light/hero.webp',
    darkSrc: '/assets/dark/herodark.webp',
    alt: '',
    wrapperClass: 'hero-art-wrapper',
    imgClass: 'hero-art',
    loading: 'eager',
    pictureAttributes: { 'data-hero-picture': true },
    sourceAttributes: { 'data-hero-source': true },
    imageAttributes: { 'data-hero-image': true }
  });
  return `
  <header class="hero-section">
    ${heroMedia}
    <div class="hero-content">
      <div class="names-display">
        <span class="name-large">${renderHeroHeadline(view.hero.headline)}</span>
      </div>
      <div class="event-date">${escapeHtml(view.hero.dateText)}</div>
      ${ctaContent ? `<a href="#rsvp" class="rsvp-box" data-scroll-target="rsvp">${ctaContent}</a>` : ''}
    </div>
  </header>`;
}
