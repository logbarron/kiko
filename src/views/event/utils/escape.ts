const escapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
};

export function escapeHtml(text: string | undefined | null): string {
  if (text === undefined || text === null || text === '') {
    return '';
  }

  return String(text).replace(/[&<>"']/g, char => escapeMap[char]);
}
