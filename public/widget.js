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
  var MAX_TOOL_ROUNDS = 8;

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

  var STYLES = [
    ":host { all: initial; }",
    "*, *::before, *::after { box-sizing: border-box; }",
    ".mc-root { position: fixed; bottom: 24px; right: 24px; z-index: 2147483000;",
    "  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;",
    "  -webkit-font-smoothing: antialiased; }",

    // ---- Floating launcher ----
    ".mc-btn { width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;",
    "  background: #0071e3; color: #fff; box-shadow: 0 8px 24px rgba(0,0,0,0.18);",
    "  display: flex; align-items: center; justify-content: center;",
    "  transition: transform .2s ease, background .2s ease; }",
    ".mc-btn:hover { transform: scale(1.06); background: #0077ed; }",
    ".mc-btn:active { transform: scale(0.98); }",
    ".mc-btn svg { width: 26px; height: 26px; }",

    // ---- Panel ----
    ".mc-panel { position: absolute; bottom: 74px; right: 0; width: 380px; max-width: calc(100vw - 32px);",
    "  height: 560px; max-height: calc(100vh - 120px); background: #ffffff; border-radius: 20px;",
    "  box-shadow: 0 12px 48px rgba(0,0,0,0.18); display: none; flex-direction: column; overflow: hidden;",
    "  border: 1px solid rgba(0,0,0,0.08);",
    "  opacity: 0; transform: translateY(12px) scale(0.98);",
    "  transition: opacity .24s ease, transform .24s cubic-bezier(0.2,0.8,0.2,1); }",
    ".mc-panel.mc-open { display: flex; }",
    ".mc-panel.mc-visible { opacity: 1; transform: translateY(0) scale(1); }",

    // ---- Header (frosted) ----
    ".mc-header { padding: 16px 18px; display: flex; align-items: center; justify-content: space-between;",
    "  background: rgba(255,255,255,0.72); -webkit-backdrop-filter: saturate(180%) blur(20px);",
    "  backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid rgba(0,0,0,0.08); }",
    ".mc-header-text { display: flex; flex-direction: column; gap: 1px; }",
    ".mc-title { font-size: 15px; font-weight: 600; color: #1d1d1f; letter-spacing: -0.01em; }",
    ".mc-subtitle { font-size: 12px; font-weight: 400; color: #6e6e73; }",
    ".mc-close { background: transparent; border: none; color: #6e6e73; cursor: pointer; font-size: 22px;",
    "  line-height: 1; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;",
    "  border-radius: 50%; transition: background .15s ease, color .15s ease; }",
    ".mc-close:hover { background: rgba(0,0,0,0.06); color: #1d1d1f; }",

    // ---- Message list ----
    ".mc-list { flex: 1; overflow-y: auto; padding: 18px 16px; display: flex; flex-direction: column; gap: 8px;",
    "  background: #ffffff; }",
    ".mc-msg { max-width: 78%; padding: 9px 14px; border-radius: 20px; font-size: 15px; line-height: 1.4;",
    "  white-space: pre-wrap; word-wrap: break-word; letter-spacing: -0.01em; }",
    ".mc-user { align-self: flex-end; background: #0071e3; color: #fff; border-bottom-right-radius: 6px; }",
    ".mc-bot { align-self: flex-start; background: #f5f5f5; color: #1d1d1f; border-bottom-left-radius: 6px; }",
    ".mc-error { align-self: flex-start; background: #fdecea; color: #b3261e; border-bottom-left-radius: 6px; }",

    // ---- Typing indicator ----
    ".mc-typing { align-self: flex-start; background: #f5f5f5; border-bottom-left-radius: 6px;",
    "  display: inline-flex; gap: 5px; align-items: center; padding: 12px 14px; }",
    ".mc-dot { width: 7px; height: 7px; border-radius: 50%; background: #b0b0b5; animation: mc-blink 1.3s infinite ease-in-out; }",
    ".mc-dot:nth-child(2) { animation-delay: .18s; } .mc-dot:nth-child(3) { animation-delay: .36s; }",
    "@keyframes mc-blink { 0%, 70%, 100% { opacity: .35; transform: translateY(0); } 35% { opacity: 1; transform: translateY(-2px); } }",

    // ---- Composer ----
    ".mc-form { display: flex; gap: 8px; align-items: center; padding: 12px 14px;",
    "  border-top: 1px solid rgba(0,0,0,0.08); background: #ffffff; }",
    ".mc-input { flex: 1; border: 1px solid rgba(0,0,0,0.12); border-radius: 22px; padding: 10px 16px; font-size: 15px;",
    "  outline: none; font-family: inherit; color: #1d1d1f; background: #ffffff;",
    "  transition: border-color .15s ease, box-shadow .15s ease; }",
    ".mc-input::placeholder { color: #6e6e73; }",
    ".mc-input:focus { border-color: #0071e3; box-shadow: 0 0 0 3px rgba(0,113,227,0.15); }",
    ".mc-input:disabled { opacity: .55; }",
    ".mc-send { flex: none; border: none; background: #0071e3; color: #fff; border-radius: 50%;",
    "  width: 40px; height: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center;",
    "  transition: background .15s ease, transform .15s ease; }",
    ".mc-send svg { width: 20px; height: 20px; }",
    ".mc-send:hover:not(:disabled) { background: #0077ed; transform: scale(1.05); }",
    ".mc-send:disabled { opacity: .4; cursor: default; }",

    // ---- Dark mode ----
    "@media (prefers-color-scheme: dark) {",
    "  .mc-panel { background: #1c1c1e; border-color: rgba(255,255,255,0.10); box-shadow: 0 12px 48px rgba(0,0,0,0.5); }",
    "  .mc-header { background: rgba(28,28,30,0.72); border-bottom-color: rgba(255,255,255,0.10); }",
    "  .mc-title { color: #f5f5f7; }",
    "  .mc-subtitle { color: #8e8e93; }",
    "  .mc-close { color: #8e8e93; }",
    "  .mc-close:hover { background: rgba(255,255,255,0.10); color: #f5f5f7; }",
    "  .mc-list { background: #1c1c1e; }",
    "  .mc-user { background: #0a84ff; color: #fff; }",
    "  .mc-bot { background: #2c2c2e; color: #f5f5f7; }",
    "  .mc-error { background: #3a2321; color: #ff9b93; }",
    "  .mc-typing { background: #2c2c2e; }",
    "  .mc-dot { background: #636366; }",
    "  .mc-form { background: #1c1c1e; border-top-color: rgba(255,255,255,0.10); }",
    "  .mc-input { background: #2c2c2e; color: #f5f5f7; border-color: rgba(255,255,255,0.14); }",
    "  .mc-input::placeholder { color: #8e8e93; }",
    "  .mc-input:focus { border-color: #0a84ff; box-shadow: 0 0 0 3px rgba(10,132,255,0.25); }",
    "  .mc-btn { background: #0a84ff; }",
    "  .mc-btn:hover { background: #3d9bff; }",
    "  .mc-send { background: #0a84ff; }",
    "  .mc-send:hover:not(:disabled) { background: #3d9bff; }",
    "}",
  ].join("\n");

  var host, root, panel, list, input, form, sendBtn;
  var conversationId = null;
  var busy = false;

  function build() {
    host = document.createElement("div");
    host.setAttribute("id", "merclo-chat-widget");
    root = host.attachShadow({ mode: "open" });

    var style = document.createElement("style");
    style.textContent = STYLES;
    root.appendChild(style);

    var wrap = document.createElement("div");
    wrap.className = "mc-root";

    panel = document.createElement("div");
    panel.className = "mc-panel";
    panel.innerHTML =
      '<div class="mc-header">' +
      '<span class="mc-header-text">' +
      '<span class="mc-title">Chat with us</span>' +
      '<span class="mc-subtitle">Typically replies in a few seconds</span>' +
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
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
      ' stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

    wrap.appendChild(panel);
    wrap.appendChild(btn);
    root.appendChild(wrap);
    document.body.appendChild(host);

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
    if (!greeted) {
      greeted = true;
      addBubble("Hi! How can I help you with your shopping today?", "mc-bot");
    }
    input.focus();
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
        addBubble(data.content || "", "mc-bot");
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

    addBubble(text, "mc-user");
    input.value = "";
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

  function init() {
    if (document.getElementById("merclo-chat-widget")) return;
    build();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
