import type { PartyMember } from '../types';

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function formatMemberNameWithInitial(member: PartyMember | undefined): string | undefined {
  if (!member) {
    return undefined;
  }

  const first = normalize(member.firstName);
  const lastInitial = normalize(member.lastName)?.charAt(0)?.toUpperCase();
  const lastPart = lastInitial ? `${lastInitial}.` : '';

  if (first && lastPart) {
    return `${first} ${lastPart}`;
  }

  if (first) {
    return first;
  }

  if (lastPart) {
    return lastPart;
  }

  if (member.role === 'companion') {
    return 'Companion';
  }

  if (member.role === 'guest') {
    return 'Guest';
  }

  return undefined;
}

export function formatMemberDisplayName(member: PartyMember): string {
  return formatMemberNameWithInitial(member) ?? 'Guest';
}
