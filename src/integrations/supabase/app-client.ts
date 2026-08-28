// Cliente do banco usado pelo app (base do escritório).
// Mantido fora do arquivo gerado automaticamente para não ser revertido.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { brokeredPreviewStorage } from './previewAuthStorage';

export const APP_SUPABASE_URL = 'https://olyvjnqmrzkziirzbmhi.supabase.co';
export const APP_SUPABASE_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9seXZqbnFtcnpremlpcnpibWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MjY4NDUsImV4cCI6MjEwMjIwMjg0NX0.3_OyS_gB7ZeDY9fMcYBSqeypGYO0aW57vfEne-XB97w';

function createAppClient() {
  return createClient<Database>(APP_SUPABASE_URL, APP_SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: brokeredPreviewStorage(),
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _client: ReturnType<typeof createAppClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createAppClient>, {
  get(_, prop, receiver) {
    if (!_client) _client = createAppClient();
    return Reflect.get(_client, prop, receiver);
  },
});
