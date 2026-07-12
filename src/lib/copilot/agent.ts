/**
 * Builds the dashboard copilot Agent: OpenRouter chat-completions model +
 * CRUD tools + instructions. `model` is injectable so the runtime can be unit
 * tested without network access.
 */
import { Agent, setTracingDisabled, type Model } from "@openai/agents";
import { OpenAIChatCompletionsModel } from "@openai/agents-openai";
import { createOpenRouterClient, getAgentModel } from "@/lib/agent/openrouter";
import { buildCopilotTools } from "./tools";
import type { CopilotMode } from "@/lib/db/copilot-conversations";

// The SDK's tracing exporter phones OpenAI; we run only through OpenRouter.
setTracingDisabled(true);

const INSTRUCTIONS = `You are Merclo's dashboard copilot. You act on behalf of the currently logged-in user, operating ONLY on their own data (their bots, knowledge sources, storefront conversations, and analytics).

Guidelines:
- Use tools to read real data before answering; never invent ids, names, or numbers. To act on a bot/conversation, look it up first (e.g. list_bots) to get its id.
- You cannot perform account-level operations (deleting the account, billing, or auth). If asked, say so.
- For destructive actions (delete_bot, delete_knowledge, delete_conversation), confirm the target with the user in your wording and proceed via the tool.
- After making changes, briefly summarize what you did.
- Be concise.`;

export function buildCopilotAgent(opts: {
  mode: CopilotMode;
  model?: Model;
}): Agent {
  const model =
    opts.model ??
    new OpenAIChatCompletionsModel(
      // `@openai/agents-openai` bundles its own nested `openai` package version,
      // so our app's `OpenAI` client instance (same runtime chat.completions
      // shape) isn't structurally assignable to the constructor's nominal type.
      // Cast through the constructor's own expected param type.
      createOpenRouterClient() as unknown as ConstructorParameters<
        typeof OpenAIChatCompletionsModel
      >[0],
      getAgentModel()
    );

  return new Agent({
    name: "Merclo Copilot",
    instructions: INSTRUCTIONS,
    model,
    tools: buildCopilotTools(opts.mode),
  });
}
