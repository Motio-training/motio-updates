/* ==========================================================================
   FICHIER PROTÉGÉ — pendant Web de SupabaseConfig.kt.
   Ne jamais l'écraser dans une livraison ultérieure.

   La clé anon est publique par conception : elle est déjà compilée dans l'APK
   et n'importe qui peut l'en extraire. C'est la Row Level Security qui protège
   les données. La clé « service_role » ne doit JAMAIS apparaître ici.
   ========================================================================== */

export const CONFIG = {
  SUPABASE_URL: 'https://mwjfhavvoiafjueecopg.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13amZoYXZ2b2lhZmp1ZWVjb3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MjU1NTIsImV4cCI6MjEwMTMwMTU1Mn0.HESGew6nlDKjs3vRW73VGaKZqY5qpNX_xEq4tLWHoO4',

  /* Adresse publique de l'espace web. À déclarer aussi dans
     Supabase › Authentication › URL Configuration › Redirect URLs. */
  SITE_URL: 'https://motio-training.github.io/motio-updates/app/',

  DOWNLOAD_URL: 'https://github.com/Motio-training/motio-updates/releases/latest',

  /* Tables. Toutes existent déjà côté Android sauf synced_workouts/
     synced_programs (sql/01_schema.sql). */
  TABLES: {
    profiles: 'profiles',
    follows: 'follows',
    sharedSessions: 'shared_sessions',
    kudos: 'kudos',
    comments: 'comments',
    workouts: 'synced_workouts',
    programs: 'synced_programs',
    messages: 'messages',
    messageReactions: 'message_reactions',
    groups: 'groups',
    groupMembers: 'group_members',
    groupMessages: 'group_messages',
    liveSessions: 'live_sessions',
    coachMessages: 'coach_messages'
  }
};
