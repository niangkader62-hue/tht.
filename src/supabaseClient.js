import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://tgcltyibsorhotoiogeu.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_nD9KlhROSbf7L4JU3R70EA_DgrWOndL";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
});
