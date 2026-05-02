/**
 * Supabase Client — Harsh Makeovers
 *
 * Creates a Supabase admin client used for Storage operations (uploading
 * portfolio images/videos). Uses the service role key which bypasses
 * Row Level Security — this is safe because only our backend calls it.
 *
 * Usage:
 *   import { supabase } from "../config/supabase";
 *   await supabase.storage.from("portfolio").upload(path, file);
 */

import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
