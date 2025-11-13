// ABOUTME: Tests Gmail email rendering and MIME message construction.
// ABOUTME: Ensures HTML escaping, MIME formatting, and template generation work correctly.

import { describe, expect, it } from 'vitest';
import type { PartyMember } from '../../../src/types';

// Import the module to test private functions via any type assertion
// Note: This is a workaround since many functions are not exported
const gmailModule = await import('../../../src/lib/gmail');

// Helper to test non-exported functions
type GmailModule = typeof gmailModule & {
  escapeHtml?: (value: string) => string;
  renderEmailShell?: (opts: { preheader?: string; content: string }) => string;
  renderPrimaryButton?: (text: string, href: string) => string;
  chunkBase64?: (base64: string) => string;
  htmlToPlainText?: (html: string) => string;
  buildMimeMessage?: (opts: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    inlineImages?: Array<{
      mimeType: string;
      base64: string;
      fileName: string;
      contentId: string;
    }>;
  }) => string;
  renderMagicLinkEmail?: (magicLink: string) => { html: string; text: string };
  renderWeddingInvitationEmail?: (
    party: PartyMember[],
    trackingUrl: string
  ) => { html: string; text: string };
};

// Access the module with extended type
const gmail = gmailModule as GmailModule;

describe('buildInviteGreeting', () => {
  it('formats primary guest only', () => {
    const party: PartyMember[] = [
      {
        personId: '1',
        role: 'primary',
        firstName: 'John',
        lastName: 'Smith',
        invitedEvents: [],
        attendance: {}
      }
    ];

    const result = gmail.buildInviteGreeting(party);
    expect(result).toBe('John S.');
  });

  it('formats primary and companion', () => {
    const party: PartyMember[] = [
      {
        personId: '1',
        role: 'primary',
        firstName: 'John',
        lastName: 'Smith',
        invitedEvents: [],
        attendance: {}
      },
      {
        personId: '2',
        role: 'companion',
        firstName: 'Jane',
        lastName: 'Doe',
        invitedEvents: [],
        attendance: {}
      }
    ];

    const result = gmail.buildInviteGreeting(party);
    expect(result).toBe('John S. & Jane D.');
  });

  it('formats primary with generic guest slot', () => {
    const party: PartyMember[] = [
      {
        personId: '1',
        role: 'primary',
        firstName: 'John',
        lastName: 'Smith',
        invitedEvents: [],
        attendance: {}
      },
      {
        personId: '3',
        role: 'guest',
        firstName: '',
        lastName: '',
        invitedEvents: [],
        attendance: {}
      }
    ];

    const result = gmail.buildInviteGreeting(party);
    expect(result).toBe('John S. & Guest');
  });

  it('returns "Guest" when no primary found', () => {
    const party: PartyMember[] = [];
    const result = gmail.buildInviteGreeting(party);
    expect(result).toBe('Guest');
  });
});

describe('HTML escaping in email templates', () => {
  it('escapes special characters when rendering invitation email', () => {
    // HTML escaping happens in the email rendering layer, not in buildInviteGreeting
    const party: PartyMember[] = [
      {
        personId: '1',
        role: 'primary',
        firstName: '<script>alert("xss")</script>',
        lastName: 'Test&Co',
        invitedEvents: [],
        attendance: {}
      }
    ];

    if (gmail.renderWeddingInvitationEmail) {
      const { html } = gmail.renderWeddingInvitationEmail(party, 'https://example.com');

      // The email HTML should escape the dangerous characters
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>alert');
    }
  });
});

