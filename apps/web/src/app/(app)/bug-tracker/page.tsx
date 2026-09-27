import { createClient } from '@/lib/supabase/server';

export default async function BugTrackerPage() {
  const supabase = await createClient();
  const { data: bugs } = await supabase
    .from('bug_references')
    .select('*')
    .order('created_at', { ascending: false });

  const analysisIds = (bugs ?? []).map((b) => b.failure_analysis_id);
  const { data: analyses } = analysisIds.length
    ? await supabase.from('failure_analyses').select('id, summary, suggested_severity').in('id', analysisIds)
    : { data: [] };
  const analysisById = new Map((analyses ?? []).map((a) => [a.id, a]));

  const configured = Boolean(process.env.BUG_TRACKER_BASE_URL && process.env.BUG_TRACKER_API_KEY);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
          ICore Integration
        </div>
        <h1 className="text-xl font-semibold">Bug Tracker</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          This system never owns bug data — once a failure is analyzed, a structured bug is sent
          to your ICore Bug Tracker via API automatically, and this page shows each synced
          bug&rsquo;s ID and the status it had at creation time. ICore&rsquo;s Automation API is
          write-only (it accepts new bugs but has no endpoint to read them back), so status,
          assignment, and comments can change in ICore without this page ever knowing — use
          &ldquo;View in ICore&rdquo; below for the current, authoritative state.
        </p>
        {!configured && (
          <p className="mt-2 text-xs text-warning">
            BUG_TRACKER_BASE_URL / BUG_TRACKER_API_KEY aren&rsquo;t set yet, so failures are
            analyzed but not synced — set them in apps/web/.env.local once you have the real
            ICore API contract confirmed.
          </p>
        )}
      </div>

      {(!bugs || bugs.length === 0) && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
          No bugs synced yet — this fills in automatically once a test run has a failure that
          gets analyzed and (with the Bug Tracker credentials set) synced.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {bugs?.map((bug) => {
          const analysis = analysisById.get(bug.failure_analysis_id);
          return (
            <div key={bug.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs">{bug.external_bug_id}</span>
                {bug.cached_status && (
                  <span
                    title="Status at creation time — ICore's API can't report changes back"
                    className="rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted"
                  >
                    {bug.cached_status} at creation
                  </span>
                )}
              </div>
              {analysis && <h3 className="mt-2 text-sm font-semibold">{analysis.summary}</h3>}
              {bug.external_bug_url ? (
                <a
                  href={bug.external_bug_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block text-xs font-medium text-accent hover:underline"
                >
                  View current status in ICore →
                </a>
              ) : (
                <p className="mt-1 text-[11px] text-muted">
                  No link returned by ICore for this bug.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
