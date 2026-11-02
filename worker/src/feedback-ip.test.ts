import { describe, expect, it } from 'vitest';
import { feedbackIpBucket } from './feedback-ip';

describe('feedbackIpBucket', () => {
  it('keeps a v4 address whole', () => {
    expect(feedbackIpBucket('203.0.113.7')).toBe('203.0.113.7');
  });

  it('keys a full v6 address on its /64 prefix', () => {
    expect(feedbackIpBucket('2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd')).toBe('v6:2001:db8:1:2');
    expect(feedbackIpBucket('2001:db8:1:2:1:2:3:4')).toBe(feedbackIpBucket('2001:db8:1:2:ffff:ffff:ffff:ffff'));
  });

  it('handles a compressed v6 address (2001:db8::1)', () => {
    expect(feedbackIpBucket('2001:db8::1')).toBe('v6:2001:db8:0:0');
    expect(feedbackIpBucket('2001:db8:0:0:0:0:0:1')).toBe('v6:2001:db8:0:0');
    expect(feedbackIpBucket('2001:db8:5::9:1')).toBe('v6:2001:db8:5:0');
    expect(feedbackIpBucket('::1')).toBe('v6:0:0:0:0');
  });

  it('treats an IPv4-mapped address as the v4 address', () => {
    expect(feedbackIpBucket('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(feedbackIpBucket('::FFFF:0102:0304')).toBe('1.2.3.4');
  });

  it('uses the shared dev fallback when there is no header', () => {
    expect(feedbackIpBucket(null)).toBe('dev');
  });

  it('keeps unparseable input in its own bucket rather than guessing', () => {
    expect(feedbackIpBucket('not-an-ip')).toBe('raw:not-an-ip');
  });
});
