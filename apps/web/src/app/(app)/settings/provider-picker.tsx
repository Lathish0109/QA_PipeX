'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AI_PROVIDERS,
  AI_PROVIDER_ENV_VAR,
  AI_PROVIDER_LABELS,
  type AIProvider,
} from '@qapipex/ai-service';

export function ProviderPicker({
  active,
  availability,
}: {
  active: AIProvider;
  availability: Record<AIProvider, boolean>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<AIProvider>(active);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setLoading(true);
    setError(null);
    setSaved(false);
    const res = await fetch('/api/settings/ai-provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: selected }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Failed to save');
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {AI_PROVIDERS.map((provider) => {
        const configured = availability[provider];
        return (
          <label
            key={provider}
            className={`flex cursor-pointer items-center justify-between rounded border px-4 py-3 transition ${
              selected === provider ? 'border-accent bg-accent/5' : 'border-border bg-surface-raised'
            }`}
          >
            <div className="flex items-center gap-3">
              <input
                type="radio"
                name="provider"
                checked={selected === provider}
                onChange={() => setSelected(provider)}
                className="accent-accent"
              />
              <div>
                <div className="text-sm">{AI_PROVIDER_LABELS[provider]}</div>
                <div className="font-mono text-[10px] text-muted">{AI_PROVIDER_ENV_VAR[provider]}</div>
              </div>
            </div>
            <span
              className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                configured ? 'border-accent/30 text-accent' : 'border-warning/30 text-warning'
              }`}
            >
              {configured ? 'configured' : 'key missing'}
            </span>
          </label>
        );
      })}

      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={loading || selected === active}
          className="w-fit rounded bg-accent px-3 py-2 text-sm font-medium text-background transition hover:bg-accent-dim disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-xs text-accent">Saved.</span>}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>

      {!availability[selected] && (
        <p className="text-xs text-warning">
          {AI_PROVIDER_LABELS[selected]} isn&rsquo;t configured on the server yet — set{' '}
          {AI_PROVIDER_ENV_VAR[selected]} in apps/web/.env.local before selecting it, or AI calls
          will fail with a clear error until then.
        </p>
      )}
    </div>
  );
}
