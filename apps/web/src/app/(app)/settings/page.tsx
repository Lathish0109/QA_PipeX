import { createClient } from '@/lib/supabase/server';
import { getActiveProvider } from '@/lib/ai-provider';
import { AI_PROVIDERS, isProviderConfigured, type AIProvider } from '@qapipex/ai-service';
import { ProviderPicker } from './provider-picker';

export default async function SettingsPage() {
  const supabase = await createClient();
  const active = await getActiveProvider(supabase);
  const availability = Object.fromEntries(
    AI_PROVIDERS.map((p) => [p, isProviderConfigured(p)]),
  ) as Record<AIProvider, boolean>;

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
          applies to the whole workspace — everyone using the app shares the same setting. API
          keys are server-only environment variables, never entered here or sent to the browser.
        </p>

        <div className="mt-4">
          <ProviderPicker active={active} availability={availability} />
        </div>
      </div>
    </div>
  );
}
