import { escapeHtml } from './escape';

type ListState = 'none' | 'ul' | 'ol';

function unescapeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function isAllowedUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:') ||
    trimmed.startsWith('file:')
  ) {
    return false;
  }
  return true;
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();

  // If it already has a protocol, return as-is
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return trimmed;
  }

  // If it looks like a domain (contains a dot and no slashes at the start), prepend https://
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  // Otherwise, return as-is (relative URLs, etc.)
  return trimmed;
}

function formatInline(text: string): string {
  // Process links FIRST, before any HTML escaping
  // This allows us to handle formatting inside link text and URLs separately
  const linkReplaced = text.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, (match, linkText, linkUrl) => {
    const url = linkUrl.trim();
    if (!isAllowedUrl(url)) {
      // Return escaped original text if URL is dangerous
      return escapeHtml(match);
    }

    const normalizedUrl = normalizeUrl(url);
    const escapedUrl = escapeHtml(normalizedUrl);

    // Process markdown formatting inside link text, then escape
    let formattedText = linkText;
    formattedText = formattedText
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>');
    formattedText = formattedText.replace(/==(.+?)==/g, '<span class="gold">$1</span>');
    formattedText = formattedText
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>');
    formattedText = formattedText.replace(/`([^`]+)`/g, '<code>$1</code>');

    const escapedLinkText = escapeHtml(formattedText);

    // Use a placeholder that won't be affected by subsequent processing
    return `__LINK__${escapedUrl}__TEXT__${escapedLinkText}__ENDLINK__`;
  });

  // Now escape all remaining HTML (non-link content)
  const escaped = escapeHtml(linkReplaced);

  // Process remaining markdown formatting (outside of links)
  const boldReplaced = escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>');

  const highlightReplaced = boldReplaced.replace(/==(.+?)==/g, '<span class="gold">$1</span>');

  const italicReplaced = highlightReplaced
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>');

  const backtickReplaced = italicReplaced.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Finally, restore links from placeholders
  const final = backtickReplaced.replace(/__LINK__(.+?)__TEXT__(.+?)__ENDLINK__/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>');

  return final;
}

export function renderRichTextBlock(input: string | undefined | null): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed) return '';
  return `<div class="rich-text">${renderRichText(trimmed)}</div>`;
}

export function renderRichTextInline(input: string | undefined | null): string {
  if (!input) return '';
  const lines = input.split(/\r?\n/);
  return lines.map(line => formatInline(line)).join('<br>');
}

function closeList(state: ListState, buffer: string[]): ListState {
  if (state === 'ul') {
    buffer.push('</ul>');
  } else if (state === 'ol') {
    buffer.push('</ol>');
  }
  return 'none';
}

export function renderRichText(input: string): string {
  const lines = input.split(/\r?\n/);
  const output: string[] = [];

  let listState: ListState = 'none';
  let inParagraph = false;

  const closeParagraph = () => {
    if (inParagraph) {
      output.push('</p>');
      inParagraph = false;
    }
  };

  const startList = (type: 'ul' | 'ol') => {
    if (listState !== type) {
      listState = closeList(listState, output);
      output.push(type === 'ul' ? '<ul class="rich-list">' : '<ol class="rich-list">');
      listState = type;
    }
  };

  const startParagraph = () => {
    if (!inParagraph) {
      listState = closeList(listState, output);
      output.push('<p>');
      inParagraph = true;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeParagraph();
      listState = closeList(listState, output);
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const [, hashes, text] = headingMatch;
      const level = Math.min(hashes.length + 3, 6);
      closeParagraph();
      listState = closeList(listState, output);
      output.push(`<h${level}>${formatInline(text.trim())}</h${level}>`);
      continue;
    }

    const numberedHeading = line.match(/^(\d+)\s{2,}(.*)$/);
    if (numberedHeading) {
      const [, , text] = numberedHeading;
      closeParagraph();
      listState = closeList(listState, output);
      output.push(`<h4>${formatInline(text.trim())}</h4>`);
      continue;
    }

    const orderedMatch = line.match(/^(\d+)[\.)]\s+(.*)$/);
    if (orderedMatch) {
      const [, , itemText] = orderedMatch;
      closeParagraph();
      startList('ol');
      output.push(`<li>${formatInline(itemText.trim())}</li>`);
      continue;
    }

    const bulletMatch = line.match(/^[\u2022\-\*]\s+(.*)$/);
    if (bulletMatch) {
      const [, itemText] = bulletMatch;
      closeParagraph();
      startList('ul');
      output.push(`<li>${formatInline(itemText.trim())}</li>`);
      continue;
    }

    startParagraph();
    output.push(formatInline(line));
  }

  closeParagraph();
  closeList(listState, output);

  return output.join('');
}
