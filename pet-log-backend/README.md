# Pet Log Backend

A single serverless endpoint that powers the "Ask the Pet Coach" feature in
`daily_log_tab.tsx`. It sends the child's log text to Claude, gets back
attribute increases and a friendly summary, and returns them in the exact
shape the app already expects.

## Endpoint

`POST /api/analyze-log`

Request body:
```json
{ "petName": "Buddy", "logText": "We walked to the park and played fetch" }
```

Response body:
```json
{ "summary": "Buddy had an amazing day of running and playing!", "attributeChanges": { "speed": 1, "energy": 2 } }
```

## Local setup

1. Install the Vercel CLI if you don't have it:
   ```
   npm install -g vercel
   ```
2. In this folder, copy the env example and add your real key:
   ```
   cp .env.example .env
   ```
   Then edit `.env` and paste in your Anthropic API key.
3. Run it locally:
   ```
   vercel dev
   ```
   This starts the function at `http://localhost:3000/api/analyze-log`.

## Deploying

1. From this folder:
   ```
   vercel
   ```
   Follow the prompts (link or create a project).
2. Add your API key to the deployed project:
   ```
   vercel env add ANTHROPIC_API_KEY
   ```
   Paste your key when prompted, and select all environments (Production,
   Preview, Development).
3. Deploy to production:
   ```
   vercel --prod
   ```
4. Vercel will give you a URL like `https://pet-log-backend.vercel.app`.

## Connecting the app

In your Expo project, set the base URL as an environment variable so
`daily_log_tab.tsx` (which already reads `EXPO_PUBLIC_API_BASE_URL`) can find it:

```
# .env in your Expo project
EXPO_PUBLIC_API_BASE_URL=https://pet-log-backend.vercel.app
```

Restart the Expo dev server after adding this so the env var is picked up.
On a physical device, this works out of the box since it's a real public
URL — no local IP / tunneling needed like you'd have with a local Express
server.

## Notes

- CORS is wide open (`*`) for now. If you ever ship an Expo *web* build,
  you may want to lock `Access-Control-Allow-Origin` down to your real
  domain.
- The model is asked to return strict JSON and the function validates/clamps
  the attribute values (1–2 per attribute) before sending them back, so a
  malformed or overly generous model response can't break the app or let
  attributes jump too fast.
- Swap `"model": "claude-sonnet-5"` in `api/analyze-log.js` for a different
  model string any time — check Anthropic's docs for current model names
  if this changes later.
