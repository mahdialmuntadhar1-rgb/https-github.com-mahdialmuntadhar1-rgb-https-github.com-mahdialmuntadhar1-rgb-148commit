# Phase 3 — Data layer mapping only (Firestore ➜ Supabase/PostgreSQL)

This document maps the currently visible Firestore data layer to an equivalent Supabase/PostgreSQL model **without rewriting frontend calls yet**.

Scope used for this mapping:
- `services/api.ts`
- `firestore.rules`
- `types.ts`
- legacy auth bootstrap module (name updated during migration)

If something is not present in those files, it is flagged as uncertain instead of inferred.

## 1) Firestore collections/documents used in code

### Actively used by runtime code (`services/api.ts`)

1. `test/connection` (single document path)
   - Used by `testConnection()` via `getDocFromServer(doc(db, 'test', 'connection'))` as connectivity check.

2. `businesses` (collection)
   - Read with optional filters (`category`, `city` prefix, `governorate`, `isFeatured`) + pagination.

3. `posts` (collection)
   - Read via realtime subscription (`onSnapshot`) ordered by `createdAt desc`.
   - Write via `addDoc` when creating a post.

4. `deals` (collection)
   - Read ordered by `createdAt desc`, limited.

5. `stories` (collection)
   - Read ordered by `createdAt desc`, limited.

6. `events` (collection)
   - Read ordered by `date asc`, optional filters on `category` and `governorate`.

7. `users/{uid}` (document)
   - Read for profile lookup.
   - Write (`setDoc`) for profile creation/merge updates.

8. `business_postcards` (collection)
   - Upsert-like write by deterministic document ID (`title_city` normalized).
   - Read ordered by `updatedAt desc`, optional `governorate` filter.

### Defined in rules, but not used in visible client code

9. `likes` (collection)
   - Full rules exist in `firestore.rules`, but no visible reads/writes in `services/api.ts`.
   - Treat as part of domain model, but migration priority can be lower unless used by hidden code.

## 2) Observed read/write/update/delete patterns

## `businesses`
- **READ/LIST:**
  - `orderBy(name)` default.
  - If city search: range prefix on `city` + `orderBy(city), orderBy(name)`.
  - Optional equality filters: `category`, `governorate`, `isFeatured=true`.
  - Pagination with `startAfter(lastDoc)` + `limit`.
- **WRITE/UPDATE/DELETE in client code:** none visible.
- **Rules intent:** create admin-only; update owner-or-admin; delete admin-only.

## `posts`
- **READ/LIST (realtime):** `orderBy(createdAt desc)` + `limit(50)` via `onSnapshot`.
- **CREATE:** adds `createdAt=serverTimestamp()`, `likes=0`.
- **UPDATE/DELETE:** not exposed in visible API methods.
- **Rules intent:**
  - create: owners only, businessId must match owner profile businessId.
  - update: owner of business or admin; special likes-only increment/decrement allowed.
  - delete: owner of business or admin.

## `deals`
- **READ/LIST:** `orderBy(createdAt desc)` + `limit(10)`.
- **WRITE/UPDATE/DELETE in client code:** none visible.
- **Rules intent:** owners/admin create; owner-of-business/admin update/delete.

## `stories`
- **READ/LIST:** `orderBy(createdAt desc)` + `limit(20)`.
- **WRITE/UPDATE/DELETE in client code:** none visible.
- **Rules intent:** creator (userId == auth.uid) or admin can update/delete.

## `events`
- **READ/LIST:** `orderBy(date asc)` with optional `category`/`governorate` filters.
- **WRITE/UPDATE/DELETE in client code:** none visible.
- **Rules intent:** admin-only write.

## `users`
- **GET:** `getDoc(users/{uid})`.
- **UPSERT-like CREATE/UPDATE:** `setDoc(..., {merge:true})` in profile setup/update.
- **Special behavior:** bootstrap admin role for `safaribosafar@gmail.com` if verified.
- **Rules intent:**
  - read authenticated users.
  - create own profile only; role escalation guarded.
  - update own profile without role changes, unless admin.
  - delete admin only.

## `business_postcards`
- **UPSERT:** deterministic ID from `title` + `city`, merge write, set `updatedAt=serverTimestamp()`.
- **READ/LIST:** `orderBy(updatedAt desc)`, optional `governorate` filter.
- **Rules intent:** admin-only create/update/delete; public read.

