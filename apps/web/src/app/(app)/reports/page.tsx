import { createClient } from '@/lib/supabase/server';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-danger',
  high: 'bg-warning',
  medium: 'bg-blue-400',
  low: 'bg-muted',
};

function BarRow({ label, count, total, colorClass }: { label: string; count: number; total: number; colorClass: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="capitalize">{label}</span>
        <span className="text-muted">
          {count} ({pct}%)
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function ReportsPage() {
  const supabase = await createClient();

  const [
    { data: projects },
    { data: runs },
    { data: results },
    { data: analyses },
    { count: bugCount },
  ] = await Promise.all([
    supabase.from('projects').select('id, name'),
    supabase.from('test_runs').select('id, project_id, status'),
    supabase.from('test_results').select('test_run_id, status'),
    supabase.from('failure_analyses').select('error_category, suggested_severity, confidence_level'),
    supabase.from('bug_references').select('*', { count: 'exact', head: true }),
  ]);

  const totalRuns = runs?.length ?? 0;
  const passedRuns = (runs ?? []).filter((r) => r.status === 'passed').length;
  const overallPassRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : null;

  const totalResults = results?.length ?? 0;
  const passedResults = (results ?? []).filter((r) => r.status === 'passed').length;
  const resultPassRate = totalResults > 0 ? Math.round((passedResults / totalResults) * 100) : null;

  const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const perProject = new Map<string, { total: number; passed: number }>();
  for (const run of runs ?? []) {
    const entry = perProject.get(run.project_id) ?? { total: 0, passed: 0 };
    entry.total += 1;
    if (run.status === 'passed') entry.passed += 1;
    perProject.set(run.project_id, entry);
  }

  const categoryCounts = new Map<string, number>();
  const severityCounts = new Map<string, number>();
  for (const a of analyses ?? []) {
    const cat = a.error_category ?? 'uncategorized';
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
    const sev = a.suggested_severity ?? 'unknown';
    severityCounts.set(sev, (severityCounts.get(sev) ?? 0) + 1);
  }
  const totalAnalyses = analyses?.length ?? 0;
  const sortedCategories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);
  const severityOrder = ['critical', 'high', 'medium', 'low'];
  const sortedSeverities = severityOrder
    .filter((s) => severityCounts.has(s))
    .map((s) => [s, severityCounts.get(s)!] as const);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
          Analytics
        </div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Aggregate trends across every project — pass rates, what keeps failing, and how
          severe it tends to be.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Test Runs
          </div>
          <div className="mt-2 text-2xl font-semibold">{totalRuns}</div>
          {overallPassRate !== null && (
            <div className="mt-1 text-xs text-muted">{overallPassRate}% ended fully passed</div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Test Case Pass Rate
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {resultPassRate !== null ? `${resultPassRate}%` : '—'}
          </div>
          <div className="mt-1 text-xs text-muted">{totalResults} test case executions</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Failures Analyzed
          </div>
          <div className="mt-2 text-2xl font-semibold">{totalAnalyses}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Bugs Synced to ICore
          </div>
          <div className="mt-2 text-2xl font-semibold">{bugCount ?? 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold">Pass Rate by Project</h2>
          {perProject.size === 0 && <p className="mt-2 text-sm text-muted">No test runs yet.</p>}
          <div className="mt-4 flex flex-col gap-3">
            {[...perProject.entries()].map(([projectId, { total, passed }]) => (
              <BarRow
                key={projectId}
                label={projectNameById.get(projectId) ?? 'Unknown project'}
                count={passed}
                total={total}
                colorClass="bg-accent"
              />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold">Failure Severity Distribution</h2>
          {sortedSeverities.length === 0 && (
            <p className="mt-2 text-sm text-muted">No failures analyzed yet.</p>
          )}
          <div className="mt-4 flex flex-col gap-3">
            {sortedSeverities.map(([severity, count]) => (
              <BarRow
                key={severity}
                label={severity}
                count={count}
                total={totalAnalyses}
                colorClass={SEVERITY_COLORS[severity] ?? 'bg-muted'}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Top Failure Categories</h2>
        <p className="mt-1 text-xs text-muted">
          What keeps breaking, ranked by how often the AI failure analyzer has categorized it
          this way.
        </p>
        {sortedCategories.length === 0 && (
          <p className="mt-2 text-sm text-muted">No failures analyzed yet.</p>
        )}
        <div className="mt-4 flex flex-col gap-3">
          {sortedCategories.map(([category, count]) => (
            <BarRow
              key={category}
              label={category}
              count={count}
              total={totalAnalyses}
              colorClass="bg-blue-400"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
