-- Lets the AI provider's API key be changed from the Settings page instead of
-- only via server env vars. One row per provider, workspace-wide (same
-- shared-workspace model as app_settings). A key stored here takes priority
-- over the matching env var at runtime; the env var stays as the initial/
-- fallback source so existing deployments keep working unchanged.
create table if not exists public.ai_provider_keys (
  provider text primary key check (provider in ('anthropic', 'openai', 'gemini')),
  encrypted_key text not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.ai_provider_keys enable row level security;
create policy "authenticated full access ai_provider_keys" on public.ai_provider_keys for all to authenticated using (true) with check (true);
