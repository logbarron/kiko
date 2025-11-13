// ABOUTME: Exercises event detail normalization and migrations.
// ABOUTME: Ensures inconsistent inputs are sanitized before storage.

import { describe, it, expect, vi } from 'vitest';

import { normalizeEventDetails } from '../../../src/lib/eventNormalization';

const baseInput = {
  siteTitle: 'Sample Event',
  heroHeadline: 'Sample Hero',
  dateISO: new Date().toISOString(),
  timeZone: 'UTC'
};

describe('normalizeEventDetails meal options', () => {
  it('sanitizes per-event meal options and removes duplicates', () => {
    const { details } = normalizeEventDetails({
      ...baseInput,
      events: [
        {
          id: 'dinner',
          label: 'Welcome Dinner',
          requiresMealSelection: true,
          mealOptions: [' Beef ', 'Fish', 'Beef', '', 'Veg']
        }
      ]
    });

    expect(details.events?.[0].mealOptions).toEqual(['Beef', 'Fish', 'Veg']);
  });

  it('drops venue geo when trimmed value is empty', () => {
    const { details } = normalizeEventDetails({
      ...baseInput,
      events: [
        {
          label: 'Ceremony',
          venue: {
            geo: '   ',
            address: ['123 Beach Ave']
          }
        }
      ]
    });

    expect(details.events?.[0].venue?.geo).toBeUndefined();
    expect(details.events?.[0].venue?.address).toEqual(['123 Beach Ave']);
  });

  it('migrates legacy global meal options to events', () => {
    const { details } = normalizeEventDetails({
      ...baseInput,
      events: [
        {
          id: 'reception',
          label: 'Reception',
          requiresMealSelection: true
        }
      ],
      globalMealOptions: ['Chicken', 'Veg']
    });

    expect(details.events?.[0].mealOptions).toEqual(['Chicken', 'Veg']);
    expect(details.globalMealOptions).toBeUndefined();
    expect(details.schemaVersion).toBe(6);
  });

  it('migrates legacy child policy notes to each event', () => {
    const { details } = normalizeEventDetails({
      ...baseInput,
      events: [
        {
          id: 'welcome',
          label: 'Welcome Drinks'
        },
        {
          id: 'ceremony',
          label: 'Ceremony',
          childPolicy: 'Kids welcome'
        }
      ],
      childPolicy: 'Adults only'
    });

    expect(details.events?.[0].childPolicy).toBe('Adults only');
    expect(details.events?.[1].childPolicy).toBe('Kids welcome');
    expect((details as any).childPolicy).toBeUndefined();
  });
  it('trims siteTitle and heroHeadline values', () => {
    const { details } = normalizeEventDetails({
      siteTitle: '  Refined Event  ',
      heroHeadline: '  Welcome Friends  ',
      dateISO: baseInput.dateISO,
      timeZone: baseInput.timeZone
    });

    expect(details.siteTitle).toBe('Refined Event');
    expect(details.heroHeadline).toBe('Welcome Friends');
  });

  it('migrates legacy title into siteTitle when provided', () => {
    const { details } = normalizeEventDetails({
      title: 'Legacy Only Event',
      dateISO: baseInput.dateISO,
      timeZone: baseInput.timeZone
    });

    expect(details.siteTitle).toBe('Legacy Only Event');
  });

  it('trims email subject copy fields', () => {
    const { details } = normalizeEventDetails({
      ...baseInput,
      magicLinkEmailSubject: '  Magic Subject  ',
      inviteEmailSubject: '  Invitation Subject  '
    });

    expect(details.magicLinkEmailSubject).toBe('Magic Subject');
    expect(details.inviteEmailSubject).toBe('Invitation Subject');
  });

  it('normalizes structured local guide sections', () => {
    const { details } = normalizeEventDetails({
      ...baseInput,
      localGuide: {
        eat: '  Sushi Spot  ',
        drink: '  ',
        see: 'Sunset Cliffs',
        do: 42
      }
    });

    expect(details.localGuide).toEqual({
      eat: 'Sushi Spot',
      see: 'Sunset Cliffs'
    });
  });

  it('drops local guide when all sections are empty after trim', () => {
    const { details } = normalizeEventDetails({
      ...baseInput,
      localGuide: {
        eat: '   ',
        drink: '',
        see: undefined,
        do: null
      }
    });

    expect(details.localGuide).toBeUndefined();
  });

  it('normalizes structured transportation guide sections', () => {
    const { details } = normalizeEventDetails({
      ...baseInput,
      transportationGuide: {
        planes: '  Fly into JFK or LGA  ',
        trains: null,
        automobiles: 'Valet is onsite'
      }
    });

    expect(details.transportationGuide).toEqual({
      planes: 'Fly into JFK or LGA',
      automobiles: 'Valet is onsite'
    });
  });

  it('drops transportation guide when all sections are empty after trim', () => {
    const { details } = normalizeEventDetails({
      ...baseInput,
      transportationGuide: {
        planes: '   ',
        trains: '',
        automobiles: undefined
      }
    });

    expect(details.transportationGuide).toBeUndefined();
  });

  it('generates stable event ids and trims venue details', () => {
    const randomId = 'generated-event-id';
    const randomUuidSpy = typeof crypto.randomUUID === 'function'
      ? vi.spyOn(crypto, 'randomUUID').mockReturnValue(randomId)
      : undefined;

    const { details, didMutate } = normalizeEventDetails({
      ...baseInput,
      events: [
        {
          id: '  welcome-1  ',
          label: '  Welcome Party  ',
          startISO: 'not-a-date',
          endISO: '2023-13-01T00:00:00Z',
          venue: {
            name: '  Harbor House  ',
            geo: '  Palm Beach, FL  ',
            address: [' 123 Bay Rd ', ''],
            mapUrl: 'ftp://invalid'
          }
        },
        {
          label: 'Reception',
          venue: {
            name: 'Dockside',
            geo: ' Jupiter, Florida ',
            address: [' Wharf ']
          }
        }
      ]
    });

    expect(didMutate).toBe(true);
    expect(details.events?.[0]).toMatchObject({
      id: 'welcome-1',
      label: 'Welcome Party',
      startISO: undefined,
      endISO: undefined,
      venue: {
        name: 'Harbor House',
        geo: 'Palm Beach, FL',
        address: ['123 Bay Rd'],
        mapUrl: undefined
      }
    });

    expect(details.events?.[1]).toMatchObject({
      label: 'Reception',
      venue: {
        name: 'Dockside',
        geo: 'Jupiter, Florida',
        address: ['Wharf']
      }
    });

    if (randomUuidSpy) {
      expect(details.events?.[1].id).toBe(randomId);
      randomUuidSpy.mockRestore();
    } else {
      expect(details.events?.[1].id).toMatch(/^reception-\d+$/);
    }
  });

  it('defaults invalid date and time zone to safe values', () => {
    const fixedNow = 1_700_000_000;
    const { details, didMutate } = normalizeEventDetails(
      {
        siteTitle: 'Sample Event',
        dateISO: 'not-a-real-date',
        timeZone: 'Mars/Phobos'
      },
      { now: fixedNow }
    );

    expect(didMutate).toBe(true);
    expect(details.dateISO).toBe(new Date(fixedNow * 1000).toISOString());
    expect(details.timeZone).toBe('UTC');
  });

  it('reports didMutate false when data is already normalized', () => {
    const initial = normalizeEventDetails({
      siteTitle: 'Welcome Event',
      heroHeadline: 'Celebrate Together',
      dateISO: '2024-05-01T00:00:00.000Z',
      timeZone: 'America/New_York',
      events: [
        {
          id: 'reception',
          label: 'Reception',
          startISO: '2024-05-01T21:00:00.000Z',
          endISO: '2024-05-02T01:00:00.000Z',
          requiresMealSelection: false,
          collectDietaryNotes: false,
          venue: {
            name: 'Dockside',
            address: ['123 Main Street'],
            mapUrl: 'https://maps.example.com/dockside'
          }
        }
      ]
    });

    const rerun = normalizeEventDetails(initial.details, {
      updatedAtFromRow: initial.details.updatedAt
    });

    expect(rerun.didMutate).toBe(false);
    expect(rerun.details).toEqual(initial.details);
  });
});
