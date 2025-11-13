import type {
  CeremonyGuideSections,
  EventDetails,
  LocalGuideSections,
  TransportationSections
} from '../types';

type EventItem = NonNullable<EventDetails['events']>[number];
type RegistryEntry = NonNullable<EventDetails['registry']>[number];
type Accommodation = NonNullable<EventDetails['accommodations']>[number];

type NormalizeEventDetailsOptions = {
  updatedAtFromRow?: number;
  now?: number;
};

export type NormalizeEventDetailsResult = {
  details: EventDetails;
  didMutate: boolean;
};

const DEFAULT_TIME_ZONE = 'UTC';

export function isValidISODate(value: string | undefined | null): boolean {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

export function isValidTimeZone(tz: string | undefined | null): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isHttpUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeRegistryEntry(entry: unknown): RegistryEntry | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const label = typeof record.label === 'string' ? record.label.trim() : '';
  const url = typeof record.url === 'string' ? record.url.trim() : '';
  if (!label || !isHttpUrl(url)) {
    return null;
  }

  const description = typeof record.description === 'string' ? record.description.trim() : undefined;

  return {
    label,
    url,
    description
  };
}

function ensureEventId(label: string, index: number, existingId?: string): string {
  const trimmed = existingId?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'event';
  return `${base}-${index + 1}`;
}

function normalizeEvents(rawEvents: unknown[] | undefined, now: number): { events: EventItem[]; mutated: boolean } {
  if (!Array.isArray(rawEvents)) {
    return { events: [], mutated: Boolean(rawEvents) };
  }

  const events: EventItem[] = [];
  let mutated = false;

  rawEvents.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') {
      mutated = true;
      return;
    }

    const source = candidate as Record<string, unknown>;
    const label = typeof source.label === 'string' ? source.label.trim() : '';
    if (!label) {
      mutated = true;
      return;
    }

    const id = ensureEventId(label, index, typeof source.id === 'string' ? source.id : undefined);
    if (source.id !== id) {
      mutated = true;
    }

    const startISO = typeof source.startISO === 'string' && isValidISODate(source.startISO)
      ? source.startISO
      : undefined;
    if (source.startISO && source.startISO !== startISO) {
      mutated = true;
    }

    const endISO = typeof source.endISO === 'string' && isValidISODate(source.endISO)
      ? source.endISO
      : undefined;
    if (source.endISO && source.endISO !== endISO) {
      mutated = true;
    }

    const capacity = typeof source.capacity === 'number' && Number.isFinite(source.capacity) && source.capacity >= 0
      ? source.capacity
      : undefined;
    if (typeof source.capacity !== 'undefined' && source.capacity !== capacity) {
      mutated = true;
    }

    const venueSource = source.venue && typeof source.venue === 'object'
      ? (source.venue as Record<string, unknown>)
      : undefined;

    const venue = venueSource
      ? {
          name: typeof venueSource.name === 'string' ? venueSource.name.trim() || undefined : undefined,
          address: Array.isArray(venueSource.address)
            ? venueSource.address.map((line) => line?.toString().trim()).filter(Boolean)
            : [],
          geo: typeof venueSource.geo === 'string' ? venueSource.geo.trim() || undefined : undefined,
          mapUrl: typeof venueSource.mapUrl === 'string' && isHttpUrl(venueSource.mapUrl)
            ? venueSource.mapUrl.trim()
            : undefined
        }
      : undefined;

    if (venueSource) {
      const venueName = typeof venueSource.name === 'string' ? venueSource.name.trim() : undefined;
      if (venueName !== venue?.name) {
        mutated = true;
      }
      const rawAddress = Array.isArray(venueSource.address) ? venueSource.address : undefined;
      if (rawAddress && rawAddress.length !== (venue?.address.length ?? 0)) {
        mutated = true;
      }
      const rawGeo = typeof venueSource.geo === 'string' ? venueSource.geo.trim() || undefined : undefined;
      if (rawGeo !== venue?.geo) {
        mutated = true;
      }
      const rawMapUrl = typeof venueSource.mapUrl === 'string' ? venueSource.mapUrl.trim() : undefined;
      if (rawMapUrl !== venue?.mapUrl) {
        mutated = true;
      }
    }

    const dressCode = typeof source.dressCode === 'string' ? source.dressCode.trim() || undefined : undefined;
    if (source.dressCode !== undefined && source.dressCode !== dressCode) {
      mutated = true;
    }

    const photoPolicy = typeof source.photoPolicy === 'string' ? source.photoPolicy.trim() || undefined : undefined;
    if (source.photoPolicy !== undefined && source.photoPolicy !== photoPolicy) {
      mutated = true;
    }

    const accessibility = typeof source.accessibility === 'string' ? source.accessibility.trim() || undefined : undefined;
    if (source.accessibility !== undefined && source.accessibility !== accessibility) {
      mutated = true;
    }

    const transportation = typeof source.transportation === 'string' ? source.transportation.trim() || undefined : undefined;
    if (source.transportation !== undefined && source.transportation !== transportation) {
      mutated = true;
    }

    const foodNotes = typeof source.foodNotes === 'string' ? source.foodNotes.trim() || undefined : undefined;
    if (source.foodNotes !== undefined && source.foodNotes !== foodNotes) {
      mutated = true;
    }

    const requiresMealSelection = Boolean(source.requiresMealSelection);
    if (source.requiresMealSelection !== requiresMealSelection) {
      mutated = true;
    }

    const collectDietaryNotes = Boolean(source.collectDietaryNotes);
    if (source.collectDietaryNotes !== collectDietaryNotes) {
      mutated = true;
    }

    const { options: normalizedMealOptions, mutated: mealOptionsMutated } = normalizeMealOptions(
      source.mealOptions
    );
    if (mealOptionsMutated) {
      mutated = true;
    }
    const mealOptions = normalizedMealOptions.length > 0 ? normalizedMealOptions : undefined;

    const childPolicy = typeof source.childPolicy === 'string' ? source.childPolicy.trim() || undefined : undefined;
    if (source.childPolicy !== undefined && source.childPolicy !== childPolicy) {
      mutated = true;
    }

    const additionalNotes = typeof source.additionalNotes === 'string' ? source.additionalNotes.trim() || undefined : undefined;
    if (source.additionalNotes !== undefined && source.additionalNotes !== additionalNotes) {
      mutated = true;
    }

    events.push({
      id,
      label,
      startISO,
      endISO,
      capacity,
      venue,
      dressCode,
      photoPolicy,
      accessibility,
      transportation,
      foodNotes,
      requiresMealSelection,
      collectDietaryNotes,
      mealOptions,
      childPolicy,
      additionalNotes
    });
  });

  return { events, mutated };
}

