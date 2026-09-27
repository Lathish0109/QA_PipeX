import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { reconcileStaleRuns } from '@/lib/reconcile';
import { TriggerRunForm } from './trigger-run-form';

const STATUS_STYLES: Record<string, string> = {
  queued: 'text-muted border-border',
  running: 'text-blue-300 border-blue-400/30',
  passed: 'text-accent border-accent/30',
  failed: 'text-danger border-danger/30',
  partial: 'text-warning border-warning/30',
  error: 'text-danger border-danger/30',
};

export default async function TestRunsPage() {
  const supabase = await createClient();
  await reconcileStaleRuns(supabase);

  const { data: projects } = await supabase.from('projects').select('id, name');
  const { data: runs } = await supabase
    .from('test_runs')
    .select('*')
    .order('created_at', { ascending: false });
  const { data: results } = await supabase.from('test_results').select('test_run_id, status');

  const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const resultCounts = new Map<string, { total: number; passed: number; failed: number }>();
  for (const r of results ?? []) {
    const entry = resultCounts.get(r.test_run_id) ?? { total: 0, passed: 0, failed: 0 };
    entry.total += 1;
    if (r.status === 'passed') entry.passed += 1;
    if (r.status === 'failed' || r.status === 'error') entry.failed += 1;
    resultCounts.set(r.test_run_id, entry);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
          Execution
        </div>
        <h1 className="text-xl font-semibold">Test Runs</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Runs every approved test case for a project through Playwright. Evidence (screenshot,
          trace, console log) is captured automatically on any failure.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Trigger a run</h2>
        {projects && projects.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            You need a project with approved test cases first.
          </p>
        ) : (
          <div className="mt-4">
            <TriggerRunForm projects={projects ?? []} />
          </div>
        )}
      </div>

      {(!runs || runs.length === 0) && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
          No test runs yet — approve some test cases in the{' '}
          <Link href="/test-generator" className="text-accent hover:underline">
            AI Test Generator
          </Link>
          , then trigger a run above.
        </div>
      )}

      <div className="flex flex-col gap-3">
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
                <div className="flex items-center gap-3">
                  {counts && (
                    <span className="text-xs text-muted">
                      {counts.passed}/{counts.total} passed
                    </span>
                  )}
                  <span
                    className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${STATUS_STYLES[run.status]}`}
                  >
                    {run.status}
                  </span>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-muted">
                Created {new Date(run.created_at).toLocaleString()}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
