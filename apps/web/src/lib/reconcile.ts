import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@qapipex/db';

/**
 * A test_run can get stuck showing "running" forever if the worker process
 * dies mid-run, the web server restarts before persisting the final status,
 * or the request is otherwise interrupted after `status: 'running'` was set
 * but before the worker's response came back. There's no background job to
 * catch this — it's reconciled lazily, here, whenever a page that lists or
 * shows runs is loaded. The worker's own request has a 120s timeout
 * (see api/test-runs/route.ts), so anything still "running" well past that
 * is not actually running anymore.
 */
export async function reconcileStaleRuns(supabase: SupabaseClient<Database>): Promise<void> {
  const staleThreshold = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  await supabase
    .from('test_runs')
    .update({ status: 'error', completed_at: new Date().toISOString() })
    .eq('status', 'running')
    .lt('started_at', staleThreshold);
}
