import type { BugPayload } from '@qapipex/shared-types';

export interface CreatedBug {
  id: string;
  url: string;
  status: string;
}

/** Our internal priority scale -> ICore's p1 (most urgent) .. p4 (least). */
const PRIORITY_MAP: Record<string, 'p1' | 'p2' | 'p3' | 'p4'> = {
  urgent: 'p1',
  high: 'p2',
  medium: 'p3',
  low: 'p4',
};

/** Our internal severity scale matches ICore's exactly (critical|high|medium|low). */
const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

interface ICoreCreateBugRequest {
  title: string;
  steps_to_reproduce: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  priority?: 'p1' | 'p2' | 'p3' | 'p4';
  expected_result?: string;
  actual_result?: string;
  additional_context?: string;
}

interface ICoreCreateBugResponse {
  id: string;
  displayId: string;
}

interface ICoreErrorResponse {
  error: string;
}

function toICoreRequest(payload: BugPayload): ICoreCreateBugRequest {
  const stepsList = payload.stepsToReproduce.map((step, i) => `${i + 1}. ${step}`).join('\n');

  const contextParts = [payload.description, ...payload.evidenceLinks].filter(Boolean);

  return {
    title: payload.title,
    steps_to_reproduce: stepsList,
    severity: VALID_SEVERITIES.has(payload.severity)
      ? (payload.severity as ICoreCreateBugRequest['severity'])
      : undefined,
    priority: PRIORITY_MAP[payload.priority],
    expected_result: payload.expectedResult,
    actual_result: payload.actualResult,
    additional_context: contextParts.length > 0 ? contextParts.join('\n\n') : undefined,
  };
}

/**
 * Client for the ICore Bug Tracker's "Automation API" (Settings -> Automation
 * API in the ICore app). Confirmed 2026-09-28 directly against the live API:
 * endpoint, auth, field names/types, and both success/error response shapes
 * were read from that page and verified by generating a real key and issuing
 * a real request — this is not an assumed contract.
 *
 * Deliberately isolated here: nothing outside this file needs to know these
 * field names, in case ICore's contract changes later.
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

    const response = await fetch(`${this.baseUrl}/api/v1/bugs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(toICoreRequest(payload)),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ICoreErrorResponse | null;
      throw new Error(
        `ICore Bug Tracker returned ${response.status}: ${body?.error ?? response.statusText}`,
      );
    }

    const created = (await response.json()) as ICoreCreateBugResponse;
    return {
      id: created.displayId,
      url: `${this.baseUrl}/bugs/${created.id}`,
      // The create response doesn't include a status field; new bugs were
      // observed to start as "Open" in the dashboard, but this isn't
      // confirmed from the API response itself — cached_status gets
      // refreshed from ICore later anyway once that sync exists.
      status: 'open',
    };
  }
}