function normalizeAccommodations(raw: unknown[] | undefined): { accommodations: Accommodation[]; mutated: boolean } {
  if (!Array.isArray(raw)) {
    return { accommodations: [], mutated: Boolean(raw) };
  }

  const accommodations: Accommodation[] = [];
  let mutated = false;

  raw.forEach((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      mutated = true;
      return;
    }

    const record = candidate as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const address = typeof record.address === 'string' ? record.address.trim() : '';

    if (!name || !address) {
      mutated = true;
      return;
    }

    const discountCode = typeof record.discountCode === 'string' ? record.discountCode.trim() || undefined : undefined;
    if (record.discountCode !== undefined && record.discountCode !== discountCode) {
      mutated = true;
    }

    const notes = typeof record.notes === 'string' ? record.notes.trim() || undefined : undefined;
    if (record.notes !== undefined && record.notes !== notes) {
      mutated = true;
    }

    accommodations.push({ name, address, discountCode, notes });
  });

  return { accommodations, mutated };
}

function normalizeRegistry(raw: unknown[] | undefined): { registry: RegistryEntry[]; mutated: boolean } {
  if (!Array.isArray(raw)) {
    return { registry: [], mutated: Boolean(raw) };
  }

  const registry: RegistryEntry[] = [];
  let mutated = false;

  raw.forEach((entry) => {
    const sanitized = sanitizeRegistryEntry(entry);
    if (!sanitized) {
      mutated = true;
      return;
    }
    registry.push(sanitized);
  });

  if (registry.length !== raw.length) {
    mutated = true;
  }

  return { registry, mutated };
}

function normalizeMealOptions(raw: unknown): { options: string[]; mutated: boolean } {
  if (!Array.isArray(raw)) {
    return { options: [], mutated: Boolean(raw) };
  }

  let mutated = false;
  const trimmed = raw.map((item) => {
    if (typeof item !== 'string') {
      mutated = true;
      return '';
    }
    const normalized = item.trim();
    if (normalized !== item) {
      mutated = true;
    }
    return normalized;
  }).filter(Boolean);

  const options: string[] = [];
  trimmed.forEach((value) => {
    if (!options.includes(value)) {
      options.push(value);
    } else {
      mutated = true;
    }
  });

  if (options.length !== trimmed.length) {
    mutated = true;
  }

  return { options, mutated };
}

