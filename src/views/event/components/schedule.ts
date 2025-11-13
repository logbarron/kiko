import type { EventPageViewModel } from '../view-models';
import { escapeHtml } from '../utils/escape';
import { renderRichTextBlock, renderRichTextInline } from '../utils/rich-text';
import { sanitizeToggleLabel } from '../utils/sanitize-toggle-label';
import { renderTimelineSection } from './timeline-section';
import { renderThemePicture } from './theme-picture';
import { buildTabIds } from './tab-ids';

export function renderScheduleSection(view: EventPageViewModel): string {
  if (!view.navigation.showSchedule || view.events.length === 0) {
    return '';
  }

  const eventCards = view.events.map(event => {
    const wrapScheduleBlock = (content: string): string => (content ? `<div class="schedule-detail">${content}</div>` : '');

    const dressCodeBlock = wrapScheduleBlock(renderRichTextBlock(event.dressCode));
    const transportationBlock = wrapScheduleBlock(renderRichTextBlock(event.transportation));
    const photoPolicyBlock = wrapScheduleBlock(renderRichTextBlock(event.photoPolicy));
    const childPolicyBlock = wrapScheduleBlock(renderRichTextBlock(event.childPolicy));
    const foodNotesBlock = wrapScheduleBlock(renderRichTextBlock(event.foodNotes));
    const additionalNotesBlock = wrapScheduleBlock(renderRichTextBlock(event.additionalNotes));
    const accessibilityBlock = wrapScheduleBlock(renderRichTextBlock(event.accessibility));

    const mapLinkFallback = event.mapUrl && !transportationBlock
      ? `<p class="schedule-detail"><a href="${escapeHtml(event.mapUrl)}" target="_blank" rel="noopener">View directions</a></p>`
      : '';

    const hasGettingThere = Boolean(transportationBlock || mapLinkFallback);
    const detailBlocks = [photoPolicyBlock, childPolicyBlock, foodNotesBlock, additionalNotesBlock]
      .filter(Boolean)
      .join('');
    const hasDetails = Boolean(detailBlocks);
    const hasAccessibility = Boolean(accessibilityBlock);

    const locationNameMarkup = event.locationName
      ? `<div class="schedule-location-name">${renderRichTextBlock(event.locationName)}</div>`
      : '';

    const addressJoined = event.locationAddress && event.locationAddress.length > 0
      ? event.locationAddress.join('\n')
      : '';

    const locationAddressMarkup = addressJoined
      ? event.mapUrl
        ? `<a href="${escapeHtml(event.mapUrl)}" target="_blank" rel="noopener" class="schedule-address-link rich-text-inline">${renderRichTextInline(addressJoined)}</a>`
        : `<div class="schedule-address">${renderRichTextBlock(addressJoined)}</div>`
      : '';

    const slots = [
      {
        key: 'essential',
        label: 'Essential Info',
        content: `
          ${locationNameMarkup}
          ${locationAddressMarkup}
          ${dressCodeBlock}
        `,
        enabled: true
      },
      {
        key: 'getting',
        label: 'Getting There',
        content: `
          ${transportationBlock}
          ${mapLinkFallback}
        `,
        enabled: hasGettingThere
      },
      {
        key: 'details',
        label: 'What to Know',
        content: `
          ${detailBlocks}
        `,
        enabled: hasDetails
      },
      {
        key: 'access',
        label: 'Accessibility',
        content: `
          ${accessibilityBlock}
        `,
        enabled: hasAccessibility
      }
    ].filter(slot => slot.enabled);

    const desktopButtons = slots.map((slot, index) => {
      const { tabId, panelId } = buildTabIds('schedule', `${event.id}-${slot.key}`);
      const isActive = index === 0;
      const dataKey = `${slot.key}-${event.id}`;
      return `<button id="${tabId}" role="tab" aria-selected="${isActive ? 'true' : 'false'}" aria-controls="${panelId}" data-tab="${dataKey}" tabindex="${isActive ? '0' : '-1'}">${slot.label.trim()}</button>`;
    }).join('\n');

    const desktopPanels = slots.map((slot, index) => {
      const { tabId, panelId } = buildTabIds('schedule', `${event.id}-${slot.key}`);
      const isActive = index === 0;
      const dataKey = `${slot.key}-${event.id}`;
      return `<div id="${panelId}" class="schedule-tab-panel" role="tabpanel" aria-labelledby="${tabId}" data-panel="${dataKey}"${isActive ? ' data-active' : ''}>
          ${slot.content}
        </div>`;
    }).join('\n');

    const desktopTabs = `
        <div class="schedule-tabs" role="tablist">
          ${desktopButtons}
        </div>`;

    const mobileSections = `
        <div class="schedule-mobile-sections">
          ${slots.map(slot => {
            const dataKey = `${slot.key}-${event.id}`;
            return `
          <div class="schedule-mobile-section">
            <button class="schedule-section-toggle" aria-expanded="false" data-section="${dataKey}">
              ${slot.label.trim()}
            </button>
            <div class="schedule-section-content" data-content="${dataKey}" hidden>
              <div class="schedule-mobile-panel">
                ${slot.content}
              </div>
            </div>
          </div>`;
          }).join('')}
        </div>`;

    const dateSpan = event.dateLabel
      ? `<span class="schedule-card-date">${escapeHtml(event.dateLabel)}</span>`
      : '';
    const timeSpan = event.timeLabel
      ? `<span class="schedule-card-time">${escapeHtml(event.timeLabel)}</span>`
      : '';
    const metaLine = [dateSpan, timeSpan].filter(Boolean).join('<span class="schedule-meta-separator"> · </span>');

    const geoMarkup = event.locationGeo
      ? `<p class="schedule-card-meta">${escapeHtml(event.locationGeo)}</p>`
      : '';
    const contentId = escapeHtml(`schedule-desktop-content-${event.id}`);
    const toggleLabelPlain = sanitizeToggleLabel(event.label);
    const toggleLabelText = escapeHtml(
      toggleLabelPlain ? `Toggle ${toggleLabelPlain} details` : 'Toggle schedule details'
    );
    const defaultExpandedAttr = 'false';
    const desktopContentHidden = ' hidden';

    return `
        <article class="schedule-card schedule-card--collapsible" data-schedule-id="${escapeHtml(event.id)}" data-desktop-expanded="${defaultExpandedAttr}">
          <header class="schedule-card-header">
            <div class="schedule-card-summary" data-schedule-trigger>
              <h3 class="schedule-card-title">${renderRichTextInline(event.label)}</h3>
              ${metaLine ? `<p class="schedule-card-meta">${metaLine}</p>` : ''}
              ${geoMarkup}
            </div>
            <button
              type="button"
              class="schedule-card-toggle"
              aria-expanded="${defaultExpandedAttr}"
              aria-controls="${contentId}"
              data-schedule-toggle
            >
              <span class="sr-only">${toggleLabelText}</span>
              <span aria-hidden="true" class="schedule-card-toggle-icon">›</span>
            </button>
          </header>
          <div class="schedule-desktop-content" id="${contentId}"${desktopContentHidden}>
            ${desktopTabs}
            <div class="schedule-panels">
              ${desktopPanels}
            </div>
          </div>
          ${mobileSections}
        </article>`;
  }).join('\n');

  const body = `
          <div class="schedule-list">
            ${eventCards}
          </div>`;

  const headerMedia = renderThemePicture({
    lightSrc: '/assets/light/reception.webp',
    darkSrc: '/assets/dark/receptiondark.webp',
    alt: 'Reception inspiration',
    imgClass: 'timeline-header-media-img'
  });

  return renderTimelineSection({
    id: 'schedule',
    title: 'Schedule',
    align: 'right',
    body,
    headerMedia
  });
}
