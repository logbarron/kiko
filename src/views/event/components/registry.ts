import type { EventPageViewModel } from '../view-models';
import { escapeHtml } from '../utils/escape';
import { renderRichTextBlock, renderRichTextInline } from '../utils/rich-text';
import { renderTimelineSection } from './timeline-section';
import { renderThemePicture } from './theme-picture';

export function renderRegistrySection(view: EventPageViewModel): string {
  if (!view.navigation.showRegistry || !view.registry || view.registry.length === 0) {
    return '';
  }

  const items = view.registry.map(item => {
    const description = renderRichTextBlock(item.description);
    return `
        <li class="timeline-card registry-item">
          <a class="registry-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${renderRichTextInline(item.label)}</a>
          ${description ? `<div class="registry-description">${description}</div>` : ''}
        </li>`;
  }).join('\n');

  const honeymoonWidget = `
          <div class="registry-honeymoon">
            <section class="honeymoon-widget" data-honeymoon>
              <h3 class="honeymoon-heading">Honeymoon Fund</h3>
              <div class="honeymoon-fields" data-contribute-fields>
                <div class="honeymoon-presets" data-preset-row>
                  <button type="button" class="honeymoon-preset" data-amount-button="50">$50</button>
                  <button type="button" class="honeymoon-preset" data-amount-button="100">$100</button>
                  <button type="button" class="honeymoon-preset" data-amount-button="200">$200</button>
                </div>
                <label class="honeymoon-label">
                  <div class="honeymoon-amount-input" data-amount-shell>
                    <span aria-hidden="true">$</span>
                    <input
                      type="text"
                      inputmode="decimal"
                      pattern="[0-9]*"
                      autocomplete="off"
                      placeholder="Feeling Generous"
                      aria-label="Contribution amount in dollars"
                      data-amount-input
                    >
                  </div>
                </label>
              </div>
              <button type="button" class="honeymoon-button" data-contribute-button>Contribute</button>
              <div class="honeymoon-checkout" data-checkout-container hidden>
                <div class="honeymoon-email-wrapper">
                  <label class="honeymoon-email-label" for="honeymoon-email-input">Email</label>
                  <input
                    type="email"
                    id="honeymoon-email-input"
                    data-email-input
                    placeholder="your@email.com"
                    required
                    aria-label="Email address for receipt"
                  >
                </div>
                <div class="honeymoon-payment-element" data-payment-mount></div>
                <div class="honeymoon-button-mount" data-button-mount></div>
              </div>
              <div class="honeymoon-success" data-success hidden>
                <p class="honeymoon-success-message" data-success-message></p>
                <a class="honeymoon-receipt" data-receipt-link target="_blank" rel="noopener">View receipt</a>
              </div>
              <p class="honeymoon-error" data-error hidden aria-live="polite"></p>
            </section>
          </div>`;

  const body = `
          <ul class="registry-list">
            ${items}
          </ul>
          ${honeymoonWidget}`;

  const headerMedia = renderThemePicture({
    lightSrc: '/assets/light/registry.webp',
    darkSrc: '/assets/dark/registrydark.webp',
    alt: 'Registry inspiration',
    imgClass: 'timeline-header-media-img'
  });

  return renderTimelineSection({
    id: 'registry',
    title: 'Registry',
    align: 'right',
    body,
    headerMedia
  });
}
