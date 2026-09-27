import { createClient } from '@/lib/supabase/server';
import { getActiveProvider, isProviderConfiguredAnywhere } from '@/lib/ai-provider';
import { AI_PROVIDERS, isProviderConfigured, type AIProvider } from '@qapipex/ai-service';
import { ProviderPicker } from './provider-picker';
import { ApiKeysManager } from './api-keys-manager';

export default async function SettingsPage() {
  const supabase = await createClient();
  const active = await getActiveProvider(supabase);
  const availability = Object.fromEntries(
    await Promise.all(AI_PROVIDERS.map(async (p) => [p, await isProviderConfiguredAnywhere(supabase, p)])),
  ) as Record<AIProvider, boolean>;

  const { data: storedKeys } = await supabase.from('ai_provider_keys').select('provider, updated_at');
  const keyStatus = Object.fromEntries(
    AI_PROVIDERS.map((p) => [
      p,
      {
        storedAt: storedKeys?.find((row) => row.provider === p)?.updated_at ?? null,
        hasEnvVar: isProviderConfigured(p),
      },
    ]),
  ) as Record<AIProvider, { storedAt: string | null; hasEnvVar: boolean }>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
          Workspace
        </div>
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">AI Provider</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Pick which model powers test generation, failure analysis, and bug drafting. This
          applies to the whole workspace — everyone using the app shares the same setting.
        </p>

        <div className="mt-4">
          <ProviderPicker active={active} availability={availability} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">API Keys</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Set or rotate a provider&rsquo;s key here — it&rsquo;s encrypted before it&rsquo;s
          stored, takes effect on the very next AI call, and needs no redeploy. A key saved here
          overrides that provider&rsquo;s server environment variable; remove it to fall back to
          the env var instead.
        </p>

        <div className="mt-4">
          <ApiKeysManager keyStatus={keyStatus} />
        </div>
      </div>
    </div>
  );
}
