import type { CeremonyGuideSections } from '../../../types';
import type { EventPageViewModel } from '../view-models';
import { renderRichTextBlock } from '../utils/rich-text';
import { renderTimelineSection } from './timeline-section';
import { renderThemePicture } from './theme-picture';
import { buildTabIds } from './tab-ids';

type CeremonyTab = {
  key: keyof CeremonyGuideSections;
  label: string;
  content: string;
};

const CEREMONY_ORDER: Array<{ key: keyof CeremonyGuideSections; label: string }> = [
  { key: 'summary', label: 'Summary' },
  { key: 'quickGuide', label: 'Quick Guide' },
  { key: 'stepByStep', label: 'Full Step-by-Step' },
  { key: 'rolesObjects', label: 'Roles & Objects' },
  { key: 'history', label: 'History' },
  { key: 'etiquetteFaq', label: 'Etiquette & FAQ' }
];

export function getCeremonyTabs(view: EventPageViewModel): CeremonyTab[] {
  if (!view.navigation.showCeremony || !view.ceremonyGuide) {
    return [];
  }

  return buildCeremonyTabs(view.ceremonyGuide);
}

export function renderCeremonySection(view: EventPageViewModel): string {
  const tabs = getCeremonyTabs(view);
  if (tabs.length === 0) {
    return '';
  }

  const desktopTabs = renderCeremonyDesktopTabs(tabs);
  const mobileSections = renderCeremonyMobileSections(tabs);

  const headerMedia = renderThemePicture({
    lightSrc: '/assets/light/ceremony.webp',
    darkSrc: '/assets/dark/ceremonydark.webp',
    alt: 'Ceremony inspiration',
    imgClass: 'timeline-header-media-img'
  });

  const body = `
          <article class="timeline-card ceremony-card schedule-card" data-ceremony-card>
            ${desktopTabs}
            ${mobileSections}
          </article>`;

  return renderTimelineSection({
    id: 'ceremony',
    title: 'Ceremony',
    headerMedia,
    body
  });
}

function buildCeremonyTabs(sections: CeremonyGuideSections): CeremonyTab[] {
  const tabs: CeremonyTab[] = [];
  for (const { key, label } of CEREMONY_ORDER) {
    const raw = sections[key];
    if (!raw || typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const content = renderRichTextBlock(trimmed);
    if (!content) continue;

    tabs.push({
      key,
      label,
      content
    });
  }
  return tabs;
}

function renderCeremonyDesktopTabs(tabs: CeremonyTab[]): string {
  if (!tabs.length) return '';

  const buttons = tabs.map((tab, index) => {
    const { tabId, panelId } = buildTabIds('ceremony', tab.key);
    const isActive = index === 0;
    return `
            <button id="${tabId}" role="tab" aria-selected="${isActive ? 'true' : 'false'}" aria-controls="${panelId}" data-tab="ceremony-${tab.key}" tabindex="${isActive ? '0' : '-1'}">${tab.label}</button>`;
  }).join('\n');

  const panels = tabs.map((tab, index) => {
    const { tabId, panelId } = buildTabIds('ceremony', tab.key);
    const isActive = index === 0;
    return `
            <div id="${panelId}" class="schedule-tab-panel" role="tabpanel" aria-labelledby="${tabId}" data-panel="ceremony-${tab.key}"${isActive ? ' data-active' : ''}>
              ${tab.content}
            </div>`;
  }).join('\n');

  return `
          <div class="schedule-desktop-content">
            <div class="schedule-tabs" role="tablist">
${buttons}
            </div>
            <div class="schedule-panels">
${panels}
            </div>
          </div>`;
}

function renderCeremonyMobileSections(tabs: CeremonyTab[]): string {
  if (!tabs.length) return '';

  const sections = tabs.map((tab) => `
          <div class="schedule-mobile-section">
            <button class="schedule-section-toggle" aria-expanded="false" data-section="ceremony-${tab.key}">
              ${tab.label}
            </button>
            <div class="schedule-section-content" data-content="ceremony-${tab.key}" hidden>
              <div class="schedule-mobile-panel">
                ${tab.content}
              </div>
            </div>
          </div>`).join('\n');

  return `
          <div class="schedule-mobile-sections">
${sections}
          </div>`;
}