## `likes` (rules-only in visible code)
- **Rules intent:**
  - create by authenticated user with key pattern `${uid}_${postId}`.
  - delete own likes only.
  - read public.
- **Client usage uncertainty:** no visible API usage in repository files inspected.

## 3) Firestore ➜ Supabase table mapping

| Firestore path | Supabase table | Notes |
|---|---|---|
| `users/{uid}` | `public.users` | PK should be `id uuid/text` matching auth user subject. |
| `businesses` | `public.businesses` | Keep owner link (`owner_id`) + discoverability indexes. |
| `posts` | `public.posts` | Replace doc IDs with UUID/text PK; keep `likes_count` integer. |
| `likes` | `public.post_likes` | Composite uniqueness `(user_id, post_id)`. |
| `deals` | `public.deals` | FK to `businesses`. |
| `stories` | `public.stories` | `media` as `text[]` or `jsonb`; author as `user_id`. |
| `events` | `public.events` | Date/time as `timestamptz`. |
| `business_postcards` | `public.business_postcards` | Keep deterministic ID semantics via generated slug or explicit `id text`. |
| `test/connection` | `public.healthcheck` (optional) | Prefer SQL `select 1`; table not strictly required. |

## 4) Suggested PostgreSQL schema (draft)

```sql
-- Requires pgcrypto or uuid-ossp for UUID generation if UUID PKs are used.

create table if not exists public.users (
  id text primary key,
  name text not null check (char_length(name) between 1 and 99),
  email text not null unique,
  avatar text,
  role text not null check (role in ('user','owner','admin')),
  business_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.businesses (
  id text primary key,
  name text not null,
  name_ar text,
  name_ku text,
  category text not null,
  subcategory text,
  governorate text not null,
  city text not null,
  address text,
  phone text,
  description text,
  rating numeric,
  review_count integer,
  is_verified boolean default false,
  is_featured boolean default false,
  tags text[],
  price_range smallint,
  open_hours text,
  image_url text,
  cover_image text,
  lat double precision,
  lng double precision,
  owner_id text references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses(id) on delete cascade,
  business_name text not null,
  business_avatar text not null,
  caption text not null check (char_length(caption) between 1 and 2000),
  image_url text,
  created_at timestamptz not null default now(),
  likes_count integer not null default 0 check (likes_count >= 0),
  verified boolean default false
);

create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

create table if not exists public.deals (
  id text primary key,
  business_id text not null references public.businesses(id) on delete cascade,
  title text not null,
  description text,
  discount integer not null check (discount > 0 and discount <= 100),
  claimed integer,
  total integer not null check (total > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.stories (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  media text[] not null,
  type text not null check (type in ('business','community')),
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id text primary key,
  title text not null,
  date timestamptz not null,
  venue text not null,
  price integer not null check (price >= 0),
  category text,
  governorate text,
  image text,
  attendees integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_postcards (
  id text primary key,
  title text not null,
  city text not null,
  neighborhood text not null,
  governorate text not null,
  category_tag text not null check (
    category_tag in ('Cafe','Restaurant','Bakery','Hotel','Gym','Salon','Pharmacy','Supermarket')
  ),
  phone text not null,
  website text,
  instagram text,
  hero_image text not null,
  image_gallery text[] not null,
  postcard_content text not null check (char_length(postcard_content) between 1 and 999),
  google_maps_url text not null,
  rating numeric not null,
  review_count integer not null,
  verified boolean not null,
  updated_at timestamptz not null default now()
);
```

### Indexes aligned with current query patterns

```sql
create index if not exists idx_businesses_name on public.businesses (name);
create index if not exists idx_businesses_city_name on public.businesses (city, name);
create index if not exists idx_businesses_category on public.businesses (category);
create index if not exists idx_businesses_governorate on public.businesses (governorate);
create index if not exists idx_businesses_featured on public.businesses (is_featured) where is_featured = true;

create index if not exists idx_posts_created_at_desc on public.posts (created_at desc);
create index if not exists idx_deals_created_at_desc on public.deals (created_at desc);
create index if not exists idx_stories_created_at_desc on public.stories (created_at desc);
create index if not exists idx_events_date_asc on public.events (date asc);
create index if not exists idx_events_category on public.events (category);
create index if not exists idx_events_governorate on public.events (governorate);
create index if not exists idx_postcards_updated_at_desc on public.business_postcards (updated_at desc);
create index if not exists idx_postcards_governorate on public.business_postcards (governorate);
```

