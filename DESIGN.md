# AI-Powered QA System — Architecture & Design (V1)

Status: **Approved. All 6 V1 milestones implemented — see README.md for current status and what's verified vs. code-complete-but-unexercised.**
Produced against `AI-QA-System-Design-Phase-Prompt.md`.

---

## 0. Decisions Locked In

| Item | Decision |
|---|---|
| Relationship to Bug Tracker | Separate project/repo. QA System never owns bug data — it POSTs a structured bug to the Bug Tracker's API and stores back only a reference + cached status. |
| Database | Dedicated Postgres/Supabase project (not shared with Bug Tracker). |
| Auth | Own Supabase Auth, independent of the Bug Tracker's login. |
| LLM provider | Anthropic Claude API, behind a provider-agnostic `AIService` interface. |
| Version control | Separate GitHub account/repo: [github.com/Lathish0109/QA_pipeX](https://github.com/Lathish0109/QA_pipeX) (renamed from QA_worker; project itself renamed Obsidian QA Engine -> QAPipeX). |
| Playwright execution | Dedicated Node/TypeScript worker service, containerized with Docker (default choice — see §6 for why, and the alternatives if you'd rather not run your own container). |

**UPDATE 2026-09-27 — resolved:** the Bug Tracker turned out to be the same live app (ErrorZero) already used for Playwright execution testing, and it exposes its own real contract via a self-service "Automation API" settings page. `packages/bug-tracker-client` now implements that real contract (`POST /api/v1/bugs`, Bearer auth, real field names) and it's verified — real bugs created through our client code appear correctly in ICore's dashboard. Section 4 below (and the payload shape in §7) still describe the original *assumed* shape from the design phase; see README.md's "Current status" for what's actually implemented now.

**Also open, not a design blocker:** at least one real target test website + how its login credentials get entered. The schema (§3) already has a place for this (`project_credentials`, encrypted, never sent to the LLM) — you can fill it in whenever you have a real site to point at.

---

## 1. System Architecture

```
                         ┌─────────────────────────┐
                         │   Next.js App (apps/web) │
                         │  - Dashboard/Projects UI │
                         │  - Test Generator UI     │
                         │  - Review/Approve UI     │
                         │  - Reports/History UI    │
                         │  - API routes (BFF)      │
                         └───────────┬──────────────┘
                                     │ internal REST, service-token auth
                                     ▼
                         ┌─────────────────────────┐
                         │  Worker Service          │
                         │  (apps/worker, Docker)   │
                         │  - Playwright runner     │
                         │  - Evidence capture      │
                         │  - Reports results back  │
                         │    via webhook callback  │
                         └───────────┬──────────────┘
                                     │
                 ┌───────────────────┼───────────────────┐
                 ▼                   ▼                   ▼
        ┌────────────────┐ ┌────────────────┐  ┌────────────────────┐
        │ Supabase        │ │ Supabase        │  │ Target website      │
        │ Postgres (DB)   │ │ Storage         │  │ under test           │
        │ - projects       │ │ (screenshots,   │  │ (Playwright drives   │
        │ - test cases     │ │  traces, logs)  │  │  a real browser      │
        │ - test runs      │ └────────────────┘  │  against it)         │
        │ - failure        │                     └────────────────────┘
        │   analyses       │
        │ - bug refs       │
        └─────────┬───────┘
                   │
                   │ (AI calls happen from apps/web's API routes,
                   │  server-side only, via packages/ai-service)
                   ▼
        ┌────────────────────┐        ┌──────────────────────────┐
        │ AI Service          │        │ ICore Bug Tracker (API)   │
        │ (packages/ai-service)│──────▶│ POST /api/bugs             │
        │ wraps Claude API     │        │ (separate system,          │
        │ Test Gen / Failure    │        │  owns bug status/         │
        │ Analysis / Bug Gen    │        │  assignment/comments)      │
        └────────────────────┘        └──────────────────────────┘
```

**Why Playwright doesn't live inside the Next.js app:** headless Chromium/Firefox/WebKit processes are long-running, memory-heavy, and need a real filesystem for trace/video output — none of which fits serverless function limits (execution time caps, no persistent FS, cold starts killing browser handles mid-run). The worker is a normal long-lived Node process that Next.js calls into, not a function Vercel invokes.

**Why a separate worker instead of running Playwright from the same server as the web app:** isolation (a hung/crashed browser doesn't take down the web app), independent scaling (test runs can be CPU/memory-heavy and bursty), and it matches the "no tight coupling" principle — the web app just calls an HTTP endpoint and doesn't care how execution happens underneath.

---

## 2. Folder / Project Structure

Monorepo, pnpm workspaces (keeps shared types and the AI/bug-tracker clients from drifting between web and worker):

```
qa-system/
├── apps/
│   ├── web/                     # Next.js app (TS) — UI + API routes (BFF layer)
│   │   ├── app/                 # routes: dashboard, projects, test-cases, runs, reports
│   │   ├── app/api/             # internal REST endpoints (see §4)
│   │   └── lib/                 # server-only glue (db client, auth, calls into packages/*)
│   └── worker/                  # Node/TS service — Playwright execution
│       ├── src/runner.ts        # executes a test run, captures evidence
│       ├── src/server.ts        # internal HTTP API (receives run requests)
│       └── Dockerfile
├── packages/
│   ├── ai-service/              # AIService interface + AnthropicAIService impl (§5)
│   ├── bug-tracker-client/      # thin client for the external Bug Tracker API (§4)
│   ├── db/                      # Drizzle ORM schema + migrations, shared DB client
│   └── shared-types/            # TestCase, TestRun, TestResult, FailureAnalysis, BugPayload
├── docker-compose.yml           # local dev: worker + (optional) local Postgres
├── pnpm-workspace.yaml
└── package.json
```

Only `packages/ai-service` imports the Anthropic SDK. Only `packages/bug-tracker-client` knows the Bug Tracker's URL/auth shape. Everything else depends on `shared-types` + these two interfaces.

---

## 3. Database Schema (Postgres / Supabase)

```sql
-- Auth: Supabase's built-in auth.users is the source of identity.
-- profiles mirrors it 1:1 for app-level fields.
profiles (
  id            uuid PK references auth.users(id),
  display_name  text,
  created_at    timestamptz default now()
)

projects (
  id            uuid PK default gen_random_uuid(),
  name          text not null,
  base_url      text not null,
  created_by    uuid references profiles(id),
  created_at    timestamptz default now()
)
-- index: projects(created_by)

project_credentials (
  id                    uuid PK default gen_random_uuid(),
  project_id            uuid references projects(id) on delete cascade,
  label                 text not null,              -- e.g. "standard test user"
  username              text not null,
  encrypted_password    text not null,               -- encrypted at rest (app-level, e.g. AES via a server-only key); NEVER passed to the LLM
  created_at            timestamptz default now()
)
-- index: project_credentials(project_id)

requirements (
  id            uuid PK default gen_random_uuid(),
  project_id    uuid references projects(id) on delete cascade,
  text          text not null,
  created_by    uuid references profiles(id),
  created_at    timestamptz default now()
)
-- index: requirements(project_id)

test_cases (
  id              uuid PK default gen_random_uuid(),
  project_id      uuid references projects(id) on delete cascade,
  requirement_id  uuid references requirements(id) on delete cascade,
  title           text not null,
  description     text,
  type            text check (type in ('positive','negative','edge','validation')),
  steps           jsonb not null,        -- [{action, target, value}, ...]
  expected_result text not null,
  status          text check (status in ('draft','approved','rejected')) default 'draft',
  generated_by    text check (generated_by in ('ai','human')) default 'ai',
  approved_by     uuid references profiles(id),
  approved_at     timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
)
-- index: test_cases(project_id), test_cases(requirement_id), test_cases(status)

test_runs (
  id            uuid PK default gen_random_uuid(),
  project_id    uuid references projects(id) on delete cascade,
  triggered_by  uuid references profiles(id),
  status        text check (status in ('queued','running','passed','failed','partial','error')) default 'queued',
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz default now()
)
-- index: test_runs(project_id), test_runs(status)

test_results (
  id              uuid PK default gen_random_uuid(),
  test_run_id     uuid references test_runs(id) on delete cascade,
  test_case_id    uuid references test_cases(id),
  status          text check (status in ('passed','failed','skipped','error')),
  duration_ms     integer,
  error_message   text,
  screenshot_url  text,
  trace_url       text,
  console_log_url text,
  created_at      timestamptz default now()
)
-- index: test_results(test_run_id), test_results(test_case_id), test_results(status)

failure_analyses (
  id                     uuid PK default gen_random_uuid(),
  test_result_id         uuid references test_results(id) on delete cascade,
  summary                text not null,
  expected_behavior      text not null,
  actual_behavior        text not null,
  root_cause_hypothesis  text,                       -- explicitly a hypothesis, never asserted as fact
  confidence_level       text check (confidence_level in ('low','medium','high')),
  error_category         text,
  suggested_severity     text check (suggested_severity in ('low','medium','high','critical')),
  suggested_priority     text check (suggested_priority in ('low','medium','high','urgent')),
  reproduction_steps     jsonb,
  created_at             timestamptz default now()
)
-- index: failure_analyses(test_result_id)

bug_references (
  id                  uuid PK default gen_random_uuid(),
  failure_analysis_id uuid references failure_analyses(id) on delete cascade,
  external_bug_id     text not null,      -- ID from the Bug Tracker
  external_bug_url    text,
  cached_status       text,               -- last known status, refreshed periodically/on view
  last_synced_at      timestamptz,
  created_at          timestamptz default now()
)
-- index: bug_references(failure_analysis_id), bug_references(external_bug_id)
```

Design notes:
- `project_credentials.encrypted_password` is encrypted at the application layer (a server-only key, e.g. via `libsodium`/`crypto`), not just relying on Postgres row security — so even a DB dump doesn't leak plaintext passwords.
- No table duplicates bug status/assignee/comments — `bug_references.cached_status` is a display convenience only, refreshed from the Bug Tracker, never edited locally.

---

## 4. API Boundaries

### 4a. Internal (Next.js API routes, called by the frontend)

```
POST   /api/projects
GET    /api/projects
GET    /api/projects/:id
POST   /api/projects/:id/requirements
POST   /api/requirements/:id/generate-test-cases     → AIService.generateTestCases()
GET    /api/test-cases?requirementId=
PATCH  /api/test-cases/:id                           (QA edits)
POST   /api/test-cases/:id/approve
POST   /api/test-cases/:id/reject
POST   /api/test-runs                                (run all approved cases for a project/requirement)
GET    /api/test-runs/:id
GET    /api/test-runs/:id/results
GET    /api/test-results/:id/failure-analysis
GET    /api/reports?projectId=
GET    /api/history?projectId=
```

### 4b. Internal, web ⇄ worker (service-token authenticated, not public)

```
POST   /internal/worker/run
  → { testRunId, projectId, baseUrl, testCases: [...], credentialsRef }
  called by apps/web to kick off execution

POST   /api/internal/test-runs/:id/results            (webhook: worker → web)
  → { results: [{ testCaseId, status, durationMs, errorMessage,
                   screenshotUrl, traceUrl, consoleLogUrl }], runStatus }
  worker calls this when the run completes; web app persists results,
  then triggers AIService.analyzeFailure() for each failed result server-side
```

### 4c. External — ICore Bug Tracker (assumed contract, flagged for confirmation)

```
POST {BUG_TRACKER_BASE_URL}/api/bugs
Auth: Bearer <service API key>            ← confirm real auth method
Body (BugPayload, see §7):
  {
    title, description, severity, priority,
    stepsToReproduce, expectedResult, actualResult,
    evidenceLinks: [screenshotUrl, traceUrl, ...],
    source: "qa-system",
    sourceRefs: { testRunId, testResultId, testCaseId, projectId }
  }
Expected response: { id, url, status }
```

`packages/bug-tracker-client` is the only file that needs to change once you confirm the real contract.

---

## 5. AI Service Interface

```ts
// packages/ai-service/src/types.ts
interface AIService {
  generateTestCases(input: {
    requirementText: string;
    baseUrl: string;
  }): Promise<GeneratedTestCase[]>;

  analyzeFailure(input: {
    testCase: TestCase;
    testResult: TestResult;
    evidence: { screenshotUrl?: string; traceUrl?: string; consoleLogUrl?: string };
  }): Promise<FailureAnalysis>;

  generateBugReport(input: {
    failureAnalysis: FailureAnalysis;
    testCase: TestCase;
  }): Promise<BugPayload>;
}
```

- `AnthropicAIService implements AIService` is the only module in the codebase that imports the Claude SDK.
- All three methods request **structured JSON output** (Claude tool-use / forced JSON schema), never freeform text parsed with regex.
- `analyzeFailure` prompt explicitly instructs the model to separate confirmed evidence (what the screenshot/log/trace show) from `rootCauseHypothesis` (a guess) — the schema itself makes this separation structural, not just a prompt suggestion.
- No website password or credential value is ever included in a prompt — only the credential's `label` (e.g. "standard test user") is passed if needed for context, never the secret.
- Swapping providers later = writing a new class that implements `AIService`; nothing outside `packages/ai-service` changes.

---

## 6. Playwright Execution Architecture

**Trigger:** `apps/web` POSTs to the worker's `/internal/worker/run` with the approved test cases for a run. Chosen over a message queue (Redis/BullMQ) for V1 to avoid extra infra — a `test_runs.status` column plus a direct HTTP call is enough at this scale. Revisit if concurrent-run volume grows.

**Isolation:** one Playwright **browser** instance per test run, one **browser context** per test case within that run (contexts are cheap, give clean cookies/storage per case, avoid full browser relaunch overhead).

**Evidence capture (on failure only, per Section 3 of the prompt):**
- Screenshot: `page.screenshot()` at point of failure
- Trace: `context.tracing.start({screenshots: true, snapshots: true})` → `.stop({path})` on failure, saved as a `.zip`
- Console logs: collected via `page.on('console', ...)` for the whole test case, attached only if the case failed
- All three uploaded to Supabase Storage at `evidence/{projectId}/{testRunId}/{testResultId}/...`, URLs written into `test_results`

**Reporting back:** worker calls the web app's internal webhook (§4b) when the run finishes. Web app persists `test_results`, then server-side triggers `AIService.analyzeFailure()` for every failed result and stores the `failure_analyses` row, then `AIService.generateBugReport()` → `bug-tracker-client` → Bug Tracker API → `bug_references` row.

**Where it actually runs (your Playwright-hosting decision):** Docker container, deployable to any container host (Fly.io, Railway, Render, a VPS with Docker, etc.) — your choice at deploy time, the design doesn't lock in a specific host. If you'd rather not operate a container at all, the alternative is a managed headless-browser service (e.g. Browserless) that the worker calls out to instead of launching browsers itself — that's a same-shaped swap inside `apps/worker`, not an architecture change, so it's not a blocking decision now.

---

## 7. Core Data Structures

```ts
// packages/shared-types

interface TestCase {
  id: string;
  projectId: string;
  requirementId: string;
  title: string;
  description: string;
  type: 'positive' | 'negative' | 'edge' | 'validation';
  steps: { action: string; target?: string; value?: string }[];
  expectedResult: string;
  status: 'draft' | 'approved' | 'rejected';
  generatedBy: 'ai' | 'human';
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface TestRun {
  id: string;
  projectId: string;
  triggeredBy: string;
  status: 'queued' | 'running' | 'passed' | 'failed' | 'partial' | 'error';
  startedAt?: string;
  completedAt?: string;
}

interface TestResult {
  id: string;
  testRunId: string;
  testCaseId: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  durationMs: number;
  errorMessage?: string;
  evidence: {
    screenshotUrl?: string;
    traceUrl?: string;
    consoleLogUrl?: string;
  };
  createdAt: string;
}

interface FailureAnalysis {
  id: string;
  testResultId: string;
  summary: string;
  expectedBehavior: string;
  actualBehavior: string;
  rootCauseHypothesis?: string;   // hypothesis, never asserted as fact
  confidenceLevel: 'low' | 'medium' | 'high';
  errorCategory: string;
  suggestedSeverity: 'low' | 'medium' | 'high' | 'critical';
  suggestedPriority: 'low' | 'medium' | 'high' | 'urgent';
  reproductionSteps: string[];
  createdAt: string;
}

// Payload shape sent to the Bug Tracker — assumed contract, confirm & adjust
interface BugPayload {
  title: string;
  description: string;
  severity: string;
  priority: string;
  stepsToReproduce: string[];
  expectedResult: string;
  actualResult: string;
  evidenceLinks: string[];
  source: 'qa-system';
  sourceRefs: {
    testRunId: string;
    testResultId: string;
    testCaseId: string;
    projectId: string;
  };
}
```

---

## 8. Phased Implementation Plan (V1 only)

1. **Foundation** — monorepo scaffold, Supabase project + migrations (§3), Supabase Auth wired into `apps/web`, Projects CRUD.
2. **AI Test Generation** — requirement input UI, `AIService` interface + `AnthropicAIService`, generation flow, review/edit UI, approve/reject flow.
3. **Execution engine** — `apps/worker` scaffold, Dockerfile, internal run API (§4b), basic Playwright execution of approved cases, `test_runs`/`test_results` wired end-to-end (no evidence yet, just pass/fail).
4. **Evidence & failure analysis** — screenshot/trace/console capture on failure, Supabase Storage upload, `AIService.analyzeFailure()`, `failure_analyses` persisted and shown in UI.
5. **Bug Tracker integration** — `AIService.generateBugReport()`, `bug-tracker-client`, `bug_references`, status display (manual refresh is fine for V1; polling/webhook sync is a V2 candidate).
6. **Reports & history** — Test History view and Reports view tying run → evidence → analysis → bug status together.

Each milestone should be independently demoable end-to-end on a real target site once you have one.

---

## Assumptions flagged for your review

- Bug Tracker API contract (§4c, §7 `BugPayload`) is **assumed**, not confirmed against the real ICore Bug Tracker. Swap point is isolated to one package.
- Playwright hosting is designed as Docker-container-shaped but the specific host (Fly.io/Railway/VPS/etc.) is left open — not a design blocker, pick at deploy time.
- Target test website + credential entry flow: schema is ready (`project_credentials`), no real site plugged in yet.
