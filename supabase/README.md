# Supabase Setup

1) Create a Supabase project and capture:
   - SUPABASE_URL
   - SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY (server only)

2) Apply schema:
   - Open SQL Editor and run the contents of migrations/0001_init.sql
   - Or use Supabase CLI to apply.

3) Next steps:
   - Add Storage buckets for media (images/audio) and configure CORS for Admin/Mobile.
   - Enable RLS and add policies per the PDR once services are wired.
