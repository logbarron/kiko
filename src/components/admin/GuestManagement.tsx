import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../../lib/utils';
import type { AttendanceRecord } from '../../types';
import { toast } from 'sonner';
import { adminFetch, isAdminAuthError } from './admin-auth';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '../ui/card';
import { Badge } from '../ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../ui/accordion';
import { Collapsible, CollapsibleContent } from '../ui/collapsible';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Skeleton } from '../ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import type { LucideIcon } from 'lucide-react';
import {
  Trash2,
  Mail,
  MousePointerClick,
  KeyRound,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  BarChart3,
  UserPlus,
  Users,
  ArrowUpRight,
  FileText
} from 'lucide-react';

export interface EventDefinition {
  id: string;
  label: string;
  timeText?: string;
  startISO?: string;
  capacity?: number;
  collectDietaryNotes?: boolean;
  requiresMealSelection?: boolean;
  mealOptions?: string[];
}

export interface InviteFormState {
  primaryGuest: {
    firstName: string;
    lastName: string;
    email: string;
  };
  companion: {
    firstName: string;
    lastName: string;
  };
  allowPlusOne: boolean;
  eventVisibility: Record<string, boolean>;
}

type InviteSubmitMode = 'email' | 'seed';

interface ActivitySummary {
  count: number;
  last: number | null;
}

interface GuestActivity {
  audit: Record<string, ActivitySummary>;
  magicLinks: {
    issuedCount: number;
    lastIssued: number | null;
    usedCount: number;
    lastUsed: number | null;
  };
}

interface AuditEvent {
  id: number;
  guest_id?: number | null;
  type: string;
  created_at: number;
}

export interface PartyMemberState {
  personId: string;
  role: 'primary' | 'companion' | 'guest';
  firstName: string;
  lastName: string;
  invitedEvents: string[];
  attendance: Record<string, AttendanceRecord>;
  mealSelections?: Record<string, string>;
  dietaryNotes?: Record<string, string>;
}

export interface Guest {
  id: number;
  email: string;
  party: PartyMemberState[];
  invitedEvents: string[];
  phone?: string;
  dietary?: string;
  notes?: string;
  vip?: boolean;
  inviteToken?: string;
  inviteSentAt?: number;
  inviteClickedAt?: number;
  registeredAt?: number;
  createdAt?: number;
  rsvpUpdatedAt?: number;
  rsvp?: {
    partyResponses?: Record<string, {
      events: Record<string, AttendanceRecord>;
      mealSelections?: Record<string, string>;
      dietaryNotes?: Record<string, string>;
    }>;
    dietary?: string;
    notes?: string;
    submittedAt?: string;
  };
  activity: GuestActivity;
}

interface GuestManagementProps {
  guests: Guest[];
  isLoading: boolean;
  events: EventDefinition[];
  eventTimeZone?: string;
  emailInviteForm: InviteFormState;
  setEmailInviteForm: React.Dispatch<React.SetStateAction<InviteFormState>>;
  resetEmailInviteForm: () => void;
  seedInviteForm: InviteFormState;
  setSeedInviteForm: React.Dispatch<React.SetStateAction<InviteFormState>>;
  resetSeedInviteForm: () => void;
  sendInvite: (form: InviteFormState, options?: { mode?: InviteSubmitMode }) => Promise<boolean>;
  inviteRequestMode: InviteSubmitMode | null;
  resendInvite: (guestId: number) => void;
  deleteGuest: (guest: Guest) => void;
  updateEventVisibility: (guestId: number, visibility: Record<string, boolean>) => void;
  updateAllowPlusOne: (guestId: number, allowPlusOne: boolean) => Promise<void>;
  updateEventAttendance: (
    guestId: number,
    eventId: string,
    personId: string | undefined,
    status: 'yes' | 'no' | 'pending'
  ) => Promise<void>;
  updateMealSelection: (
    guestId: number,
    eventId: string,
    personId: string,
    mealKey: string | null
  ) => Promise<void>;
  eventDetailsLoaded: boolean;
  emailSubjects: {
    magicLinkSubject: string;
    inviteSubject: string;
  };
  onEmailSubjectsChange: (next: { magicLinkSubject: string; inviteSubject: string }) => void;
  saveEmailSubjects: () => Promise<void>;
}
const auditLabels: Record<string, string> = {
  invite_sent: 'Invite sent',
  invite_seeded: 'Guest seeded (no email)',
  invite_clicked: 'Invite clicked',
  email_sent: 'Magic link requested',
  link_clicked: 'Magic link opened',
  verify_ok: 'Verification success',
  verify_fail: 'Verification failed',
  rsvp_submit: 'RSVP submitted',
  event_visibility_updated: 'Event visibility updated',
  event_attendance_updated: 'Event attendance updated',
  guest_deleted: 'Guest deleted',
  event_updated: 'Event updated'
};

const getAttendanceStatus = (record: AttendanceRecord | undefined): 'yes' | 'no' | 'pending' => {
  return record?.status ?? 'pending';
};

const describeAttendanceSource = (record: AttendanceRecord | undefined): string => {
  if (!record) {
    return 'system';
  }
  if (record.source === 'guest') {
    return 'guest';
  }
  if (record.source === 'admin') {
    return 'admin';
  }
  return 'system';
};

const relativeTimeFromSeconds = (seconds?: number | null): string | null => {
  if (!seconds || Number.isNaN(seconds)) {
    return null;
  }
  try {
    return formatDistanceToNow(new Date(seconds * 1000), { addSuffix: true });
  } catch (error) {
    console.error('Error formatting relative time', error);
    return null;
  }
};

const relativeTimeFromIso = (iso?: string): string | null => {
  if (!iso) {
    return null;
  }
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch (error) {
    console.error('Error formatting ISO time', error);
    return null;
  }
};

const getActivitySummary = (guest: Guest, type: string): ActivitySummary | undefined => {
  return guest.activity?.audit?.[type];
};

const formatSummary = (summary?: ActivitySummary): string => {
  if (!summary || summary.count === 0) {
    return '—';
  }
  const relative = summary.last ? relativeTimeFromSeconds(summary.last) : null;
  return relative ? `${summary.count} • ${relative}` : `${summary.count}`;
};

const formatAuditType = (type: string): string => {
  return auditLabels[type] ?? type.replace(/_/g, ' ');
};

const deriveInviteStatus = (guest: Guest): 'yes' | 'no' | 'pending' => {
  const statuses: Array<'yes' | 'no' | 'pending'> = [];
  guest.party.forEach(member => {
    Object.keys(member.attendance || {}).forEach(eventId => {
      const value = getAttendanceStatus(member.attendance?.[eventId]);
      statuses.push(value);
    });
  });
  if (statuses.some(status => status === 'yes')) {
    return 'yes';
  }
  if (statuses.length > 0 && statuses.every(status => status === 'no')) {
    return 'no';
  }
  return 'pending';
};

const getEventStatusForGuest = (guest: Guest, eventId: string): 'yes' | 'no' | 'pending' | null => {
  const statuses: Array<'yes' | 'no' | 'pending'> = [];
  guest.party.forEach(member => {
    if (member.invitedEvents.includes(eventId)) {
      statuses.push(getAttendanceStatus(member.attendance?.[eventId]));
    }
  });
  if (statuses.length === 0) {
    return null;
  }
  if (statuses.some(status => status === 'yes')) {
    return 'yes';
  }
  if (statuses.every(status => status === 'no')) {
    return 'no';
  }
  return 'pending';
};

const hasGuestPlaceholder = (guest: Guest): boolean => {
  return guest.party.some(member => member.role === 'guest');
};

const formatMemberDisplayName = (member: PartyMemberState): string => {
  const parts = [member.firstName.trim(), member.lastName.trim()].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(' ');
  }
  if (member.role === 'companion') {
    return 'Companion';
  }
  if (member.role === 'guest') {
    return 'Guest';
  }
  return 'Guest';
};

const getMemberRoleLabel = (member: PartyMemberState): string => {
  if (member.role === 'primary') {
    return 'Primary';
  }
  if (member.role === 'companion') {
    return 'Companion';
  }
  return 'Guest';
};

type MemberRosterStatus = 'attending' | 'pending' | 'declined';

type RosterStatus =
  | { type: MemberRosterStatus }
  | { type: 'invited' }
  | { type: 'dietary' }
  | { type: 'meal-summary' }
  | { type: 'meal-pending' }
  | { type: 'meal'; mealKey: string };

const memberRosterStatusLabels: Record<MemberRosterStatus, string> = {
  attending: 'Attending',
  pending: 'Pending',
  declined: 'Declined'
};

const rosterStatusesEqual = (a: RosterStatus | null, b: RosterStatus | null): boolean => {
  if (!a || !b) {
    return false;
  }
  if (a.type !== b.type) {
    return false;
  }
  if (a.type === 'meal' && b.type === 'meal') {
    return a.mealKey === b.mealKey;
  }
  return true;
};

const isMealFamilyStatus = (status: RosterStatus | null): boolean => {
  return Boolean(status && (status.type === 'meal' || status.type === 'meal-summary' || status.type === 'meal-pending'));
};

const rosterStatusFromAttendance = (status: 'yes' | 'no' | 'pending'): MemberRosterStatus => {
  if (status === 'yes') {
    return 'attending';
  }
  if (status === 'no') {
    return 'declined';
  }
  return 'pending';
};

const normalizeMealValue = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const createMealKey = (label: string): string =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const buildMealOptionLookup = (options: string[] | undefined): Map<string, string> => {
  const lookup = new Map<string, string>();
  if (!Array.isArray(options)) {
    return lookup;
  }
  options.forEach(option => {
    const normalized = normalizeMealValue(option);
    if (!normalized) {
      return;
    }
    lookup.set(createMealKey(normalized), option);
  });
  return lookup;
};

type MealSelectionMap = Record<string, string | null>;

const buildInitialMealMap = (guest: Guest): MealSelectionMap => {
  const map: MealSelectionMap = {};
  guest.party.forEach((member) => {
    Object.entries(member.mealSelections ?? {}).forEach(([eventId, value]) => {
      const normalized = normalizeMealValue(value);
      map[`${eventId}:${member.personId}`] = normalized ? createMealKey(normalized) : null;
    });
  });
  return map;
};

const sortPartyMembersByRole = (party: PartyMemberState[]): PartyMemberState[] => {
  const priority: Record<PartyMemberState['role'], number> = {
    primary: 0,
    companion: 1,
    guest: 2
  };
  return [...party].sort((a, b) => priority[a.role] - priority[b.role]);
};

const normalizeNamePart = (value?: string | null): string => value?.trim().toLocaleLowerCase() ?? '';

