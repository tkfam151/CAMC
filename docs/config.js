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
 */
window.CAMC_CONFIG = {
  supabaseUrl: 'https://rbdgizbcocuzahuwnjtx.supabase.co',
  supabaseAnonKey: 'sb_publishable_jCmTggKoH6quMAnvSeAj1w_0rJuajfU',
};
