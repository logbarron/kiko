type RequestWithHeaders = {
  headers: {
    get(name: string): string | null;
  };
  url?: string;
};

export function isAllowedOrigin(request: RequestWithHeaders, baseUrl: string): boolean {
  try {
    const allowed = new URL(baseUrl);

    const originHeader = request.headers.get('Origin');
    if (originHeader) {
      const incoming = new URL(originHeader);
      if (incoming.origin === allowed.origin) {
        return true;
      }
    }

    const referer = request.headers.get('Referer');
    if (referer) {
      const incoming = new URL(referer);
      if (incoming.origin === allowed.origin) {
        return true;
      }
    }

    const fetchSite = request.headers.get('Sec-Fetch-Site');
    if (fetchSite === 'same-origin' || fetchSite === 'none') {
      return true;
    }

    if (request.url) {
      const incoming = new URL(request.url);
      if (incoming.origin === allowed.origin) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
