import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { toast } from 'sonner';
import { Users, Calendar, MoreHorizontal } from 'lucide-react';
import type { EventDetails as CanonicalEventDetails } from '@/types';
import { EventTabContent } from './EventTabContent';
import { GuestManagement, type InviteFormState, type Guest as AdminGuest } from './GuestManagement';
import { ThemeToggle } from './ThemeToggle';
import { ButtonGroup } from '../ui/button-group';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { adminFetch, isAdminAuthError } from './admin-auth';

type EventDetails = CanonicalEventDetails;

type ConfirmDialogState = { message: string; onConfirm: () => void } | null;
type InviteMode = 'email' | 'seed';

const createInviteFormDefaults = (events: EventDetails['events'] | undefined): InviteFormState => ({
  primaryGuest: {
    firstName: '',
    lastName: '',
    email: ''
  },
  companion: {
    firstName: '',
    lastName: ''
  },
  allowPlusOne: false,
  eventVisibility: (events ?? []).reduce<Record<string, boolean>>((acc, event) => {
    if (event && typeof event.id === 'string') {
      acc[event.id] = false;
    }
    return acc;
  }, {})
});

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('guests');
  const [guests, setGuests] = useState<AdminGuest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inviteRequestMode, setInviteRequestMode] = useState<InviteMode | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const defaultEvent: EventDetails = {
    schemaVersion: 6,
    siteTitle: '',
    heroHeadline: '',
    magicLinkEmailSubject: '',
    inviteEmailSubject: '',
    dateISO: new Date().toISOString(),
    timeZone: 'UTC',
    rsvpDeadlineISO: undefined,
    rsvpStatus: { mode: 'open' },

    events: [],
    accommodations: [],
    registry: [],
    localGuide: { eat: undefined, drink: undefined, see: undefined, do: undefined },
    transportationGuide: { planes: undefined, trains: undefined, automobiles: undefined }
  };
  const [eventDetails, setEventDetails] = useState<EventDetails>(defaultEvent);
  const [eventForm, setEventForm] = useState<EventDetails>(defaultEvent);
  const [eventDetailsLoaded, setEventDetailsLoaded] = useState(false);
  const [emailInviteForm, setEmailInviteForm] = useState<InviteFormState>(() => createInviteFormDefaults([]));
  const [seedInviteForm, setSeedInviteForm] = useState<InviteFormState>(() => createInviteFormDefaults([]));

  const resetEmailInviteForm = () => setEmailInviteForm(createInviteFormDefaults(eventDetails.events));
  const resetSeedInviteForm = () => setSeedInviteForm(createInviteFormDefaults(eventDetails.events));

  const handleLogout = () => {
    window.open('https://accounts.google.com/Logout', '_blank');
    window.location.href = '/cdn-cgi/access/logout';
  };

  const scrollRestoreRef = useRef<number | null>(null);

  useEffect(() => {
    if (scrollRestoreRef.current !== null && !isLoading) {
      const target = scrollRestoreRef.current;
      scrollRestoreRef.current = null;
      requestAnimationFrame(() => {
        window.scrollTo({ top: target, behavior: 'auto' });
      });
    }
  }, [guests, isLoading]);

  useEffect(() => {
    loadGuests();
    loadEventDetails();
  }, []);

  useEffect(() => {
    const events = eventDetails.events ?? [];

    // Update email invite form
    setEmailInviteForm((prev) => {
      const nextVisibility: Record<string, boolean> = {};
      for (const event of events) {
        if (event && typeof event.id === 'string') {
          nextVisibility[event.id] = prev.eventVisibility?.[event.id] === true;
        }
      }

      const prevVisibility = prev.eventVisibility ?? {};
      const same = Object.keys(nextVisibility).length === Object.keys(prevVisibility).length &&
        Object.keys(nextVisibility).every((key) => prevVisibility[key] === nextVisibility[key]);

      if (same) {
        return prev;
      }

      return {
        ...prev,
        eventVisibility: nextVisibility
      };
    });

    // Update seed invite form
    setSeedInviteForm((prev) => {
      const nextVisibility: Record<string, boolean> = {};
      for (const event of events) {
        if (event && typeof event.id === 'string') {
          nextVisibility[event.id] = prev.eventVisibility?.[event.id] === true;
        }
      }

      const prevVisibility = prev.eventVisibility ?? {};
      const same = Object.keys(nextVisibility).length === Object.keys(prevVisibility).length &&
        Object.keys(nextVisibility).every((key) => prevVisibility[key] === nextVisibility[key]);

      if (same) {
        return prev;
      }

      return {
        ...prev,
        eventVisibility: nextVisibility
      };
    });
  }, [eventDetails.events]);

  const getStringField = (value: unknown, key: string): string | undefined => {
    if (value && typeof value === 'object' && key in value) {
      const raw = (value as Record<string, unknown>)[key];
      return typeof raw === 'string' ? raw : undefined;
    }
    return undefined;
  };

  const getStringArrayField = (value: unknown, key: string): string[] => {
    if (value && typeof value === 'object' && key in value) {
      const raw = (value as Record<string, unknown>)[key];
      if (Array.isArray(raw)) {
        return raw.filter((item): item is string => typeof item === 'string');
      }
    }
    return [];
  };

  const loadGuests = useCallback(async (options?: { preserveScroll?: boolean }) => {
    if (options?.preserveScroll) {
      scrollRestoreRef.current = window.scrollY;
    }

    setIsLoading(true);
    try {
      const response = await adminFetch('/admin/guests');
      const guestData = await response.json() as AdminGuest[];
      setGuests(guestData);
    } catch (error) {
      if (isAdminAuthError(error)) {
        return;
      }
      console.error('Error loading guests:', error);
      toast.error('Failed to load guests');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendInvite = async (
    form: InviteFormState,
    options?: { mode?: InviteMode }
  ): Promise<boolean> => {
    const mode = options?.mode ?? 'email';
    const shouldSendEmail = mode !== 'seed';
    const trimmedFirstName = form.primaryGuest.firstName.trim();
    const trimmedLastName = form.primaryGuest.lastName.trim();
    const normalizedEmail = form.primaryGuest.email.trim().toLowerCase();

    if (!trimmedFirstName || !trimmedLastName || !normalizedEmail) {
      toast.error('Please fill in all fields');
      return false;
    }

    const companionFirst = form.companion.firstName.trim();
    const companionLast = form.companion.lastName.trim();
    const companion = companionFirst || companionLast
      ? { firstName: companionFirst, lastName: companionLast }
      : undefined;

    const visibility: Record<string, boolean> = {};
    for (const event of eventDetails.events ?? []) {
      if (event && typeof event.id === 'string') {
        visibility[event.id] = form.eventVisibility?.[event.id] === true;
      }
    }

    const payload = {
      primaryGuest: {
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        email: normalizedEmail
      },
      allowPlusOne: companion ? false : form.allowPlusOne === true,
      eventVisibility: visibility,
      ...(companion ? { companion } : {}),
      ...(shouldSendEmail ? {} : { sendEmail: false })
    };

    setInviteRequestMode(mode);
    setIsLoading(true);
    try {
      const response = await adminFetch('/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const responseClone = response.clone();
      const result = await response.json().catch(() => null);
      const successMessage = getStringField(result, 'message');
      const errorDetail = getStringField(result, 'error');

      if (response.ok) {
        const fallbackMessage = shouldSendEmail
          ? 'Invite sent successfully'
          : 'Guest added without sending email';
        toast.success(successMessage ?? fallbackMessage);
        await loadGuests();
        return true;
      }

      const fallbackText = await responseClone.text();
      const details = errorDetail ?? (fallbackText || undefined);
      const action = shouldSendEmail ? 'send email invite' : 'add guest';
      toast.error(`Failed to ${action}: ${details ?? 'Unknown error'}`);
      return false;
    } catch (error) {
      if (isAdminAuthError(error)) {
        return false;
      }
      toast.error(shouldSendEmail ? 'Failed to send email invite' : 'Failed to add guest');
      return false;
    } finally {
      setIsLoading(false);
      setInviteRequestMode(null);
    }
  };

  const canSendEmailCopy = Boolean(
    eventForm.magicLinkEmailSubject?.trim() && eventForm.inviteEmailSubject?.trim()
  );

  const resendInvite = async (guestId: number) => {
    if (!canSendEmailCopy) {
      toast.error('Update email subjects before resending invites');
      return;
    }

    setConfirmDialog({
      message: 'Resend invite to this guest?',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const response = await adminFetch('/admin/guests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'resend', guestId }),
          });
          const responseClone = response.clone();
          const result = await response.json().catch(() => null);
          const successMessage = getStringField(result, 'message');
          const errorDetail = getStringField(result, 'error');

          if (response.ok) {
            toast.success(successMessage ?? 'Invite resent successfully');
            await loadGuests({ preserveScroll: true });
          } else {
            const fallbackText = await responseClone.text();
            const details = errorDetail ?? (fallbackText || undefined);
            toast.error(`Failed to resend invite: ${details ?? 'Unknown error'}`);
          }
        } catch (error) {
          if (isAdminAuthError(error)) {
            return;
          }
          toast.error('Failed to resend invite');
        }
      }
    });
  };

  const getGuestDisplayName = (guest: AdminGuest): string => {
    const names = guest.party
      ?.map(member => [member.firstName.trim(), member.lastName.trim()].filter(Boolean).join(' ').trim())
      .filter(Boolean);
    if (names && names.length > 0) {
      return names.join(' & ');
    }
    return guest.email || 'Guest';
  };

  const deleteGuest = (guest: AdminGuest) => {
    const displayName = getGuestDisplayName(guest);
    setConfirmDialog({
      message: `Remove invite for ${displayName}? This revokes any existing access and RSVP data.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const response = await adminFetch('/admin/guests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', guestId: guest.id }),
          });
          const responseClone = response.clone();
          const result = await response.json().catch(() => null);
          const errorDetail = getStringField(result, 'error');

          if (response.ok) {
            toast.success('Guest removed');
            await loadGuests({ preserveScroll: true });
          } else {
            const fallbackText = await responseClone.text();
            const details = errorDetail ?? (fallbackText || undefined);
            toast.error(`Failed to remove guest: ${details ?? 'Unknown error'}`);
          }
        } catch (error) {
          if (isAdminAuthError(error)) {
            return;
          }
          toast.error('Failed to remove guest');
        }
      }
    });
  };

  const updateGuestVisibility = async (guestId: number, visibility: Record<string, boolean>) => {
    try {
      const response = await adminFetch('/admin/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateEventVisibility',
          guestId,
          visibility
        }),
      });

      if (response.ok) {
        await loadGuests({ preserveScroll: true });
      }
    } catch (error) {
      if (isAdminAuthError(error)) {
        return;
      }
      console.error('Error updating permissions:', error);
    }
  };

  const updateGuestAllowPlusOne = async (guestId: number, allowPlusOne: boolean) => {
    try {
      const response = await adminFetch('/admin/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          guestId,
          updates: { allowPlusOne }
        }),
      });

      if (response.ok) {
        await loadGuests({ preserveScroll: true });
      }
    } catch (error) {
      if (isAdminAuthError(error)) {
        return;
      }
      console.error('Error updating plus one status:', error);
    }
  };

  const updateGuestEventAttendance = async (
    guestId: number,
    eventId: string,
    personId: string | undefined,
    status: 'yes' | 'no' | 'pending'
  ) => {
    try {
      const response = await adminFetch('/admin/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateEventAttendance',
          guestId,
          attendance: { eventId, personId, status }
        })
      });

      if (response.ok) {
        await loadGuests({ preserveScroll: true });
      }
    } catch (error) {
      if (isAdminAuthError(error)) {
        return;
      }
      console.error('Error updating event attendance:', error);
    }
  };

  const updateGuestMealSelection = async (
    guestId: number,
    eventId: string,
    personId: string,
    mealKey: string | null
  ) => {
    const response = await adminFetch('/admin/guests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updateMealSelection',
        guestId,
        meal: { eventId, personId, mealKey }
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update meal selection');
    }

    await loadGuests({ preserveScroll: true });
  };

  const loadEventDetails = async () => {
    try {
      const response = await adminFetch('/admin/event');
      if (response.ok) {
        const data = await response.json() as EventDetails;
        setEventDetails(data);
        setEventForm(data);
      }
    } catch (error) {
      if (isAdminAuthError(error)) {
        return;
      }
      console.error('Error loading event details:', error);
    } finally {
      setEventDetailsLoaded(true);
    }
  };

  const saveEventDetails = async () => {
    setIsLoading(true);
    try {
      const response = await adminFetch('/admin/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventForm)
      });

      if (response.ok) {
        toast.success('Event details updated successfully');
        setEventDetails(eventForm);
      } else {
        let msg = 'Failed to update event details';
        try {
          const err = await response.json().catch(() => null);
          const errors = getStringArrayField(err, 'errors');
          if (errors.length) {
            msg = `Fix these: ${errors.slice(0, 4).join('; ')}`;
          }
        } catch {}
        toast.error(msg);
      }
    } catch (error) {
      if (isAdminAuthError(error)) {
        return;
      }
      toast.error('Failed to update event details');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" data-react-hydrated="true">


      <div className="container mx-auto space-y-6 p-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Admin Console</h1>
          <div className="flex items-center gap-2">
            <ButtonGroup>
              <ThemeToggle />
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Open admin options"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-24 p-1.5">
                  <Button variant="ghost" className="w-full justify-start" onClick={handleLogout}>
                    Log out
                  </Button>
                </PopoverContent>
              </Popover>
            </ButtonGroup>
          </div>
        </div>

        <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 w-full">
            <TabsList>
              <TabsTrigger value="guests">
                <Users className="mr-2 h-4 w-4" />
                Guests
              </TabsTrigger>
              <TabsTrigger value="event">
                <Calendar className="mr-2 h-4 w-4" />
                Event
              </TabsTrigger>
            </TabsList>

          <TabsContent value="guests" className="w-full">
            <GuestManagement
              guests={guests}
              isLoading={isLoading}
              events={eventDetails.events ?? []}
              eventTimeZone={eventDetails.timeZone}
              emailInviteForm={emailInviteForm}
              setEmailInviteForm={setEmailInviteForm}
              resetEmailInviteForm={resetEmailInviteForm}
              seedInviteForm={seedInviteForm}
              setSeedInviteForm={setSeedInviteForm}
              resetSeedInviteForm={resetSeedInviteForm}
              sendInvite={sendInvite}
              inviteRequestMode={inviteRequestMode}
              resendInvite={resendInvite}
              deleteGuest={deleteGuest}
              updateEventVisibility={updateGuestVisibility}
              updateAllowPlusOne={updateGuestAllowPlusOne}
              updateEventAttendance={updateGuestEventAttendance}
              updateMealSelection={updateGuestMealSelection}
              eventDetailsLoaded={eventDetailsLoaded}
              emailSubjects={{
                magicLinkSubject: eventForm.magicLinkEmailSubject ?? '',
                inviteSubject: eventForm.inviteEmailSubject ?? ''
              }}
              onEmailSubjectsChange={({ magicLinkSubject, inviteSubject }) => {
                setEventForm((prev) => ({
                  ...prev,
                  magicLinkEmailSubject: magicLinkSubject,
                  inviteEmailSubject: inviteSubject
                }));
              }}
              saveEmailSubjects={saveEventDetails}
            />
          </TabsContent>

          <TabsContent value="event" className="relative w-full">
            <EventTabContent
              eventDetails={eventDetails}
              eventForm={eventForm}
              setEventForm={setEventForm}
              saveEventDetails={saveEventDetails}
              isLoading={isLoading}
            />
          </TabsContent>
          </Tabs>
        </div>
      </div>

      {confirmDialog && (
        <AlertDialog open={!!confirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Action</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmDialog.message}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmDialog(null)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={confirmDialog.onConfirm}>
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