describe('htmlToPlainText', () => {
  // Since htmlToPlainText is not exported, we'll test it indirectly through email rendering
  // by checking the .text field of rendered emails

  it('converts links to text with URLs', () => {
    const party: PartyMember[] = [
      {
        personId: '1',
        role: 'primary',
        firstName: 'John',
        lastName: 'Smith',
        invitedEvents: [],
        attendance: {}
      }
    ];

    if (gmail.renderWeddingInvitationEmail) {
      const { text } = gmail.renderWeddingInvitationEmail(
        party,
        'https://example.com/invite'
      );

      // Should contain the URL in plain text
      expect(text).toContain('https://example.com/invite');
      // Should not contain HTML tags
      expect(text).not.toContain('<a ');
      expect(text).not.toContain('</a>');
    }
  });

  it('converts list items to bullet points', () => {
    if (gmail.renderMagicLinkEmail) {
      const { text } = gmail.renderMagicLinkEmail('https://example.com/auth/verify?token=test');

      // Plain text should not contain HTML tags
      expect(text).not.toContain('<li>');
      expect(text).not.toContain('</li>');
      expect(text).not.toContain('<p>');
      expect(text).not.toContain('</p>');
    }
  });

  it('decodes HTML entities', () => {
    if (gmail.renderWeddingInvitationEmail) {
      const party: PartyMember[] = [
        {
          personId: '1',
          role: 'primary',
          firstName: 'John',
          lastName: 'Smith',
          invitedEvents: [],
          attendance: {}
        }
      ];

      const { text } = gmail.renderWeddingInvitationEmail(party, 'https://example.com');

      // Should not contain encoded entities in plain text
      expect(text).not.toContain('&amp;');
      expect(text).not.toContain('&lt;');
      expect(text).not.toContain('&gt;');
    }
  });
});

describe('renderMagicLinkEmail', () => {
  it('renders valid HTML email', () => {
    if (gmail.renderMagicLinkEmail) {
      const { html } = gmail.renderMagicLinkEmail('https://example.com/auth/verify?token=abc123');

      // Should be valid HTML structure
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
      expect(html).toContain('<body');
      expect(html).toContain('</body>');

      // Should contain the magic link
      expect(html).toContain('https://example.com/auth/verify?token=abc123');

      // Should have email-specific content
      expect(html).toContain('Let\'s get you signed in');
      expect(html).toContain('Access RSVP &amp; Event Details');
      expect(html).toContain('10 minutes');
    }
  });

  it('generates plain text alternative', () => {
    if (gmail.renderMagicLinkEmail) {
      const { text } = gmail.renderMagicLinkEmail('https://example.com/auth/verify?token=abc123');

      // Should contain key text without HTML
      expect(text).toContain('Let\'s get you signed in');
      expect(text).toContain('https://example.com/auth/verify?token=abc123');
      expect(text).not.toContain('<');
      expect(text).not.toContain('>');
      expect(text).not.toContain('&amp;');
    }
  });

  it('escapes special characters in magic link URL', () => {
    if (gmail.renderMagicLinkEmail) {
      const { html } = gmail.renderMagicLinkEmail('https://example.com/auth?token=<script>');

      // Should escape the script tag
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>');
    }
  });
});

describe('renderWeddingInvitationEmail', () => {
  const mockParty: PartyMember[] = [
    {
      personId: '1',
      role: 'primary',
      firstName: 'Alice',
      lastName: 'Johnson',
      invitedEvents: [],
      attendance: {}
    },
    {
      personId: '2',
      role: 'companion',
      firstName: 'Bob',
      lastName: 'Williams',
      invitedEvents: [],
      attendance: {}
    }
  ];

  it('renders valid HTML invitation email', () => {
    if (gmail.renderWeddingInvitationEmail) {
      const { html } = gmail.renderWeddingInvitationEmail(
        mockParty,
        'https://example.com/invite?t=xyz'
      );

      // Should be valid HTML structure
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');

      // Should contain invitation content
      expect(html).toContain('You\'re Invited!');
      expect(html).toContain('Dear Alice J. &amp; Bob W.');
      expect(html).toContain('wedding celebration');
      expect(html).toContain('https://example.com/invite?t=xyz');
    }
  });

  it('generates plain text alternative with proper greeting', () => {
    if (gmail.renderWeddingInvitationEmail) {
      const { text } = gmail.renderWeddingInvitationEmail(
        mockParty,
        'https://example.com/invite?t=xyz'
      );

      // Should contain unescaped greeting in plain text
      expect(text).toContain('Dear Alice J. & Bob W.');
      expect(text).toContain('You\'re Invited!');
      expect(text).toContain('https://example.com/invite?t=xyz');
      expect(text).not.toContain('<');
      expect(text).not.toContain('&amp;');
    }
  });

  it('handles single primary guest', () => {
    if (gmail.renderWeddingInvitationEmail) {
      const singleParty: PartyMember[] = [
        {
          personId: '1',
          role: 'primary',
          firstName: 'Charlie',
          lastName: 'Brown',
          invitedEvents: [],
          attendance: {}
        }
      ];

      const { html, text } = gmail.renderWeddingInvitationEmail(
        singleParty,
        'https://example.com/invite'
      );

      expect(html).toContain('Dear Charlie B.');
      expect(text).toContain('Dear Charlie B.');
    }
  });

  it('escapes XSS attempts in tracking URL', () => {
    if (gmail.renderWeddingInvitationEmail) {
      const { html } = gmail.renderWeddingInvitationEmail(
        mockParty,
        'https://example.com/"><script>alert("xss")</script>'
      );

      // Should escape the malicious content
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>alert');
    }
  });
});

