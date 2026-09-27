# QAPipeX

AI-powered QA platform: requirement → AI-generated test cases → human review/approval →
Playwright execution → evidence capture → AI failure analysis → structured bug → ICore Bug Tracker.

See [DESIGN.md](./DESIGN.md) for the full architecture, schema, and phased plan.

## Repo layout

```
apps/
  web/      Next.js app — UI + internal API routes
  worker/   Playwright execution service — plain local Node process for now
            (Dockerize later, when deploying somewhere other than your machine)
packages/
  shared-types/        TestCase, TestRun, FailureAnalysis, BugPayload, WorkerRunRequest/Response
  db/                   Supabase client + hand-written DB types + migrations
  ai-service/           AIService interface + Anthropic/OpenAI/Gemini implementations,
                        selectable per-workspace from the Settings page
  bug-tracker-client/   Client for the ICore Bug Tracker's bug-creation API
```

## First-time setup

1. **Install dependencies** (from repo root):
   ```
   npm install
   ```

2. **Database schema.** Already applied to the live Supabase project
   (`qkmjvgaiuzofvwntxlrg`) — `packages/db/migrations/*.sql` is the record of what's been
   run, in order. If you ever need to reapply from scratch (e.g. a fresh project), run each
   file in order in the [Supabase SQL Editor](https://supabase.com/dashboard/project/qkmjvgaiuzofvwntxlrg/sql/new).

3. **Environment variables.** `apps/web/.env.local` already has the Supabase keys and the
   worker's shared secret filled in (it's gitignored — never commit it). Still empty:
   - `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` — fill in whichever
     provider(s) you want to use, then pick the active one on the **Settings** page. Only
     one needs to be set to get started; all three power the same three AI operations (test
     generation, failure analysis, bug drafting) behind the same `AIService` interface.
   - `BUG_TRACKER_BASE_URL` / `BUG_TRACKER_API_KEY` — once the real ICore Bug Tracker API
     contract is confirmed, set these to actually sync bugs (current client code assumes a
     contract — see `packages/bug-tracker-client/src/index.ts` — isolated to one file so
     swapping in the real one is cheap)
   - `CREDENTIALS_ENCRYPTION_KEY` — already filled in and must match exactly between
     `apps/web/.env.local` and `apps/worker/.env.local` (a 32-byte hex key encrypts project
     login credentials at rest; generate a new one with
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` if you ever
     need to rotate it — but rotating invalidates every stored credential, since they can
     only be decrypted with the key they were encrypted under)

4. **Run the web app and the worker** (two terminals, both from repo root):
   ```
   npm run dev:web      # Next.js app on http://localhost:3000
   npm run dev:worker   # Playwright execution worker on http://localhost:4088
   ```
   Visit http://localhost:3000 — it redirects to `/login`. Sign up with any email/password
   (Supabase Auth); a `profiles` row is created automatically via a DB trigger. The worker
   only needs to be running when you actually trigger a test run from the Test Runs page —
   everything else works without it, just with `WORKER_URL`/`WORKER_SHARED_SECRET` already
   set in `apps/web/.env.local` and `apps/worker/.env.local` (both gitignored).

## Current status

**All 6 V1 milestones from DESIGN.md §8 are built, and the full pipeline has now been
verified end-to-end with real AI output against the real target site**: a requirement on
the `ErrorZero Bug Tracker` project was turned into real Gemini-generated test cases,
approved, actually executed by Playwright against
`https://errorzero-bug-tracker.vercel.app` (not a stand-in), captured a real failure
screenshot when the AI's guessed selector didn't match the real page, and produced a real
AI failure analysis that correctly separated confirmed evidence from an explicitly-labeled
hypothesis. That is the core value proposition of this whole system, proven working.

One thing remains genuinely open, and it's account-side, not code:
- **Claude (Anthropic)**: the account's API credit balance is $0 — Claude Pro (the chat
  subscription) and API billing are separate products with separate balances. Add credits
  at console.anthropic.com → Plans & Billing to use it (the code side — including a
  workspace-ID header some Console setups require — is already fixed and confirmed working
  up to the billing wall).

