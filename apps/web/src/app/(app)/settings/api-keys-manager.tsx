'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AI_PROVIDERS, AI_PROVIDER_ENV_VAR, AI_PROVIDER_LABELS, type AIProvider } from '@qapipex/ai-service';

type KeyStatus = Record<AIProvider, { storedAt: string | null; hasEnvVar: boolean }>;

function ProviderKeyRow({ provider, status }: { provider: AIProvider; status: KeyStatus[AIProvider] }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/settings/ai-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey: value }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Failed to save key');
      return;
    }
    setValue('');
    router.refresh();
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/settings/ai-keys', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Failed to remove key');
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-border bg-surface-raised px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="text-sm">{AI_PROVIDER_LABELS[provider]}</div>
        {status.storedAt ? (
          <span className="rounded border border-accent/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent">
            saved {new Date(status.storedAt).toLocaleDateString()}
          </span>
        ) : status.hasEnvVar ? (
          <span className="rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
            using {AI_PROVIDER_ENV_VAR[provider]}
          </span>
        ) : (
          <span className="rounded border border-warning/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-warning">
            key missing
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={status.storedAt ? 'Replace saved key…' : 'Paste API key…'}
          className="flex-1 rounded border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button
          onClick={handleSave}
          disabled={busy || !value.trim()}
          className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-background hover:bg-accent-dim disabled:opacity-50"
        >
          Save
        </button>
        {status.storedAt && (
          <button
            onClick={handleRemove}
            disabled={busy}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function ApiKeysManager({ keyStatus }: { keyStatus: KeyStatus }) {
  return (
    <div className="flex flex-col gap-3">
      {AI_PROVIDERS.map((provider) => (
        <ProviderKeyRow key={provider} provider={provider} status={keyStatus[provider]} />
      ))}
    </div>
  );
}