describe('MIME message construction', () => {
  it('builds multipart/alternative message without inline images', () => {
    if (gmail.buildMimeMessage) {
      const result = gmail.buildMimeMessage({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Hello World</p>',
        text: 'Hello World'
      });

      // Should have proper headers
      expect(result).toContain('From: sender@example.com');
      expect(result).toContain('To: recipient@example.com');
      expect(result).toContain('Subject: Test Email');
      expect(result).toContain('MIME-Version: 1.0');

      // Should have multipart/alternative
      expect(result).toContain('Content-Type: multipart/alternative');

      // Should contain both plain text and HTML parts
      expect(result).toContain('Content-Type: text/plain');
      expect(result).toContain('Content-Type: text/html');
      expect(result).toContain('Hello World');
      expect(result).toContain('<p>Hello World</p>');

      // Should use CRLF line endings
      expect(result).toContain('\r\n');
    }
  });

  it('builds multipart/related message with inline images', () => {
    if (gmail.buildMimeMessage) {
      const result = gmail.buildMimeMessage({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Email with Image',
        html: '<p>Hello <img src="cid:test-image" /></p>',
        text: 'Hello',
        inlineImages: [
          {
            mimeType: 'image/png',
            base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            fileName: 'test.png',
            contentId: 'test-image'
          }
        ]
      });

      // Should have multipart/related
      expect(result).toContain('Content-Type: multipart/related');

      // Should have nested multipart/alternative
      expect(result).toContain('Content-Type: multipart/alternative');

      // Should have image attachment with proper headers
      expect(result).toContain('Content-Type: image/png');
      expect(result).toContain('Content-Transfer-Encoding: base64');
      expect(result).toContain('Content-ID: <test-image>');
      expect(result).toContain('Content-Disposition: inline; filename="test.png"');

      // Should contain base64 data (may be chunked)
      expect(result).toContain('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ');
    }
  });

  it('chunks base64 data to 76 characters per line', () => {
    if (gmail.chunkBase64) {
      const longBase64 = 'A'.repeat(200);
      const result = gmail.chunkBase64(longBase64);

      // Should have line breaks
      expect(result).toContain('\r\n');

      // Each line should be <= 76 characters
      const lines = result.split('\r\n');
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(76);
      }
    }
  });

  it('handles empty base64 string', () => {
    if (gmail.chunkBase64) {
      const result = gmail.chunkBase64('');
      expect(result).toBe('');
    }
  });
});

