<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your app (Supabase Auth + Supabase data)

This is a Vite + React frontend-only app.

- **Authentication:** Supabase Auth
- **Data layer:** Supabase (`@supabase/supabase-js`)
- **No Cloudflare Worker backend/proxy layer**

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```
3. Fill in `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Run the app:
   ```bash
   npm run dev
   ```

## Authentication flows

The app now uses Supabase Auth for:

- Email/password sign up
- Email/password sign in
- Google OAuth sign in
- Session persistence and auth state listening via `supabase.auth.onAuthStateChange`
- Sign out

## Deployment notes (Vercel)

- Deploy only the frontend build output (`vite build` => `dist/`).
- Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project environment variables.
- Enable the desired auth providers (e.g. Google) in the Supabase dashboard.