const buildPartySortKey = (
  primary: PartyMemberState | null | undefined,
  summaryFallback: string | undefined,
  emailFallback: string,
  idFallback: number
): string => {
  const last = normalizeNamePart(primary?.lastName);
  const first = normalizeNamePart(primary?.firstName);
  const summary = summaryFallback?.trim().toLocaleLowerCase() ?? '';
  const email = emailFallback.trim().toLocaleLowerCase();
  const id = String(idFallback);

  const base = last || first || summary || email;
  const secondary = last ? first : summary || email;

  return [base, secondary, email, id].filter(Boolean).join('|');
};

interface MealMetrics {
  eligible: number;
  selected: number;
  pending: number;
  totals: Record<string, number>;
  labels: Record<string, string>;
}

interface RosterEntry {
  eventId: string;
  guestId: number;
  personId: string;
  member: PartyMemberState;
  displayName: string;
  status: MemberRosterStatus;
  guestSummary: string;
  primaryName: string | null;
  partySortKey: string;
  dietaryNote?: string;
  mealChoice?: string;
  mealKey?: string;
}

const sortRosterEntries = (entries: RosterEntry[]): RosterEntry[] => {
  const roleWeight: Record<PartyMemberState['role'], number> = {
    primary: 0,
    companion: 1,
    guest: 2
  };
  return [...entries].sort((a, b) => {
    const partyDiff = a.partySortKey.localeCompare(b.partySortKey);
    if (partyDiff !== 0) {
      return partyDiff;
    }

    const roleDiff = roleWeight[a.member.role] - roleWeight[b.member.role];
    if (roleDiff !== 0) {
      return roleDiff;
    }

    return a.displayName.localeCompare(b.displayName);
  });
};

const getPartySummary = (guest: Guest): string => {
  const names = guest.party.map(formatMemberDisplayName).filter(Boolean);
  if (names.length === 0) {
    return 'Guest';
  }
  if (names.length === 1) {
    return names[0];
  }
  if (names.length === 2) {
    return `${names[0]} & ${names[1]}`;
  }
  return names.join(', ');
};

interface GuestAttendanceGridProps {
  events: EventDefinition[];
  eventVisibility: Record<string, boolean>;
  onToggleVisibility: (eventId: string, enabled: boolean) => void;
  guest: Guest;
  updatingAttendanceKey: string | null;
  onAttendanceChange: (eventId: string, personId: string, status: 'yes' | 'no' | 'pending') => void;
  allowPlusOne: boolean;
  isTogglingPlusOne: boolean;
  onTogglePlusOne: () => Promise<void>;
}

