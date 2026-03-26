# Launch Audit (2026-03-26)

Hostile pre-launch audit completed against current repository state.

## Verdict

**STILL BLOCKED**

## Top blockers found

1. Business-directory pagination is not truthful (`total` is page length, not filtered total).
2. Agent Monitor is labeled "Live" but only performs one-time fetch (no realtime subscription).
3. Multiple production sections are demo/mock-only (events, deals, stories, favorites text), while UI labels imply live/personalized content.

## Additional critical risks

- No Supabase schema migrations/docs exist in-repo for tables the app depends on.
- Vite injects `GEMINI_API_KEY` into client bundle and DataArchitect uses it in-browser.
- Mixed data-model assumptions between Firestore rules/blueprint and Supabase runtime tables.

