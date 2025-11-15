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

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
    slashCount++;
  }
  return slashCount % 2 === 1;
}

function findClosingBracket(text: string, startIndex: number): number {
  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === ']' && !isEscaped(text, i)) {
      return i;
    }
  }
  return -1;
}

function findClosingParenthesis(text: string, startIndex: number): number {
  let depth = 1;
  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];
    if ((char === '(' || char === ')') && isEscaped(text, i)) {
      continue;
    }
    if (char === '(') {
      depth++;
      continue;
    }
    if (char === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function replaceMarkdownLinks(
  input: string,
  onLink: (linkText: string, linkUrl: string, rawMatch: string) => string
): string {
  let cursor = 0;
  let output = '';

  while (cursor < input.length) {
    const openBracket = input.indexOf('[', cursor);
    if (openBracket === -1) {
      output += input.slice(cursor);
      break;
    }

    if (isEscaped(input, openBracket)) {
      output += input.slice(cursor, openBracket + 1);
      cursor = openBracket + 1;
      continue;
    }

    const closeBracket = findClosingBracket(input, openBracket + 1);
    if (closeBracket === -1) {
      output += input.slice(cursor);
      break;
    }

    const openParen = closeBracket + 1;
    if (
      openParen >= input.length ||
      input[openParen] !== '(' ||
      isEscaped(input, openParen)
    ) {
      output += input.slice(cursor, openParen);
      cursor = openParen;
      continue;
    }

    const closeParen = findClosingParenthesis(input, openParen + 1);
    if (closeParen === -1) {
      output += input.slice(cursor);
      break;
    }

    output += input.slice(cursor, openBracket);

    const linkText = input.slice(openBracket + 1, closeBracket);
    const linkUrl = input.slice(openParen + 1, closeParen);
    const rawMatch = input.slice(openBracket, closeParen + 1);
    output += onLink(linkText, linkUrl, rawMatch);

    cursor = closeParen + 1;
  }

  return output;
}

function formatInline(text: string): string {
  // Store processed links in an array
  const links: string[] = [];

  // Extract links and replace with simple placeholders
  const linkReplaced = replaceMarkdownLinks(text, (linkText, linkUrl, rawMatch) => {
    const url = linkUrl.trim();
    if (!isAllowedUrl(url)) {
      // If URL is dangerous, just return the escaped original text
      return escapeHtml(rawMatch);
    }

    const normalizedUrl = normalizeUrl(url);
    const escapedUrl = escapeHtml(normalizedUrl);

    // Escape the link text FIRST to neutralize any HTML, THEN apply markdown formatting
    const escapedText = escapeHtml(linkText);

    // Now process markdown formatting - the content is safe, and we're adding safe HTML tags
    let formattedText = escapedText;
    formattedText = formattedText
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>');
    formattedText = formattedText.replace(/==(.+?)==/g, '<span class="gold">$1</span>');
    formattedText = formattedText
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>');
    formattedText = formattedText.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Don't escape again - content is already safe, tags are intentional HTML

    // Store the complete link HTML
    const linkHtml = `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer">${formattedText}</a>`;
    const index = links.length;
    links.push(linkHtml);

    // Return a unique placeholder that won't match markdown patterns or get stripped
    return `{{MDLINK${index}}}`;
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

  // Finally, restore links from the array
  // {{MDLINK0}} passes through escapeHtml unchanged (only & < > " ' are escaped)
  const final = backtickReplaced.replace(/\{\{MDLINK(\d+)\}\}/g, (match, index) => {
    return links[parseInt(index, 10)] || match;
  });

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
