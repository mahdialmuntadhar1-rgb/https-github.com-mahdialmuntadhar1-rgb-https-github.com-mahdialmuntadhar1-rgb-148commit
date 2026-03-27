# Final verification — Supabase-only stack (2026-03-27)

## Completed checks

1. Authentication is fully handled by Supabase Auth (`supabase.auth` listener + sign-in/sign-up/sign-out methods).
2. Data reads/writes continue to use the same Supabase client (`services/supabase.ts` + `services/api.ts`).
3. Environment variables are Supabase-only (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. Dependency graph no longer includes the legacy auth SDK.
5. Build and type checks should be re-run after dependencies are installed in a network-enabled environment.

## Post-migration reminders

- Confirm redirect URLs for OAuth providers in Supabase Auth settings.
- Confirm row-level-security rules use `auth.uid()` and match the `users.id` strategy.
- If old `users.id` values came from a prior identity system, run an ID-alignment migration before production cutover.
