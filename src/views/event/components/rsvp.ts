import type {
  EventAttendeeViewModel,
  EventEntryViewModel,
  EventPageViewModel
} from '../view-models';
import { escapeHtml } from '../utils/escape';
import { renderRichTextBlock, renderRichTextInline } from '../utils/rich-text';
import { renderTimelineSection } from './timeline-section';
import { renderThemePicture } from './theme-picture';

export function renderRsvpSection(view: EventPageViewModel): string {
  const headerMedia = renderThemePicture({
    lightSrc: '/assets/light/rsvp.webp',
    darkSrc: '/assets/dark/rsvpdark.webp',
    alt: 'RSVP inspiration',
    imgClass: 'timeline-header-media-img'
  });

  if (view.rsvp.state === 'closed') {
    const closedMessage = view.rsvp.closedMessage
      ? renderRichTextBlock(view.rsvp.closedMessage)
      : '<p class="timeline-note">RSVP is now closed. Please reach out to the hosts if you need to make changes.</p>';

    const body = `
          <div class="rsvp-closed">
            ${closedMessage}
          </div>`;

    return renderTimelineSection({
      id: 'rsvp',
      title: 'RSVP',
      body,
      headerMedia
    });
  }

  const eventsMarkup = renderRsvpEvents(view);

  const body = `
          <form id="rsvp-form" method="post" action="/rsvp" novalidate>
            <input type="hidden" name="partyResponses" value="{}">
            ${eventsMarkup ? `<div class="event-list">${eventsMarkup}</div>` : ''}

            <p id="rsvp-status" class="form-status" role="status" aria-live="polite"></p>
          </form>`;

  return renderTimelineSection({
    id: 'rsvp',
    title: 'RSVP',
    body,
    headerMedia
  });
}

function renderRsvpEvents(view: EventPageViewModel): string {
  if (view.events.length === 0) return '';

  return view.events.map(event => {
    const roleOrder: Record<EventAttendeeViewModel['role'], number> = {
      primary: 0,
      companion: 1,
      guest: 2
    };

    const attendees = [...event.attendees]
      .sort((a, b) => roleOrder[a.role] - roleOrder[b.role])
      .map(attendee => renderAttendeeBlock(event, attendee))
      .join('\n');

    const eventDataAttrs = [
      `data-event-id="${escapeHtml(event.id)}"`,
      event.requiresMealSelection ? 'data-requires-meal="true"' : '',
      event.collectDietaryNotes ? 'data-collects-dietary="true"' : ''
    ].filter(Boolean).join(' ');

    const dateSpan = event.dateLabel
      ? `<span class="schedule-card-date">${escapeHtml(event.dateLabel)}</span>`
      : '';
    const timeSpan = event.timeLabel
      ? `<span class="schedule-card-time">${escapeHtml(event.timeLabel)}</span>`
      : '';
    const metaLine = [dateSpan, timeSpan].filter(Boolean).join('<span class="schedule-meta-separator"> · </span>');

    const geoMarkup = event.locationGeo
      ? `<p class="schedule-card-meta rsvp-event-geo">${escapeHtml(event.locationGeo)}</p>`
      : '';

    return `
          <article class="schedule-card" ${eventDataAttrs}>
            <header class="schedule-card-header">
              <h3 class="schedule-card-title">${renderRichTextInline(event.label)}</h3>
              ${metaLine ? `<p class="schedule-card-meta">${metaLine}</p>` : ''}
              ${geoMarkup}
            </header>
            ${attendees ? `<div class="event-attendees">${attendees}</div>` : ''}
          </article>`;
  }).join('\n');
}

function renderAttendeeBlock(event: EventEntryViewModel, attendee: EventAttendeeViewModel): string {
  return `
        <div class="event-attendee" data-person-id="${escapeHtml(attendee.personId)}">
          <div class="attendee-header">
            <span class="attendee-name">${escapeHtml(attendee.name)}</span>
          </div>
          <div class="attendance-options">
            ${renderAttendanceOptions(event.id, attendee)}
          </div>
          ${renderMealControl(event.id, attendee, event.requiresMealSelection, event.mealOptions)}
          ${renderDietaryControl(event, attendee)}
        </div>`;
}

