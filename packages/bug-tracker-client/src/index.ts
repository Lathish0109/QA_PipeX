import type { BugPayload } from '@qapipex/shared-types';

export interface CreatedBug {
  id: string;
  url: string;
  status: string;
}

/**
 * Client for the ICore Bug Tracker's bug-creation API.
 *
 * ASSUMED CONTRACT — not yet confirmed against the real ICore Bug Tracker.
 * This is the one file to change once the real endpoint/auth/field names
 * are confirmed; nothing else in the app depends on these details.
 */
export class BugTrackerClient {
  constructor(
    private baseUrl: string = process.env.BUG_TRACKER_BASE_URL ?? '',
    private apiKey: string = process.env.BUG_TRACKER_API_KEY ?? '',
  ) {}

  async createBug(payload: BugPayload): Promise<CreatedBug> {
    if (!this.baseUrl || !this.apiKey) {
      throw new Error('BUG_TRACKER_BASE_URL and BUG_TRACKER_API_KEY must be set (server-side only).');
    }
    const response = await fetch(`${this.baseUrl}/api/bugs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Bug Tracker returned ${response.status}: ${await response.text()}`);
    }
    return (await response.json()) as CreatedBug;
  }
}
