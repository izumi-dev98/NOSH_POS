import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const useSupabaseProxy = import.meta.env.PROD || import.meta.env.VITE_USE_SUPABASE_PROXY === "true";
const supabaseClientUrl = useSupabaseProxy
	? `${window.location.origin}/supabase`
	: supabaseUrl;

if (!supabaseClientUrl || !supabaseAnonKey) {
	throw new Error(
		"Missing environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required."
	);
}

const supabase = createClient(supabaseClientUrl, supabaseAnonKey);

export default supabase;