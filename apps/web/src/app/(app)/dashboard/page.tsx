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

export default async function DashboardPage() {
  const supabase = await createClient();
  await reconcileStaleRuns(supabase);

  const [
    { count: projectCount },
    { count: testRunCount },
    { count: approvedTestCaseCount },
    { count: bugCount },
    { data: projects },
    { data: recentRuns },
    { data: recentAnalyses },
  ] = await Promise.all([
    supabase.from('projects').select('*', { count: 'exact', head: true }),
    supabase.from('test_runs').select('*', { count: 'exact', head: true }),
    supabase.from('test_cases').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('bug_references').select('*', { count: 'exact', head: true }),
    supabase.from('projects').select('id, name'),
    supabase.from('test_runs').select('*').order('created_at', { ascending: false }).limit(5),
    supabase.from('failure_analyses').select('*').order('created_at', { ascending: false }).limit(5),
  ]);

  const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]));

  const stats = [
    { label: 'Projects', value: projectCount ?? 0 },
    { label: 'Test Runs', value: testRunCount ?? 0 },
    { label: 'Approved Test Cases', value: approvedTestCaseCount ?? 0 },
    { label: 'Bugs Synced to ICore', value: bugCount ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
          QA Operations
        </div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-surface p-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
              {stat.label}
            </div>
            <div className="mt-2 text-2xl font-semibold">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold">Recent Test Runs</h2>
          {(!recentRuns || recentRuns.length === 0) && (
            <p className="mt-2 text-sm text-muted">No test runs yet.</p>
          )}
          <div className="mt-3 flex flex-col gap-2">
            {recentRuns?.map((run) => (
              <Link
                key={run.id}
                href={`/test-runs/${run.id}`}
                className="flex items-center justify-between rounded border border-border bg-surface-raised px-3 py-2 text-xs transition hover:border-accent"
              >
                <span>{projectNameById.get(run.project_id) ?? 'Unknown project'}</span>
                <span
                  className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${STATUS_STYLES[run.status]}`}
                >
                  {run.status}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold">Recent AI Failure Diagnoses</h2>
          {(!recentAnalyses || recentAnalyses.length === 0) && (
            <p className="mt-2 text-sm text-muted">No failures analyzed yet.</p>
          )}
          <div className="mt-3 flex flex-col gap-2">
            {recentAnalyses?.map((a) => (
              <div key={a.id} className="rounded border border-border bg-surface-raised px-3 py-2 text-xs">
                <span className="text-muted">{a.confidence_level ?? 'unknown'} confidence — </span>
                {a.summary}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Getting started</h2>
        <p className="mt-2 text-sm text-muted">
          Create a project to give the AI Test Generator a target site, then add a
          requirement to generate your first set of test cases.
        </p>
        <Link
          href="/projects"
          className="mt-4 inline-block rounded bg-accent px-3 py-2 text-sm font-medium text-background transition hover:bg-accent-dim"
        >
          Go to Projects
        </Link>
      </div>
    </div>
  );
}
