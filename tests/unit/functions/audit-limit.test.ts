import { describe, expect, it } from 'vitest';
import { _resolveAuditLimit } from '../../../functions/admin/audit';

describe('resolveAuditLimit', () => {
  it('returns default for undefined', () => {
    expect(_resolveAuditLimit(null)).toBe(100);
  });

  it('clamps below minimum', () => {
    expect(_resolveAuditLimit('0')).toBe(1);
    expect(_resolveAuditLimit('-10')).toBe(1);
  });

  it('clamps above maximum', () => {
    expect(_resolveAuditLimit('9999')).toBe(500);
  });

  it('allows numeric within range', () => {
    expect(_resolveAuditLimit('25')).toBe(25);
  });

  it('falls back to default for non-numeric input', () => {
    expect(_resolveAuditLimit('abc')).toBe(100);
    expect(_resolveAuditLimit('')).toBe(100);
    expect(_resolveAuditLimit('   ')).toBe(100);
  });
});
