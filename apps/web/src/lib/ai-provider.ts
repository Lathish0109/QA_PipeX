import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@qapipex/db';
import { createAIService, type AIProvider, type AIService } from '@qapipex/ai-service';

const DEFAULT_PROVIDER: AIProvider = 'anthropic';

export async function getActiveProvider(supabase: SupabaseClient<Database>): Promise<AIProvider> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'ai_provider').single();
  const provider = (data?.value as { provider?: string } | null)?.provider;
  if (provider === 'anthropic' || provider === 'openai' || provider === 'gemini') {
    return provider;
  }
  return DEFAULT_PROVIDER;
}

/** Builds the AIService for whichever provider is currently active in Settings. */
export async function getActiveAIService(supabase: SupabaseClient<Database>): Promise<AIService> {
  const provider = await getActiveProvider(supabase);
  return createAIService(provider);
}
