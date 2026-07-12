/**
 * Static, merchant-facing content for the dashboard Docs panel
 * (`/dashboard/docs`). Kept as plain data so it can be unit-tested and rendered
 * by a server component without any per-bot state.
 */

export interface HowItWorksCard {
  title: string;
  description: string;
}

export interface SetupStep {
  title: string;
  description: string;
  /** Internal dashboard route the CTA links to. */
  href: string;
  cta: string;
}

export interface CopilotInfo {
  title: string;
  description: string;
  modes: HowItWorksCard[];
}

export const HOW_IT_WORKS: HowItWorksCard[] = [
  {
    title: "Your shopper chats",
    description:
      "A chat bubble sits on your storefront. Shoppers ask for what they want in plain language — “show me waterproof jackets under €150” — instead of hunting through menus.",
  },
  {
    title: "The bot acts in your store",
    description:
      "Your assistant works on the shopper's behalf right on the page: it searches products, reads what they're looking at, adds items to the cart, applies discounts, and helps them navigate.",
  },
  {
    title: "You stay in control",
    description:
      "You create each bot, shape its personality and knowledge, style it to match your brand, and choose exactly which storefronts are allowed to use it.",
  },
];

export const SETUP_STEPS: SetupStep[] = [
  {
    title: "Create a bot",
    description:
      "Give your assistant a name and a persona that matches your store's voice.",
    href: "/dashboard/bots/new",
    cta: "Create a bot",
  },
  {
    title: "Add knowledge and persona",
    description:
      "Teach the bot about your products, policies, and tone so its answers sound like you.",
    href: "/dashboard/bots",
    cta: "Open your bots",
  },
  {
    title: "Customize its appearance",
    description:
      "Match the widget's colors and style to your storefront's brand.",
    href: "/dashboard/bots",
    cta: "Customize appearance",
  },
  {
    title: "Install the widget",
    description:
      "Copy your bot's snippet into your Shopify theme, and set which storefronts are allowed to use it.",
    href: "/dashboard/onboarding",
    cta: "Get the snippet",
  },
  {
    title: "Test, then go live",
    description:
      "Chat with your bot in the private Playground to make sure it feels right before your customers see it.",
    href: "/dashboard/bots",
    cta: "Open the Playground",
  },
];

export const COPILOT_INFO: CopilotInfo = {
  title: "Dashboard copilot",
  description:
    "The copilot is an AI assistant that lives in the dashboard itself, in the panel on the right. It works on your own data — your bots, their knowledge, and your storefront conversations — to help you manage them faster: creating and editing bots, updating knowledge, and reviewing conversations, all through plain-language requests instead of clicking through forms. It never performs account-level actions (billing, login, or account settings) — only bot, knowledge, and conversation changes you could otherwise make yourself in the dashboard.",
  modes: [
    {
      title: "Review changes (default)",
      description:
        "Shown as the “Review changes” toggle in the panel. The copilot proposes each change and waits for you to approve it before anything is applied. Use this when you want to review every edit before it takes effect.",
    },
    {
      title: "Auto-apply",
      description:
        "Shown as the “Auto-apply” toggle in the panel. The copilot applies changes immediately as it makes them, without waiting for approval. Use this when you trust it to move faster on routine updates.",
    },
  ],
};
