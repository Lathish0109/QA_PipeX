import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { reconcileStaleRuns } from '@/lib/reconcile';

const STATUS_STYLES: Record<string, string> = {
  queued: 'text-muted border-border',
  running: 'text-blue-300 border-blue-400/30',
  passed: 'text-accent border-accent/30',
  failed: 'text-danger border-danger/30',
  partial: 'text-warning border-warning/30',
  error: 'text-danger border-danger/30',
};

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return '—';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default async function TestHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; status?: string }>;
}) {
  const { project: projectFilter, status: statusFilter } = await searchParams;
  const supabase = await createClient();
  await reconcileStaleRuns(supabase);

  const { data: projects } = await supabase.from('projects').select('id, name').order('name');

  type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'partial' | 'error';
  const validStatuses: RunStatus[] = ['queued', 'running', 'passed', 'failed', 'partial', 'error'];
  const validStatus = validStatuses.find((s) => s === statusFilter);

  let query = supabase.from('test_runs').select('*').order('created_at', { ascending: false });
  if (projectFilter) query = query.eq('project_id', projectFilter);
  if (validStatus) query = query.eq('status', validStatus);
  const { data: runs } = await query;

  const { data: results } = await supabase.from('test_results').select('test_run_id, status');
  const resultCounts = new Map<string, { total: number; passed: number; failed: number }>();
  for (const r of results ?? []) {
    const entry = resultCounts.get(r.test_run_id) ?? { total: 0, passed: 0, failed: 0 };
    entry.total += 1;
    if (r.status === 'passed') entry.passed += 1;
    if (r.status === 'failed' || r.status === 'error') entry.failed += 1;
    resultCounts.set(r.test_run_id, entry);
  }

  const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]));

  const statusTabs = [
    { key: undefined, label: 'All' },
    { key: 'passed', label: 'Passed' },
    { key: 'partial', label: 'Partial' },
    { key: 'failed', label: 'Failed' },
    { key: 'error', label: 'Error' },
  ];

  function buildHref(overrides: { project?: string; status?: string }) {
    const params = new URLSearchParams();
    const p = overrides.project ?? projectFilter;
    const s = overrides.status ?? statusFilter;
    if (p) params.set('project', p);
    if (s) params.set('status', s);
    const qs = params.toString();
    return qs ? `/test-history?${qs}` : '/test-history';
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
          Archive
        </div>
        <h1 className="text-xl font-semibold">Test History</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Every test run ever executed, across every project — filter by project or outcome to
          find a specific run.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form action="/test-history" method="get" className="flex flex-wrap items-center gap-3">
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          <select
            name="project"
            defaultValue={projectFilter ?? ''}
            className="rounded border border-border bg-surface-raised px-3 py-1.5 text-xs text-foreground outline-none focus:border-accent"
          >
            <option value="">All projects</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
          >
            Apply
          </button>
        </form>

        <div className="flex gap-2">
          {statusTabs.map((tab) => {
            const isActive = (statusFilter ?? undefined) === tab.key;
            return (
              <Link
                key={tab.label}
                href={buildHref({ status: tab.key })}
                className={`rounded border px-3 py-1.5 text-xs transition ${
                  isActive ? 'border-accent text-accent' : 'border-border text-muted hover:text-foreground'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {runs && runs.length === 0 && (
          <p className="text-sm text-muted">No test runs match this filter.</p>
        )}
        {runs?.map((run) => {
          const counts = resultCounts.get(run.id);
          return (
            <Link
              key={run.id}
              href={`/test-runs/${run.id}`}
              className="rounded-lg border border-border bg-surface p-4 transition hover:border-accent"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                    {projectNameById.get(run.project_id) ?? 'Unknown project'}
                  </span>
                  <div className="font-mono text-xs text-muted">Run {run.id.slice(0, 8)}</div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted">
                  {counts && (
                    <span>
                      {counts.passed}/{counts.total} passed
                    </span>
                  )}
                  <span>{formatDuration(run.started_at, run.completed_at)}</span>
                  <span
                    className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${STATUS_STYLES[run.status]}`}
                  >
                    {run.status}
                  </span>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-muted">
                {new Date(run.created_at).toLocaleString()}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
