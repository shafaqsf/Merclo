/**
 * Merclo storefront chat widget.
 *
 * Merchants embed this via:
 *   <script src="{APP_URL}/widget.js" data-bot-id="BOT_ID" defer></script>
 *
 * Self-contained IIFE, no external dependencies. Renders a chat bubble/panel
 * inside a Shadow DOM and connects to Merclo's agent runtime. All storefront
 * tools execute in the browser (the server has no Shopify access).
 */
(function () {
  "use strict";

  // ---- Resolve config from this script tag ---------------------------------
  var currentScript =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  var APP_URL;
  try {
    APP_URL = new URL(currentScript.src).origin;
  } catch (e) {
    APP_URL = window.location.origin;
  }

  var BOT_ID = currentScript.getAttribute("data-bot-id") || "";
  var TURN_ENDPOINT = APP_URL + "/api/chat/turn";
  var CONFIG_ENDPOINT = APP_URL + "/api/bots/" + BOT_ID + "/config";
  var FEEDBACK_ENDPOINT = APP_URL + "/api/feedback";
  var MAX_TOOL_ROUNDS = 8;

  // Sensible defaults; overwritten by GET /api/bots/:id/config on init. Kept in
  // sync with src/lib/bots/appearance.ts DEFAULT_APPEARANCE.
  var APPEARANCE = {
    accent: "#0071e3",
    position: "right",
    launcher: "chat",
    title: "Chat with us",
    subtitle: "Typically replies in a few seconds",
    greeting: "Hi! How can I help you with your shopping today?",
    quickReplies: [],
    showProductCards: true,
    proactive: { enabled: false, delayMs: 8000, message: "👋 Need a hand finding something?" },
    avatarUrl: "",
    theme: { shape: "rounded", density: "spacious" },
    darkMode: "auto",
  };

  var LAUNCHER_ICONS = {
    chat:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
      ' stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    sparkle:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
      ' stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5 10.1 7.6 12 3z"/></svg>',
    cart:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
      ' stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>' +
      '<path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>',
  };

  // ==========================================================================
  // Tool executors (run in the browser against the Shopify storefront).
  // Names align with src/lib/tools/schema.ts. Each returns a JSON-serializable
  // value and never throws; on failure it returns { error: string }.
  // ==========================================================================

  function detectPageType(path) {
    if (/\/products\//.test(path)) return "product";
    if (/\/collections\//.test(path)) return "collection";
    if (/\/cart\b/.test(path)) return "cart";
    if (/\/checkout\b/.test(path)) return "checkout";
    return "other";
  }

  function parseProductFromPage() {
    // Prefer JSON-LD Product blocks.
    try {
      var scripts = document.querySelectorAll(
        'script[type="application/ld+json"]'
      );
      for (var i = 0; i < scripts.length; i++) {
        var data;
        try {
          data = JSON.parse(scripts[i].textContent);
        } catch (e) {
          continue;
        }
        var candidates = Array.isArray(data) ? data : [data];
        // Some sites wrap with @graph.
        for (var c = 0; c < candidates.length; c++) {
          var node = candidates[c];
          if (node && node["@graph"] && Array.isArray(node["@graph"])) {
            candidates = candidates.concat(node["@graph"]);
          }
        }
        for (var j = 0; j < candidates.length; j++) {
          var n = candidates[j];
          if (!n) continue;
          var type = n["@type"];
          var isProduct =
            type === "Product" ||
            (Array.isArray(type) && type.indexOf("Product") !== -1);
          if (isProduct) {
            var offers = n.offers;
            if (Array.isArray(offers)) offers = offers[0];
            offers = offers || {};
            return {
              name: n.name,
              description: n.description,
              price: offers.price,
              currency: offers.priceCurrency,
              availability: offers.availability,
              sku: n.sku,
            };
          }
        }
      }
    } catch (e) {
      /* fall through to og: meta */
    }

    // Fall back to Open Graph meta tags.
    try {
      var og = function (prop) {
        var el = document.querySelector('meta[property="' + prop + '"]');
        return el ? el.getAttribute("content") : undefined;
      };
      var ogType = og("og:type");
      var ogTitle = og("og:title");
      if (ogTitle || (ogType && ogType.indexOf("product") !== -1)) {
        return {
          name: ogTitle,
          description: og("og:description"),
          price: og("product:price:amount") || og("og:price:amount"),
          currency:
            og("product:price:currency") || og("og:price:currency"),
          availability: og("product:availability"),
        };
      }
    } catch (e) {
      /* ignore */
    }
    return undefined;
  }

  function trimProduct(p) {
    if (!p) return p;
    return {
      title: p.title,
      handle: p.handle,
      price: p.price,
      available: p.available,
      variants: (p.variants || []).map(function (v) {
        return {
          id: v.id,
          title: v.title,
          price: v.price,
          available: v.available,
        };
      }),
    };
  }

  var executors = {
    get_page_context: function () {
      try {
        var path = window.location.pathname;
        var result = {
          url: window.location.href,
          pageType: detectPageType(path),
        };
        var product = parseProductFromPage();
        if (product) result.product = product;
        return result;
      } catch (e) {
        return { error: String((e && e.message) || e) };
      }
    },

    search_products: async function (args) {
      args = args || {};
      var q = encodeURIComponent(args.query || "");
      var limit = args.limit || 5;
      try {
        var res = await fetch(
          "/search/suggest.json?q=" +
            q +
            "&resources[type]=product&resources[limit]=" +
            limit
        );
        if (res.ok) {
          var data = await res.json();
          var products =
            (data.resources &&
              data.resources.results &&
              data.resources.results.products) ||
            [];
          return products.map(trimProduct);
        }
        throw new Error("suggest.json returned " + res.status);
      } catch (e) {
        // Fall back to products.json.
        try {
          var res2 = await fetch("/products.json?limit=" + limit);
          if (!res2.ok) throw new Error("products.json returned " + res2.status);
          var data2 = await res2.json();
          return (data2.products || []).map(trimProduct);
        } catch (e2) {
          return { error: String((e2 && e2.message) || e2) };
        }
      }
    },

    get_cart: async function () {
      try {
        var res = await fetch("/cart.js");
        if (!res.ok) throw new Error("/cart.js returned " + res.status);
        return await res.json();
      } catch (e) {
        return { error: String((e && e.message) || e) };
      }
    },

    add_to_cart: async function (args) {
      args = args || {};
      try {
        var res = await fetch("/cart/add.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: args.variant_id,
            quantity: args.quantity || 1,
          }),
        });
        if (!res.ok) throw new Error("/cart/add.js returned " + res.status);
        return await res.json();
      } catch (e) {
        return { error: String((e && e.message) || e) };
      }
    },

    update_cart: async function (args) {
      args = args || {};
      try {
        var res = await fetch("/cart/change.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: args.variant_id,
            quantity: args.quantity,
          }),
        });
        if (!res.ok) throw new Error("/cart/change.js returned " + res.status);
        return await res.json();
      } catch (e) {
        return { error: String((e && e.message) || e) };
      }
    },

    apply_discount_code: function (args) {
      args = args || {};
      try {
        window.location = "/discount/" + encodeURIComponent(args.code || "");
        return { applied: true };
      } catch (e) {
        return { error: String((e && e.message) || e) };
      }
    },

    navigate_to: function (args) {
      args = args || {};
      try {
        window.location = args.path;
        return { navigated: true };
      } catch (e) {
        return { error: String((e && e.message) || e) };
      }
    },
  };

  async function runTool(name, args) {
    var fn = executors[name];
    if (!fn) return { error: "Unknown tool: " + name };
    try {
      return await fn(args);
    } catch (e) {
      return { error: String((e && e.message) || e) };
    }
  }

  // ==========================================================================
  // UI (Shadow DOM)
  // ==========================================================================

  // Each entry is [selector, declarations]; declarations are scoped under
  // the shadow root wrapper, i.e. compiled as ".mc-root[...] " + selector.
  var DARK_RULES = [
    [".mc-panel", "background: rgba(28,28,30,0.78); border-color: rgba(255,255,255,0.12); box-shadow: 0 20px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08);"],
    [".mc-header", "background: linear-gradient(180deg, rgba(255,255,255,0.08), transparent); border-bottom-color: rgba(255,255,255,0.1);"],
    [".mc-title", "color: #f5f5f7;"],
    [".mc-subtitle", "color: #8e8e93;"],
    [".mc-close", "color: #8e8e93;"],
    [".mc-close:hover", "background: rgba(255,255,255,0.10); color: #f5f5f7;"],
    [".mc-list", "background: transparent;"],
    [".mc-user", "background: linear-gradient(180deg, rgba(255,255,255,0.12), transparent 60%), var(--mc-accent); color: #fff;"],
    [".mc-bot", "background: rgba(120,120,128,0.24); color: #f5f5f7;"],
    [".mc-error", "background: #3a2321; color: #ff9b93;"],
    [".mc-typing", "background: rgba(120,120,128,0.24);"],
    [".mc-dot", "background: #636366;"],
    [".mc-form", "background: rgba(28,28,30,0.5); border-top-color: rgba(255,255,255,0.1);"],
    [".mc-input", "background: rgba(44,44,46,0.7); color: #f5f5f7; border-color: rgba(255,255,255,0.14);"],
    [".mc-input::placeholder", "color: #8e8e93;"],
    [".mc-input:focus", "border-color: var(--mc-accent); box-shadow: 0 0 0 3px rgba(10,132,255,0.25);"],
    [".mc-btn", "background: linear-gradient(180deg, rgba(255,255,255,0.15), transparent 60%), var(--mc-accent);"],
    [".mc-btn:hover", "background: linear-gradient(180deg, rgba(255,255,255,0.2), transparent 60%), #3d9bff;"],
    [".mc-send", "background: linear-gradient(180deg, rgba(255,255,255,0.15), transparent 60%), var(--mc-accent);"],
    [".mc-send:hover:not(:disabled)", "background: linear-gradient(180deg, rgba(255,255,255,0.2), transparent 60%), #3d9bff;"],
    [".mc-card", "background: rgba(44,44,46,0.6); border-color: rgba(255,255,255,0.1);"],
    [".mc-card-img", "background: #1c1c1e;"],
    [".mc-card-title", "color: #f5f5f7;"],
    [".mc-card-price", "color: #8e8e93;"],
    [".mc-fb-btn:hover", "background: rgba(255,255,255,0.10);"],
    [".mc-nudge", "background: rgba(44,44,46,0.78); color: #f5f5f7; border-color: rgba(255,255,255,0.12);"],
    [".mc-nudge-close", "color: #8e8e93;"],
  ];

  // Emits each dark rule twice: once inside a `prefers-color-scheme: dark`
  // media query scoped to `[data-mc-theme="auto"]`, and once unconditionally
  // scoped to `[data-mc-theme="dark"]`. `"light"` matches neither.
  function buildDarkModeStyles() {
    var mediaLines = ["@media (prefers-color-scheme: dark) {"];
    DARK_RULES.forEach(function (r) {
      mediaLines.push('  .mc-root[data-mc-theme="auto"] ' + r[0] + " { " + r[1] + " }");
    });
    mediaLines.push("}");

    var darkLines = DARK_RULES.map(function (r) {
      return '.mc-root[data-mc-theme="dark"] ' + r[0] + " { " + r[1] + " }";
    });

    return mediaLines.concat(darkLines);
  }

  var STYLES = [
    ":host { all: initial; }",
    "*, *::before, *::after { box-sizing: border-box; }",
    ".mc-root { position: fixed; bottom: 24px; right: 24px; z-index: 2147483000;",
    "  --mc-accent: #0071e3;",
    "  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;",
    "  -webkit-font-smoothing: antialiased; }",
    // ---- Left-hand positioning ----
    ".mc-root.mc-left { right: auto; left: 24px; }",
    ".mc-root.mc-left .mc-panel { right: auto; left: 0; }",

    // ---- Floating launcher ----
    ".mc-btn { width: 56px; height: 56px; border-radius: var(--mc-radius-btn, 50%); border: 1px solid rgba(255,255,255,0.35); cursor: pointer;",
    "  background: linear-gradient(180deg, rgba(255,255,255,0.35), transparent 60%), var(--mc-accent); color: #fff;",
    "  box-shadow: 0 8px 24px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.5);",
    "  -webkit-backdrop-filter: blur(8px) saturate(1.6); backdrop-filter: blur(8px) saturate(1.6);",
    "  display: flex; align-items: center; justify-content: center;",
    "  transition: transform .2s cubic-bezier(0.34,1.56,0.64,1), background .2s ease, box-shadow .2s ease; }",
    ".mc-btn:hover { transform: scale(1.06); background: linear-gradient(180deg, rgba(255,255,255,0.4), transparent 60%), #0077ed;",
    "  box-shadow: 0 12px 32px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.6); }",
    ".mc-btn:active { transform: scale(0.94); }",
    ".mc-btn svg { width: 26px; height: 26px; }",
    ".mc-btn img { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; }",

    // ---- Panel ----
    ".mc-panel { position: absolute; bottom: 74px; right: 0; width: 380px; max-width: calc(100vw - 32px);",
    "  height: 560px; max-height: calc(100vh - 120px); background: rgba(255,255,255,0.78); border-radius: var(--mc-radius-panel, 26px);",
    "  -webkit-backdrop-filter: blur(24px) saturate(1.8); backdrop-filter: blur(24px) saturate(1.8);",
    "  box-shadow: 0 4px 8px rgba(0,0,0,0.05), 0 20px 48px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.7);",
    "  display: none; flex-direction: column; overflow: hidden;",
    "  border: 1px solid rgba(255,255,255,0.6);",
    "  opacity: 0; transform: translateY(12px) scale(0.98);",
    "  transition: opacity .24s ease, transform .24s cubic-bezier(0.2,0.8,0.2,1); }",
    ".mc-panel.mc-open { display: flex; }",
    ".mc-panel.mc-visible { opacity: 1; transform: translateY(0) scale(1); }",

    // ---- Header (frosted) ----
    ".mc-header { padding: calc(16px * var(--mc-space-scale)) calc(18px * var(--mc-space-scale)); display: flex; align-items: center; gap: 10px; justify-content: space-between;",
    "  background: linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0.1)); -webkit-backdrop-filter: saturate(180%) blur(20px);",
    "  backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid rgba(255,255,255,0.5); }",
    ".mc-header-left { display: flex; align-items: center; gap: 10px; }",
    ".mc-header-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; display: none; flex: none; }",
    ".mc-header-avatar.mc-visible { display: block; }",
    ".mc-header-text { display: flex; flex-direction: column; gap: 1px; }",
    ".mc-title { font-size: 15px; font-weight: 600; color: #1d1d1f; letter-spacing: -0.01em; }",
    ".mc-subtitle { font-size: 12px; font-weight: 400; color: #6e6e73; }",
    ".mc-close { background: transparent; border: none; color: #6e6e73; cursor: pointer; font-size: 22px;",
    "  line-height: 1; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;",
    "  border-radius: 50%; transition: background .15s ease, color .15s ease; }",
    ".mc-close:hover { background: rgba(0,0,0,0.06); color: #1d1d1f; }",

    // ---- Message list ----
    ".mc-list { flex: 1; overflow-y: auto; padding: calc(18px * var(--mc-space-scale)) calc(16px * var(--mc-space-scale)); display: flex; flex-direction: column; gap: calc(8px * var(--mc-space-scale));",
    "  background: transparent; }",
    ".mc-msg { max-width: 78%; padding: 9px 14px; border-radius: var(--mc-radius-msg, 20px); font-size: 15px; line-height: 1.4;",
    "  white-space: pre-wrap; word-wrap: break-word; letter-spacing: -0.01em; transition: transform .15s ease; }",
    ".mc-user { align-self: flex-end; background: linear-gradient(180deg, rgba(255,255,255,0.25), transparent 60%), var(--mc-accent);",
    "  color: #fff; border-bottom-right-radius: 6px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.35); }",
    ".mc-bot { align-self: flex-start; background: rgba(120,120,128,0.12); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);",
    "  color: #1d1d1f; border-bottom-left-radius: 6px; }",
    ".mc-error { align-self: flex-start; background: #fdecea; color: #b3261e; border-bottom-left-radius: 6px; }",

    // ---- Typing indicator ----
    ".mc-typing { align-self: flex-start; background: #f5f5f5; border-bottom-left-radius: 6px;",
    "  display: inline-flex; gap: 5px; align-items: center; padding: 12px 14px; }",
    ".mc-dot { width: 7px; height: 7px; border-radius: 50%; background: #b0b0b5; animation: mc-blink 1.3s infinite ease-in-out; }",
    ".mc-dot:nth-child(2) { animation-delay: .18s; } .mc-dot:nth-child(3) { animation-delay: .36s; }",
    "@keyframes mc-blink { 0%, 70%, 100% { opacity: .35; transform: translateY(0); } 35% { opacity: 1; transform: translateY(-2px); } }",

    // ---- Composer ----
    ".mc-form { display: flex; gap: calc(8px * var(--mc-space-scale)); align-items: center; padding: calc(12px * var(--mc-space-scale)) calc(14px * var(--mc-space-scale));",
    "  border-top: 1px solid rgba(255,255,255,0.5); background: rgba(255,255,255,0.35);",
    "  -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); }",
    ".mc-input { flex: 1; border: 1px solid rgba(0,0,0,0.1); border-radius: var(--mc-radius-input, 22px); padding: 10px 16px; font-size: 15px;",
    "  outline: none; font-family: inherit; color: #1d1d1f; background: rgba(255,255,255,0.6);",
    "  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);",
    "  transition: border-color .15s ease, box-shadow .15s ease; }",
    ".mc-input::placeholder { color: #6e6e73; }",
    ".mc-input:focus { border-color: var(--mc-accent); box-shadow: 0 0 0 3px rgba(0,113,227,0.15); }",
    ".mc-input:disabled { opacity: .55; }",
    ".mc-send { flex: none; border: 1px solid rgba(255,255,255,0.35); background: linear-gradient(180deg, rgba(255,255,255,0.35), transparent 60%), var(--mc-accent);",
    "  color: #fff; border-radius: 50%;",
    "  width: 40px; height: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center;",
    "  box-shadow: inset 0 1px 0 rgba(255,255,255,0.5);",
    "  transition: background .15s ease, transform .15s cubic-bezier(0.34,1.56,0.64,1); }",
    ".mc-send svg { width: 20px; height: 20px; }",
    ".mc-send:hover:not(:disabled) { background: #0077ed; transform: scale(1.08); }",
    ".mc-send:active:not(:disabled) { transform: scale(0.92); }",
    ".mc-send:disabled { opacity: .4; cursor: default; }",

    // ---- Quick replies ----
    ".mc-quick { align-self: flex-start; display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 4px; }",
    ".mc-chip { border: 1px solid var(--mc-accent); color: var(--mc-accent); background: transparent;",
    "  border-radius: 16px; padding: 6px 12px; font-size: 13px; font-weight: 500; cursor: pointer;",
    "  font-family: inherit; transition: background .15s ease, color .15s ease; }",
    ".mc-chip:hover { background: var(--mc-accent); color: #fff; }",

    // ---- Product cards ----
    ".mc-products { align-self: flex-start; display: flex; flex-direction: column; gap: 8px; width: 82%; }",
    ".mc-card { border: 1px solid rgba(0,0,0,0.08); border-radius: var(--mc-radius-card, 18px); overflow: hidden;",
    "  background: rgba(255,255,255,0.55); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);",
    "  box-shadow: 0 2px 4px rgba(0,0,0,0.04), 0 8px 20px rgba(0,0,0,0.06); transition: transform .15s ease; }",
    ".mc-card:hover { transform: translateY(-1px); }",
    ".mc-card-img { width: 100%; height: 120px; object-fit: cover; display: block; background: #f5f5f5; }",
    ".mc-card-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }",
    ".mc-card-title { font-size: 14px; font-weight: 600; color: #1d1d1f; letter-spacing: -0.01em; }",
    ".mc-card-price { font-size: 13px; color: #6e6e73; }",
    ".mc-card-actions { display: flex; gap: 8px; align-items: center; margin-top: 2px; }",
    ".mc-card-add { border: none; background: var(--mc-accent); color: #fff; border-radius: 16px;",
    "  padding: 7px 14px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; }",
    ".mc-card-add:disabled { opacity: .5; cursor: default; }",
    ".mc-card-link { font-size: 13px; color: var(--mc-accent); text-decoration: none; font-weight: 500; }",
    ".mc-card-link:hover { text-decoration: underline; }",

    // ---- Feedback ----
    ".mc-feedback { align-self: flex-start; display: flex; gap: 4px; margin: -2px 0 4px 2px; }",
    ".mc-fb-btn { border: none; background: transparent; cursor: pointer; font-size: 14px; line-height: 1;",
    "  opacity: .5; padding: 2px 4px; border-radius: 6px; transition: opacity .15s ease, background .15s ease; }",
    ".mc-fb-btn:hover { opacity: 1; background: rgba(0,0,0,0.05); }",
    ".mc-fb-btn.mc-fb-active { opacity: 1; }",

    // ---- Proactive nudge ----
    ".mc-nudge { position: absolute; bottom: 74px; right: 0; max-width: 260px; background: rgba(255,255,255,0.78);",
    "  -webkit-backdrop-filter: blur(20px) saturate(1.8); backdrop-filter: blur(20px) saturate(1.8);",
    "  color: #1d1d1f; padding: 12px 34px 12px 14px; border-radius: 18px; font-size: 14px; line-height: 1.4;",
    "  box-shadow: 0 8px 28px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.6); cursor: pointer;",
    "  opacity: 0; transform: translateY(8px); transition: opacity .24s ease, transform .24s ease; }",
    ".mc-root.mc-left .mc-nudge { right: auto; left: 0; }",
    ".mc-nudge.mc-visible { opacity: 1; transform: translateY(0); }",
    ".mc-nudge-close { position: absolute; top: 6px; right: 8px; background: transparent; border: none;",
    "  color: #6e6e73; cursor: pointer; font-size: 16px; line-height: 1; padding: 2px; }",

    // ---- Dark mode ----
    // Rules below are duplicated: applied when the OS prefers dark AND the
    // widget's darkMode setting is "auto", or unconditionally when darkMode
    // is "dark". "light" matches neither form and falls through to the
    // default (light) styling above regardless of OS preference.
  ].concat(buildDarkModeStyles())
    .join("\n");

  var host, root, panel, list, input, form, sendBtn, rootWrap;
  var conversationId = null;
  var busy = false;
  var assistantMessageIndex = 0;

  function build() {
    host = document.createElement("div");
    host.setAttribute("id", "merclo-chat-widget");
    root = host.attachShadow({ mode: "open" });

    var style = document.createElement("style");
    style.textContent = STYLES;
    root.appendChild(style);

    var wrap = document.createElement("div");
    wrap.className = "mc-root" + (APPEARANCE.position === "left" ? " mc-left" : "");
    wrap.style.setProperty("--mc-accent", APPEARANCE.accent);

    var theme = APPEARANCE.theme || { shape: "rounded", density: "spacious" };
    var isSharp = theme.shape === "sharp";
    wrap.style.setProperty("--mc-radius-panel", isSharp ? "10px" : "26px");
    wrap.style.setProperty("--mc-radius-msg", isSharp ? "6px" : "20px");
    wrap.style.setProperty("--mc-radius-btn", isSharp ? "12px" : "50%");
    wrap.style.setProperty("--mc-radius-input", isSharp ? "8px" : "22px");
    wrap.style.setProperty("--mc-radius-card", isSharp ? "8px" : "18px");
    wrap.style.setProperty("--mc-space-scale", theme.density === "compact" ? "0.7" : "1");

    wrap.setAttribute("data-mc-theme", APPEARANCE.darkMode || "auto");

    rootWrap = wrap;

    panel = document.createElement("div");
    panel.className = "mc-panel";
    panel.innerHTML =
      '<div class="mc-header">' +
      '<span class="mc-header-left">' +
      '<img class="mc-header-avatar" alt="" />' +
      '<span class="mc-header-text">' +
      '<span class="mc-title"></span>' +
      '<span class="mc-subtitle"></span>' +
      "</span>" +
      "</span>" +
      '<button class="mc-close" aria-label="Close chat">&times;</button>' +
      "</div>" +
      '<div class="mc-list"></div>' +
      '<form class="mc-form">' +
      '<input class="mc-input" type="text" placeholder="Message…" autocomplete="off" />' +
      '<button class="mc-send" type="submit" aria-label="Send message">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"' +
      ' stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/>' +
      '<polyline points="5 12 12 5 19 12"/></svg>' +
      "</button>" +
      "</form>";

    var btn = document.createElement("button");
    btn.className = "mc-btn";
    btn.setAttribute("aria-label", "Open chat");
    if (APPEARANCE.avatarUrl) {
      var launcherImg = document.createElement("img");
      launcherImg.src = APPEARANCE.avatarUrl;
      launcherImg.alt = "";
      btn.appendChild(launcherImg);
    } else {
      btn.innerHTML = LAUNCHER_ICONS[APPEARANCE.launcher] || LAUNCHER_ICONS.chat;
    }

    wrap.appendChild(panel);
    wrap.appendChild(btn);
    root.appendChild(wrap);
    document.body.appendChild(host);

    // Apply themed header text.
    panel.querySelector(".mc-title").textContent = APPEARANCE.title;
    panel.querySelector(".mc-subtitle").textContent = APPEARANCE.subtitle;

    var headerAvatar = panel.querySelector(".mc-header-avatar");
    if (APPEARANCE.avatarUrl) {
      headerAvatar.src = APPEARANCE.avatarUrl;
      headerAvatar.classList.add("mc-visible");
    }

    list = panel.querySelector(".mc-list");
    input = panel.querySelector(".mc-input");
    form = panel.querySelector(".mc-form");
    sendBtn = panel.querySelector(".mc-send");

    btn.addEventListener("click", togglePanel);
    panel.querySelector(".mc-close").addEventListener("click", closePanel);
    form.addEventListener("submit", onSubmit);
  }

  var greeted = false;
  function openPanel() {
    panel.classList.add("mc-open");
    // Trigger entrance transition on the next frame so display:flex applies first.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        panel.classList.add("mc-visible");
      });
    });
    hideNudge();
    if (!greeted) {
      greeted = true;
      if (APPEARANCE.greeting) addBubble(APPEARANCE.greeting, "mc-bot");
      renderQuickReplies();
    }
    input.focus();
  }

  function renderQuickReplies() {
    var replies = APPEARANCE.quickReplies || [];
    if (!replies.length) return;
    var row = document.createElement("div");
    row.className = "mc-quick";
    replies.forEach(function (text) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "mc-chip";
      chip.textContent = text;
      chip.addEventListener("click", function () {
        if (busy) return;
        if (row.parentNode) row.parentNode.removeChild(row);
        sendMessage(text);
      });
      row.appendChild(chip);
    });
    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
  }

  function closePanel() {
    panel.classList.remove("mc-visible");
    var done = function () {
      panel.classList.remove("mc-open");
      panel.removeEventListener("transitionend", done);
    };
    panel.addEventListener("transitionend", done);
  }

  function togglePanel() {
    if (panel.classList.contains("mc-open")) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function addBubble(text, cls) {
    var el = document.createElement("div");
    el.className = "mc-msg " + cls;
    el.textContent = text;
    list.appendChild(el);
    list.scrollTop = list.scrollHeight;
    return el;
  }

  // Render an assistant message plus a 👍/👎 feedback row. messageIndex is a
  // monotonically increasing counter over assistant messages in this session.
  function addAssistantMessage(text) {
    addBubble(text || "", "mc-bot");
    var index = assistantMessageIndex++;
    if (!conversationId) return;
    var row = document.createElement("div");
    row.className = "mc-feedback";
    var rated = false;
    ["up", "down"].forEach(function (rating) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "mc-fb-btn";
      b.setAttribute(
        "aria-label",
        rating === "up" ? "Helpful" : "Not helpful"
      );
      b.textContent = rating === "up" ? "👍" : "👎";
      b.addEventListener("click", function () {
        if (rated) return;
        rated = true;
        b.classList.add("mc-fb-active");
        sendFeedback(index, rating);
      });
      row.appendChild(b);
    });
    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
  }

  function sendFeedback(messageIndex, rating) {
    try {
      fetch(FEEDBACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId,
          messageIndex: messageIndex,
          rating: rating,
        }),
      }).catch(function () {});
    } catch (e) {
      /* ignore */
    }
  }

  function renderProductCards(products) {
    if (!APPEARANCE.showProductCards) return;
    if (!Array.isArray(products) || !products.length) return;
    var container = document.createElement("div");
    container.className = "mc-products";
    products.forEach(function (p) {
      if (!p) return;
      var card = document.createElement("div");
      card.className = "mc-card";

      if (p.image) {
        var img = document.createElement("img");
        img.className = "mc-card-img";
        img.src = p.image;
        img.alt = p.title || "";
        img.loading = "lazy";
        card.appendChild(img);
      }

      var body = document.createElement("div");
      body.className = "mc-card-body";

      var title = document.createElement("div");
      title.className = "mc-card-title";
      title.textContent = p.title || "Product";
      body.appendChild(title);

      if (p.price) {
        var price = document.createElement("div");
        price.className = "mc-card-price";
        price.textContent = p.price;
        body.appendChild(price);
      }

      var actions = document.createElement("div");
      actions.className = "mc-card-actions";

      if (p.variantId) {
        var add = document.createElement("button");
        add.type = "button";
        add.className = "mc-card-add";
        add.textContent = "Add to cart";
        add.addEventListener("click", function () {
          add.disabled = true;
          add.textContent = "Adding…";
          Promise.resolve(
            runTool("add_to_cart", { variant_id: p.variantId, quantity: 1 })
          ).then(function (result) {
            var ok = result && !result.error;
            add.textContent = ok ? "Added ✓" : "Try again";
            add.disabled = false;
          });
        });
        actions.appendChild(add);
      }

      if (p.url) {
        var link = document.createElement("a");
        link.className = "mc-card-link";
        link.href = p.url;
        link.target = "_top";
        link.textContent = "View";
        actions.appendChild(link);
      }

      if (actions.childNodes.length) body.appendChild(actions);
      card.appendChild(body);
      container.appendChild(card);
    });
    list.appendChild(container);
    list.scrollTop = list.scrollHeight;
  }

  // ---- Proactive nudge ----
  var nudgeEl = null;
  var proactiveTimer = null;
  function scheduleProactive() {
    if (!APPEARANCE.proactive || !APPEARANCE.proactive.enabled) return;
    var delay = APPEARANCE.proactive.delayMs;
    if (typeof delay !== "number" || delay < 0) delay = 8000;
    proactiveTimer = setTimeout(function () {
      if (greeted || panel.classList.contains("mc-open")) return;
      showNudge(APPEARANCE.proactive.message);
    }, delay);
  }

  function showNudge(message) {
    if (nudgeEl) return;
    nudgeEl = document.createElement("div");
    nudgeEl.className = "mc-nudge";
    var text = document.createElement("span");
    text.textContent = message || "";
    var close = document.createElement("button");
    close.className = "mc-nudge-close";
    close.setAttribute("aria-label", "Dismiss");
    close.innerHTML = "&times;";
    close.addEventListener("click", function (e) {
      e.stopPropagation();
      hideNudge();
    });
    nudgeEl.appendChild(text);
    nudgeEl.appendChild(close);
    nudgeEl.addEventListener("click", function () {
      hideNudge();
      openPanel();
    });
    rootWrap.appendChild(nudgeEl);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (nudgeEl) nudgeEl.classList.add("mc-visible");
      });
    });
  }

  function hideNudge() {
    if (proactiveTimer) {
      clearTimeout(proactiveTimer);
      proactiveTimer = null;
    }
    if (nudgeEl && nudgeEl.parentNode) nudgeEl.parentNode.removeChild(nudgeEl);
    nudgeEl = null;
  }

  var typingEl = null;
  function showTyping() {
    if (typingEl) return;
    typingEl = document.createElement("div");
    typingEl.className = "mc-msg mc-typing";
    typingEl.innerHTML =
      '<span class="mc-dot"></span><span class="mc-dot"></span><span class="mc-dot"></span>';
    list.appendChild(typingEl);
    list.scrollTop = list.scrollHeight;
  }
  function hideTyping() {
    if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
    typingEl = null;
  }

  function setBusy(v) {
    busy = v;
    sendBtn.disabled = v;
    input.disabled = v;
  }

  async function postTurn(body) {
    var res = await fetch(TURN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Server returned " + res.status);
    return await res.json();
  }

  function parseArgs(a) {
    if (a && typeof a === "object") return a;
    if (typeof a === "string") {
      try {
        return JSON.parse(a);
      } catch (e) {
        return {};
      }
    }
    return {};
  }

  async function handleResponse(data) {
    var rounds = 0;
    while (true) {
      if (data.conversationId) conversationId = data.conversationId;

      if (data.type === "message") {
        hideTyping();
        addAssistantMessage(data.content || "");
        if (data.products) renderProductCards(data.products);
        return;
      }

      if (data.type === "tool_calls") {
        if (rounds >= MAX_TOOL_ROUNDS) {
          hideTyping();
          addBubble(
            "Sorry, I got stuck working on that. Please try rephrasing your request.",
            "mc-error"
          );
          return;
        }
        rounds++;
        var calls = data.toolCalls || [];
        var toolResults = [];
        for (var i = 0; i < calls.length; i++) {
          var call = calls[i];
          var result = await runTool(call.name, parseArgs(call.arguments));
          toolResults.push({
            toolCallId: call.id,
            name: call.name,
            result: result,
          });
        }
        data = await postTurn({
          conversationId: conversationId,
          botId: BOT_ID,
          toolResults: toolResults,
        });
        continue;
      }

      // Unknown response shape.
      hideTyping();
      addBubble("Sorry, something went wrong.", "mc-error");
      return;
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    var text = (input.value || "").trim();
    if (!text) return;
    input.value = "";
    await sendMessage(text);
  }

  async function sendMessage(text) {
    if (busy) return;
    text = (text || "").trim();
    if (!text) return;

    addBubble(text, "mc-user");
    setBusy(true);
    showTyping();

    try {
      var data = await postTurn({
        conversationId: conversationId,
        botId: BOT_ID,
        userMessage: text,
      });
      await handleResponse(data);
    } catch (err) {
      hideTyping();
      addBubble(
        "Sorry, I couldn't reach the server. Please try again.",
        "mc-error"
      );
    } finally {
      hideTyping();
      setBusy(false);
      input.focus();
    }
  }

  function applyConfig(cfg) {
    if (cfg && cfg.appearance && typeof cfg.appearance === "object") {
      var a = cfg.appearance;
      for (var k in APPEARANCE) {
        if (Object.prototype.hasOwnProperty.call(a, k) && a[k] != null) {
          APPEARANCE[k] = a[k];
        }
      }
    }
  }

  async function loadConfig() {
    try {
      var res = await fetch(CONFIG_ENDPOINT);
      if (res.ok) applyConfig(await res.json());
    } catch (e) {
      /* fall back to defaults so the widget still works */
    }
  }

  async function init() {
    if (document.getElementById("merclo-chat-widget")) return;
    await loadConfig();
    build();
    scheduleProactive();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