function renderAttendanceOptions(eventId: string, attendee: EventAttendeeViewModel): string {
  const baseName = `attendance-${attendee.personId}-${eventId}`;
  const options: Array<{ value: 'yes' | 'no'; label: string; shortLabel: string }> = [
    { value: 'yes', label: 'Accept', shortLabel: 'Yes' },
    { value: 'no', label: 'Decline', shortLabel: 'No' }
  ];

  return options.map(opt => {
    const inputId = `${baseName}-${opt.value}`;
    const checked = attendee.attendanceStatus === opt.value ? ' checked' : '';
    return `
              <div class="attendance-option">
                <input type="radio" id="${escapeHtml(inputId)}" name="${escapeHtml(baseName)}" value="${opt.value}" data-auto-save="true" data-person-id="${escapeHtml(attendee.personId)}" data-event-id="${escapeHtml(eventId)}"${checked}>
                <label class="attendance-pill" for="${escapeHtml(inputId)}" aria-label="${escapeHtml(opt.label)}">
                  <span class="attendance-pill-label-full">${escapeHtml(opt.label)}</span>
                  <span class="attendance-pill-label-short" aria-hidden="true">${escapeHtml(opt.shortLabel)}</span>
                </label>
              </div>`;
  }).join('\n');
}

function renderMealControl(
  eventId: string,
  attendee: EventAttendeeViewModel,
  requiresMealSelection: boolean,
  mealOptions: string[] | undefined
): string {
  if (!requiresMealSelection) return '';

  const containerKey = `${eventId}:${attendee.personId}`;

  if (mealOptions && mealOptions.length > 0) {
    const options = mealOptions.map(option => {
      const slug = option.replace(/[^a-z0-9]+/gi, '-');
      const inputId = `meal-${eventId}-${attendee.personId}-${slug}`;
      const isSelected = attendee.mealChoice === option;
      const checked = isSelected ? ' checked' : '';
      const selectedClass = isSelected ? 'meal-option-pill is-selected' : 'meal-option-pill';

      return `
                <label class="${selectedClass}" for="${escapeHtml(inputId)}">
                  <input type="radio" id="${escapeHtml(inputId)}" name="meal-${escapeHtml(eventId)}-${escapeHtml(attendee.personId)}" value="${escapeHtml(option)}" data-meal-event="${escapeHtml(eventId)}" data-meal-person="${escapeHtml(attendee.personId)}"${checked}>
                  <span>${escapeHtml(option)}</span>
                </label>`;
    }).join('\n');

    return `
            <div class="form-field meal-field" data-meal-container="${escapeHtml(containerKey)}">
              <span class="field-label">Meal preference</span>
              <div class="meal-options" role="group">
                ${options}
              </div>
            </div>`;
  }

  return `
            <div class="form-field meal-field" data-meal-container="${escapeHtml(containerKey)}">
              <label class="field-label" for="meal-${escapeHtml(eventId)}-${escapeHtml(attendee.personId)}">Meal preference</label>
              <input id="meal-${escapeHtml(eventId)}-${escapeHtml(attendee.personId)}" type="text" data-meal-event="${escapeHtml(eventId)}" data-meal-person="${escapeHtml(attendee.personId)}" value="${escapeHtml(attendee.mealChoice || '')}" placeholder="Tell us what you’d like">
            </div>`;
}

function renderDietaryControl(event: EventEntryViewModel, attendee: EventAttendeeViewModel): string {
  if (!event.collectDietaryNotes) {
    return '';
  }

  const note = attendee.dietaryNote?.trim() || '';
  const hasNote = Boolean(note);
  const toggleLabel = hasNote
    ? 'Hide allergies or restrictions'
    : 'Add allergies or restrictions';
  const textareaId = `dietary-${event.id}-${attendee.personId}`;

  return `
            <div
              class="form-field dietary-person-field${hasNote ? ' is-open' : ''}"
              data-dietary-container
              data-event-id="${escapeHtml(event.id)}"
              data-event-label="${escapeHtml(event.label)}"
              data-person-id="${escapeHtml(attendee.personId)}"
              data-person-name="${escapeHtml(attendee.name)}"
            >
              <button
                type="button"
                class="dietary-toggle"
                data-dietary-toggle
                aria-expanded="${hasNote ? 'true' : 'false'}"
                aria-controls="${escapeHtml(textareaId)}"
              >${escapeHtml(toggleLabel)}</button>
              <div class="dietary-field"${hasNote ? '' : ' hidden'}>
                <textarea id="${escapeHtml(textareaId)}" data-dietary-input rows="3" placeholder="Allergies or restrictions">${escapeHtml(note)}</textarea>
              </div>
            </div>`;
}