function normalizeLocalGuideSections(input: unknown): LocalGuideSections | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const candidate = input as Record<string, unknown>;
  const eat = typeof candidate.eat === 'string' ? candidate.eat.trim() : '';
  const drink = typeof candidate.drink === 'string' ? candidate.drink.trim() : '';
  const see = typeof candidate.see === 'string' ? candidate.see.trim() : '';
  const doItem = typeof candidate.do === 'string' ? candidate.do.trim() : '';

  const result: LocalGuideSections = {};
  if (eat) result.eat = eat;
  if (drink) result.drink = drink;
  if (see) result.see = see;
  if (doItem) result.do = doItem;

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeTransportationGuideSections(input: unknown): TransportationSections | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const candidate = input as Record<string, unknown>;
  const planes = typeof candidate.planes === 'string' ? candidate.planes.trim() : '';
  const trains = typeof candidate.trains === 'string' ? candidate.trains.trim() : '';
  const automobiles = typeof candidate.automobiles === 'string' ? candidate.automobiles.trim() : '';

  const result: TransportationSections = {};
  if (planes) result.planes = planes;
  if (trains) result.trains = trains;
  if (automobiles) result.automobiles = automobiles;

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeCeremonyGuideSections(input: unknown): CeremonyGuideSections | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const candidate = input as Record<string, unknown>;
  const summary = typeof candidate.summary === 'string' ? candidate.summary.trim() : '';
  const quickGuide = typeof candidate.quickGuide === 'string' ? candidate.quickGuide.trim() : '';
  const stepByStep = typeof candidate.stepByStep === 'string' ? candidate.stepByStep.trim() : '';
  const rolesObjects = typeof candidate.rolesObjects === 'string' ? candidate.rolesObjects.trim() : '';
  const history = typeof candidate.history === 'string' ? candidate.history.trim() : '';
  const etiquetteFaq = typeof candidate.etiquetteFaq === 'string' ? candidate.etiquetteFaq.trim() : '';

  const result: CeremonyGuideSections = {};
  if (summary) result.summary = summary;
  if (quickGuide) result.quickGuide = quickGuide;
  if (stepByStep) result.stepByStep = stepByStep;
  if (rolesObjects) result.rolesObjects = rolesObjects;
  if (history) result.history = history;
  if (etiquetteFaq) result.etiquetteFaq = etiquetteFaq;

  return Object.keys(result).length > 0 ? result : undefined;
}

