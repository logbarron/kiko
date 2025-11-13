import type { EventPageViewModel } from '../view-models';
import { renderThemeToggle } from '../../shared/themeToggle';
import { getCeremonyTabs } from './ceremony';
import { getTravelSections } from './travel';
import { escapeHtml } from '../utils/escape';

export function renderNavigation(view: EventPageViewModel): string {
  const items: string[] = [];
  const ceremonyTabs = getCeremonyTabs(view);
  const hasCeremony = ceremonyTabs.length > 0;
  const hasSchedule = view.navigation.showSchedule && view.events.length > 0;
  const travelSections = getTravelSections(view);
  const hasTravelContent = travelSections.hotels.length > 0 ||
    travelSections.localGuide.length > 0 ||
    travelSections.transportation.length > 0;
  const hasRegistryContent = view.navigation.showRegistry && Array.isArray(view.registry) && view.registry.length > 0;

  const renderAnchor = (label: string, target: string): string => {
    const safeTarget = escapeHtml(target);
    const safeLabel = escapeHtml(label);
    return `<a href="#${safeTarget}" data-scroll-target="${safeTarget}">${safeLabel}</a>`;
  };

  const renderDropdown = (options: {
    id: 'schedule' | 'travel';
    label: string;
    fallbackTarget: string;
    items: Array<{ label: string; target: string; focus: string }>;
  }): string => {
    if (options.items.length === 0) {
      return renderAnchor(options.label, options.fallbackTarget);
    }

    const safeId = escapeHtml(options.id);
    const safeFallbackTarget = escapeHtml(options.fallbackTarget);
    const dropdownId = `nav-dropdown-${safeId}`;
    const triggerLabel = escapeHtml(options.label);
    const itemEntries = options.items.map(item => {
      const safeLabel = escapeHtml(item.label);
      const safeTarget = escapeHtml(item.target);
      const safeFocus = escapeHtml(item.focus);
      return `<a class="nav-dropdown-link" href="#${safeTarget}" data-scroll-target="${safeTarget}" data-scroll-focus="${safeFocus}">${safeLabel}</a>`;
    }).join('\n');

    return [
      `<div class="nav-item nav-item--dropdown" data-nav-item="${safeId}">`,
      `  <button type="button" class="nav-trigger" data-nav-trigger="${safeId}" data-nav-target="${safeFallbackTarget}" aria-controls="${escapeHtml(dropdownId)}" aria-expanded="false" aria-haspopup="true">`,
      `    ${triggerLabel}`,
      '  </button>',
      `  <div class="nav-dropdown" id="${escapeHtml(dropdownId)}" data-nav-dropdown="${safeId}" hidden>`,
      `    ${itemEntries}`,
      '  </div>',
      '</div>'
    ].join('\n');
  };

  if (hasCeremony) {
    items.push(renderAnchor('Ceremony', 'ceremony'));
  }

  if (hasSchedule) {
    const scheduleItems = view.events.map(event => ({
      label: event.label || 'Event',
      target: 'schedule',
      focus: `schedule:${event.id}`
    }));

    items.push(renderDropdown({
      id: 'schedule',
      label: 'Schedule',
      fallbackTarget: 'schedule',
      items: scheduleItems
    }));
  }

  if (hasTravelContent) {
    const travelItems: Array<{ label: string; target: string; focus: string }> = [];
    if (travelSections.hotels.length > 0) {
      travelItems.push({ label: 'Hotels', target: 'travel', focus: 'travel:hotels' });
    }
    if (travelSections.transportation.length > 0) {
      travelItems.push({ label: 'Transportation', target: 'travel', focus: 'travel:transportation' });
    }
    if (travelSections.localGuide.length > 0) {
      travelItems.push({ label: 'Local Guide', target: 'travel', focus: 'travel:local-guide' });
    }

    items.push(renderDropdown({
      id: 'travel',
      label: 'Travel',
      fallbackTarget: 'travel',
      items: travelItems
    }));
  }

  if (hasRegistryContent) {
    items.push(renderAnchor('Registry', 'registry'));
  }

  if (view.navigation.showRsvp) {
    items.push(renderAnchor('RSVP', 'rsvp'));
  }

  items.push(renderThemeToggle());

  return items.join('\n');
}
