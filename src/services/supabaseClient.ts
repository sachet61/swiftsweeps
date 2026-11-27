import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase is optional; credentials must be provided explicitly via environment variables.
export const DEFAULT_SUPABASE_URL = '';
export const DEFAULT_SUPABASE_ANON_KEY = '';
export const DEFAULT_SUPABASE_SERVICE_ROLE_KEY = '';
export const DEFAULT_SUPABASE_JWKS_URL = '';

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : ({} as Record<string, string | undefined>);
const proc = typeof process !== 'undefined' && process.env ? process.env : ({} as Record<string, string | undefined>);

const isPlaceholder = (val: string | undefined | null): boolean => {
  if (!val) return true;
  const v = val.trim().toLowerCase();
  return (
    !v ||
    v.includes('your-project') ||
    v.includes('your-supabase') ||
    v.includes('example.com') ||
    v === 'placeholder' ||
    v.includes('undefined') ||
    v.includes('null')
  );
};

const resolveSupabaseUrl = (): string => {
  const candidate = (
    env.VITE_SUPABASE_URL ||
    proc.VITE_SUPABASE_URL ||
    proc.SUPABASE_URL ||
    ''
  ).trim();
  return isPlaceholder(candidate) ? DEFAULT_SUPABASE_URL : candidate;
};

const resolveSupabaseAnonKey = (): string => {
  const candidate = (
    env.VITE_SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    proc.VITE_SUPABASE_ANON_KEY ||
    proc.SUPABASE_PUBLISHABLE_KEY ||
    proc.SUPABASE_ANON_KEY ||
    ''
  ).trim();
  return isPlaceholder(candidate) ? DEFAULT_SUPABASE_ANON_KEY : candidate;
};

const resolveSupabaseServiceRoleKey = (): string => {
  const candidate = (
    proc.SUPABASE_SERVICE_ROLE_KEY ||
    proc.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
  return isPlaceholder(candidate) ? DEFAULT_SUPABASE_SERVICE_ROLE_KEY : candidate;
};

const resolveSupabaseJwksUrl = (): string => {
  const candidate = (
    env.VITE_SUPABASE_JWKS_URL ||
    proc.VITE_SUPABASE_JWKS_URL ||
    proc.SUPABASE_JWKS_URL ||
    ''
  ).trim();
  return isPlaceholder(candidate) ? DEFAULT_SUPABASE_JWKS_URL : candidate;
};

export const supabaseUrl = resolveSupabaseUrl();
export const supabaseAnonKey = resolveSupabaseAnonKey();
export const supabaseServiceRoleKey = resolveSupabaseServiceRoleKey();
export const supabaseJwksUrl = resolveSupabaseJwksUrl();

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    !isPlaceholder(supabaseUrl) &&
    !isPlaceholder(supabaseAnonKey)
  );
};

function resolveProjectId(url: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.split('.')[0] || '';
  } catch {
    return '';
  }
}

export const getSupabaseConfig = () => ({
  url: supabaseUrl,
  hasKey: Boolean(supabaseAnonKey),
  isReady: isSupabaseConfigured(),
  projectId: resolveProjectId(supabaseUrl),
  jwksUrl: supabaseJwksUrl,
});

// Single authoritative Supabase client when configured; null in standalone in-memory/self-hosted mode
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'aetherpay_supabase_auth_token',
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : null;

export async function testSupabaseConnection(): Promise<{ ok: boolean; message: string }> {
  if (!supabase) {
    return { ok: false, message: 'Supabase is not configured in this environment.' };
  }
  try {
    const { error } = await supabase.auth.getSession();
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true, message: `Connected to Supabase (${supabaseUrl}) successfully!` };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Connection check failed' };
  }
}