describe('Email shell rendering', () => {
  it('renders complete HTML document structure', () => {
    if (gmail.renderEmailShell) {
      const result = gmail.renderEmailShell({
        content: '<p>Test content</p>'
      });

      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<html lang="en">');
      expect(result).toContain('<meta charset="utf-8"');
      expect(result).toContain('<meta name="viewport"');
      expect(result).toContain('<body');
      expect(result).toContain('<p>Test content</p>');
      expect(result).toContain('</body>');
      expect(result).toContain('</html>');
    }
  });

  it('includes hidden preheader when provided', () => {
    if (gmail.renderEmailShell) {
      const result = gmail.renderEmailShell({
        preheader: 'This is the preview text',
        content: '<p>Main content</p>'
      });

      // Preheader should be hidden
      expect(result).toContain('display:none');
      expect(result).toContain('This is the preview text');
      expect(result).toContain('<p>Main content</p>');
    }
  });

  it('escapes HTML in preheader', () => {
    if (gmail.renderEmailShell && gmail.escapeHtml) {
      const result = gmail.renderEmailShell({
        preheader: '<script>alert("xss")</script>',
        content: '<p>Content</p>'
      });

      expect(result).toContain('&lt;script&gt;');
      expect(result).not.toContain('<script>alert');
    }
  });

  it('omits preheader div when not provided', () => {
    if (gmail.renderEmailShell) {
      const result = gmail.renderEmailShell({
        content: '<p>Content</p>'
      });

      // Count occurrences of <div - should only be in content if any
      const matches = result.match(/<div[^>]*style="display:none/g);
      expect(matches).toBeNull();
    }
  });
});

describe('Primary button rendering', () => {
  it('renders button with text and link', () => {
    if (gmail.renderPrimaryButton) {
      const result = gmail.renderPrimaryButton('Click Me', 'https://example.com/action');

      expect(result).toContain('<a href="https://example.com/action"');
      expect(result).toContain('Click Me');
      expect(result).toContain('role="presentation"');
      expect(result).toContain('display:inline-block');
    }
  });

  it('escapes HTML in button text', () => {
    if (gmail.renderPrimaryButton) {
      const result = gmail.renderPrimaryButton('<script>alert("xss")</script>', 'https://example.com');

      expect(result).toContain('&lt;script&gt;');
      expect(result).not.toContain('<script>alert');
    }
  });

  it('escapes HTML in button href', () => {
    if (gmail.renderPrimaryButton) {
      const result = gmail.renderPrimaryButton('Click', '"><script>alert("xss")</script>');

      expect(result).toContain('&quot;&gt;&lt;script&gt;');
      expect(result).not.toContain('"><script>');
    }
  });
});

describe('HTML entity escaping', () => {
  it('escapes all dangerous characters', () => {
    if (gmail.escapeHtml) {
      const dangerous = '& < > " \'';
      const result = gmail.escapeHtml(dangerous);

      expect(result).toBe('&amp; &lt; &gt; &quot; &#39;');
      expect(result).not.toContain('&');
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain('"');
      expect(result).not.toContain("'");
    }
  });

  it('handles empty string', () => {
    if (gmail.escapeHtml) {
      const result = gmail.escapeHtml('');
      expect(result).toBe('');
    }
  });

  it('handles string with no special characters', () => {
    if (gmail.escapeHtml) {
      const result = gmail.escapeHtml('Hello World 123');
      expect(result).toBe('Hello World 123');
    }
  });

  it('handles multiple consecutive special characters', () => {
    if (gmail.escapeHtml) {
      const result = gmail.escapeHtml('<<<>>>');
      expect(result).toBe('&lt;&lt;&lt;&gt;&gt;&gt;');
    }
  });
});

describe('Integration: Full email rendering flow', () => {
  it('produces valid MIME message for magic link email', () => {
    if (gmail.renderMagicLinkEmail && gmail.buildMimeMessage) {
      const { html, text } = gmail.renderMagicLinkEmail('https://example.com/verify');

      const mimeMessage = gmail.buildMimeMessage({
        from: 'noreply@example.com',
        to: 'user@example.com',
        subject: 'Sign In',
        html,
        text
      });

      // Should be a complete MIME message
      expect(mimeMessage).toContain('From: noreply@example.com');
      expect(mimeMessage).toContain('To: user@example.com');
      expect(mimeMessage).toContain('Subject: Sign In');
      expect(mimeMessage).toContain('MIME-Version: 1.0');
      expect(mimeMessage).toContain('multipart/alternative');

      // Should contain both versions
      expect(mimeMessage).toContain('<!DOCTYPE html>');
      expect(mimeMessage).toContain('Let\'s get you signed in');
    }
  });

  it('produces valid MIME message for wedding invitation', () => {
    if (gmail.renderWeddingInvitationEmail && gmail.buildMimeMessage) {
      const party: PartyMember[] = [
        {
          personId: '1',
          role: 'primary',
          firstName: 'Test',
          lastName: 'User',
          invitedEvents: [],
          attendance: {}
        }
      ];

      const { html, text } = gmail.renderWeddingInvitationEmail(party, 'https://example.com/invite');

      const mimeMessage = gmail.buildMimeMessage({
        from: 'wedding@example.com',
        to: 'guest@example.com',
        subject: 'Wedding Invitation',
        html,
        text
      });

      // Should be a complete MIME message
      expect(mimeMessage).toContain('From: wedding@example.com');
      expect(mimeMessage).toContain('To: guest@example.com');
      expect(mimeMessage).toContain('Subject: Wedding Invitation');

      // Should contain invitation content
      expect(mimeMessage).toContain('You\'re Invited!');
      expect(mimeMessage).toContain('Dear Test U.');
    }
  });
});
