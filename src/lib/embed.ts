/**
 * Builds the copy-paste embed snippet that merchants drop into their Shopify
 * storefront theme. The widget script reads `data-bot-id` to know which bot
 * configuration to load.
 */
export function buildEmbedSnippet(botId: string, appUrl: string): string {
  const base = appUrl.replace(/\/+$/, "");
  return `<script src="${base}/widget.js" data-bot-id="${botId}" defer></script>`;
}
