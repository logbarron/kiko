import { describe, expect, it } from 'vitest';
import type { PartyMember } from '../../../src/types';
import {
  formatMemberDisplayName,
  formatMemberNameWithInitial
} from '../../../src/lib/name-format';

const member = (role: PartyMember['role'], first: string, last: string): PartyMember => ({
  personId: `${role}-${first || 'anon'}`,
  role,
  firstName: first,
  lastName: last,
  invitedEvents: [],
  attendance: {}
});

describe('formatMemberNameWithInitial', () => {
  it('returns first name with last initial when both present', () => {
    expect(formatMemberNameWithInitial(member('primary', 'Logan', 'Barron'))).toBe('Logan B.');
  });

  it('returns first name when last name missing', () => {
    expect(formatMemberNameWithInitial(member('primary', 'Ava', ''))).toBe('Ava');
  });

  it('returns last initial when first name missing', () => {
    expect(formatMemberNameWithInitial(member('primary', '', 'Nguyen'))).toBe('N.');
  });

  it('falls back to Companion when no names provided for companion', () => {
    expect(formatMemberNameWithInitial(member('companion', ' ', ' '))).toBe('Companion');
  });

  it('falls back to Guest when no names provided for guest', () => {
    expect(formatMemberNameWithInitial(member('guest', '', ''))).toBe('Guest');
  });

  it('returns undefined when primary has no names', () => {
    expect(formatMemberNameWithInitial(member('primary', '', ''))).toBeUndefined();
  });

  it('preserves accented characters and emoji', () => {
    expect(formatMemberNameWithInitial(member('primary', 'Łukasz', 'Żółć'))).toBe('Łukasz Ż.');
    expect(formatMemberNameWithInitial(member('primary', '😊', 'Smith'))).toBe('😊 S.');
  });
});

describe('formatMemberDisplayName', () => {
  it('falls back to Guest when name data missing for primary', () => {
    expect(formatMemberDisplayName(member('primary', '', ''))).toBe('Guest');
  });

  it('keeps companion fallback when name data missing', () => {
    expect(formatMemberDisplayName(member('companion', ' ', ' '))).toBe('Companion');
  });
});
