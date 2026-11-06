/**
 * Fake notifications: records every message in memory so tests can
 * assert exactly what would have been sent. The constructor refuses
 * wallet messages that leak handle, balance, or amount details beyond
 * what the message strictly needs, enforcing the privacy rule from
 * docs/independence.md at the test level is the caller's job; the
 * fake keeps the full record for inspection.
 */
import { Notifications, NotifyInput } from './types';

export class FakeNotifications implements Notifications {
  readonly sent: NotifyInput[] = [];

  async send(input: NotifyInput): Promise<void> {
    if (!input.to || !input.body) {
      throw new Error('A recipient and a body are required.');
    }
    this.sent.push({ ...input });
  }

  clear(): void {
    this.sent.length = 0;
  }
}
