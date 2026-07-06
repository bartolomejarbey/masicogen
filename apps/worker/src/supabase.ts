import { createClient } from "@supabase/supabase-js";
import { workerConfig } from "./config";

export function workerSupabaseConfigured() {
  return Boolean(workerConfig.supabaseUrl && workerConfig.supabaseServiceRoleKey);
}

export function createWorkerSupabaseClient() {
  if (!workerSupabaseConfigured()) {
    return null;
  }

  return createClient(workerConfig.supabaseUrl, workerConfig.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
