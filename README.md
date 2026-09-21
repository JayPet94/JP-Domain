# JP-Domain

Cloudflare Worker with static assets and two browser-based tools:

- `/lineup-coach/` loads a Sleeper league and builds a fantasy football lineup.
- `/dm-screen/` provides a local-only tabletop DM screen.

## Cloudflare deployment with Wrangler

1. Push this repository to GitHub.
2. In Cloudflare, create a Worker connected to this repository using **Workers Builds**.
3. Use these build settings:
	- **Deploy command:** `npx wrangler deploy`
	- **Root directory:** `/`
4. Deploy. The root `index.html` is the site entry point, and `wrangler.toml` tells Wrangler to upload the repository root as static assets.

For Cloudflare Pages instead, use **Workers & Pages > Create application > Pages > Connect to Git**, choose **None** as the framework, leave the build command blank, and set the output directory to `/`. Do not use `npx wrangler deploy` as a Pages build command; that command is for Workers deployments.

There is no build step. The Lineup Coach calls the Sleeper API and tier-data sources from the browser, so its behavior depends on those services allowing browser requests. Without Cloudflare Access and KV configured, both tools fall back to browser `localStorage`.

## Optional user data sync with Access and KV

The repository includes `worker.js`, which exposes an authenticated `GET/PATCH /api/data` endpoint. It stores one JSON record per Cloudflare Access identity in Workers KV. The pages continue working locally with `localStorage` when Access or KV is unavailable.

To enable sync:

1. Create a Workers KV namespace.
2. Put its namespace ID in `wrangler.toml` in place of `YOUR_KV_NAMESPACE_ID`.
3. Protect the deployed hostname with Cloudflare Access. The Worker expects Access to provide the authenticated identity headers; do not expose `/api/data` without Access protection.
4. Use `npx wrangler deploy` from the repository root.

The Lineup Coach syncs the user's Sleeper username. The DM Screen syncs named campaigns, the active campaign, players, NPCs, conditions, HP, and initiative state. Passwords are never stored by this project; authentication belongs to Cloudflare Access. KV is appropriate here because each user's data is retrieved by one identity key rather than queried relationally.

For local testing, serve the repository root with any static server, for example:

```sh
python3 -m http.server 8000
```