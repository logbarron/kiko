import { describe, expect, it } from 'vitest';
import type { PartyMember } from '../../../src/types';
import { buildInviteGreeting } from '../../../src/lib/gmail';

const member = (role: PartyMember['role'], first: string, last: string): PartyMember => ({
  personId: `${role}-${first || 'anon'}`,
  role,
  firstName: first,
  lastName: last,
  invitedEvents: [],
  attendance: {}
});

describe('buildInviteGreeting', () => {
  it('formats a solo primary as "FirstName LastInitial."', () => {
    const party = [member('primary', 'Carl', 'Gallagher')];
    expect(buildInviteGreeting(party)).toBe('Carl G.');
  });

  it('includes a named companion with ampersand', () => {
    const party = [
      member('primary', 'Carl', 'Gallagher'),
      member('companion', 'Dana', 'Lopez')
    ];
    expect(buildInviteGreeting(party)).toBe('Carl G. & Dana L.');
  });

  it('falls back to Guest when only a plus-one slot exists', () => {
    const party = [
      member('primary', 'Carl', 'Gallagher'),
      member('guest', '', '')
    ];
    expect(buildInviteGreeting(party)).toBe('Carl G. & Guest');
  });

  it('defaults to Guest when party data is empty', () => {
    expect(buildInviteGreeting([])).toBe('Guest');
  });

  it('trims whitespace and handles hyphenated last names', () => {
    const party = [member('primary', '  Ana  ', '  Smith-Jones  ')];
    expect(buildInviteGreeting(party)).toBe('Ana S.');
  });

  it('falls back to last initial when first name missing', () => {
    const party = [member('primary', '', "O'Neill")];
    expect(buildInviteGreeting(party)).toBe('O.');
  });

  it('includes companion fallback when names missing', () => {
    const party = [
      member('primary', 'Carl', 'Gallagher'),
      member('companion', ' ', ' ')
    ];
    expect(buildInviteGreeting(party)).toBe('Carl G. & Companion');
  });

  it('ignores additional companions beyond the first', () => {
    const party = [
      member('primary', 'Carl', 'Gallagher'),
      member('companion', 'Dana', 'Lopez'),
      member('companion', 'Evan', 'Stone')
    ];
    expect(buildInviteGreeting(party)).toBe('Carl G. & Dana L.');
  });

  it('supports guest fallback when no primary present', () => {
    const party = [
      member('companion', 'Dana', 'Lopez'),
      member('guest', '', '')
    ];
    expect(buildInviteGreeting(party)).toBe('Guest & Dana L.');
  });

  it('handles unicode characters in names', () => {
    const party = [
      member('primary', 'Óscar', 'Nuñez'),
      member('companion', 'Zoë', 'Šimůnek')
    ];
    expect(buildInviteGreeting(party)).toBe('Óscar N. & Zoë Š.');
  });
});
