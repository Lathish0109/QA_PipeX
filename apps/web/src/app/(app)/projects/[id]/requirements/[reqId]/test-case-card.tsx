'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Database } from '@qapipex/db';
import type { TestStep } from '@qapipex/shared-types';

type TestCaseRow = Database['public']['Tables']['test_cases']['Row'];

const TYPE_STYLES: Record<string, string> = {
  positive: 'bg-accent/10 text-accent',
  negative: 'bg-danger/10 text-danger',
  edge: 'bg-warning/10 text-warning',
  validation: 'bg-blue-400/10 text-blue-300',
};

const STATUS_STYLES: Record<string, string> = {
  draft: 'text-warning border-warning/30',
  approved: 'text-accent border-accent/30',
  rejected: 'text-danger border-danger/30',
};

export function TestCaseCard({ testCase }: { testCase: TestCaseRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(testCase.title);
  const [description, setDescription] = useState(testCase.description ?? '');
  const [expectedResult, setExpectedResult] = useState(testCase.expected_result);
  const [steps, setSteps] = useState<TestStep[]>((testCase.steps as unknown as TestStep[]) ?? []);

  function updateStep(index: number, field: keyof TestStep, value: string) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function addStep() {
    setSteps((prev) => [...prev, { action: '', target: '', value: '' }]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSaveEdit() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/test-cases/${testCase.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, expectedResult, steps }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Failed to save changes');
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function handleAction(action: 'approve' | 'reject') {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/test-cases/${testCase.id}/${action}`, { method: 'POST' });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Failed to ${action} test case`);
      return;
    }
    router.refresh();
  }

  const isDraft = testCase.status === 'draft';

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${TYPE_STYLES[testCase.type] ?? 'bg-muted/10 text-muted'}`}
        >
          {testCase.type}
        </span>
        <span
          className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${STATUS_STYLES[testCase.status]}`}
        >
          {testCase.status}
        </span>
        <span className="font-mono text-[10px] text-muted">
          {testCase.generated_by === 'ai' ? 'AI-generated' : 'Human-authored'}
        </span>
      </div>

      {editing ? (
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="rounded border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted">Steps</span>
            {steps.map((step, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  value={step.action}
                  onChange={(e) => updateStep(i, 'action', e.target.value)}
                  placeholder="action"
                  className="w-28 rounded border border-border bg-surface-raised px-2 py-1.5 text-xs outline-none focus:border-accent"
                />
                <input
                  value={step.target ?? ''}
                  onChange={(e) => updateStep(i, 'target', e.target.value)}
                  placeholder="target"
                  className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-xs outline-none focus:border-accent"
                />
                <input
                  value={step.value ?? ''}
                  onChange={(e) => updateStep(i, 'value', e.target.value)}
                  placeholder="value"
                  className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-xs outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  className="text-xs text-danger hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addStep}
              className="w-fit text-xs text-muted hover:text-foreground"
            >
              + Add step
            </button>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Expected result</span>
            <textarea
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
              rows={2}
              className="rounded border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <div className="flex gap-2">
            <button
              onClick={handleSaveEdit}
              disabled={busy}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-background hover:bg-accent-dim disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <h3 className="text-sm font-semibold">{testCase.title}</h3>
          {testCase.description && (
            <p className="mt-1 text-sm text-muted">{testCase.description}</p>
          )}

          {steps.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded border border-border">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th className="px-2 py-1.5 font-mono font-normal">#</th>
                    <th className="px-2 py-1.5 font-mono font-normal">Action</th>
                    <th className="px-2 py-1.5 font-mono font-normal">Target</th>
                    <th className="px-2 py-1.5 font-mono font-normal">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((step, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-2 py-1.5 text-muted">{i + 1}</td>
                      <td className="px-2 py-1.5 text-accent">{step.action}</td>
                      <td className="px-2 py-1.5 font-mono text-muted">{step.target || '—'}</td>
                      <td className="px-2 py-1.5 font-mono text-muted">{step.value || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 text-xs">
            <span className="text-muted">Expected: </span>
            {testCase.expected_result}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {isDraft && !editing && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => handleAction('approve')}
            disabled={busy}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-background hover:bg-accent-dim disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => setEditing(true)}
            disabled={busy}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
          >
            Edit
          </button>
          <button
            onClick={() => handleAction('reject')}
            disabled={busy}
            className="rounded border border-danger/30 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
