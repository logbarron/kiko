import type { LocalGuideSections, TransportationSections } from '../../../types';
import type { EventPageViewModel } from '../view-models';
import { escapeHtml } from '../utils/escape';
import { renderRichTextBlock, renderRichTextInline } from '../utils/rich-text';
import { sanitizeToggleLabel } from '../utils/sanitize-toggle-label';
import { renderTimelineSection } from './timeline-section';
import { renderThemePicture } from './theme-picture';
import { buildTabIds } from './tab-ids';

type LocalGuideTab = {
  key: keyof LocalGuideSections;
  label: string;
  content: string;
};

type HotelTab = {
  name: string;
  label: string;
  content: string;
};

type TransportationTab = {
  key: keyof TransportationSections;
  label: string;
  content: string;
};

type TravelSections = {
  hotels: HotelTab[];
  transportation: TransportationTab[];
  localGuide: LocalGuideTab[];
};

type TravelCardKey = 'hotels' | 'transportation' | 'local-guide';

function renderTravelCard({
  key,
  title,
  desktopMarkup,
  mobileMarkup,
  modifierClass
}: {
  key: TravelCardKey;
  title: string;
  desktopMarkup: string;
  mobileMarkup: string;
  modifierClass: string;
}): string {
  const contentId = escapeHtml(`travel-desktop-content-${key}`);
  const toggleLabelPlain = sanitizeToggleLabel(title);
  const toggleLabelText = escapeHtml(
    toggleLabelPlain ? `Toggle ${toggleLabelPlain} details` : 'Toggle travel details'
  );

  return `
          <article class="timeline-card ${modifierClass} schedule-card schedule-card--collapsible" data-travel-card="${key}" data-travel-desktop-expanded="false">
            <header class="schedule-card-header">
              <div class="schedule-card-summary" data-travel-trigger>
                <h3 class="schedule-card-title">${escapeHtml(title)}</h3>
              </div>
              <button
                type="button"
                class="schedule-card-toggle"
                aria-expanded="false"
                aria-controls="${contentId}"
                data-travel-toggle
              >
                <span class="sr-only">${toggleLabelText}</span>
                <span aria-hidden="true" class="schedule-card-toggle-icon">›</span>
              </button>
            </header>
            <div class="schedule-desktop-content" id="${contentId}" data-travel-content hidden>
${desktopMarkup}
            </div>
${mobileMarkup}
          </article>`;
}

export function getTravelSections(view: EventPageViewModel): TravelSections {
  if (!view.navigation.showTravel) {
    return {
      hotels: [],
      transportation: [],
      localGuide: []
    };
  }

  const hotels = Array.isArray(view.accommodations) && view.accommodations.length > 0
    ? buildHotelTabs(view.accommodations)
    : [];

  const localGuide = view.localGuide ? buildLocalGuideTabs(view.localGuide) : [];
  const transportation = view.transportationGuide
    ? buildTransportationTabs(view.transportationGuide)
    : [];

  return {
    hotels,
    transportation,
    localGuide
  };
}

export function renderTravelSection(view: EventPageViewModel): string {
  if (!view.navigation.showTravel) {
    return '';
  }

  const sections = getTravelSections(view);
  const hasAccommodations = sections.hotels.length > 0;
  const hasTransportation = sections.transportation.length > 0;
  const hasGuide = sections.localGuide.length > 0;

  if (!hasAccommodations && !hasGuide && !hasTransportation) {
    return '';
  }

  const travelCards: string[] = [];

  if (hasAccommodations) {
    const hotelDesktop = renderHotelDesktopTabs(sections.hotels);
    const hotelMobile = renderHotelMobileSections(sections.hotels);

    travelCards.push(
      renderTravelCard({
        key: 'hotels',
        title: 'Hotels',
        desktopMarkup: hotelDesktop,
        mobileMarkup: hotelMobile,
        modifierClass: 'hotels-card'
      })
    );
  }

  if (hasTransportation) {
    const transportationDesktop = renderTransportationDesktopTabs(sections.transportation);
    const transportationMobile = renderTransportationMobileSections(sections.transportation);

    travelCards.push(
      renderTravelCard({
        key: 'transportation',
        title: 'Transportation',
        desktopMarkup: transportationDesktop,
        mobileMarkup: transportationMobile,
        modifierClass: 'transportation-card'
      })
    );
  }

  if (hasGuide) {
    const localGuideDesktop = renderLocalGuideDesktopTabs(sections.localGuide);
    const localGuideMobile = renderLocalGuideMobileSections(sections.localGuide);

    travelCards.push(
      renderTravelCard({
        key: 'local-guide',
        title: 'Local Guide',
        desktopMarkup: localGuideDesktop,
        mobileMarkup: localGuideMobile,
        modifierClass: 'local-guide-card'
      })
    );
  }

  const body = `
          <div class="schedule-list travel-list">
            ${travelCards.join('\n')}
          </div>`;

  const headerMedia = renderThemePicture({
    lightSrc: '/assets/light/travel.webp',
    darkSrc: '/assets/dark/traveldark.webp',
    alt: 'Travel inspiration',
    imgClass: 'timeline-header-media-img'
  });

  return renderTimelineSection({
    id: 'travel',
    title: 'Travel',
    body,
    headerMedia
  });
}

