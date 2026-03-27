const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

export interface SupabaseQueryOptions {
  select: string;
  orderBy?: string;
  ascending?: boolean;
  offset?: number;
  limit?: number;
  filters?: string[];
}

function buildQuery(options: SupabaseQueryOptions): string {
  const params = new URLSearchParams();
  params.set('select', options.select);

  if (options.orderBy) {
    params.set('order', `${options.orderBy}.${options.ascending === false ? 'desc' : 'asc'}`);
  }

  for (const filter of options.filters || []) {
    const [key, value] = filter.split('=');
    if (key && value) {
      params.set(key, value);
    }
  }

  if (typeof options.offset === 'number') {
    params.set('offset', String(options.offset));
  }

  if (typeof options.limit === 'number') {
    params.set('limit', String(options.limit));
  }

  return params.toString();
}

export async function querySupabase<T = Record<string, unknown>>(
  table: string,
  options: SupabaseQueryOptions
): Promise<{ data: T[]; count?: number; error?: string }> {
  if (!hasSupabaseEnv || !supabaseUrl || !supabaseAnonKey) {
    return { data: [], error: 'Supabase environment variables are missing.' };
  }

  const query = buildQuery(options);
  const url = `${supabaseUrl}/rest/v1/${table}?${query}`;

  const response = await fetch(url, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Prefer: 'count=exact',
    },
  });

  const countHeader = response.headers.get('content-range');
  const count = countHeader?.includes('/') ? Number(countHeader.split('/')[1]) : undefined;

  if (!response.ok) {
    const msg = await response.text();
    return { data: [], error: msg || `Supabase returned ${response.status}` };
  }

  const data = (await response.json()) as T[];
  return { data, count };
}
