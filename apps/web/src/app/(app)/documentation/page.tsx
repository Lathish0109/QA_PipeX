const PIPELINE_STAGES = [
  {
    title: '1. Write a requirement',
    body: 'Plain-language text, e.g. "User should be able to log in with a valid email and password." No special format required.',
  },
  {
    title: '2. AI generates test cases',
    body: 'The active provider (Settings) turns the requirement into structured Playwright steps (navigate/click/fill/assert). If the worker is reachable, it first captures a snapshot of the real target page’s inputs/buttons/selectors, so generated steps reference elements that actually exist instead of guessing.',
  },
  {
    title: '3. Human review — mandatory gate',
    body: 'Every generated test case starts as a draft. A person approves, rejects, or edits it before it can ever run. AI output never executes unreviewed.',
  },
  {
    title: '4. Playwright execution',
    body: 'Triggering a run sends every approved test case for a project to the worker service, which drives a real headless browser against the target site.',
  },
  {
    title: '5. Evidence capture on failure',
    body: 'A failed step automatically captures a screenshot, a full Playwright trace, and the browser’s console log — stored privately and shown via short-lived signed URLs.',
  },
  {
    title: '6. AI failure analysis',
    body: 'Runs automatically in the background after the run completes (or on-demand via a retry button). The prompt is structured to separate what the evidence actually confirms from a labeled, unconfirmed root-cause hypothesis — it’s never allowed to state a guess as fact.',
  },
  {
    title: '7. Duplicate check',
    body: 'Before filing anything, the pipeline checks whether this exact test case already has a bug on file from an earlier run. If so, the new failure links to that existing bug instead of creating a second one.',
  },
  {
    title: '8. Bug drafted and synced to ICore',
    body: 'Only for a genuinely new failure: the analysis is turned into a bug report and sent to the ICore Bug Tracker’s API. ICore’s Automation API only accepts new bugs — it has no endpoint to read status back — so this app shows the bug’s state at creation time and links out to ICore for the current, authoritative status.',
  },
];

const SETUP_STEPS = [
  {
    title: 'Configure at least one AI provider',
    body: 'Settings → AI Provider to pick which one is active, and Settings → API Keys to paste that provider’s key directly (encrypted, takes effect immediately — no redeploy needed). A key here overrides the server’s environment variable for that provider.',
  },
  {
    title: 'Create a project',
    body: 'Projects → New Project, with a real target base URL. This is the site every test case and run for this project points at.',
  },
  {
    title: 'Add a login credential (only if the flow needs authentication)',
    body: 'On the project’s detail page, add a label + username + password. Stored encrypted, only ever decrypted by the worker at run time — never sent to the AI or the browser. Generated test cases can then reference it by label with a login step.',
  },
  {
    title: 'Write a requirement and generate test cases',
    body: 'Requirements & Specs (or a project’s own page) → add requirement text → open it → Generate Test Cases. Review what comes back, then approve the ones you want runnable.',
  },
  {
    title: 'Make sure the Playwright worker is reachable',
    body: 'This is the one piece that has to be running somewhere the web app can reach over HTTP: WORKER_URL and WORKER_SHARED_SECRET must be set on the web app and must match the worker’s own configuration. Locally this is just npm run dev:worker on your machine. In production it needs to be a real, always-on host — a plain serverless function can’t keep a browser process alive long enough to run Playwright.',
  },
  {
    title: 'Trigger a run and check the result',
    body: 'Test Runs → pick the project → Run Approved Tests. Watch the result on the run’s own page, the Dashboard, or Test History. A failure should show evidence within a few seconds, and an AI analysis shortly after.',
  },
  {
    title: '(Optional) Connect the ICore Bug Tracker',
    body: 'Set BUG_TRACKER_BASE_URL and BUG_TRACKER_API_KEY on the server to see real failures turn into real bugs on the Bug Tracker page, with a link out to ICore for each one.',
  },
];

const CONSTRAINTS = [
  'ICore’s Automation API is write-only — it can accept a new bug but has no endpoint to read one back, so this app can’t show live status changes made directly in ICore. The "View in ICore" link is always the current, authoritative source.',
  'Each AI provider has its own rate limits. Free tiers in particular can be very restrictive (e.g. a low fixed number of requests per day) — a single test run with several failures can cost multiple AI calls (one to analyze each failure, one more to draft each new bug), so a restrictive free tier can be exhausted quickly.',
  'The worker needs a persistent process somewhere reachable by the web app. Everything else in this app (auth, projects, requirements, AI test generation, review/approve, Dashboard, Reports, Test History, Bug Tracker, Settings) works without it — only actually triggering and executing a run needs it.',
];

export default function DocumentationPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
          Reference
        </div>
        <h1 className="text-xl font-semibold">Documentation</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          How this application works, end to end, and what needs to be in place before a
          requirement can turn into a real, executed, evidence-backed result.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">How QAPipeX works</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          One pipeline, start to finish. Everything below runs in this order for a single
          requirement.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {PIPELINE_STAGES.map((stage) => (
            <div key={stage.title} className="rounded border border-border bg-surface-raised p-4">
              <h3 className="text-sm font-semibold">{stage.title}</h3>
              <p className="mt-1 text-sm text-muted">{stage.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Setting up to test end to end</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          What actually has to be in place for a real run to work, in the order you&rsquo;d
          normally set it up.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {SETUP_STEPS.map((step, i) => (
            <div key={step.title} className="flex gap-3 rounded border border-border bg-surface-raised p-4">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 font-mono text-xs font-semibold text-accent">
                {i + 1}
              </div>
              <div>
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Known constraints</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Things that are true about this system by design, not bugs to expect a fix for.
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          {CONSTRAINTS.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-muted">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
