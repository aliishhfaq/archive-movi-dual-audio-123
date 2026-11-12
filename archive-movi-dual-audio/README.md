# Archive Movi Dual Audio

A Cloudflare Worker + static frontend for browsing Archive.org items and playing their available audio/video files with byte-range streaming.

## Features
- Archive.org metadata lookup by identifier
- Audio/video track selection for files available in an item
- Base64URL stream-key generation (UTF-8 JSON payload)
- Worker-mediated streaming with HTTP Range forwarding and CORS
- Cloudflare Workers Static Assets served by the same Worker
- Node.js test suite and GitHub Actions deployment

## Local development
Requires Node.js 20+.

```bash
npm install
npm test
npx wrangler dev
```

Open the local URL printed by Wrangler. Enter an Archive.org identifier and choose a playable file.

## API
- `GET /api/health`
- `GET /api/metadata/:identifier`
- `GET /api/stream?key=<base64url>`

The stream key encodes JSON: `{"identifier":"...","file":"..."}`. The Worker verifies the file against Archive.org item metadata before fetching it, preventing arbitrary URL proxying.

## Deploy to Cloudflare
1. Create a Cloudflare API token with Workers Scripts:Edit and account access.
2. Add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Enable GitHub Actions in repository settings.
4. Push to `main` or run **Test and deploy Cloudflare Worker** manually.

The workflow runs tests before deployment. Static assets are bundled from `public/` and served by the same Worker. No Cloudflare credentials are stored in this repository.

## Notes
Only use Archive.org content you are authorized to access. Availability and playback depend on item metadata, formats, and Archive.org response headers.