function buildHotelTabs(accommodations: Array<{
  name: string;
  address: string;
  discountCode?: string;
  notes?: string;
}>): HotelTab[] {
  return accommodations.map((hotel) => {
    const label = escapeHtml(hotel.name);
    const hotelAddress = hotel.address ? renderRichTextBlock(hotel.address) : '';
    const discountCode = hotel.discountCode ? `<div class="hotel-meta">${renderRichTextBlock(hotel.discountCode)}</div>` : '';
    const hotelNotes = hotel.notes ? `<div class="hotel-notes">${renderRichTextBlock(hotel.notes)}</div>` : '';

    const content = `
      <div class="hotel-details">
        ${hotelAddress ? `<div class="hotel-address">${hotelAddress}</div>` : ''}
        ${discountCode}
        ${hotelNotes}
      </div>`;
    return {
      name: hotel.name,
      label,
      content
    };
  });
}

function buildLocalGuideTabs(sections: LocalGuideSections): LocalGuideTab[] {
  const order: Array<keyof LocalGuideSections> = ['eat', 'drink', 'see', 'do'];
  const labels: Record<keyof LocalGuideSections, string> = {
    eat: 'What to Eat',
    drink: 'Where to Drink',
    see: 'Places to See',
    do: 'Things to Do'
  };
  const result: LocalGuideTab[] = [];

  for (const key of order) {
    const raw = sections[key];
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const content = renderRichTextBlock(trimmed);
    if (!content) continue;

    result.push({
      key,
      label: labels[key],
      content
    });
  }

  return result;
}

function buildTransportationTabs(sections: TransportationSections): TransportationTab[] {
  const order: Array<keyof TransportationSections> = ['planes', 'trains', 'automobiles'];
  const labels: Record<keyof TransportationSections, string> = {
    planes: 'Planes',
    trains: 'Trains',
    automobiles: 'Automobiles'
  };
  const result: TransportationTab[] = [];

  for (const key of order) {
    const raw = sections[key];
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const content = renderRichTextBlock(trimmed);
    if (!content) continue;

    result.push({
      key,
      label: labels[key],
      content
    });
  }

  return result;
}

function renderHotelDesktopTabs(hotels: HotelTab[]): string {
  if (!hotels.length) return '';

  const tabs = hotels.map((hotel, index) => {
    const { tabId, panelId } = buildTabIds('hotel', index);
    const isActive = index === 0;
    return `
              <button id="${tabId}" role="tab" aria-selected="${isActive ? 'true' : 'false'}" aria-controls="${panelId}" data-tab="hotel-${index}" tabindex="${isActive ? '0' : '-1'}">${hotel.label}</button>`;
  }).join('\n');

  const panels = hotels.map((hotel, index) => {
    const { tabId, panelId } = buildTabIds('hotel', index);
    const isActive = index === 0;
    return `
              <div id="${panelId}" class="schedule-tab-panel hotel-panel" role="tabpanel" aria-labelledby="${tabId}" data-panel="hotel-${index}"${isActive ? ' data-active' : ''}>
                ${hotel.content}
              </div>`;
  }).join('\n');

  return `
              <div class="schedule-tabs" role="tablist">
${tabs}
              </div>
              <div class="schedule-panels">
${panels}
              </div>`;
}