export function normalizeEventDetails(
  input: unknown,
  options: NormalizeEventDetailsOptions = {}
): NormalizeEventDetailsResult {
  const { updatedAtFromRow, now: nowOverride } = options;
  const now = nowOverride ?? Math.floor(Date.now() / 1000);
  const source = (input && typeof input === 'object') ? (input as Record<string, unknown>) : {};

  let didMutate = false;

  const legacyTitle = typeof source.title === 'string' ? source.title.trim() : undefined;

  const rawSiteTitle = typeof source.siteTitle === 'string' ? source.siteTitle : undefined;
  let siteTitle = rawSiteTitle ? rawSiteTitle.trim() : '';
  if (rawSiteTitle !== siteTitle) {
    didMutate = true;
  }
  if (!siteTitle && legacyTitle) {
    siteTitle = legacyTitle;
    didMutate = true;
  }
  if (typeof source.title !== 'undefined') {
    didMutate = true;
  }

  const rawHeroHeadline = typeof source.heroHeadline === 'string' ? source.heroHeadline : undefined;
  const heroHeadlineTrimmed = rawHeroHeadline ? rawHeroHeadline.trim() : undefined;
  const heroHeadline = heroHeadlineTrimmed || undefined;
  if (source.heroHeadline !== heroHeadline) {
    didMutate = true;
  }

  const rawMagicLinkSubject = typeof source.magicLinkEmailSubject === 'string'
    ? source.magicLinkEmailSubject
    : undefined;
  const magicLinkEmailSubject = rawMagicLinkSubject ? rawMagicLinkSubject.trim() : undefined;
  if (source.magicLinkEmailSubject !== magicLinkEmailSubject) {
    didMutate = true;
  }

  const rawInviteSubject = typeof source.inviteEmailSubject === 'string'
    ? source.inviteEmailSubject
    : undefined;
  const inviteEmailSubject = rawInviteSubject ? rawInviteSubject.trim() : undefined;
  if (source.inviteEmailSubject !== inviteEmailSubject) {
    didMutate = true;
  }

  const rawDateISO = typeof source.dateISO === 'string' ? source.dateISO : undefined;
  const dateISO = rawDateISO && isValidISODate(rawDateISO) ? rawDateISO : new Date(now * 1000).toISOString();
  if (rawDateISO !== dateISO) {
    didMutate = true;
  }

  const rawTimeZone = typeof source.timeZone === 'string' ? source.timeZone.trim() : undefined;
  const timeZone = rawTimeZone && isValidTimeZone(rawTimeZone) ? rawTimeZone : DEFAULT_TIME_ZONE;
  if (rawTimeZone !== timeZone) {
    didMutate = true;
  }

  const localGuide = normalizeLocalGuideSections(source.localGuide);
  if (source.localGuide !== localGuide) {
    didMutate = true;
  }

  const transportationGuide = normalizeTransportationGuideSections(source.transportationGuide);
  if (source.transportationGuide !== transportationGuide) {
    didMutate = true;
  }

  const ceremonyGuide = normalizeCeremonyGuideSections(source.ceremonyGuide);
  if (source.ceremonyGuide !== ceremonyGuide) {
    didMutate = true;
  }

  const rawDeadline = typeof source.rsvpDeadlineISO === 'string' ? source.rsvpDeadlineISO : undefined;
  const rsvpDeadlineISO = rawDeadline && isValidISODate(rawDeadline) ? rawDeadline : undefined;
  if (rawDeadline !== rsvpDeadlineISO) {
    didMutate = true;
  }

  const rawStatus = (source.rsvpStatus && typeof source.rsvpStatus === 'object')
    ? (source.rsvpStatus as Record<string, unknown>)
    : undefined;

  let rsvpStatusMode: 'open' | 'closed' = 'open';
  let rsvpStatusMessage: string | undefined;

  if (rawStatus) {
    const modeCandidate = typeof rawStatus.mode === 'string' ? rawStatus.mode.trim().toLowerCase() : '';
    if (modeCandidate === 'closed') {
      rsvpStatusMode = 'closed';
    } else if (modeCandidate === 'open') {
      rsvpStatusMode = 'open';
    } else {
      didMutate = true;
    }

    const messageCandidate = typeof rawStatus.message === 'string' ? rawStatus.message.trim() : undefined;
    rsvpStatusMessage = messageCandidate || undefined;

    if (rawStatus.mode !== rsvpStatusMode || rawStatus.message !== rsvpStatusMessage) {
      didMutate = true;
    }
  } else if (typeof source.rsvpStatus !== 'undefined') {
    didMutate = true;
  }

  const rsvpStatus = rsvpStatusMessage
    ? { mode: rsvpStatusMode, message: rsvpStatusMessage }
    : { mode: rsvpStatusMode };

  const { events, mutated: eventsMutated } = normalizeEvents(source.events as unknown[] | undefined, now);
  if (eventsMutated) {
    didMutate = true;
  }

  const { accommodations, mutated: accommodationsMutated } = normalizeAccommodations(source.accommodations as unknown[] | undefined);
  if (accommodationsMutated) {
    didMutate = true;
  }

  const { registry, mutated: registryMutated } = normalizeRegistry(source.registry as unknown[] | undefined);
  if (registryMutated) {
    didMutate = true;
  }

  const legacyMealOptionsResult = normalizeMealOptions(source.globalMealOptions);
  const legacyChildPolicy = typeof source.childPolicy === 'string' ? source.childPolicy.trim() : undefined;
  if (typeof source.childPolicy !== 'undefined') {
    didMutate = true;
  }

  const legacyMealOptions = legacyMealOptionsResult.options;
  if (legacyMealOptionsResult.mutated || typeof source.globalMealOptions !== 'undefined') {
    didMutate = true;
  }
  if (legacyMealOptions.length > 0) {
    let appliedLegacyOptions = false;
    for (const event of events) {
      if (event.requiresMealSelection && (!event.mealOptions || event.mealOptions.length === 0)) {
        event.mealOptions = [...legacyMealOptions];
        appliedLegacyOptions = true;
      }
    }
    if (appliedLegacyOptions) {
      didMutate = true;
    }
  }

  if (legacyChildPolicy) {
    let appliedChildPolicy = false;
    for (const event of events) {
      if (!event.childPolicy) {
        event.childPolicy = legacyChildPolicy;
        appliedChildPolicy = true;
      }
    }
    if (!events.length) {
      didMutate = true;
    }
    if (appliedChildPolicy) {
      didMutate = true;
    }
  }

  const updatedAt = typeof updatedAtFromRow === 'number' ? updatedAtFromRow : now;

  const details: EventDetails = {
    schemaVersion: 6,
    siteTitle,
    heroHeadline,
    magicLinkEmailSubject,
    inviteEmailSubject,
    dateISO,
    timeZone,
    rsvpDeadlineISO,
    rsvpStatus,
    events,
    accommodations,
    registry,
    localGuide,
    transportationGuide,
    ceremonyGuide,
    updatedAt
  };

  return { details, didMutate };
}
