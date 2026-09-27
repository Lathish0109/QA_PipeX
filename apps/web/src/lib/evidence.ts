import { createServiceClient } from '@qapipex/db';

/** Evidence lives in a private bucket; generate a short-lived signed URL to display it. */
export async function signEvidenceUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from('evidence').createSignedUrl(path, 60 * 10);
  if (error) return null;
  return data.signedUrl;
}
