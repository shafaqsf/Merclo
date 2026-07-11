# Merclo

Embeddable AI shopping assistants for Shopify storefronts. Merchants create bots
in a dashboard and paste a `<script>` snippet into their theme; the widget runs
an AI agent that acts within the storefront (search, cart, discounts,
navigation). See `CLAUDE.md` for architecture.

## Local development

```bash
cp .env.example .env.local   # then fill in Supabase + OpenRouter keys
npm install
npm run dev                  # http://localhost:3000
```

Apply the migrations in `supabase/migrations/` (Supabase SQL editor or
`supabase db push`) before first run.

The fastest way to test a bot end-to-end without any storefront is the
in-dashboard **Playground** (`Bots → a bot → Test in playground`) — it drives the
real agent loop with mocked storefront tools.

## Testing the embed on a real HTTPS storefront

The embed snippet points at `NEXT_PUBLIC_APP_URL`. On a live Shopify store
(HTTPS), a raw `http://localhost:3000` snippet fails two ways: browsers block
mixed content, and `localhost` only resolves on your own machine. To test the
real embed against your local dev server you need a public **HTTPS tunnel** to
`localhost:3000`.

Using **ngrok** (already installed):

```bash
# 1. Start the dev server
npm run dev

# 2. In another terminal, open a tunnel to it
ngrok http 3000
#    → copy the https URL it prints, e.g. https://abc123.ngrok-free.app
```

Then:

1. Set `NEXT_PUBLIC_APP_URL=https://abc123.ngrok-free.app` in `.env.local` and
   **restart `npm run dev`** (`NEXT_PUBLIC_*` values are inlined at compile time).
   The tunnel host is already permitted via `allowedDevOrigins` in
   `next.config.ts` (add others through `DEV_ALLOWED_ORIGINS`).
2. In the dashboard, open your bot — the **Embed snippet** now points at the
   tunnel URL. Copy it into your Shopify theme (`theme.liquid`, before
   `</body>`).
3. Add your store's domain (e.g. `https://your-store.myshopify.com`) to the
   bot's **Allowed storefront origins**, or leave it empty to allow any origin
   during development.
4. Make sure your **OpenRouter** account has credits, otherwise the agent
   returns 402 and the bot can't reply.

Notes:
- Free ngrok URLs change every restart — re-set `NEXT_PUBLIC_APP_URL` and
  re-copy the snippet each time (or use an ngrok reserved domain).
- If ngrok's free browser-warning page interferes with loading `widget.js`,
  switch to a Cloudflare quick tunnel, which has no interstitial:
  `cloudflared tunnel --url http://localhost:3000`.
