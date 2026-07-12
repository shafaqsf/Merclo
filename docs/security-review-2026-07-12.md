# Merclo Security Review — 2026-07-12

Reviewer: senior application-security review (read-only audit). Scope: RLS/tenancy,
public chat endpoint, dashboard copilot, authN/Z, injection, secrets, widget XSS.

## Executive summary

Overall posture: **Reasonably solid for its stage.** The core tenancy model is
sound: every table has RLS enabled with owner-scoped policies (`supabase/migrations/0001_initial_schema.sql`),
the service-role (admin) client is server-only and never leaks into `NEXT_PUBLIC_*`
or the widget, and every copilot/dashboard mutation is bounded to the caller's own
rows by RLS even when a user-supplied id is passed. The widget renders model output
via `textContent`, avoiding the obvious XSS. The material gaps are operational
rather than tenancy: the anonymous, paid-LLM endpoint has **no rate limiting or
abuse control**, and its Origin check does not stop non-browser attackers. Several
dashboard API routes rely on RLS alone with no explicit auth check (defense-in-depth
gap), and error responses leak internal messages.

Findings by severity:
- Critical: 0
- High: 1
- Medium: 3
- Low: 4
- Info / accepted-risk: 4

No cross-tenant read/write vulnerability was found: every admin-client caller either
takes no user-supplied selector on a tenant boundary (`searchKnowledge`/`getBotForRuntime`
are already scoped to the resolved bot) or performs an RLS-scoped ownership check first
(`deleteConversationForOwner`).

---

## Findings

### HIGH

#### H1 — No rate limiting / abuse controls on the anonymous, paid-LLM endpoint
`src/app/api/chat/turn/route.ts` (whole handler), also `src/app/api/feedback/route.ts`.

`POST /api/chat/turn` is public, CORS-enabled, and invokes an OpenRouter LLM on every
call. There is no rate limit, no per-bot quota, no captcha/proof-of-work, and no cap
on conversation growth. `botId` is a public identifier (it ships in the embed snippet,
`data-bot-id`), so anyone can drive unlimited paid completions against any merchant's
bot.

The Origin allow-list is **not** an effective control here: the `Origin` header is only
enforced by real browsers; a scripted attacker (curl/fetch from a server) sets any
`Origin` value it likes, and for the dev-default empty allow-list any origin (including
none) is accepted (`originAllowed`, lines 62-76). So origin checking stops cross-site
browser abuse but not automated cost/DoS abuse.

Exploit: script `POST /api/chat/turn {botId, userMessage}` in a loop → unbounded LLM
spend and, because `appendMessages` reads-modifies-writes the full `messages` jsonb
every turn (`conversations.ts:187`), unbounded row growth / DB load per conversation.

Fix: add IP- and bot-scoped rate limiting (e.g. Upstash/Redis token bucket or Vercel
firewall) on `/api/chat/turn` and `/api/feedback`; cap conversation message count and
total tokens per conversation; consider a lightweight per-bot daily budget the merchant
configures. Treat the Origin check as anti-CSRF only, not anti-abuse.

### MEDIUM

#### M1 — Dashboard API routes rely solely on RLS, with no explicit auth/ownership check
`src/app/api/bots/[id]/route.ts` (GET/PATCH/DELETE), `src/app/api/bots/[id]/knowledge/route.ts`,
`src/app/api/knowledge/[id]/route.ts`, `src/app/api/bots/[id]/avatar/route.ts`.

`src/middleware.ts` only redirects unauthenticated users for paths under `/dashboard`
(line 35); it does **not** gate `/api/**`. These routes therefore have no `getUser()`
check of their own and depend entirely on the cookie-bound client's RLS to scope
`getBot`/`updateBot`/`deleteBot`/`*Knowledge` to the owner. Today that is safe because
those helpers use `createServerSupabase()` (RLS-enforced) and the policies in
`0001_initial_schema.sql` are correct — a non-owner id resolves to 0 rows (404, or a
`.single()` error → 500). Cross-tenant access is blocked.

