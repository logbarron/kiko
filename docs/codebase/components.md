# Source Code - React Components

React 19 components using Radix UI primitives and Tailwind CSS. All components are TypeScript with strict mode enabled.

---

### Component Architecture

**Admin Components** (`src/components/admin/`):
- Complex interactive dashboard with full React hydration
- Uses Radix UI primitives for accessibility
- State management via React hooks (useState, useEffect, useCallback)
- Optimistic UI updates with rollback on error

**UI Primitives** (`src/components/ui/`):
- Shadcn UI components (Radix + Tailwind)
- Reusable across admin dashboard
- Variants defined with `class-variance-authority`

---

### src/components/admin/AdminDashboard.tsx

**Purpose**: Main admin dashboard container with tab navigation.

**Key Features**:
- **Tabs**: Guests, Event (2 tabs total)
- **State Management**: React hooks for guests, event details, audit events
- **API Integration**: Fetches and updates data via `/admin/*` endpoints
- **Error Handling**: Toast notifications for success/failure
- **Optimistic UI**: Immediate updates with server sync

**Key Hooks**:
- `useState`: Manages active tab, loading states, dialog state
- `useEffect`: Fetches initial data on mount
- `useCallback`: Memoizes event handlers to prevent re-renders

**Child Components**:
- `GuestManagement`: Guest list CRUD operations
- `EventTabContent`: Event configuration form
- `ThemeToggle`: Dark mode toggle
- `AlertDialog`: Confirmation dialogs for destructive actions

**API Endpoints Used**:
- `GET /admin/guests`: Fetch all guests with profiles and stats
- `POST /admin/guests`: Multi-action handler (update, resend, updateEventVisibility, updateEventAttendance, updateMealSelection, delete)
- `GET /admin/event`: Fetch event configuration
- `POST /admin/event`: Update event configuration
- `POST /admin/invite`: Seed new guest with invitation
- `POST /admin/group-email`: Send bulk emails
- `GET /admin/audit`: Fetch audit log

---

### src/components/admin/GuestManagement.tsx

**Purpose**: Guest list table with add/edit/delete operations.

**Key Features**:
- **Table View**: Sortable columns (name, email, RSVP status, invited events)
- **Search**: Filter guests by name or email
- **Bulk Actions**: Send invitations to multiple guests
- **Edit Modal**: Inline editing of guest profiles
- **Party Members**: Add/remove party members (companion, guest roles)
- **Event Invitations**: Toggle which events each guest is invited to

**Key State**:
- `guests`: Array of guest records
- `selectedGuestIds`: Set of IDs for bulk actions
- `editingGuest`: Guest being edited (null when not editing)
- `inviteFormState`: Form data for new guest creation

**Validation**:
- Email format validation
- Required fields enforcement
- Person ID uniqueness check
- Invited events must exist in event configuration

**UI Components Used**:
- `Table`: Guest list display
- `Checkbox`: Multi-select for bulk actions
- `Button`: Action buttons (add, edit, delete, invite)
- `Input`: Text fields for guest data
- `Select`: Dropdown for event selection
- `AlertDialog`: Delete confirmation

---

### src/components/admin/EventTabContent.tsx

**Purpose**: Event configuration form with multi-event support.

**Key Features**:
- **Site Settings**: Title, date, timezone
- **Multi-Event Support**: Add/remove multiple events (ceremony, reception, etc.)
- **Venue Information**: Address, city, state, zip, country per event
- **Schedule**: Start/end times, date per event
- **Meal Options**: Configure meal choices per event
- **Registry Links**: Add/remove registry URLs
- **Accommodations**: Hotel name, address, booking URL

**Key State**:
- `eventDetails`: Event configuration object
- `isDirty`: Tracks unsaved changes
- `isSaving`: Loading state during save

**Validation**:
- Date format: ISO 8601 (YYYY-MM-DD)
- Time format: HH:MM
- Timezone: IANA timezone database
- URL format: HTTP/HTTPS only
- Event IDs must be unique

**UI Components Used**:
- `Tabs`: Organize events into tabs
- `Input`: Text fields for event data
- `DatePicker`: Calendar widget for date selection
- `Select`: Timezone and meal option dropdowns
- `Button`: Save/cancel actions
- `Card`: Section containers

**Schema Migration**:
- Handles legacy event formats (version 1-5)
- Normalizes data on save
- Shows warning if normalization mutates data

---

### src/components/admin/ThemeToggle.tsx

**Purpose**: Dark mode toggle button for admin dashboard.

**Key Features**:
- Uses `next-themes` ThemeProvider for theme management
- Persists theme preference to localStorage
- Applies `.dark` class to `<html>` element (via next-themes `attribute="class"`)
- Icon changes based on theme (sun/moon)

**Storage Key**: `admin-theme` (values: `'light'`, `'dark'`, `'system'`)

Note: Guest pages use a separate theme system with `guest-theme` storage key and `body[data-theme]` attribute.

---

### src/components/ui/*

**Purpose**: Reusable Radix UI primitives styled with Tailwind CSS.

**Components**:
- `accordion.tsx`: Collapsible sections
- `alert-dialog.tsx`: Modal confirmation dialogs
- `badge.tsx`: Status indicators
- `button.tsx`: Buttons with variants (default, destructive, outline, ghost, link)
- `button-group.tsx`: Grouped button sets
- `calendar.tsx`: Date picker calendar
- `card.tsx`: Content containers
- `checkbox.tsx`: Toggle checkboxes
- `collapsible.tsx`: Expandable content
- `date-picker.tsx`: Date selection widget
- `input.tsx`: Text input fields
- `label.tsx`: Form labels
- `popover.tsx`: Floating tooltips
- `select.tsx`: Dropdown menus
- `separator.tsx`: Horizontal dividers
- `skeleton.tsx`: Loading placeholders
- `sonner.tsx`: Toast notifications (via Sonner library)
- `switch.tsx`: Toggle switches
- `table.tsx`: Data tables
- `tabs.tsx`: Tab navigation
- `textarea.tsx`: Multi-line text inputs

**Variant System**:
- Uses `class-variance-authority` for variant management
- Variants: size (sm, default, lg), style (default, destructive, outline, ghost, link)
- Tailwind utilities composed with `cn()` helper

**Accessibility**:
- ARIA labels and roles
- Keyboard navigation support
- Focus management
- Screen reader compatibility

**Dark Mode**:
- CSS variables for theme colors
- Applies dark variants via `dark:` Tailwind prefix
- Admin: Theme toggle updates `html.dark` class (via next-themes)
- Guest pages: Use `body[data-theme="dark"]` attribute (vanilla JS)
