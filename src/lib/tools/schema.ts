/**
 * Shared tool contract between the server-side agent runtime and the
 * client-side widget that actually executes the tools on the storefront.
 *
 * The server exposes these definitions to the LLM (tool-calling contract); the
 * widget maps each `name` to a browser-side implementation. Keep this file the
 * single source of truth for tool names and argument shapes.
 */

export type ToolName =
  | "get_page_context"
  | "search_products"
  | "get_cart"
  | "add_to_cart"
  | "update_cart"
  | "apply_discount_code"
  | "navigate_to";

export interface ToolDefinition {
  name: ToolName;
  description: string;
  /** JSON Schema for the tool arguments (OpenAI tool-calling `parameters`). */
  parameters: Record<string, unknown>;
  /** True if the tool mutates storefront state (cart/navigation). */
  mutating: boolean;
}

const obj = (
  properties: Record<string, unknown>,
  required: string[] = []
): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const TOOL_DEFINITIONS: Record<ToolName, ToolDefinition> = {
  get_page_context: {
    name: "get_page_context",
    description:
      "Read the current storefront page: URL, page type (product/collection/cart/checkout/other), and any product data from JSON-LD or meta tags.",
    parameters: obj({}),
    mutating: false,
  },
  search_products: {
    name: "search_products",
    description:
      "Search the store's public catalog for products matching a query.",
    parameters: obj(
      {
        query: { type: "string", description: "Free-text search query." },
        limit: { type: "number", description: "Max results (default 5)." },
      },
      ["query"]
    ),
    mutating: false,
  },
  get_cart: {
    name: "get_cart",
    description: "Return the shopper's current cart contents and totals.",
    parameters: obj({}),
    mutating: false,
  },
  add_to_cart: {
    name: "add_to_cart",
    description: "Add a product variant to the cart.",
    parameters: obj(
      {
        variant_id: { type: "string", description: "Shopify variant id." },
        quantity: { type: "number", description: "Quantity (default 1)." },
      },
      ["variant_id"]
    ),
    mutating: true,
  },
  update_cart: {
    name: "update_cart",
    description: "Change the quantity of a line item already in the cart.",
    parameters: obj(
      {
        variant_id: { type: "string" },
        quantity: { type: "number", description: "New quantity; 0 removes it." },
      },
      ["variant_id", "quantity"]
    ),
    mutating: true,
  },
  apply_discount_code: {
    name: "apply_discount_code",
    description: "Apply a discount code to the cart.",
    parameters: obj({ code: { type: "string" } }, ["code"]),
    mutating: true,
  },
  navigate_to: {
    name: "navigate_to",
    description: "Navigate the shopper's browser to a path on the storefront.",
    parameters: obj(
      { path: { type: "string", description: "Relative path, e.g. /products/foo." } },
      ["path"]
    ),
    mutating: true,
  },
};

export const ALL_TOOL_NAMES = Object.keys(TOOL_DEFINITIONS) as ToolName[];
