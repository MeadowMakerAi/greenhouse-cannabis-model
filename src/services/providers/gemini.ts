import type { ToolDefinition } from "../chatbotTools";
import type { ChatMessage, ChatProvider, ChatTurnArgs } from "./types";

/**
 * Google Gemini native API. Picked specifically because the free tier has
 * a generous quota AND the API accepts inline PDFs (mime application/pdf)
 * with a 1M-token context window — which is what makes it the right fallback
 * for users hitting the Anthropic 30k tokens/min rate limit while feeding
 * in a large greenhouse spec document.
 *
 * Uses native function-calling format. Anthropic tool schemas
 * (`input_schema`) map directly onto Gemini's `parameters`.
 */

const HARMLESS_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

interface GeminiTextPart {
  text: string;
}
interface GeminiInlineDataPart {
  inlineData: { mimeType: string; data: string };
}
interface GeminiFunctionCallPart {
  functionCall: { name: string; args: Record<string, unknown> };
}
interface GeminiFunctionResponsePart {
  functionResponse: {
    name: string;
    response: { content: unknown };
  };
}
type GeminiPart =
  | GeminiTextPart
  | GeminiInlineDataPart
  | GeminiFunctionCallPart
  | GeminiFunctionResponsePart;

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface GeminiResponse {
  candidates?: {
    content?: GeminiContent;
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message: string };
}

function translateToolsToGemini(tools: ToolDefinition[]): GeminiFunctionDeclaration[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  }));
}

function isFunctionCallPart(p: GeminiPart): p is GeminiFunctionCallPart {
  return (p as GeminiFunctionCallPart).functionCall !== undefined;
}
function isTextPart(p: GeminiPart): p is GeminiTextPart {
  return typeof (p as GeminiTextPart).text === "string";
}

export const geminiProvider: ChatProvider = {
  async chat({
    apiKey,
    baseUrl,
    model,
    history,
    userMessage,
    attachments,
    toolHandler,
    tools,
    systemPrompt,
    maxRoundtrips = 6,
  }: ChatTurnArgs): Promise<ChatMessage> {
    const contents: GeminiContent[] = history.map<GeminiContent>((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const userParts: GeminiPart[] = [];
    if (attachments && attachments.length > 0) {
      for (const a of attachments) {
        userParts.push({
          inlineData: { mimeType: a.mediaType, data: a.base64 },
        });
      }
    }
    userParts.push({ text: userMessage });
    contents.push({ role: "user", parts: userParts });

    const functionDeclarations = translateToolsToGemini(tools);
    const url =
      baseUrl.replace(/\/+$/, "") +
      `/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const toolTrace: { name: string; input: unknown; output: unknown }[] = [];
    let finalText = "";

    for (let i = 0; i < maxRoundtrips; i++) {
      const body = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools:
          functionDeclarations.length > 0
            ? [{ functionDeclarations }]
            : undefined,
        safetySettings: HARMLESS_SETTINGS,
        generationConfig: { maxOutputTokens: 1500 },
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Gemini API ${res.status}: ${txt.slice(0, 300)}`);
      }
      const json: GeminiResponse = await res.json();
      if (json.error) {
        throw new Error(`Gemini API error: ${json.error.message}`);
      }
      const candidate = json.candidates?.[0];
      if (!candidate || !candidate.content) {
        const reason =
          json.promptFeedback?.blockReason ?? candidate?.finishReason ?? "unknown";
        throw new Error(`Gemini returned no candidate content (reason: ${reason}).`);
      }

      contents.push(candidate.content);

      const parts = candidate.content.parts || [];
      const functionCalls = parts.filter(isFunctionCallPart);

      if (functionCalls.length === 0) {
        finalText = parts
          .filter(isTextPart)
          .map((p) => p.text)
          .join("\n")
          .trim();
        break;
      }

      const responseParts: GeminiPart[] = [];
      for (const call of functionCalls) {
        const name = call.functionCall.name;
        const input = call.functionCall.args ?? {};
        let output: unknown;
        try {
          output = await toolHandler(name, input);
        } catch (err) {
          output = { error: (err as Error).message };
        }
        toolTrace.push({ name, input, output });
        responseParts.push({
          functionResponse: {
            name,
            response: { content: output },
          },
        });
      }
      contents.push({ role: "user", parts: responseParts });
    }

    return {
      role: "assistant",
      content: finalText || "(No final response after tool roundtrips.)",
      toolTrace: toolTrace.length ? toolTrace : undefined,
    };
  },
};