const GuestAttendanceGrid = ({
  events,
  eventVisibility,
  onToggleVisibility,
  guest,
  updatingAttendanceKey,
  onAttendanceChange,
  allowPlusOne,
  isTogglingPlusOne,
  onTogglePlusOne
}: GuestAttendanceGridProps) => {
  const members = useMemo(() => sortPartyMembersByRole(guest.party), [guest.party]);

  const hasNamedCompanion = useMemo(() => {
    return guest.party.some(member =>
      member.role === 'companion' && (member.firstName.trim() || member.lastName.trim())
    );
  }, [guest.party]);

  if (events.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Event Attendance</h4>
        </div>
        <p className="text-sm text-muted-foreground">Add events to the schedule to manage attendance.</p>
      </div>
    );
  }

  const renderAttendanceButtons = (
    event: EventDefinition,
    member: PartyMemberState,
    enabled: boolean
  ) => {
    const eventId = event.id;
    const isInvited = member.invitedEvents.includes(eventId);
    const statusRecord = member.attendance?.[eventId];
    const status: 'yes' | 'no' | 'pending' = getAttendanceStatus(statusRecord);
    const updatedRelative = statusRecord?.updatedAt ? relativeTimeFromSeconds(statusRecord.updatedAt) : null;
    const updatedSource = describeAttendanceSource(statusRecord);
    const attendanceKey = `${eventId}:${member.personId}`;
    const isUpdating = updatingAttendanceKey === attendanceKey;
    const canInteract = enabled && isInvited;

    const setStatus = (desired: 'yes' | 'no') => {
      const nextStatus: 'yes' | 'no' | 'pending' = status === desired ? 'pending' : desired;
      void onAttendanceChange(eventId, member.personId, nextStatus);
    };

    const baseClasses = 'h-7 rounded-full px-3 text-xs';

    return (
      <div className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={status === 'yes' ? 'default' : 'outline'}
            className={cn(baseClasses, !canInteract && 'opacity-40')}
            aria-pressed={status === 'yes'}
            disabled={!canInteract || isUpdating}
            onClick={() => setStatus('yes')}
          >
            {isUpdating && canInteract && status === 'yes' ? 'Saving...' : 'Attending'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={status === 'no' ? 'default' : 'outline'}
            className={cn(baseClasses, !canInteract && 'opacity-40')}
            aria-pressed={status === 'no'}
            disabled={!canInteract || isUpdating}
            onClick={() => setStatus('no')}
          >
            {isUpdating && canInteract && status === 'no' ? 'Saving...' : 'Declined'}
          </Button>
        </div>
        {statusRecord?.updatedAt ? (
          <p className="text-[11px] text-muted-foreground">
            Updated by {updatedSource}{updatedRelative ? ` • ${updatedRelative}` : ''}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">Event Attendance</h4>
        {!hasNamedCompanion && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void onTogglePlusOne();
            }}
            disabled={isTogglingPlusOne}
            className="h-7 text-xs"
          >
            {isTogglingPlusOne
              ? 'Updating...'
              : allowPlusOne ? 'Disable Guest' : 'Enable Guest'}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-48 pr-4 align-top pb-1">Event</th>
              {members.map((member, index) => (
                <th
                  key={member.personId}
                  className={cn('pr-4 align-top pb-1', index === 0 && 'pl-6')}
                >
                  <div className="flex flex-col gap-0 text-left leading-tight">
                    <span className="text-sm font-semibold text-foreground uppercase tracking-wide">
                      {formatMemberDisplayName(member)}
                    </span>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {getMemberRoleLabel(member)}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const enabled = eventVisibility[event.id] === true;
              const toggleClasses = enabled
                ? 'bg-foreground text-background hover:bg-foreground/90'
                : 'bg-muted text-muted-foreground hover:bg-muted';

              return (
                <tr key={event.id} className="border-t">
                  <td className="py-3 pr-4 align-top">
                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        size="sm"
                        className={cn('h-9 rounded-lg px-4 text-xs font-semibold', toggleClasses)}
                        onClick={() => onToggleVisibility(event.id, !enabled)}
                        aria-pressed={enabled}
                      >
                        {event.label}
                      </Button>
                      {event.timeText && (
                        <span className="text-xs text-muted-foreground">{event.timeText}</span>
                      )}
                    </div>
                  </td>
                  {members.map((member, index) => (
                    <td
                      key={`${event.id}-${member.personId}`}
                      className={cn('py-3 pr-4 align-top', index === 0 && 'pl-6')}
                    >
                      {renderAttendanceButtons(event, member, enabled)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface GuestMealsAndAllergiesAccordionProps {
  guest: Guest;
  events: EventDefinition[];
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftMeals: MealSelectionMap;
  attendanceByMember: Record<string, 'yes' | 'no' | 'pending'>;
  mealOptionsByEvent: Record<string, Array<{ key: string; label: string }>>;
  pendingMealRequests: Set<string>;
  dietaryNotesByMember: Record<string, string>;
  showMeals: boolean;
  showAllergies: boolean;
  onMealSelect: (
    eventId: string,
    personId: string,
    mealKey: string
  ) => Promise<void>;
}

const GuestMealsAndAllergiesAccordion = ({
  guest,
  events,
  title,
  open,
  onOpenChange,
  draftMeals,
  attendanceByMember,
  mealOptionsByEvent,
  pendingMealRequests,
  dietaryNotesByMember,
  showMeals,
  showAllergies,
  onMealSelect
}: GuestMealsAndAllergiesAccordionProps) => {
  const members = useMemo(() => sortPartyMembersByRole(guest.party), [guest.party]);
  const pendingCount = pendingMealRequests.size;

  const allergyEntries = useMemo(() => {
    const entries: Array<{ personId: string; eventId: string; note: string }> = [];
    events.forEach((event) => {
      guest.party.forEach((member) => {
        if (!member.invitedEvents.includes(event.id)) {
          return;
        }
        const key = `${event.id}:${member.personId}`;
        const note = dietaryNotesByMember[key];
        if (note) {
          entries.push({ personId: member.personId, eventId: event.id, note });
        }
      });
    });
    return entries;
  }, [dietaryNotesByMember, events, guest.party]);

  return (
    <div className="border-t pt-4">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm font-semibold text-foreground  hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
        >
          <span>{title}</span>
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              open ? 'rotate-180' : ''
            )}
          />
        </button>
        <CollapsibleContent forceMount className="data-[state=closed]:hidden">
          <div className="space-y-6 pt-4">
            {showMeals ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Meal Selections</h4>
                  {pendingCount > 0 ? (
                    <span className="text-xs uppercase text-muted-foreground">{pendingCount} update{pendingCount === 1 ? '' : 's'} pending</span>
                  ) : null}
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b">
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="w-48 pr-4 align-top pb-1">Event</th>
                        {members.map((member, index) => (
                          <th
                            key={member.personId}
                            className={cn('pr-4 align-top pb-1', index === 0 && 'pl-6')}
                          >
                            <div className="flex flex-col gap-0 text-left leading-tight">
                              <span className="text-sm font-semibold text-foreground uppercase tracking-wide">
                                {formatMemberDisplayName(member)}
                              </span>
                              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                {getMemberRoleLabel(member)}
                              </span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => {
                        const options = mealOptionsByEvent[event.id] ?? [];
                        return (
                          <tr key={event.id} className="border-t">
                            <td className="py-3 pr-4 align-top">
                              <div className="flex flex-col gap-1">
                                <span className="text-sm font-semibold">{event.label}</span>
                                {event.timeText ? (
                                  <span className="text-xs text-muted-foreground">{event.timeText}</span>
                                ) : null}
                              </div>
                            </td>
                            {members.map((member, index) => {
                              if (!member.invitedEvents.includes(event.id)) {
                                return (
                                  <td
                                    key={`${event.id}-${member.personId}`}
                                    className={cn('py-3 pr-4 align-top text-xs text-muted-foreground', index === 0 && 'pl-6')}
                                  >
                                    Not invited
                                  </td>
                                );
                              }

                              const cellKey = `${event.id}:${member.personId}`;
                              const attendanceStatus = attendanceByMember[cellKey] ?? 'pending';
                              const isDeclined = attendanceStatus === 'no';
                              const selectedKey = draftMeals[cellKey] ?? null;
                              const chipDisabled = isDeclined || attendanceStatus === 'pending' || pendingMealRequests.has(cellKey);

                              return (
                                <td
                                  key={`${event.id}-${member.personId}`}
                                  className={cn('py-3 pr-4 align-top', index === 0 && 'pl-6')}
                                >
                                  <div className="flex flex-wrap gap-2">
                                    {options.map((option) => (
                                      <Button
                                        key={option.key}
                                        type="button"
                                        size="sm"
                                        variant={selectedKey === option.key ? 'default' : 'outline'}
                                        className={cn('h-7 rounded-full px-3', chipDisabled && 'opacity-40')}
                                        disabled={chipDisabled}
                                        onClick={() => {
                                          if (selectedKey === option.key || chipDisabled) {
                                            return;
                                          }
                                          void onMealSelect(event.id, member.personId, option.key);
                                        }}
                                      >
                                        {option.label}
                                      </Button>
                                    ))}
                                    {options.length === 0 ? (
                                      <span className="text-xs text-muted-foreground">Configure meal options in the Event tab.</span>
                                    ) : null}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {showAllergies ? (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Allergy Notes</h4>
                {allergyEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No allergy notes provided.</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    {allergyEntries.map((entry) => {
                      const member = guest.party.find((item) => item.personId === entry.personId);
                      const event = events.find((item) => item.id === entry.eventId);
                      if (!member || !event) {
                        return null;
                      }
                      return (
                        <div key={`${entry.eventId}-${entry.personId}`} className="rounded-md border border-border bg-background px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-semibold uppercase text-muted-foreground">
                              {formatMemberDisplayName(member)} • {event.label}
                            </span>
                            <span className="text-sm leading-snug text-foreground">{entry.note}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

const GuestDetail = ({
  guest,
  events,
  auditEvents,
  isLoading,
  error,
  eventTimeZone,
  onUpdateEventVisibility,
  onTogglePlusOne,
  onUpdateEventAttendance,
  onUpdateMealSelection
}: {
  guest: Guest;
  events: EventDefinition[];
  auditEvents: AuditEvent[] | undefined;
  isLoading: boolean;
  error: string | null | undefined;
  eventTimeZone: string;
  onUpdateEventVisibility: (next: Record<string, boolean>) => void;
  onTogglePlusOne: (allow: boolean) => Promise<void>;
  onUpdateEventAttendance: (
    eventId: string,
    personId: string,
    status: 'yes' | 'no' | 'pending'
  ) => Promise<void>;
  onUpdateMealSelection: (
    eventId: string,
    personId: string,
    mealKey: string | null
  ) => Promise<void>;
}) => {
  const magicLinks = guest.activity?.magicLinks ?? {
    issuedCount: 0,
    usedCount: 0,
    lastIssued: null,
    lastUsed: null
  };
  const magicRequested = getActivitySummary(guest, 'email_sent');
  const inviteSummary = getActivitySummary(guest, 'invite_sent');
  const inviteClickSummary = getActivitySummary(guest, 'invite_clicked');

  // Format date/time for timeline
  const formatDateTime = (seconds?: number | null): string | null => {
    if (!seconds || Number.isNaN(seconds)) return null;
    const date = new Date(seconds * 1000);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: eventTimeZone
    }).replace(',', '');
  };

  const engagementMetrics: Array<{ icon: LucideIcon; label: string; value: string }> = [
    { icon: Mail, label: 'Invites sent', value: String(inviteSummary?.count || 0) },
    { icon: MousePointerClick, label: 'Invite clicks', value: String(inviteClickSummary?.count || 0) },
    { icon: KeyRound, label: 'Magic link requests', value: String(magicRequested?.count || 0) },
    { icon: ShieldCheck, label: 'Magic link uses', value: String(magicLinks.usedCount || 0) },
  ];

  const timeline = [
    { label: 'Invite sent', value: formatDateTime(guest.inviteSentAt) },
    { label: 'Invite clicked', value: formatDateTime(guest.inviteClickedAt) },
    { label: 'Magic link requested', value: formatDateTime(magicLinks.lastIssued) },
    { label: 'Magic link used', value: formatDateTime(magicLinks.lastUsed) }
  ];

  const [isMealsSectionOpen, setIsMealsSectionOpen] = useState(false);
  const [draftMeals, setDraftMeals] = useState<MealSelectionMap>(() => buildInitialMealMap(guest));
  useEffect(() => {
    setDraftMeals(buildInitialMealMap(guest));
  }, [guest]);

  const [pendingMealRequests, setPendingMealRequests] = useState<Set<string>>(new Set());
  useEffect(() => {
    setPendingMealRequests(new Set());
  }, [guest]);

  const mealRelatedEvents = useMemo(() => {
    const invitedEventIds = new Set(guest.invitedEvents ?? []);
    return events.filter((event) => {
      if (!invitedEventIds.has(event.id)) {
        return false;
      }
      return Boolean(event.requiresMealSelection || event.collectDietaryNotes);
    });
  }, [events, guest.invitedEvents]);

  const showMeals = useMemo(() => mealRelatedEvents.some((event) => event.requiresMealSelection), [mealRelatedEvents]);
  const showAllergies = useMemo(() => mealRelatedEvents.some((event) => event.collectDietaryNotes), [mealRelatedEvents]);
  const showMealAccordion = showMeals || showAllergies;

  const mealAccordionTitle = useMemo(() => {
    if (showMeals && showAllergies) {
      return 'Meals & Allergies';
    }
    if (showMeals) {
      return 'Meals';
    }
    if (showAllergies) {
      return 'Allergies';
    }
    return 'Meals';
  }, [showMeals, showAllergies]);

  const mealOptionsByEvent = useMemo(() => {
    return mealRelatedEvents.reduce<Record<string, Array<{ key: string; label: string }>>>((acc, event) => {
      const options: Array<{ key: string; label: string }> = [];
      if (event.requiresMealSelection) {
        const lookup = buildMealOptionLookup(event.mealOptions);
        lookup.forEach((label, key) => {
          options.push({ key, label });
        });
      }
      acc[event.id] = options;
      return acc;
    }, {});
  }, [mealRelatedEvents]);

  const attendanceByMember = useMemo(() => {
    const map: Record<string, 'yes' | 'no' | 'pending'> = {};
    mealRelatedEvents.forEach((event) => {
      guest.party.forEach((member) => {
        if (!member.invitedEvents.includes(event.id)) {
          return;
        }
        const status = getAttendanceStatus(member.attendance?.[event.id]);
        map[`${event.id}:${member.personId}`] = status;
      });
    });
    return map;
  }, [guest.party, mealRelatedEvents]);

  const dietaryNotesByMember = useMemo(() => {
    const map: Record<string, string> = {};
    mealRelatedEvents.forEach((event) => {
      if (!event.collectDietaryNotes) {
        return;
      }
      guest.party.forEach((member) => {
        if (!member.invitedEvents.includes(event.id)) {
          return;
        }
        const note = member.dietaryNotes?.[event.id]
          ?? guest.rsvp?.partyResponses?.[member.personId]?.dietaryNotes?.[event.id];
        if (typeof note === 'string') {
          const trimmed = note.trim();
          if (trimmed) {
            map[`${event.id}:${member.personId}`] = trimmed;
          }
        }
      });
    });
    return map;
  }, [guest.party, guest.rsvp?.partyResponses, mealRelatedEvents]);

  const eventVisibility = useMemo(() => {
    const invited = new Set(guest.invitedEvents ?? []);
    return events.reduce<Record<string, boolean>>((acc, event) => {
      acc[event.id] = invited.has(event.id);
      return acc;
    }, {});
  }, [events, guest.invitedEvents]);

  const handleVisibilityChange = (eventId: string, enabled: boolean) => {
    onUpdateEventVisibility({
      ...eventVisibility,
      [eventId]: enabled
    });
  };

  const allowPlusOne = hasGuestPlaceholder(guest);

  const [isTogglingPlusOne, setIsTogglingPlusOne] = useState(false);
  const [updatingAttendanceKey, setUpdatingAttendanceKey] = useState<string | null>(null);
  const [isEngagementSectionOpen, setIsEngagementSectionOpen] = useState(false);

  const makeAttendanceKey = (eventId: string, personId: string): string => {
    return `${eventId}:${personId}`;
  };

  const handlePlusOneToggle = async () => {
    setIsTogglingPlusOne(true);
    try {
      await onTogglePlusOne(!allowPlusOne);
    } finally {
      setIsTogglingPlusOne(false);
    }
  };

  const handleAttendanceUpdate = async (eventId: string, personId: string, status: 'yes' | 'no' | 'pending') => {
    const key = makeAttendanceKey(eventId, personId);
    const member = guest.party.find((entry) => entry.personId === personId);
    if (!member) {
      return;
    }

    const current = getAttendanceStatus(member.attendance?.[eventId]);
    if (current === status) {
      return;
    }

    if (status === 'no') {
      setDraftMeals((prev) => {
        if (prev[key] === null || prev[key] === undefined) {
          return prev;
        }
        return { ...prev, [key]: null };
      });
      setPendingMealRequests((prev) => {
        if (!prev.has(key)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }

    setUpdatingAttendanceKey(key);
    try {
      await onUpdateEventAttendance(eventId, personId, status);
    } finally {
      setUpdatingAttendanceKey(null);
    }
  };

  const handleMealSelect = async (eventId: string, personId: string, mealKey: string) => {
    const cellKey = makeAttendanceKey(eventId, personId);
    const previousValue = draftMeals[cellKey] ?? null;
    setPendingMealRequests((prev) => {
      const next = new Set(prev);
      next.add(cellKey);
      return next;
    });
    setDraftMeals((prev) => ({ ...prev, [cellKey]: mealKey }));
    try {
      await onUpdateMealSelection(eventId, personId, mealKey);
    } catch (error) {
      setDraftMeals((prev) => ({ ...prev, [cellKey]: previousValue }));
      if (!isAdminAuthError(error)) {
        toast.error('Unable to update meal selection');
      }
    } finally {
      setPendingMealRequests((prev) => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-4">
        <GuestAttendanceGrid
          events={events}
          eventVisibility={eventVisibility}
          onToggleVisibility={handleVisibilityChange}
          guest={guest}
          updatingAttendanceKey={updatingAttendanceKey}
          onAttendanceChange={handleAttendanceUpdate}
          allowPlusOne={allowPlusOne}
          isTogglingPlusOne={isTogglingPlusOne}
          onTogglePlusOne={handlePlusOneToggle}
        />

        {showMealAccordion ? (
          <GuestMealsAndAllergiesAccordion
            guest={guest}
            events={mealRelatedEvents}
            title={mealAccordionTitle}
            open={isMealsSectionOpen}
            onOpenChange={setIsMealsSectionOpen}
            draftMeals={draftMeals}
            attendanceByMember={attendanceByMember}
            mealOptionsByEvent={mealOptionsByEvent}
            pendingMealRequests={pendingMealRequests}
            dietaryNotesByMember={dietaryNotesByMember}
            showMeals={showMeals}
            showAllergies={showAllergies}
            onMealSelect={handleMealSelect}
          />
        ) : null}

        <div className="border-t pt-4">
          <Collapsible
            open={isEngagementSectionOpen}
            onOpenChange={setIsEngagementSectionOpen}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm font-semibold text-foreground  hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setIsEngagementSectionOpen((prev) => !prev)}
              aria-expanded={isEngagementSectionOpen}
            >
              <span>Engagement Tracking & Timeline</span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform',
                  isEngagementSectionOpen ? 'rotate-180' : ''
                )}
              />
            </button>
            <CollapsibleContent forceMount className="data-[state=closed]:hidden">
              <div className="grid gap-6 pt-4 md:grid-cols-2">
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Engagement Tracking</h4>
                  <div className="space-y-2 text-sm">
                    {engagementMetrics.map((metric) => (
                      <div key={metric.label} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <metric.icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">{metric.label}</span>
                        </div>
                        <span className="font-medium">{metric.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Timeline</h4>
                  <div className="space-y-2 text-sm">
                    {timeline.map((entry) => (
                      <div key={entry.label} className="flex items-center justify-between">
                        <span className="text-muted-foreground">{entry.label}</span>
                        <span className="font-medium">{entry.value ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  );
};

// Helper function to format event date/time
const formatEventDateTime = (startISO: string | undefined, timeZone: string | undefined): string => {
  if (!startISO) return '';

  try {
    const date = new Date(startISO);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
    return formatter.format(date);
  } catch (error) {
    console.error('Failed to format event date/time:', error);
    return new Date(startISO).toLocaleString('en-US', { timeZone: timeZone || 'UTC' });
  }
};

export function GuestManagement({
  guests,
  isLoading,
  events,
  eventTimeZone,
  emailInviteForm,
  setEmailInviteForm,
  resetEmailInviteForm,
  seedInviteForm,
  setSeedInviteForm,
  resetSeedInviteForm,
  sendInvite,
  inviteRequestMode,
  resendInvite,
  deleteGuest,
  updateEventVisibility,
  updateAllowPlusOne,
  updateEventAttendance,
  updateMealSelection,
  eventDetailsLoaded,
  emailSubjects,
  onEmailSubjectsChange,
  saveEmailSubjects
}: GuestManagementProps) {
  type AttendanceFilter = 'all' | 'yes' | 'no' | 'pending';

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedAttendance, setSelectedAttendance] = useState<AttendanceFilter>('all');
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [auditLogs, setAuditLogs] = useState<Record<number, AuditEvent[]>>({});
  const [auditLoading, setAuditLoading] = useState<Record<number, boolean>>({});
  const [auditError, setAuditError] = useState<Record<number, string | null>>({});
  const [rosterSelection, setRosterSelection] = useState<{ eventId: string; status: RosterStatus } | null>(null);
  const [focusedGuestId, setFocusedGuestId] = useState<number | null>(null);
  const [openAccordionSections, setOpenAccordionSections] = useState<string[]>([]);
  const [openGuestListSections, setOpenGuestListSections] = useState<string[]>([]);
  const [openEmailSections, setOpenEmailSections] = useState<string[]>([]);
  const [groupEmailSubject, setGroupEmailSubject] = useState('');
  const [groupEmailBody, setGroupEmailBody] = useState('');
  const [groupEmailSending, setGroupEmailSending] = useState(false);
  const [recipientMode, setRecipientMode] = useState<'filter' | 'custom'>('filter');
  const [recipientEventFilter, setRecipientEventFilter] = useState<string>('');
  const [recipientStatusFilter, setRecipientStatusFilter] = useState<string>('');
  const [recipientCustomIds, setRecipientCustomIds] = useState<number[]>([]);
  const canSendInvite = Boolean(
    emailSubjects.magicLinkSubject.trim() && emailSubjects.inviteSubject.trim()
  );

  const isValidEmail = (email: string): boolean => {
    const trimmed = email.trim();
    return trimmed.length > 0 && trimmed.includes('@') && trimmed.includes('.');
  };

  const isEmailInviteFormValid = Boolean(
    emailInviteForm.primaryGuest.firstName.trim() &&
    emailInviteForm.primaryGuest.lastName.trim() &&
    isValidEmail(emailInviteForm.primaryGuest.email)
  );

  const isSeedInviteFormValid = Boolean(
    seedInviteForm.primaryGuest.firstName.trim() &&
    seedInviteForm.primaryGuest.lastName.trim() &&
    isValidEmail(seedInviteForm.primaryGuest.email)
  );

  const ensureVisibility = useCallback((visibility?: Record<string, boolean>): Record<string, boolean> => {
    return events.reduce<Record<string, boolean>>((acc, event) => {
      acc[event.id] = visibility?.[event.id] === true;
      return acc;
    }, {});
  }, [events]);

  const hasCompanionDetails = useCallback((companion: InviteFormState['companion']): boolean => {
    return Boolean(companion.firstName.trim() || companion.lastName.trim());
  }, []);

  const eventAttendanceStats = useMemo(() => {
    return events.reduce<Record<string, { yes: number; no: number; pending: number; dietary: number; meal?: MealMetrics }>>((acc, event) => {
      const collectsDietary = Boolean(event.collectDietaryNotes);
      const requiresMealSelection = Boolean(event.requiresMealSelection);
      const mealOptionLookup = buildMealOptionLookup(event.mealOptions);

      const counts: { yes: number; no: number; pending: number; dietary: number; meal?: MealMetrics } = {
        yes: 0,
        no: 0,
        pending: 0,
        dietary: 0,
        meal: requiresMealSelection
          ? {
              eligible: 0,
              selected: 0,
              pending: 0,
              totals: {},
              labels: {}
            }
          : undefined
      };

      const seenDietary = new Set<string>();

      guests.forEach((guest) => {
        guest.party.forEach(member => {
          if (!member.invitedEvents.includes(event.id)) {
            return;
          }

          const status = getAttendanceStatus(member.attendance?.[event.id]);
          if (status === 'yes') counts.yes += 1;
          else if (status === 'no') counts.no += 1;
          else counts.pending += 1;

          const mealStats = counts.meal;
          if (mealStats) {
            const mealSelection = normalizeMealValue(
              member.mealSelections?.[event.id]
                ?? guest.rsvp?.partyResponses?.[member.personId]?.mealSelections?.[event.id]
            );

            if (status !== 'no') {
              mealStats.eligible += 1;

              if (mealSelection) {
                mealStats.selected += 1;
                const mealKey = createMealKey(mealSelection);
                mealStats.totals[mealKey] = (mealStats.totals[mealKey] ?? 0) + 1;
                if (!mealStats.labels[mealKey]) {
                  mealStats.labels[mealKey] = mealOptionLookup.get(mealKey) ?? mealSelection;
                }
              }
            }
          }

          if (!collectsDietary) {
            return;
          }

          const note = member.dietaryNotes?.[event.id]
            ?? guest.rsvp?.partyResponses?.[member.personId]?.dietaryNotes?.[event.id];
          if (typeof note !== 'string') {
            return;
          }
          const trimmed = note.trim();
          if (!trimmed) {
            return;
          }
          if (seenDietary.has(member.personId)) {
            return;
          }
          counts.dietary += 1;
          seenDietary.add(member.personId);
        });
      });

      if (counts.meal) {
        counts.meal.pending = Math.max(counts.meal.eligible - counts.meal.selected, 0);
      }

      acc[event.id] = counts;
      return acc;
    }, {});
  }, [events, guests]);

  const rosterByEvent = useMemo(() => {
  const eventMap = new Map(events.map((event) => [event.id, event] as const));
  const mealLookupByEvent = new Map<string, Map<string, string>>();
  events.forEach(event => {
    mealLookupByEvent.set(event.id, buildMealOptionLookup(event.mealOptions));
  });

  const initial = events.reduce<Record<string, {
    invited: RosterEntry[];
    byStatus: {
      attending: RosterEntry[];
      pending: RosterEntry[];
      declined: RosterEntry[];
    };
    dietary: RosterEntry[];
    meals: Record<string, RosterEntry[]>;
    mealPending: RosterEntry[];
  }>>((acc, event) => {
    acc[event.id] = {
      invited: [],
      byStatus: {
        attending: [],
        pending: [],
        declined: []
      },
      dietary: [],
      meals: {},
      mealPending: []
    };
    return acc;
  }, {});

    guests.forEach((guest) => {
      const primaryMember = guest.party.find(member => member.role === 'primary') ?? guest.party[0] ?? null;
      const primaryName = primaryMember ? formatMemberDisplayName(primaryMember) : null;
      const guestSummary = getPartySummary(guest);
      const partySortKey = buildPartySortKey(primaryMember, guestSummary, guest.email, guest.id);

      guest.party.forEach((member) => {
        member.invitedEvents.forEach((eventId) => {
          const bucket = initial[eventId];
          if (!bucket) {
            return;
          }
          const eventDetails = eventMap.get(eventId);
          const attendanceStatus = getAttendanceStatus(member.attendance?.[eventId]);
          const rosterStatus = rosterStatusFromAttendance(attendanceStatus);
          const dietarySource = member.dietaryNotes?.[eventId]
            ?? guest.rsvp?.partyResponses?.[member.personId]?.dietaryNotes?.[eventId];
          const dietaryNote = typeof dietarySource === 'string' ? dietarySource.trim() : '';
          const mealLookup = mealLookupByEvent.get(eventId) ?? new Map();
          const mealSelection = normalizeMealValue(
            member.mealSelections?.[eventId]
              ?? guest.rsvp?.partyResponses?.[member.personId]?.mealSelections?.[eventId]
          );
          const entry: RosterEntry = {
            eventId,
            guestId: guest.id,
            personId: member.personId,
            member,
            displayName: formatMemberDisplayName(member),
            status: rosterStatus,
            guestSummary,
            primaryName: primaryMember && primaryMember.personId !== member.personId
              ? (formatMemberDisplayName(primaryMember) || guest.email || null)
              : null,
            partySortKey,
            dietaryNote: dietaryNote || undefined
          };

          bucket.invited.push(entry);
          bucket.byStatus[rosterStatus].push(entry);

          if (eventDetails?.collectDietaryNotes && entry.dietaryNote) {
            bucket.dietary.push(entry);
          }

          if (eventDetails?.requiresMealSelection) {
            if (rosterStatus !== 'declined') {
              if (mealSelection) {
                const mealKey = createMealKey(mealSelection);
                const displayMeal = mealLookup.get(mealKey) ?? mealSelection;
                entry.mealChoice = displayMeal;
                entry.mealKey = mealKey;
                if (!bucket.meals[mealKey]) {
                  bucket.meals[mealKey] = [];
                }
                bucket.meals[mealKey].push(entry);
              } else {
                bucket.mealPending.push(entry);
              }
            }
          }
        });
      });
    });

    Object.values(initial).forEach((bucket) => {
      bucket.invited = sortRosterEntries(bucket.invited);
      bucket.byStatus.attending = sortRosterEntries(bucket.byStatus.attending);
      bucket.byStatus.pending = sortRosterEntries(bucket.byStatus.pending);
      bucket.byStatus.declined = sortRosterEntries(bucket.byStatus.declined);
      bucket.dietary = sortRosterEntries(bucket.dietary);
      bucket.mealPending = sortRosterEntries(bucket.mealPending);
      Object.keys(bucket.meals).forEach((mealKey) => {
        bucket.meals[mealKey] = sortRosterEntries(bucket.meals[mealKey]);
      });
    });

    return initial;
  }, [events, guests]);

  const filteredGuests = useMemo(() => {
    return guests.filter((guest) => {
      if (selectedEventId) {
        const eventStatus = getEventStatusForGuest(guest, selectedEventId);
        if (eventStatus === null) {
          return false;
        }
        if (selectedAttendance !== 'all') {
          if (eventStatus !== selectedAttendance) {
            return false;
          }
        }
      } else if (selectedAttendance !== 'all') {
        const globalStatus = deriveInviteStatus(guest);
        if (globalStatus !== selectedAttendance) {
          return false;
        }
      }


      return true;
    });
  }, [guests, selectedAttendance, selectedEventId]);

  const buildGuestSortKey = (guest: Guest): string => {
    const primaryMember = guest.party.find((member) => member.role === 'primary') ?? guest.party[0] ?? null;
    const summary = getPartySummary(guest);
    return buildPartySortKey(primaryMember, summary, guest.email, guest.id);
  };

  const sortedGuests = useMemo(() => {
    return [...filteredGuests].sort((a, b) => buildGuestSortKey(a).localeCompare(buildGuestSortKey(b)));
  }, [filteredGuests]);

  const handleSelectEvent = (eventId: string | null) => {
    setSelectedEventId((prev) => (prev === eventId ? null : eventId));
    setSelectedAttendance('all');
  };

  useEffect(() => {
    if (!events.length) {
      if (selectedEventId !== null) {
        setSelectedEventId(null);
        setSelectedAttendance('all');
      }
      return;
    }

    if (selectedEventId && !events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(null);
      setSelectedAttendance('all');
    }
  }, [events, selectedEventId]);

  useEffect(() => {
    if (rosterSelection && !events.some((event) => event.id === rosterSelection.eventId)) {
      setRosterSelection(null);
    }
  }, [events, rosterSelection]);

  useEffect(() => {
    if (focusedGuestId === null) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const timeout = window.setTimeout(() => {
      setFocusedGuestId(null);
    }, 2200);
    return () => window.clearTimeout(timeout);
  }, [focusedGuestId]);

  const loadAuditEvents = async (guestId: number) => {
    setAuditLoading((prev) => ({ ...prev, [guestId]: true }));
    setAuditError((prev) => ({ ...prev, [guestId]: null }));
    try {
      const response = await adminFetch(`/admin/audit?guest_id=${guestId}&limit=50`);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const data = await response.json() as AuditEvent[];
      setAuditLogs((prev) => ({ ...prev, [guestId]: data }));
    } catch (error) {
      if (isAdminAuthError(error)) {
        return;
      }
      console.error('Failed to load audit events', error);
      setAuditError((prev) => ({ ...prev, [guestId]: 'Unable to load activity log.' }));
    } finally {
      setAuditLoading((prev) => ({ ...prev, [guestId]: false }));
    }
  };

  const focusGuestFromRoster = (guestId: number) => {
    const shouldLoadAudit = !auditLogs[guestId];
    setExpandedRows((prev) => ({ ...prev, [guestId]: true }));
    setOpenAccordionSections((prev) => (prev.includes('guest-list') ? prev : [...prev, 'guest-list']));
    setOpenGuestListSections((prev) => (prev.includes('list') ? prev : [...prev, 'list']));
    if (shouldLoadAudit) {
      void loadAuditEvents(guestId);
    }
    setFocusedGuestId(guestId);
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        const rowElement = document.getElementById(`guest-row-${guestId}`);
        if (rowElement) {
          const rect = rowElement.getBoundingClientRect();
          const offset = 120;
          const target = window.scrollY + rect.top - offset;
          window.scrollTo({ top: target, behavior: 'smooth' });
        }
      });
    }
  };

  const toggleRosterPanel = (eventId: string, status: RosterStatus) => {
    setRosterSelection((prev) => {
      if (prev && prev.eventId === eventId && rosterStatusesEqual(prev.status, status)) {
        return null;
      }
      return { eventId, status };
    });
  };

  const renderRosterPanel = (event: EventDefinition, status: RosterStatus) => {
    const roster = rosterByEvent[event.id];
    if (!roster) {
      return (
        <div className="rounded-md border bg-background/70 p-4">
          <p className="text-sm text-muted-foreground">No guests are linked to this event.</p>
        </div>
      );
    }

    const stats = eventAttendanceStats[event.id];
    const mealStats = stats?.meal;

    if (status.type === 'meal-summary') {
      type MealSummaryRow =
        | { kind: 'pending'; label: string; count: number }
        | { kind: 'option'; mealKey: string; label: string; count: number };

      if (!mealStats) {
        return (
          <div className="rounded-md border bg-background/70 p-4">
            <p className="text-sm text-muted-foreground">No meal selections have been recorded for this event yet.</p>
          </div>
        );
      }

      const rows: MealSummaryRow[] = [];
      const seenKeys = new Set<string>();
      const pendingCount = roster.mealPending.length;

      if (pendingCount > 0) {
        rows.push({ kind: 'pending', label: 'Pending', count: pendingCount });
      }

      if (event.mealOptions && event.mealOptions.length > 0) {
        event.mealOptions.forEach(option => {
          const normalized = normalizeMealValue(option);
          if (!normalized) {
            return;
          }
          const mealKey = createMealKey(normalized);
          const count = mealStats.totals[mealKey] ?? 0;
          rows.push({ kind: 'option', mealKey, label: option, count });
          seenKeys.add(mealKey);
        });
      }

      Object.entries(mealStats.totals).forEach(([mealKey, count]) => {
        if (seenKeys.has(mealKey)) {
          return;
        }
        const label = mealStats.labels[mealKey] ?? mealKey;
        rows.push({ kind: 'option', mealKey, label, count });
        seenKeys.add(mealKey);
      });

      if (rows.length === 0) {
        return (
          <div className="rounded-md border bg-background/70 p-4">
            <p className="text-sm text-muted-foreground">No meal selections have been recorded for this event yet.</p>
          </div>
        );
      }

      const showConfigurationHint = (event.mealOptions?.length ?? 0) === 0;

      return (
        <div className="rounded-md border bg-background/70">
          {showConfigurationHint ? (
            <div className="border-b bg-background/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">Add meal options in the Event tab to capture selections.</p>
            </div>
          ) : null}
          <div className="max-h-64 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead>Guests</TableHead>
                  <TableHead className="w-[90px] text-right">Manage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const disabled = row.count === 0;
                  const handleClick = () => {
                    if (disabled) {
                      return;
                    }
                    if (row.kind === 'pending') {
                      toggleRosterPanel(event.id, { type: 'meal-pending' });
                    } else {
                      toggleRosterPanel(event.id, { type: 'meal', mealKey: row.mealKey });
                    }
                  };

                  const ariaLabel = row.kind === 'pending'
                    ? 'View guests with pending meal selection'
                    : `View guests for ${row.label}`;

                  return (
                    <TableRow key={row.kind === 'pending' ? 'pending' : row.mealKey}>
                      <TableCell>{row.label}</TableCell>
                      <TableCell>
                        <span className="text-sm text-foreground">{row.count}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleClick}
                          disabled={disabled}
                          aria-label={ariaLabel}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      );
    }

    if (status.type === 'meal') {
      const entries = roster.meals[status.mealKey] ?? [];
      const mealLabel = mealStats?.labels[status.mealKey]
        ?? roster.meals[status.mealKey]?.[0]?.mealChoice
        ?? status.mealKey;

      if (entries.length === 0) {
        return (
          <div className="rounded-md border bg-background/70 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">No guests are currently associated with {mealLabel.toLowerCase()}.</p>
              <Button variant="ghost" size="sm" onClick={() => toggleRosterPanel(event.id, { type: 'meal-summary' })}>
                Back
              </Button>
            </div>
          </div>
        );
      }

      return (
        <div className="rounded-md border bg-background/70">
          <div className="flex items-center justify-between border-b bg-background/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{mealLabel}</p>
              <p className="text-xs text-muted-foreground">{entries.length} guest{entries.length === 1 ? '' : 's'}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => toggleRosterPanel(event.id, { type: 'meal-summary' })}>
              Back
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Invite</TableHead>
                  <TableHead>Meal</TableHead>
                  <TableHead className="w-[60px] text-right">Manage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={`${entry.guestId}-${entry.personId}`}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-foreground">{entry.displayName}</span>
                        <span className="text-xs text-muted-foreground">{memberRosterStatusLabels[entry.status]}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="uppercase">
                        {getMemberRoleLabel(entry.member)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-foreground">{entry.guestSummary}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-foreground" title={entry.mealChoice ?? 'Awaiting selection'}>
                        {entry.mealChoice ?? 'Awaiting selection'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => focusGuestFromRoster(entry.guestId)}
                        aria-label={`Manage ${entry.displayName}`}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      );
    }

    let entries: RosterEntry[];
    let emptyMessage: string;

    if (status.type === 'invited') {
      entries = roster.invited;
      emptyMessage = 'No guests have been invited to this event yet.';
    } else if (status.type === 'meal-pending') {
      entries = roster.mealPending;
      emptyMessage = 'All invited guests have chosen a meal for this event.';
    } else if (status.type === 'dietary') {
      entries = roster.dietary;
      emptyMessage = 'No guests have shared dietary notes for this event yet.';
    } else {
      entries = roster.byStatus[status.type];
      emptyMessage = `No guests are currently ${memberRosterStatusLabels[status.type].toLowerCase()} for this event.`;
    }

    if (entries.length === 0) {
      if (status.type === 'meal-pending') {
        return (
          <div className="rounded-md border bg-background/70 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
              <Button variant="ghost" size="sm" onClick={() => toggleRosterPanel(event.id, { type: 'meal-summary' })}>
                Back
              </Button>
            </div>
          </div>
        );
      }
      return (
        <div className="rounded-md border bg-background/70 p-4">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      );
    }

    const isMealPending = status.type === 'meal-pending';
    const showDietaryColumn = status.type === 'dietary';

    return (
      <div className="rounded-md border bg-background/70">
        {isMealPending ? (
          <div className="flex items-center justify-between border-b bg-background/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Pending</p>
              <p className="text-xs text-muted-foreground">{entries.length} guest{entries.length === 1 ? '' : 's'}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => toggleRosterPanel(event.id, { type: 'meal-summary' })}>
              Back
            </Button>
          </div>
        ) : null}
        <div className="max-h-64 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Invite</TableHead>
                {showDietaryColumn ? <TableHead>Dietary Note</TableHead> : null}
                {status.type === 'meal-pending' ? <TableHead>Meal</TableHead> : null}
                <TableHead className="w-[60px] text-right">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={`${entry.guestId}-${entry.personId}`}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-foreground">{entry.displayName}</span>
                      <span className="text-xs text-muted-foreground">{memberRosterStatusLabels[entry.status]}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="uppercase">
                      {getMemberRoleLabel(entry.member)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-foreground">{entry.guestSummary}</span>
                  </TableCell>
                  {showDietaryColumn ? (
                    <TableCell>
                      <span className="text-sm text-foreground" title={entry.dietaryNote}>{entry.dietaryNote}</span>
                    </TableCell>
                  ) : null}
                  {status.type === 'meal-pending' ? (
                    <TableCell>
                      <span className="text-sm text-foreground" title="Pending">Pending</span>
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => focusGuestFromRoster(entry.guestId)}
                      aria-label={`Manage ${entry.displayName}`}
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  const handleToggleRow = (guestId: number) => {
    setExpandedRows((prev) => {
      const next = { ...prev, [guestId]: !prev[guestId] };
      if (!prev[guestId] && !auditLogs[guestId]) {
        void loadAuditEvents(guestId);
      }
      return next;
    });
  };

  const buildInvitePayload = (form: InviteFormState): InviteFormState => {
    const companionActive = hasCompanionDetails(form.companion);

    return {
      primaryGuest: {
        firstName: form.primaryGuest.firstName,
        lastName: form.primaryGuest.lastName,
        email: form.primaryGuest.email
      },
      companion: {
        firstName: form.companion.firstName,
        lastName: form.companion.lastName
      },
      allowPlusOne: companionActive ? false : form.allowPlusOne,
      eventVisibility: ensureVisibility(form.eventVisibility)
    };
  };

  const validatePrimaryGuest = (form: InviteFormState): boolean => {
    const trimmedFirst = form.primaryGuest.firstName.trim();
    const trimmedLast = form.primaryGuest.lastName.trim();
    const normalizedEmail = form.primaryGuest.email.trim().toLowerCase();

    // No toast - button should be disabled if invalid
    return Boolean(trimmedFirst && trimmedLast && normalizedEmail);
  };

  const calculateRecipientStats = useCallback((): { emails: number; people: number } => {
    if (recipientMode === 'custom') {
      const selectedGuests = guests.filter(g => recipientCustomIds.includes(g.id));
      return {
        emails: selectedGuests.length,
        people: selectedGuests.reduce((sum, g) => sum + g.party.length, 0)
      };
    }

    // Filter mode
    // Safety: BOTH filters must be explicitly selected (not empty)
    if (!recipientEventFilter || recipientEventFilter === '' ||
        !recipientStatusFilter || recipientStatusFilter === '') {
      return { emails: 0, people: 0 };
    }

    const matchingGuests = guests.filter(guest => {
      // Must have email
      if (!guest.email?.trim()) {
        return false;
      }

      // Event filter
      if (recipientEventFilter !== 'all') {
        // Check if any party member is invited to this event
        const hasInvitedMember = guest.party.some(member =>
          member.invitedEvents.includes(recipientEventFilter)
        );
        if (!hasInvitedMember) {
          return false;
        }
      }

      // Status filter
      if (recipientStatusFilter !== 'all') {
        if (recipientStatusFilter === 'has-email') {
          return true; // Already checked email above
        }

        if (recipientEventFilter === 'all') {
          // Can't filter by status without specific event
          return true;
        }

        // Use the same logic as getEventStatusForGuest - check party member attendance
        const statuses: Array<'yes' | 'no' | 'pending'> = [];
        guest.party.forEach(member => {
          if (member.invitedEvents.includes(recipientEventFilter)) {
            statuses.push(getAttendanceStatus(member.attendance?.[recipientEventFilter]));
          }
        });

        if (statuses.length === 0) {
          return false; // No members invited to this event
        }

        // Match the filter
        if (recipientStatusFilter === 'accepted') {
          return statuses.some(s => s === 'yes');
        }
        if (recipientStatusFilter === 'pending') {
          return statuses.some(s => s === 'pending');
        }
        if (recipientStatusFilter === 'declined') {
          return statuses.every(s => s === 'no');
        }
        if (recipientStatusFilter === 'invited') {
          return statuses.some(s => s === 'yes' || s === 'pending');
        }
      }

      return true;
    });

    return {
      emails: matchingGuests.length,
      people: matchingGuests.reduce((sum, guest) => sum + guest.party.length, 0)
    };
  }, [recipientMode, recipientCustomIds, recipientEventFilter, recipientStatusFilter, guests]);

  const recipientStats = calculateRecipientStats();

  const handleInviteSubmit = async () => {
    if (!canSendInvite) {
      return;
    }

    if (!validatePrimaryGuest(emailInviteForm)) {
      return;
    }

    const success = await sendInvite(buildInvitePayload(emailInviteForm), { mode: 'email' });
    if (success) {
      resetEmailInviteForm();
    }
  };

  const handleSeedSubmit = async () => {
    if (!validatePrimaryGuest(seedInviteForm)) {
      return;
    }

    const success = await sendInvite(buildInvitePayload(seedInviteForm), { mode: 'seed' });
    if (success) {
      resetSeedInviteForm();
    }
  };

  const handleSendGroupEmail = async () => {
    setGroupEmailSending(true);

    try {
      const payload = {
        subject: groupEmailSubject.trim(),
        body: groupEmailBody.trim(),
        recipientMode,
        ...(recipientMode === 'filter' ? {
          recipientEventFilter,
          recipientStatusFilter
        } : {
          recipientCustomIds
        })
      };

      const response = await adminFetch('/admin/group-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const responseClone = response.clone();
      const result = await response.json().catch(() => null) as
        | { success?: boolean; emailsSent?: number; failed?: number; error?: string }
        | null;
      const emailsSent = typeof result?.emailsSent === 'number' ? result.emailsSent : undefined;
      const failedCount = typeof result?.failed === 'number' ? result.failed : undefined;
      const errorMessage = typeof result?.error === 'string' ? result.error : undefined;

      if (!response.ok) {
        const fallbackText = await responseClone.text().catch(() => '');
        toast.error(errorMessage || fallbackText || 'Failed to send email');
        return;
      }

      // Handle success or partial success
      if (failedCount && failedCount > 0) {
        // Partial success (HTTP 207)
        const sentCount = emailsSent ?? 0;
        toast.warning(`Email sent to ${sentCount} recipient${sentCount === 1 ? '' : 's'}, but ${failedCount} failed`);
      } else {
        // Full success
        const sentCount = emailsSent ?? 0;
        toast.success(`Email sent to ${sentCount} recipient${sentCount === 1 ? '' : 's'}`);
      }

      // Reset form
      setGroupEmailSubject('');
      setGroupEmailBody('');
      setRecipientCustomIds([]);

    } catch (error) {
      if (isAdminAuthError(error)) {
        return;
      }
      console.error('Group email error:', error);
      toast.error('Failed to send email');
    } finally {
      setGroupEmailSending(false);
    }
  };

  const filteredDescription = () => {
    const hasEventFilter = selectedEventId !== null;
    const hasStatusFilter = selectedAttendance !== 'all';

    // If no filters are active, show nothing
    if (!hasEventFilter && !hasStatusFilter) {
      return null;
    }

    const filters = [];

    if (hasEventFilter) {
      const eventLabel = events.find((event) => event.id === selectedEventId)?.label ?? 'Selected event';
      filters.push(eventLabel);
    }

    if (hasStatusFilter) {
      const statusLabel = selectedAttendance === 'yes'
        ? 'Attending'
        : selectedAttendance === 'no'
          ? 'Declined'
          : 'Pending';
      filters.push(statusLabel);
    }

    return `Filters: ${filters.join(' • ')}`;
  };


  return (
    <div className="w-full space-y-6">
      <Accordion
        type="multiple"
        value={openAccordionSections}
        onValueChange={setOpenAccordionSections}
        className="space-y-4"
      >

        {/* Email Section */}
        <AccordionItem value="email" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              <span className="font-medium">Email</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <Accordion
              type="multiple"
              value={openEmailSections}
              onValueChange={setOpenEmailSections}
              className="space-y-4"
            >

            {/* Email Subjects Section */}
            <AccordionItem value="email-subjects" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="font-medium">Subject Line</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="invite-email-subject">Invitation Email Subject</Label>
                    <Input
                      id="invite-email-subject"
                      value={emailSubjects.inviteSubject}
                      onChange={(event) =>
                        onEmailSubjectsChange({
                          magicLinkSubject: emailSubjects.magicLinkSubject,
                          inviteSubject: event.target.value
                        })
                      }
                      placeholder="You're Invited to Our Wedding!"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="magic-link-subject">Magic Link Email Subject</Label>
                    <Input
                      id="magic-link-subject"
                      value={emailSubjects.magicLinkSubject}
                      onChange={(event) =>
                        onEmailSubjectsChange({
                          magicLinkSubject: event.target.value,
                          inviteSubject: emailSubjects.inviteSubject
                        })
                      }
                      placeholder="Single use link"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void saveEmailSubjects()}
                    disabled={isLoading}
                  >
                    Save Email Copy
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Send Invite Section */}
            <AccordionItem value="send-invite" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  <span className="font-medium">Send Invite</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="primary-first-name">Primary First Name</Label>
                  <Input
                    id="primary-first-name"
                    value={emailInviteForm.primaryGuest.firstName}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setEmailInviteForm((prev) => ({
                        ...prev,
                        primaryGuest: {
                          ...prev.primaryGuest,
                          firstName: event.target.value
                        }
                      }))}
                    placeholder="Alex"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primary-last-name">Primary Last Name</Label>
                  <Input
                    id="primary-last-name"
                    value={emailInviteForm.primaryGuest.lastName}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setEmailInviteForm((prev) => ({
                        ...prev,
                        primaryGuest: {
                          ...prev.primaryGuest,
                          lastName: event.target.value
                        }
                      }))}
                    placeholder="Rivera"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primary-email">Primary Email</Label>
                  <Input
                    id="primary-email"
                    type="email"
                    value={emailInviteForm.primaryGuest.email}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setEmailInviteForm((prev) => ({
                        ...prev,
                        primaryGuest: {
                          ...prev.primaryGuest,
                          email: event.target.value
                        }
                      }))}
                    placeholder="alex@example.com"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="companion-first-name">Companion First Name</Label>
                  <Input
                    id="companion-first-name"
                    value={emailInviteForm.companion.firstName}
                    disabled={emailInviteForm.allowPlusOne}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                      const nextValue = event.target.value;
                      setEmailInviteForm((prev) => {
                        const nextCompanion = { ...prev.companion, firstName: nextValue };
                        const companionPresent = hasCompanionDetails(nextCompanion);
                        return {
                          ...prev,
                          companion: nextCompanion,
                          allowPlusOne: companionPresent ? false : prev.allowPlusOne
                        };
                      });
                    }}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companion-last-name">Companion Last Name</Label>
                  <Input
                    id="companion-last-name"
                    value={emailInviteForm.companion.lastName}
                    disabled={emailInviteForm.allowPlusOne}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                      const nextValue = event.target.value;
                      setEmailInviteForm((prev) => {
                        const nextCompanion = { ...prev.companion, lastName: nextValue };
                        const companionPresent = hasCompanionDetails(nextCompanion);
                        return {
                          ...prev,
                          companion: nextCompanion,
                          allowPlusOne: companionPresent ? false : prev.allowPlusOne
                        };
                      });
                    }}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2 md:flex md:flex-col md:justify-end">
                  <Label htmlFor="allow-plus-one" className="text-sm font-medium leading-none text-muted-foreground">
                    Unknown Guest
                  </Label>
                  <Button
                    id="allow-plus-one"
                    type="button"
                    className={cn(
                      'h-10 rounded-md px-3 text-sm w-full border ',
                      emailInviteForm.allowPlusOne
                        ? 'bg-foreground text-background border-foreground hover:bg-foreground/90'
                        : 'bg-background text-foreground border-input hover:bg-muted',
                      hasCompanionDetails(emailInviteForm.companion) && 'bg-muted text-muted-foreground border-input hover:bg-muted cursor-not-allowed'
                    )}
                    onClick={() => {
                      if (hasCompanionDetails(emailInviteForm.companion)) {
                        return;
                      }
                      setEmailInviteForm((prev) => ({
                        ...prev,
                        allowPlusOne: !prev.allowPlusOne,
                        companion: !prev.allowPlusOne
                          ? { firstName: '', lastName: '' }
                          : prev.companion
                      }));
                    }}
                    disabled={hasCompanionDetails(emailInviteForm.companion)}
                  >
                    {emailInviteForm.allowPlusOne ? 'Disable Guest' : 'Enable Guest'}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Event Access</Label>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Add events in the Event tab to control visibility.</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {events.map((event) => {
                      const enabled = emailInviteForm.eventVisibility[event.id] === true;
                      return (
                        <Button
                          key={event.id}
                          type="button"
                          className={cn(
                            'h-9 rounded-lg px-4 text-xs font-semibold  border',
                            enabled
                              ? 'bg-foreground text-background border-foreground hover:bg-foreground/90'
                              : 'bg-muted text-muted-foreground border-transparent hover:bg-muted'
                          )}
                          onClick={() => {
                            setEmailInviteForm((prev) => ({
                              ...prev,
                              eventVisibility: {
                                ...ensureVisibility(prev.eventVisibility),
                                [event.id]: !enabled
                              }
                            }));
                          }}
                        >
                          {event.label}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex justify-end">
                  <Button
                    onClick={handleInviteSubmit}
                    disabled={isLoading || !canSendInvite || !isEmailInviteFormValid}
                  >
                    {inviteRequestMode === 'email' ? 'Sending…' : 'Send Email Invite'}
                  </Button>
                </div>

                {!canSendInvite && eventDetailsLoaded && (
                  <p className="text-xs text-destructive">
                    You must update both email subjects before you can send email.
                  </p>
                )}
              </div>
              </AccordionContent>
            </AccordionItem>

            {/* Group Email Section */}
            <AccordionItem value="group-email" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <span className="font-medium">Group Email</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div className="space-y-4">
                  {/* Recipient Selection */}
                  <div className="space-y-3 rounded-lg border p-4">
                    <Label>Send to:</Label>

                    <Tabs value={recipientMode} onValueChange={(value) => setRecipientMode(value as 'filter' | 'custom')}>
                      <TabsList>
                        <TabsTrigger value="filter">Filter</TabsTrigger>
                        <TabsTrigger value="custom">Custom</TabsTrigger>
                      </TabsList>
                    </Tabs>

                    {recipientMode === 'filter' && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Event</Label>
                          <Select value={recipientEventFilter} onValueChange={setRecipientEventFilter}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Event" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Events</SelectItem>
                              {events.map((event) => (
                                <SelectItem key={event.id} value={event.id}>
                                  {event.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <Select value={recipientStatusFilter} onValueChange={setRecipientStatusFilter}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Statuses</SelectItem>
                              <SelectItem value="accepted">Accepted Only</SelectItem>
                              <SelectItem value="pending">Pending Only</SelectItem>
                              <SelectItem value="declined">Declined Only</SelectItem>
                              <SelectItem value="invited">Invited (Accepted + Pending)</SelectItem>
                              <SelectItem value="has-email">Has Email</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {recipientMode === 'custom' && (
                      <div className="max-h-64 overflow-y-auto space-y-2 rounded-md border p-3">
                        {guests
                          .filter(guest => guest.email?.trim())
                          .sort((a, b) => {
                            const aPrimary = a.party.find(m => m.role === 'primary');
                            const bPrimary = b.party.find(m => m.role === 'primary');
                            const aLast = aPrimary?.lastName.trim().toLowerCase() || '';
                            const bLast = bPrimary?.lastName.trim().toLowerCase() || '';
                            if (aLast !== bLast) return aLast.localeCompare(bLast);
                            const aFirst = aPrimary?.firstName.trim().toLowerCase() || '';
                            const bFirst = bPrimary?.firstName.trim().toLowerCase() || '';
                            return aFirst.localeCompare(bFirst);
                          })
                          .map(guest => {
                            const isSelected = recipientCustomIds.includes(guest.id);

                            // Build display name matching guest list format
                            const primary = guest.party.find(m => m.role === 'primary');
                            const companion = guest.party.find(m => m.role === 'companion');
                            const guestMember = guest.party.find(m => m.role === 'guest');

                            let displayName = '';
                            if (primary) {
                              displayName = `${primary.firstName.trim()} ${primary.lastName.trim()}`;
                            }

                            if (companion) {
                              displayName += ` & ${companion.firstName.trim()} ${companion.lastName.trim()}`;
                            } else if (guestMember) {
                              displayName += ' & Guest';
                            }

                            return (
                              <label key={guest.id} className="flex items-center gap-2 cursor-pointer">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setRecipientCustomIds(prev => [...prev, guest.id]);
                                    } else {
                                      setRecipientCustomIds(prev => prev.filter(id => id !== guest.id));
                                    }
                                  }}
                                />
                                <span className="text-sm">
                                  {displayName}  ({guest.email})
                                </span>
                              </label>
                            );
                          })}
                      </div>
                    )}

                    <div className="pt-2 border-t">
                      <p className="text-sm text-muted-foreground">
                        Emailing {recipientStats.emails} {recipientStats.emails === 1 ? 'Primary' : 'Primaries'} - {recipientStats.people} {recipientStats.people === 1 ? 'Person' : 'People'} Total (Companions & Guests)
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="group-email-subject">Subject</Label>
                    <Input
                      id="group-email-subject"
                      value={groupEmailSubject}
                      onChange={(e) => setGroupEmailSubject(e.target.value)}
                      placeholder="Wedding Update: Change of Venue"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="group-email-body">Message</Label>
                    <textarea
                      id="group-email-body"
                      value={groupEmailBody}
                      onChange={(e) => setGroupEmailBody(e.target.value)}
                      placeholder="Enter your message here..."
                      rows={8}
                      className="flex min-h-[120px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={handleSendGroupEmail}
                      disabled={groupEmailSending || !groupEmailSubject.trim() || !groupEmailBody.trim() || recipientStats.emails === 0}
                    >
                      {groupEmailSending ? 'Sending...' : 'Send Group Email'}
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            </Accordion>
          </AccordionContent>
        </AccordionItem>

        {/* RSVP Metrics Section */}
        <AccordionItem value="rsvp-metrics" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="font-medium">RSVP Metrics</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add events in the Event tab to start tracking RSVP progress.</p>
          ) : (
            <div className="space-y-4">
              {events.map((event) => {
                const counts = eventAttendanceStats[event.id] ?? { yes: 0, no: 0, pending: 0, dietary: 0, meal: undefined };
                const invited = counts.yes + counts.no + counts.pending;
                const rawCapacity = typeof event.capacity === 'number' && !Number.isNaN(event.capacity)
                  ? event.capacity
                  : undefined;
                const remaining = typeof rawCapacity === 'number' ? rawCapacity - invited : undefined;
                const metaLine = event.timeText || formatEventDateTime(event.startISO, eventTimeZone);
                const activeRosterStatus = rosterSelection?.eventId === event.id ? rosterSelection.status : null;
                const dietaryCount = counts.dietary ?? 0;

                type MetricTile = {
                  key: string;
                  label: string;
                  value: string;
                  hint?: string;
                  subtext?: string;
                  rosterStatus?: RosterStatus;
                };

                const rowOneMetrics: MetricTile[] = [];
                const rowTwoMetrics: MetricTile[] = [];

                if (typeof rawCapacity === 'number') {
                  rowOneMetrics.push({
                    key: 'invited-capacity',
                    label: 'Invited',
                    value: `${invited} / ${rawCapacity}`,
                    hint: remaining !== undefined
                      ? remaining >= 0
                        ? `${remaining} spots open`
                        : `${Math.abs(remaining)} over capacity`
                      : undefined,
                    rosterStatus: { type: 'invited' }
                  });
                } else {
                  rowOneMetrics.push({
                    key: 'invited-total',
                    label: 'Invited',
                    value: String(invited),
                    rosterStatus: { type: 'invited' }
                  });
                }

                rowOneMetrics.push(
                  { key: 'attending', label: 'Attending', value: String(counts.yes), rosterStatus: { type: 'attending' } },
                  { key: 'pending', label: 'Pending', value: String(counts.pending), rosterStatus: { type: 'pending' } },
                  { key: 'declined', label: 'Declined', value: String(counts.no), rosterStatus: { type: 'declined' } }
                );

                if (event.requiresMealSelection) {
                  const selectedMeals = counts.meal?.selected ?? 0;
                  const eligibleMeals = counts.meal?.eligible ?? 0;
                  const pendingMeals = counts.meal?.pending ?? Math.max(eligibleMeals - selectedMeals, 0);
                  rowTwoMetrics.push({
                    key: 'meals',
                    label: 'Meal Selections',
                    value: `${selectedMeals} / ${eligibleMeals}`,
                    subtext: pendingMeals > 0 ? `${pendingMeals} pending selections` : undefined,
                    rosterStatus: { type: 'meal-summary' }
                  });
                }

                if (event.collectDietaryNotes) {
                  rowTwoMetrics.push({
                    key: 'dietary',
                    label: 'Dietary Notes',
                    value: String(dietaryCount),
                    rosterStatus: { type: 'dietary' }
                  });
                }

                return (
                  <Collapsible
                    key={event.id}
                    open={Boolean(activeRosterStatus)}
                    onOpenChange={(open) => {
                      if (!open && rosterSelection?.eventId === event.id) {
                        setRosterSelection(null);
                      }
                    }}
                  >
                    <div className="rounded-lg border p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{event.label}</p>
                          {metaLine ? (
                            <p className="text-xs text-muted-foreground">{metaLine}</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                          {rowOneMetrics.map(({ key, label, value, hint, subtext, rosterStatus }) => {
                            const isActive = rosterStatus
                              ? rosterStatusesEqual(activeRosterStatus, rosterStatus)
                              : false;

                            const handleClick = () => {
                              if (!rosterStatus) {
                                return;
                              }
                              toggleRosterPanel(event.id, rosterStatus);
                            };

                            return (
                              <button
                                key={key}
                                type="button"
                                className={cn(
                                  'rounded-md border bg-background/60 p-3 text-left  shadow-sm',
                                  rosterStatus
                                    ? 'cursor-pointer hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                                    : 'cursor-default opacity-90',
                                  isActive && 'ring-2 ring-primary'
                                )}
                                onClick={handleClick}
                                disabled={!rosterStatus}
                                aria-pressed={rosterStatus ? isActive : undefined}
                              >
                                <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
                                <p className="mt-1 text-lg font-semibold">{value}</p>
                                {subtext ? (
                                  <p className="text-xs text-muted-foreground">{subtext}</p>
                                ) : null}
                                {hint ? (
                                  <p className="text-xs text-muted-foreground">{hint}</p>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                        {rowTwoMetrics.length > 0 ? (
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                            {rowTwoMetrics.map(({ key, label, value, hint, subtext, rosterStatus }) => {
                              const isActive = rosterStatus
                                ? isMealFamilyStatus(rosterStatus)
                                  ? isMealFamilyStatus(activeRosterStatus)
                                  : rosterStatusesEqual(activeRosterStatus, rosterStatus)
                                : false;

                              const handleClick = () => {
                                if (!rosterStatus) {
                                  return;
                                }
                                toggleRosterPanel(event.id, rosterStatus);
                              };

                              return (
                                <button
                                  key={key}
                                  type="button"
                                  className={cn(
                                    'rounded-md border bg-background/60 p-3 text-left  shadow-sm',
                                    rosterStatus
                                      ? 'cursor-pointer hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                                      : 'cursor-default opacity-90',
                                    isActive && 'ring-2 ring-primary'
                                  )}
                                  onClick={handleClick}
                                  disabled={!rosterStatus}
                                  aria-pressed={rosterStatus ? isActive : undefined}
                                >
                                  <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
                                  <p className="mt-1 text-lg font-semibold">{value}</p>
                                  {subtext ? (
                                    <p className="text-xs text-muted-foreground">{subtext}</p>
                                  ) : null}
                                  {hint ? (
                                    <p className="text-xs text-muted-foreground">{hint}</p>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>

                      <CollapsibleContent forceMount className="mt-4">
                        {activeRosterStatus ? renderRosterPanel(event, activeRosterStatus) : null}
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          )}
          </AccordionContent>
        </AccordionItem>

        {/* Guest List Section */}
        <AccordionItem value="guest-list" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="font-medium">Guest List</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <Accordion
              type="multiple"
              value={openGuestListSections}
              onValueChange={setOpenGuestListSections}
              className="space-y-4"
            >

            {/* Add Guest Section */}
            <AccordionItem value="add-guest" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  <span className="font-medium">Add Guest</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="seed-primary-first-name">Primary First Name</Label>
                <Input
                  id="seed-primary-first-name"
                  value={seedInviteForm.primaryGuest.firstName}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setSeedInviteForm((prev) => ({
                      ...prev,
                      primaryGuest: {
                        ...prev.primaryGuest,
                        firstName: event.target.value
                      }
                    }))}
                  placeholder="Alex"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="seed-primary-last-name">Primary Last Name</Label>
                <Input
                  id="seed-primary-last-name"
                  value={seedInviteForm.primaryGuest.lastName}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setSeedInviteForm((prev) => ({
                      ...prev,
                      primaryGuest: {
                        ...prev.primaryGuest,
                        lastName: event.target.value
                      }
                    }))}
                  placeholder="Rivera"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="seed-primary-email">Primary Email</Label>
                <Input
                  id="seed-primary-email"
                  type="email"
                  value={seedInviteForm.primaryGuest.email}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setSeedInviteForm((prev) => ({
                      ...prev,
                      primaryGuest: {
                        ...prev.primaryGuest,
                        email: event.target.value
                      }
                    }))}
                  placeholder="alex@example.com"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="seed-companion-first-name">Companion First Name</Label>
                <Input
                  id="seed-companion-first-name"
                  value={seedInviteForm.companion.firstName}
                  disabled={seedInviteForm.allowPlusOne}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    const nextValue = event.target.value;
                    setSeedInviteForm((prev) => {
                      const nextCompanion = { ...prev.companion, firstName: nextValue };
                      const companionPresent = hasCompanionDetails(nextCompanion);
                      return {
                        ...prev,
                        companion: nextCompanion,
                        allowPlusOne: companionPresent ? false : prev.allowPlusOne
                      };
                    });
                  }}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="seed-companion-last-name">Companion Last Name</Label>
                <Input
                  id="seed-companion-last-name"
                  value={seedInviteForm.companion.lastName}
                  disabled={seedInviteForm.allowPlusOne}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    const nextValue = event.target.value;
                    setSeedInviteForm((prev) => {
                      const nextCompanion = { ...prev.companion, lastName: nextValue };
                      const companionPresent = hasCompanionDetails(nextCompanion);
                      return {
                        ...prev,
                        companion: nextCompanion,
                        allowPlusOne: companionPresent ? false : prev.allowPlusOne
                      };
                    });
                  }}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2 md:flex md:flex-col md:justify-end">
                <Label htmlFor="seed-allow-plus-one" className="text-sm font-medium leading-none text-muted-foreground">
                  Unknown Guest
                </Label>
                <Button
                  id="seed-allow-plus-one"
                  type="button"
                  className={cn(
                    'h-10 rounded-md px-3 text-sm w-full border ',
                    seedInviteForm.allowPlusOne
                      ? 'bg-foreground text-background border-foreground hover:bg-foreground/90'
                      : 'bg-background text-foreground border-input hover:bg-muted',
                    hasCompanionDetails(seedInviteForm.companion) && 'bg-muted text-muted-foreground border-input hover:bg-muted cursor-not-allowed'
                  )}
                  onClick={() => {
                    if (hasCompanionDetails(seedInviteForm.companion)) {
                      return;
                    }
                    setSeedInviteForm((prev) => ({
                      ...prev,
                      allowPlusOne: !prev.allowPlusOne,
                      companion: !prev.allowPlusOne
                        ? { firstName: '', lastName: '' }
                        : prev.companion
                    }));
                  }}
                  disabled={hasCompanionDetails(seedInviteForm.companion)}
                >
                  {seedInviteForm.allowPlusOne ? 'Disable Guest' : 'Enable Guest'}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Event Access</Label>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Add events in the Event tab to control visibility.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {events.map((event) => {
                    const enabled = seedInviteForm.eventVisibility[event.id] === true;
                    return (
                      <Button
                        key={event.id}
                        type="button"
                        className={cn(
                          'h-9 rounded-lg px-4 text-xs font-semibold  border',
                          enabled
                            ? 'bg-foreground text-background border-foreground hover:bg-foreground/90'
                            : 'bg-muted text-muted-foreground border-transparent hover:bg-muted'
                        )}
                        onClick={() => {
                          setSeedInviteForm((prev) => ({
                            ...prev,
                            eventVisibility: {
                              ...ensureVisibility(prev.eventVisibility),
                              [event.id]: !enabled
                            }
                          }));
                        }}
                      >
                        {event.label}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSeedSubmit}
                disabled={isLoading || !isSeedInviteFormValid}
              >
                {inviteRequestMode === 'seed' ? 'Saving…' : 'Add Guest'}
              </Button>
            </div>
              </AccordionContent>
            </AccordionItem>

            {/* List Section */}
            <AccordionItem value="list" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span className="font-medium">List</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">

          {filteredDescription() && (
            <p className="text-xs text-muted-foreground">{filteredDescription()}</p>
          )}

          <div className="overflow-x-auto">
            <Table className="min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[45%]">Name</TableHead>
                  <TableHead className="w-[30%]">Email</TableHead>
                  <TableHead className="w-[10%] text-center">Events</TableHead>
                  <TableHead className="w-[7.5%] text-center">Resend</TableHead>
                  <TableHead className="w-[7.5%] text-center">Remove</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="space-y-3">
                        {[...Array(5)].map((_, index) => (
                          <Skeleton key={index} className="h-12 w-full" />
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && filteredGuests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      {events.length === 0
                        ? 'Add events to begin tracking invitations.'
                        : selectedEventId
                          ? 'No guests match the current filters.'
                          : 'Select an event to view guests.'}
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && sortedGuests.map((guest) => {
                  const displayName = getPartySummary(guest);
                  const email = guest.email;
                  const visibleEventCount = guest.invitedEvents?.length ?? 0;
                  const isExpanded = !!expandedRows[guest.id];

                  return (
                    <React.Fragment key={guest.id}>
                      <TableRow
                        id={`guest-row-${guest.id}`}
                        className={cn(focusedGuestId === guest.id && 'bg-primary/5 ')}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleRow(guest.id)}
                              aria-expanded={isExpanded}
                              aria-controls={`guest-details-${guest.id}`}
                              className="h-8 w-8 rounded-full border"
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                            <span className="font-medium text-foreground truncate" title={displayName || email}>{displayName || email}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <span className="block truncate" title={email}>{email}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          {visibleEventCount}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => canSendInvite && resendInvite(guest.id)}
                            aria-label="Resend invite"
                            disabled={!canSendInvite}
                            title={canSendInvite ? undefined : 'Update email subjects before resending invites'}
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteGuest(guest)}
                            aria-label="Remove guest"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={5} className="p-0 border-0" id={`guest-details-${guest.id}`}>
                            <div className="px-6 py-4">
                              <GuestDetail
                                guest={guest}
                                events={events}
                                auditEvents={auditLogs[guest.id]}
                                isLoading={auditLoading[guest.id] ?? false}
                                error={auditError[guest.id]}
                                eventTimeZone={eventTimeZone || 'UTC'}
                                onUpdateEventVisibility={(next) => updateEventVisibility(guest.id, next)}
                                onTogglePlusOne={(allow) => updateAllowPlusOne(guest.id, allow)}
                                onUpdateEventAttendance={(eventId: string, personId: string, status: 'yes' | 'no' | 'pending') =>
                                  updateEventAttendance(guest.id, eventId, personId, status)
                                }
                                onUpdateMealSelection={(eventId: string, personId: string, mealKey: string | null) =>
                                  updateMealSelection(guest.id, eventId, personId, mealKey)
                                }
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
              </AccordionContent>
            </AccordionItem>

            </Accordion>
          </AccordionContent>
        </AccordionItem>

      </Accordion>
    </div>
  );
}