## 5) Proposed SQL migrations (draft sequencing)

1. `0001_core_tables.sql`
   - Create `users`, `businesses`, `posts`, `post_likes`, `deals`, `stories`, `events`, `business_postcards`.
   - Add constraints and FKs.

2. `0002_indexes.sql`
   - Add all read-path indexes listed above.

3. `0003_rls_enable.sql`
   - Enable RLS on all user-facing tables.

4. `0004_rls_policies.sql`
   - Add policies equivalent to Firestore rules.

5. `0005_triggers.sql` (optional but recommended)
   - Auto-maintain `updated_at` on mutable tables.
   - Optional function for safe post likes increment/decrement.

## 6) RLS policy draft mirroring Firestore rules

Assumptions for Supabase auth mapping:
- `auth.uid()` corresponds to legacy auth `request.auth.uid` equivalent.
- Admin override is represented by either:
  - `users.role = 'admin'`, and/or
  - auth JWT claim `email = 'safaribosafar@gmail.com'` with verified email status.

### Helper function (recommended)

```sql
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()::text
      and u.role = 'admin'
  );
$$;
```

> Uncertainty: Supabase JWT does not always expose the same `email_verified` semantics as legacy auth. Mirror by role is reliable; exact email-verified bootstrap may need auth-hook/workflow confirmation.

### `users`
- SELECT: authenticated users can read.
- INSERT: user can insert only own row; role cannot be `admin` unless bootstrap rule explicitly handled server-side.
- UPDATE: user can update own row but cannot change role (unless admin).
- DELETE: admin only.

### `posts`
- SELECT: public.
- INSERT: authenticated owner/admin; owner’s `business_id` must match profile business_id.
- UPDATE: owner for matching business, admin, plus optional narrow likes counter update function.
- DELETE: owner for matching business or admin.

### `businesses`
- SELECT: public.
- INSERT: admin only.
- UPDATE: owner of row (`owner_id = auth.uid`) or admin.
- DELETE: admin only.

### `post_likes` (`likes` equivalent)
- SELECT: public.
- INSERT: authenticated user where `user_id = auth.uid`.
- DELETE: authenticated user where `user_id = auth.uid`.

### `business_postcards`
- SELECT: public.
- INSERT/UPDATE/DELETE: admin only.

### `deals`
- SELECT: public.
- INSERT: owner/admin with owner tied to own `business_id`.
- UPDATE/DELETE: owner of associated business or admin.

### `stories`
- SELECT: public.
- INSERT: authenticated user with `user_id = auth.uid`.
- UPDATE/DELETE: story owner or admin.

### `events`
- SELECT: public.
- INSERT/UPDATE/DELETE: admin only.

## 7) Files that will need query rewrites (after mapping approval)

### Direct Firestore/SKD replacement targets
- `services/api.ts` (all collection/document operations migrate to Supabase client queries + realtime channels).
- `legacy-auth.ts` (remove Firestore initialization; likely replace auth wiring too if fully leaving legacy auth Auth).

### Indirect callers depending on existing `api` behavior
These components call methods in `services/api.ts` and may need call-shape updates if return types change:
- `App.tsx`
- `components/FeaturedBusinesses.tsx`
- `components/BusinessDirectory.tsx`
- `components/DealsMarketplace.tsx`
- `components/CommunityStories.tsx`
- `components/PersonalizedEvents.tsx`
- `components/Dashboard.tsx`
- `components/DataArchitect.tsx`

## 8) Explicit uncertainties / missing dependencies

1. **No Supabase client/config exists in visible code**
   - Missing env vars and initialization details (e.g., project URL, anon key, service role usage boundaries).

2. **Auth migration boundary not yet specified**
   - Current code uses legacy auth Auth (`authenticated session user`, `auth-state listener`, `Google OAuth provider`).
   - If auth remains legacy auth while data moves to Supabase, JWT bridging strategy is required but not visible.

3. **`likes` usage not visible in client data layer**
   - Rules define it, but no active API method references it.

4. **Firestore validators are stricter than TS interfaces in some places**
   - Example: rules enforce URL/regex constraints not guaranteed by existing UI inputs.
   - Those checks may need DB constraints, RPC wrappers, or edge functions.

5. **Deterministic postcard ID collision behavior**
   - Current ID derives from title+city; collisions possible for same title/city pair.
   - Keep as-is for parity unless business logic clarifies intended uniqueness.
