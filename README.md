# Machine Data Microstore V0.1
Local-first industrial measurement CSV storage. `npm install && npm test && npm run build && npm run dev`.

## Format
`machine_id,timestamp,metric,value,unit`; ISO 8601 timestamp must include `Z` or a timezone offset. CSV maximum 5 MiB and 50,000 data rows.

## Storage & privacy
Uses browser IndexedDB only. No server-side upload, login, or analytics implemented. Browser data may be deleted/evicted: export backups frequently. No cloud sync. Source review is not a substitute for production Network verification.

## Deployment
Upload project to GitHub, connect Cloudflare Workers Static Assets or Pages, build command `npm run build`, output directory `dist`. Set production URL, then create sitemap.xml and register Search Console. Production deployment is NOT completed by the ZIP.

## Limitations
Single browser/device, no authentication, no backup, no real-time monitoring. Chart displays one machine/metric, up to 2,000 recent matched points. Large browser import/render, persistence, and network privacy must be verified in real production browser. CSV row counting is approximate for quoted multiline fields; additional boundary hardening is required before a verified 50,000-row release.
