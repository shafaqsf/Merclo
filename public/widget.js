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
    ".mc-root { position: fixed; bottom: 20px; right: 20px; z-index: 2147483000;",
    "  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }",
    ".mc-btn { width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;",
    "  background: #111827; color: #fff; box-shadow: 0 4px 14px rgba(0,0,0,0.25);",
    "  display: flex; align-items: center; justify-content: center; transition: transform .15s ease; }",
    ".mc-btn:hover { transform: scale(1.05); }",
    ".mc-btn svg { width: 26px; height: 26px; }",
    ".mc-panel { position: absolute; bottom: 72px; right: 0; width: 360px; max-width: calc(100vw - 40px);",
    "  height: 520px; max-height: calc(100vh - 120px); background: #fff; border-radius: 14px;",
    "  box-shadow: 0 12px 40px rgba(0,0,0,0.22); display: none; flex-direction: column; overflow: hidden;",
    "  border: 1px solid #e5e7eb; }",
    ".mc-panel.mc-open { display: flex; }",
    ".mc-header { padding: 14px 16px; background: #111827; color: #fff; display: flex;",
    "  align-items: center; justify-content: space-between; }",
    ".mc-title { font-size: 15px; font-weight: 600; }",
    ".mc-close { background: transparent; border: none; color: #fff; cursor: pointer; font-size: 20px;",
    "  line-height: 1; padding: 4px; border-radius: 6px; }",
    ".mc-close:hover { background: rgba(255,255,255,0.15); }",
    ".mc-list { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px;",
    "  background: #f9fafb; }",
    ".mc-msg { max-width: 82%; padding: 9px 13px; border-radius: 14px; font-size: 14px; line-height: 1.45;",
    "  white-space: pre-wrap; word-wrap: break-word; }",
    ".mc-user { align-self: flex-end; background: #111827; color: #fff; border-bottom-right-radius: 4px; }",
    ".mc-bot { align-self: flex-start; background: #fff; color: #111827; border: 1px solid #e5e7eb;",
    "  border-bottom-left-radius: 4px; }",
    ".mc-error { align-self: flex-start; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }",
    ".mc-typing { align-self: flex-start; background: #fff; border: 1px solid #e5e7eb; color: #6b7280;",
    "  display: inline-flex; gap: 4px; }",
    ".mc-dot { width: 6px; height: 6px; border-radius: 50%; background: #9ca3af; animation: mc-blink 1.2s infinite; }",
    ".mc-dot:nth-child(2) { animation-delay: .2s; } .mc-dot:nth-child(3) { animation-delay: .4s; }",
    "@keyframes mc-blink { 0%, 60%, 100% { opacity: .3; } 30% { opacity: 1; } }",
    ".mc-form { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #e5e7eb; background: #fff; }",
    ".mc-input { flex: 1; border: 1px solid #d1d5db; border-radius: 10px; padding: 9px 12px; font-size: 14px;",
    "  outline: none; font-family: inherit; }",
    ".mc-input:focus { border-color: #111827; }",
    ".mc-send { border: none; background: #111827; color: #fff; border-radius: 10px; padding: 0 16px;",
    "  cursor: pointer; font-size: 14px; font-weight: 600; }",
    ".mc-send:disabled { opacity: .5; cursor: default; }",
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
      '<span class="mc-title">Chat with us</span>' +
      '<button class="mc-close" aria-label="Close chat">&times;</button>' +
      "</div>" +
      '<div class="mc-list"></div>' +
      '<form class="mc-form">' +
      '<input class="mc-input" type="text" placeholder="Type a message…" autocomplete="off" />' +
      '<button class="mc-send" type="submit">Send</button>' +
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
    panel.querySelector(".mc-close").addEventListener("click", function () {
      panel.classList.remove("mc-open");
    });
    form.addEventListener("submit", onSubmit);
  }

  var greeted = false;
  function togglePanel() {
    panel.classList.toggle("mc-open");
    if (panel.classList.contains("mc-open")) {
      if (!greeted) {
        greeted = true;
        addBubble("Hi! How can I help you with your shopping today?", "mc-bot");
      }
      input.focus();
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
