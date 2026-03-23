import { createClient } from '@supabase/supabase-js';
// This pulls in the types generatesd in types file!
import { Database } from '../types/supabase'; 

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables! Check your .env file.");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);