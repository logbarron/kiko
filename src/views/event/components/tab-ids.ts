const SAFE_SEGMENT_FALLBACK = 'segment';

const sanitizeSegment = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || SAFE_SEGMENT_FALLBACK;
};

export const buildTabIds = (prefix: string, value: string | number) => {
  const safePrefix = sanitizeSegment(prefix);
  const safeValue = sanitizeSegment(String(value));

  return {
    tabId: `${safePrefix}-tab-${safeValue}`,
    panelId: `${safePrefix}-panel-${safeValue}`
  };
};
