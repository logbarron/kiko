import { toast } from 'sonner';

export class AdminAuthError extends Error {
  constructor(message: string = 'Admin authentication required') {
    super(message);
    this.name = 'AdminAuthError';
  }
}

export const isAdminAuthError = (error: unknown): error is AdminAuthError => {
  if (error instanceof AdminAuthError) {
    return true;
  }

  return Boolean(
    error &&
      typeof error === 'object' &&
      'name' in error &&
      (error as { name?: unknown }).name === 'AdminAuthError'
  );
};

type ReauthOptions = {
  message?: string;
  redirectTo?: string;
  autoRedirectMs?: number;
};

const DEFAULT_MESSAGE =
  'Your admin session ended or your access changed. Please log in again.';
const DEFAULT_REDIRECT = '/admin';
const LOOP_KEY = 'admin:reauth-at';
const LOOP_WINDOW_MS = 15_000;

let reauthInProgress = false;

const getPathname = (url: string): string | null => {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
};

export const isAdminAuthFailureResponse = (response: Response): boolean => {
  if (response.status === 401 || response.status === 403) {
    return true;
  }

  const pathname = getPathname(response.url);
  if (!pathname) {
    return false;
  }

  return pathname.startsWith('/cdn-cgi/access/');
};

export const startAdminReauth = (options: ReauthOptions = {}): void => {
  if (typeof window === 'undefined') {
    return;
  }

  if (reauthInProgress) {
    return;
  }
  reauthInProgress = true;

  const now = Date.now();
  let recentlyRedirected = false;

  try {
    const lastRaw = window.sessionStorage.getItem(LOOP_KEY);
    const last = lastRaw ? Number.parseInt(lastRaw, 10) : 0;
    recentlyRedirected = Number.isFinite(last) && now - last < LOOP_WINDOW_MS;
    window.sessionStorage.setItem(LOOP_KEY, String(now));
  } catch {
    // sessionStorage may be blocked; ignore.
  }

  toast.error(
    recentlyRedirected
      ? 'Unable to verify your admin session right now. Please try again shortly.'
      : options.message ?? DEFAULT_MESSAGE
  );

  if (recentlyRedirected) {
    return;
  }

  const redirectTo = options.redirectTo ?? DEFAULT_REDIRECT;
  const delay = options.autoRedirectMs ?? 800;

  window.setTimeout(() => {
    window.location.assign(redirectTo);
  }, delay);
};

export async function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);

  if (isAdminAuthFailureResponse(response)) {
    startAdminReauth();
    throw new AdminAuthError();
  }

  return response;
}

