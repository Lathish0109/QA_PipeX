import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@qapipex/db';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Cookie-bound Supabase client for Route Handlers and Server Components.
 * Runs as the signed-in user, so Row Level Security still applies.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll is called from a Server Component during render, where
            // cookies can't be written — middleware refreshes the session
            // instead, so this is safe to ignore.
          }
        },
      },
    },
  );
}
