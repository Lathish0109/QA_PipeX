import { createServiceClient, decryptSecret } from '@qapipex/db';

/** Fetches and decrypts a project's stored login credential by its label. */
export async function getCredential(
  projectId: string,
  label: string,
): Promise<{ username: string; password: string } | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('project_credentials')
    .select('username, encrypted_password')
    .eq('project_id', projectId)
    .eq('label', label)
    .single();

  if (error || !data) return null;

  try {
    return { username: data.username, password: decryptSecret(data.encrypted_password) };
  } catch {
    return null;
  }
}
