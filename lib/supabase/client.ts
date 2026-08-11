import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vtmjejhpdruupfvgjrhh.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0bWplamhwZHJ1dXBmdmdqcmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDgyMDUsImV4cCI6MjA4MzE4NDIwNX0.uckMFtk622u9jG2-E8dSdHwIMj8QM7SUZ6y2thSbaoI";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    },
});