Residual risk: it is a single mistake away from a hole — any future refactor that swaps
one of these helpers to the admin client, or adds a route that trusts the `[id]` param,
becomes an IDOR with no second line of defense. `PATCH /api/knowledge/[id]` and
`DELETE` in particular take a raw `id` and never even resolve the parent bot.

Fix: add an explicit `getUser()` gate (401 if absent) at the top of every `/api/**`
mutating route, and either extend the middleware matcher to protect `/api/(bots|knowledge|account|copilot)`
or centralize an auth guard. Keep RLS as defense-in-depth, don't rely on it as the only
authZ layer.

#### M2 — Anyone with a conversation UUID can append to or inject tool results into another shopper's session
`src/app/api/chat/turn/route.ts:136-168`.

The tool-results branch (and the user-turn branch with a supplied `conversationId`)
authenticates the caller only by possession of the `conversationId`. There is no
per-conversation secret/token. A caller who obtains a conversation id can (a) continue
posting messages as that shopper, and (b) submit forged `toolResults` that the agent
consumes as ground truth (`turn.kind === "tool_results"`), steering the model with
attacker-controlled "tool output." Cross-bot data exfiltration is prevented — the code
checks `conv.bot_id !== bot.id` (line 139) and re-resolves the bot from the conversation
(line 153) — so blast radius is confined to that one conversation's own bot.

Severity is held to Medium because conversation ids are unguessable v4 UUIDs and are
not exposed to other visitors; the practical attacker is one who already has the id
(e.g. from logs or their own devtools). Still, forged tool results are a genuine
integrity issue for the agent loop.

Fix: issue a per-conversation bearer token on creation, returned to the widget and
required on subsequent turns; validate that `toolResults` correspond to the tool calls
the server actually requested (match `toolCallId`s against the pending `awaiting_tool`
state) and reject a turn whose status is not `awaiting_tool`.

#### M3 — Error responses leak internal messages
`src/app/api/chat/turn/route.ts:192-193`, `src/app/api/copilot/turn/route.ts:97-99`,
`src/app/api/knowledge/[id]/route.ts` / `.../avatar/route.ts` (returns `error.message`),
plus every `db/*` helper that throws `` `Failed to …: ${error.message}` ``.

Raw Supabase/Postgres error strings are returned to the client (500 bodies). These can
disclose column names, constraint names, RLS rejISSIONS, and query structure, aiding an
attacker mapping the schema. On the public chat endpoint this is reachable anonymously.

Fix: return a generic message + a correlation id to clients; log the detailed error
server-side only.

### LOW

#### L1 — Product-card link is a DOM `href` sink for `javascript:` URLs
`public/widget.js:749` (`link.href = p.url`).

Product objects returned in the chat response populate an `<a href>` directly. Message
*text* is safely rendered with `textContent` (line 638) and product `title`/`price` use
`textContent`, and `img.src` is inert — but an `<a href="javascript:…">` executes on
click. `p.url` originates from storefront/agent data, so this requires the model (via
prompt injection in product data) or a malicious storefront to emit a `javascript:`
URL, and a user click. Low likelihood, contained to the shopper's own page.

Fix: validate `p.url` scheme (allow only `http:`/`https:`/relative) before assigning;
same for `img.src`.

#### L2 — Feedback endpoint writable by anyone with a conversation id
`src/app/api/feedback/route.ts` + `src/lib/db/feedback.ts`.

`recordFeedback` upserts via the admin client keyed on `(conversation_id, message_index)`.
An attacker with a conversation id can set/overwrite arbitrary ratings for arbitrary
message indices, skewing a merchant's CSAT analytics. Same UUID-possession caveat as M2.

Fix: rate-limit; optionally require the per-conversation token from M2; bound
`message_index` to the conversation's actual message count.

#### L3 — Origin allow-list empty = allow-any is a footgun in production
`src/app/api/chat/turn/route.ts:63`, `src/app/api/feedback/route.ts:27`.

An empty `allowed_origins` means "allow any origin." This is documented as a dev
convenience, but a merchant who never fills it in ships a bot embeddable/abusable from
any site. Combined with H1, this widens cost-abuse exposure.

