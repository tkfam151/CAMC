/*
 * Supabase connection for CAMC Seating.
 *
 * Fill these in from Supabase Dashboard → Project Settings → API:
 *   supabaseUrl      "Project URL", e.g. https://abcdefghijklm.supabase.co
 *   supabaseAnonKey  the "anon" / publishable key
 *
 * Both values are meant to be public: the database only lets visitors read
 * seating charts, and every change needs a teacher sign-in (see
 * supabase/schema.sql). Never put the service_role key here.
 *
 * Alternatively, leave this file as it is and set the repository variables
 * SUPABASE_URL and SUPABASE_ANON_KEY (Settings → Secrets and variables →
 * Actions → Variables); the GitHub Pages workflow writes them in on deploy.
 */
window.CAMC_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};
