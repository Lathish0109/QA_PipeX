import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret, type Database } from '@qapipex/db';
import { createAIService, isProviderConfigured, type AIProvider, type AIService } from '@qapipex/ai-service';

const DEFAULT_PROVIDER: AIProvider = 'anthropic';

export async function getActiveProvider(supabase: SupabaseClient<Database>): Promise<AIProvider> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'ai_provider').single();
  const provider = (data?.value as { provider?: string } | null)?.provider;
  if (provider === 'anthropic' || provider === 'openai' || provider === 'gemini') {
    return provider;
  }
  return DEFAULT_PROVIDER;
}

/** A key saved from the Settings page (encrypted in `ai_provider_keys`) takes priority
 * over the provider's env var, so rotating a key never needs a redeploy. Returns
 * undefined (falls back to the env var) if nothing's stored or decryption isn't set up. */
export async function getStoredProviderKey(
  supabase: SupabaseClient<Database>,
  provider: AIProvider,
): Promise<string | undefined> {
  const { data } = await supabase
    .from('ai_provider_keys')
    .select('encrypted_key')
    .eq('provider', provider)
    .maybeSingle();
  if (!data) return undefined;
  try {
    return decryptSecret(data.encrypted_key);
  } catch {
    return undefined;
  }
}

/** Builds the AIService for whichever provider is currently active in Settings. */
export async function getActiveAIService(supabase: SupabaseClient<Database>): Promise<AIService> {
  const provider = await getActiveProvider(supabase);
  const storedKey = await getStoredProviderKey(supabase, provider);
  return createAIService(provider, storedKey);
}

/** True if a provider has a key from either source — a key saved in Settings
 * or the env var — since either one is usable at call time. */
export async function isProviderConfiguredAnywhere(
  supabase: SupabaseClient<Database>,
  provider: AIProvider,
): Promise<boolean> {
  if (isProviderConfigured(provider)) return true;
  const storedKey = await getStoredProviderKey(supabase, provider);
  return Boolean(storedKey);
}