Fix: warn in the dashboard when a bot has an empty allow-list; consider defaulting to
deny in production and requiring at least one origin before the embed is "live."

#### L4 — Avatar upload path derived from an unvalidated route param
`src/app/api/bots/[id]/avatar/route.ts:47` (`const path = \`${id}/${crypto.randomUUID()}.${ext}\``).

`id` comes from the URL and is only validated by `getBot(id)` succeeding (RLS-scoped, so
it must be an owned bot). Because a matching bot must exist and the storage RLS policy
(`0001` lines 186-195) re-checks `(storage.foldername(name))[1]` against `bots.owner_id`,
path traversal is effectively blocked (a forged `../` prefix wouldn't match an owned bot
folder and the DB upload policy would reject it). Noted as residual: the route trusts the
param without asserting UUID shape.

Fix: validate `id` as a UUID before building the storage path; keep the storage RLS
policy as the backstop.

---

## Accepted-risk / design notes

- **Public `bot-avatars` bucket (read-any).** Intentional — avatars are served to the
  anonymous widget. Writes are correctly constrained by path + `bots.owner_id` in the
  storage RLS policies. Residual: avatar URLs are enumerable/guessable, but they hold no
  sensitive data. Accepted.
- **Service-role client bypasses RLS by design.** `src/lib/supabase/admin.ts` guards
  against browser execution and reads `SUPABASE_SERVICE_ROLE_KEY` (never `NEXT_PUBLIC_*`).
  All four callers (`getBotForRuntime`, conversation writes, `searchKnowledge`,
  `recordFeedback`, `deleteConversationForOwner`) were checked: none lets a user-supplied
  id cross a tenant boundary. `searchKnowledge`/`getBotForRuntime` are pre-scoped to the
  resolved bot; `deleteConversationForOwner` does an RLS-scoped ownership check first.
  Accepted.
- **Copilot AUTO mode executes deletes without human approval.** `src/lib/copilot/tools.ts`
  marks mutating tools `needsApproval` only in `accept` mode; in `auto` mode
  `delete_bot`/`delete_conversation`/`delete_knowledge` run unattended. Prompt-injection
  blast radius is real (untrusted storefront conversation content could be summarized into
  the copilot), but every tool routes through RLS-scoped `db/*` helpers, so damage is
  bounded to the user's *own* data — the user opted into auto mode. Accepted, with a
  recommendation to keep delete tools approval-gated even in auto mode, and to never feed
  raw shopper text into the copilot without delimiting/escaping.
- **Copilot `pending_state` deserialization.** `RunState.fromString` rehydrates the SDK
  run state from the user's own `copilot_conversations` row (RLS unique per owner). A user
  can only tamper with their own state, and resumed tool calls still execute under their
  own RLS scope. No cross-tenant risk. Accepted. The 409 pending-approval guard
  (`copilot/turn/route.ts:50, 74`) correctly prevents interleaving a new message with an
  outstanding approval.

---

## What was NOT reviewed / verified

- **Live RLS behavior.** Policies were read statically from `0001_initial_schema.sql` and
  assumed applied as written; I did not run against a live Supabase instance to confirm
  RLS is actually enabled on the deployed project or that no later ad-hoc SQL weakened it.
  (Migrations `0002`–`0009` returned "file does not exist" on read — likely a OneDrive
  sync artifact — so I relied on the consolidated `0001`, which the schema notes describe
  as authoritative. The incremental migrations were not independently inspected.)
- **Supabase Auth configuration** (email confirmation, password policy, JWT expiry,
  session cookie flags) — server/project config, not in the repo.
- **`src/lib/agent/runtime.ts` and `src/lib/agent/tools.ts`** internals (system-prompt
  construction, tool schema) beyond how the route consumes them — prompt-injection
  resistance of the storefront agent itself was not deeply assessed.
- **Dependency/supply-chain** (npm audit), CI secrets, and deployment/CORS at the edge.
- **`@openai/agents` SDK** internal safety of `RunState` serialization was taken at face
  value.