**ICore Bug Tracker sync is now real, not assumed.** ErrorZero Bug Tracker *is* ICore — the
same live site used for Playwright execution testing turned out to also be the target Bug
Tracker. It has its own self-service "Automation API" page (Settings → Automation API) with
full documentation of its real contract, so the integration was built against the actual
API, not a guess: `POST /api/v1/bugs`, `Authorization: Bearer <key>`, fields
`title`/`steps_to_reproduce`/`severity`/`priority`/`expected_result`/`actual_result`/`additional_context`,
201 response `{ id, displayId }`. `packages/bug-tracker-client` was rewritten to match this
exactly (including mapping our internal severity/priority scales to ICore's), and verified
by generating a real API key on that site and creating real bugs through our own client
code — they show up correctly in ICore's dashboard, tagged `Source: Automation`.

- ✅ Monorepo scaffold, Supabase Auth, DB schema + a private `evidence` Storage bucket
  (applied and verified live, RLS on every table, zero open security advisories)
- ✅ Dashboard: real aggregate stats (projects, test runs, approved test cases, bugs
  synced) plus recent test runs and recent AI failure diagnoses
- ✅ Projects (create/list/detail), Requirements & Specs (global + per-project)
- ✅ AI Test Generator: generate → review/edit → approve/reject, persisted to `test_cases`,
  plus a global work-queue view ranked by what needs attention
- ✅ Test Suites & Cases: global filterable list (all/pending/approved/rejected)
- ✅ Test History: every test run ever executed, across every project, filterable by
  project and outcome — the full archive, distinct from Test Runs (which is for
  triggering + monitoring)
- ✅ Reports: aggregate analytics across all projects — overall/per-project pass rates,
  failure severity distribution, and top failure categories (all real queries, no
  fabricated numbers; sparse data shows honestly, e.g. a 0% pass rate when every stored
  result genuinely failed)
- ✅ Test Runs: triggering a run executes every approved test case for a project through
  real Playwright (`apps/worker`, synchronous for V1 — see the code comment on why).
  On failure it captures a screenshot, trace, and console logs to Supabase Storage and
  renders them via short-lived signed URLs. Verified end-to-end with a genuine pass and a
  genuine fail in the same run.
- ✅ Failure Analyzer: `analyzeFailure()` runs automatically on every failed result right
  after a run completes (best-effort — never blocks the run), or on-demand via a retry
  button. The prompt structurally separates confirmed evidence (error message + screenshot)
  from `rootCauseHypothesis`, which is never asserted as fact.
- ✅ Bug Tracker: `generateBugReport()` drafts a bug from the failure analysis; the app
  fills in the structural fields (evidence links, source refs — never AI-generated) and
  sends it via `BugTrackerClient` to the real ICore API. **Verified with real bugs created**
  in ICore's live dashboard through our own client code, confirming the field mapping,
  auth, and response parsing all work correctly end-to-end.
- ✅ Settings: pick which AI provider is active — Claude (Anthropic), ChatGPT (OpenAI), or
  Gemini (Google) — workspace-wide, persisted in `app_settings`. All three implement the
  same `AIService` interface (`packages/ai-service`), including image input for failure
  screenshots. **Gemini is verified with real output** (test generation and failure
  analysis both confirmed against the live site). Claude is code-complete and confirmed up
  to the account's $0 API credit balance (see above).
- ✅ Login credentials + authenticated test steps: a Project's detail page stores a named
  credential (username + password, AES-256-GCM encrypted with `CREDENTIALS_ENCRYPTION_KEY`,
  decrypted only by the worker, never sent to the LLM or the browser). The AI test generator
  is told which credential labels exist for a project and can emit a `{"action":"login","target":"<label>"}`
  step — never the actual username/password — when a requirement needs an authenticated
  session; the worker resolves that label to real credentials at run time and performs a
  best-effort generic login (tries common email/password field and submit-button selectors).
  A real project (`ErrorZero Bug Tracker`, https://errorzero-bug-tracker.vercel.app) and
  credential are set up in the live DB. **Verified with a real authenticated login**: an
  approved test case with a `login` step actually ran against the live site — the worker
  fetched and decrypted the stored credential, filled the real "Work Email"/"Password"
  fields, clicked "Login", and landed on the real dashboard (confirmed by asserting the
  "Overview" heading) — all in ~6 seconds, genuinely passed, not simulated.

**To use real AI output yourself:** set at least one of `ANTHROPIC_API_KEY` /
`OPENAI_API_KEY` / `GEMINI_API_KEY` in `apps/web/.env.local`, then select it on the
Settings page if it isn't Gemini (the currently active one — see above for why Claude
needs API billing credits separately from a Pro subscription). Bug Tracker sync is already
configured against the real ICore instance (`BUG_TRACKER_BASE_URL`/`BUG_TRACKER_API_KEY` are
set) — nothing else to do there.

### Known transient issues

- Supabase's built-in email sender has a low default rate limit (a few emails/hour), which
  signup testing during setup already tripped. It clears on its own — if signup returns
  `over_email_send_rate_limit`, wait ~15-30 min and retry. Unrelated to the app code.
- Google's Gemini API occasionally returns a transient `503 (high demand, try again later)`.
  Usually clears within a retry or two, but during one verification session it persisted
  for several minutes straight — this is entirely on Google's side; if it's happening, wait
  a bit and use the "Analyze Failure with AI" retry button once it clears, or switch to a
  different provider in Settings in the meantime.
- The ICore Bug Tracker's Automation API key is shown in full exactly once, at creation —
  if extracting it from rendered page text (rather than reading it from an input's `.value`
  or the network response), watch for adjacent UI text (e.g. an "I've copied it" button)
  getting concatenated onto the end with no separator. Cut the string precisely at the next
  known label, or read the create-key network response body directly instead of scraping
  rendered text.
- If a target site sits behind Vercel's Deployment Protection, every visitor (including
  this app's worker) gets redirected to `vercel.com/login` instead of the real page — this
  is a per-project Vercel setting (Settings → Deployment Protection), not something this
  app can detect or bypass on its own. Disable it (or set "Only Preview Deployments") for
  any Vercel-hosted site you want to actually test.
- **Minor housekeeping left in ICore itself:** while generating/testing the Automation API
  key, one extra unused key ("QAPipeX Automation," created before the final "QAPipeX
  Final") was left in an Active state on ICore's Settings → Automation API page — harmless
  (nobody has its value), but worth revoking there if you want a tidy key list.
