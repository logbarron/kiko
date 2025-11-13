import { escapeHtml } from '../utils/escape';

type TimelineSectionOptions = {
  id: string;
  title: string;
  body: string;
  eyebrow?: string;
  summary?: string;
  align?: 'left' | 'right';
  headerMedia?: string;
};

export function renderTimelineSection({
  id,
  title,
  body,
  eyebrow,
  summary,
  align = 'left',
  headerMedia
}: TimelineSectionOptions): string {
  const eyebrowMarkup = eyebrow
    ? `<p class="timeline-eyebrow">${escapeHtml(eyebrow)}</p>`
    : '';
  const summaryMarkup = summary
    ? `<p class="timeline-summary">${escapeHtml(summary)}</p>`
    : '';
  const mediaMarkup = headerMedia
    ? `<div class="timeline-header-media">${headerMedia}</div>`
    : '';

  const safeId = escapeHtml(id);
  const safeTitle = escapeHtml(title);
  const headingId = escapeHtml(`${id}-heading`);
  const contentId = escapeHtml(`${id}-content`);
  const alignmentClass = align === 'right' ? ' timeline-section--flip' : '';
  const defaultExpanded = 'false';
  const toggleButton = `
          <button
            type="button"
            class="timeline-section-toggle"
            aria-expanded="${defaultExpanded}"
            aria-controls="${contentId}"
            aria-labelledby="${headingId} ${headingId}-toggle-label"
            data-timeline-toggle
            data-section="${safeId}"
          >
            <span class="timeline-toggle-icon" aria-hidden="true"></span>
            <span class="sr-only" id="${headingId}-toggle-label">Toggle ${safeTitle} details</span>
          </button>`;

  return `
    <section id="${safeId}" class="info-section timeline-section${alignmentClass}" data-timeline-section data-section-id="${safeId}" data-timeline-expanded="${defaultExpanded}" data-collapsed>
      <div class="timeline-section-inner">
        <header class="timeline-header" data-timeline-header>
          ${eyebrowMarkup}
          <div class="timeline-heading-row" data-timeline-toggle-target>
            <h2 class="timeline-heading" id="${headingId}">${safeTitle}</h2>
            ${toggleButton}
          </div>
          ${summaryMarkup}
          ${mediaMarkup}
        </header>
        <div class="timeline-content" id="${contentId}" data-timeline-content>
          ${body}
        </div>
      </div>
    </section>`;
}
