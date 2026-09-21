# JP-Domain

Static Cloudflare Pages site containing two browser-based tools:

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

There is no server-side code or build step. The Lineup Coach calls the Sleeper API and tier-data sources from the browser, so its behavior depends on those services allowing browser requests. The DM Screen stores data in the visitor's browser with `localStorage`.

For local testing, serve the repository root with any static server, for example:

```sh
python3 -m http.server 8000
```