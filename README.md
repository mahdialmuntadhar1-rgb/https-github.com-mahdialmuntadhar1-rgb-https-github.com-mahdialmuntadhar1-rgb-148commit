# Iraq Compass Frontend

Vite + React frontend for Iraq Compass, deployed on **Cloudflare Pages** with **Supabase** for backend data and authentication.

## Stack

- Frontend: Vite + React + TypeScript
- Hosting: Cloudflare Pages (static build)
- Backend/Auth: Supabase (REST + auth)

> This repository is Cloudflare Pages only. Do not convert it to Cloudflare Workers deployment.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create a local env file (for example `.env.local`) with:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Start the dev server:

```bash
npm run dev
```

## Build and verification

```bash
npm run lint
npm run build
npm run verify
```

## Cloudflare Pages deployment

Use these settings:

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