function renderHotelMobileSections(hotels: HotelTab[]): string {
  if (!hotels.length) return '';

  const mobile = hotels.map((hotel, index) => `
          <div class="schedule-mobile-section">
            <button class="schedule-section-toggle" aria-expanded="false" data-section="hotel-${index}">
              ${hotel.label}
            </button>
            <div class="schedule-section-content" data-content="hotel-${index}" hidden>
              <div class="schedule-mobile-panel">
                ${hotel.content}
              </div>
            </div>
          </div>`).join('\n');

  return `
            <div class="schedule-mobile-sections">
${mobile}
            </div>`;
}

function renderLocalGuideDesktopTabs(sections: LocalGuideTab[]): string {
  if (!sections.length) return '';

  const tabs = sections.map((section, index) => {
    const { tabId, panelId } = buildTabIds('local-guide', section.key);
    const isActive = index === 0;
    return `
              <button id="${tabId}" role="tab" aria-selected="${isActive ? 'true' : 'false'}" aria-controls="${panelId}" data-tab="local-guide-${String(section.key)}" tabindex="${isActive ? '0' : '-1'}">${section.label}</button>`;
  }).join('\n');

  const panels = sections.map((section, index) => {
    const { tabId, panelId } = buildTabIds('local-guide', section.key);
    const isActive = index === 0;
    return `
              <div id="${panelId}" class="schedule-tab-panel local-guide-panel" role="tabpanel" aria-labelledby="${tabId}" data-panel="local-guide-${String(section.key)}"${isActive ? ' data-active' : ''}>
                ${section.content}
              </div>`;
  }).join('\n');

  return `
              <div class="schedule-tabs" role="tablist">
${tabs}
              </div>
              <div class="schedule-panels">
${panels}
              </div>`;
}

function renderLocalGuideMobileSections(sections: LocalGuideTab[]): string {
  if (!sections.length) return '';

  const mobile = sections.map((section, index) => `
          <div class="schedule-mobile-section">
            <button class="schedule-section-toggle" aria-expanded="false" data-section="local-guide-${String(section.key)}">
              ${section.label}
            </button>
            <div class="schedule-section-content" data-content="local-guide-${String(section.key)}" hidden>
              <div class="schedule-mobile-panel">
                ${section.content}
              </div>
            </div>
          </div>`).join('\n');

  return `
            <div class="schedule-mobile-sections">
${mobile}
            </div>`;
}

function renderTransportationDesktopTabs(sections: TransportationTab[]): string {
  if (!sections.length) return '';

  const tabs = sections.map((section, index) => {
    const { tabId, panelId } = buildTabIds('transportation', section.key);
    const isActive = index === 0;
    return `
              <button id="${tabId}" role="tab" aria-selected="${isActive ? 'true' : 'false'}" aria-controls="${panelId}" data-tab="transportation-${String(section.key)}" tabindex="${isActive ? '0' : '-1'}">${section.label}</button>`;
  }).join('\n');

  const panels = sections.map((section, index) => {
    const { tabId, panelId } = buildTabIds('transportation', section.key);
    const isActive = index === 0;
    return `
              <div id="${panelId}" class="schedule-tab-panel transportation-panel" role="tabpanel" aria-labelledby="${tabId}" data-panel="transportation-${String(section.key)}"${isActive ? ' data-active' : ''}>
                ${section.content}
              </div>`;
  }).join('\n');

  return `
              <div class="schedule-tabs" role="tablist">
${tabs}
              </div>
              <div class="schedule-panels">
${panels}
              </div>`;
}

function renderTransportationMobileSections(sections: TransportationTab[]): string {
  if (!sections.length) return '';

  const mobile = sections.map((section, index) => `
          <div class="schedule-mobile-section">
            <button class="schedule-section-toggle" aria-expanded="false" data-section="transportation-${String(section.key)}">
              ${section.label}
            </button>
            <div class="schedule-section-content" data-content="transportation-${String(section.key)}" hidden>
              <div class="schedule-mobile-panel">
                ${section.content}
              </div>
            </div>
          </div>`).join('\n');

  return `
            <div class="schedule-mobile-sections">
${mobile}
            </div>`;
}
