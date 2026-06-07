import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";

type MomentType = "Clutch" | "Funny" | "Fail" | "Toxic" | "Skill" | "Comeback";
type RecommendedAction = "Save" | "Review" | "Discard";

type GameplayEvent = {
  id: string;
  timestamp: string;
  eventType: string;
  player: string;
  description: string;
  intensity: number;
  chatSpike: number;
  rarity: number;
  mistakeLevel: number;
  status: "New" | "Analyzed";
};

type ClaudeClip = GameplayEvent & {
  clipScore: number;
  momentType: MomentType;
  reason: string;
  suggestedCaption: string;
  finalCaption?: string;
  recommendedAction: RecommendedAction;
  confidence: number;
};

function readJsonBody(req: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    let rawBody = "";

    req.on("data", (chunk) => {
      rawBody += chunk;
    });

    req.on("end", () => {
      try {
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function isMomentType(value: unknown): value is MomentType {
  return ["Clutch", "Funny", "Fail", "Toxic", "Skill", "Comeback"].includes(String(value));
}

function isRecommendedAction(value: unknown): value is RecommendedAction {
  return ["Save", "Review", "Discard"].includes(String(value));
}

function clampScore(value: unknown) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function extractTextFromClaude(response: { content?: Array<{ type: string; text?: string }> }) {
  return response.content?.find((item) => item.type === "text")?.text ?? "";
}

function parseClaudeJson(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned) as { clips?: ClaudeClip[] };
}

function normalizeClip(clip: ClaudeClip, fallbackEvent: GameplayEvent): ClaudeClip {
  const momentType = isMomentType(clip.momentType) ? clip.momentType : "Funny";
  const recommendedAction = isRecommendedAction(clip.recommendedAction) ? clip.recommendedAction : "Review";
  const suggestedCaption = String(clip.suggestedCaption || "Clip-worthy moment from the match.");

  return {
    ...fallbackEvent,
    ...clip,
    id: fallbackEvent.id,
    status: "Analyzed",
    clipScore: clampScore(clip.clipScore),
    momentType,
    reason: String(clip.reason || fallbackEvent.description),
    suggestedCaption,
    finalCaption: String(clip.finalCaption || suggestedCaption),
    recommendedAction,
    confidence: clampScore(clip.confidence),
  };
}

function claudeAnalyzePlugin({ apiKey, model }: { apiKey?: string; model: string }): Plugin {
  return {
    name: "roasty-lite-claude-analyze",
    configureServer(server) {
      server.middlewares.use("/api/ai-status", (req, res, next) => {
        if (req.method !== "GET") {
          next();
          return;
        }

        sendJson(res, 200, {
          hasAnthropicKey: Boolean(apiKey?.trim()),
          model,
        });
      });

      server.middlewares.use("/api/analyze", async (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }

        const trimmedApiKey = apiKey?.trim();
        if (!trimmedApiKey) {
          sendJson(res, 503, { error: "ANTHROPIC_API_KEY is not set. Using offline mock scoring." });
          return;
        }

        try {
          const body = (await readJsonBody(req)) as { events?: GameplayEvent[] };
          const events = body.events ?? [];

          if (!Array.isArray(events) || events.length === 0) {
            sendJson(res, 400, { error: "No events provided." });
            return;
          }

          const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": trimmedApiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model,
              max_tokens: 3200,
              temperature: 0.35,
              system:
                "You score fake Rocket League-inspired gameplay moments for a creator review queue. Return only valid JSON. No markdown.",
              messages: [
                {
                  role: "user",
                  content: `Analyze these fake gameplay events and return JSON in exactly this shape:
{
  "clips": [
    {
      "id": "same event id",
      "clipScore": 0-100,
      "momentType": "Clutch|Funny|Fail|Toxic|Skill|Comeback",
      "reason": "short creator-facing explanation",
      "suggestedCaption": "short social caption",
      "recommendedAction": "Save|Review|Discard",
      "confidence": 0-100
    }
  ]
}

Rules:
- Toxic moments should usually be Review, not Save.
- High-pressure goals, comeback goals, aerial saves, triple saves, and funny fails should rank high.
- Keep reasons and captions punchy for a live hackathon demo.
- Sort clips by clipScore descending.

Events:
${JSON.stringify(events, null, 2)}`,
                },
              ],
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            sendJson(res, response.status, { error: `Claude API error: ${errorText}` });
            return;
          }

          const claudeResponse = await response.json();
          const text = extractTextFromClaude(claudeResponse);
          const parsed = parseClaudeJson(text);
          const clips = (parsed.clips ?? [])
            .map((clip) => {
              const fallbackEvent = events.find((event) => event.id === clip.id);
              return fallbackEvent ? normalizeClip(clip, fallbackEvent) : null;
            })
            .filter((clip): clip is ClaudeClip => Boolean(clip))
            .sort((a, b) => b.clipScore - a.clipScore);

          if (clips.length === 0) {
            sendJson(res, 502, { error: "Claude returned no usable clips." });
            return;
          }

          sendJson(res, 200, {
            source: model,
            clips,
          });
        } catch (error) {
          sendJson(res, 500, { error: error instanceof Error ? error.message : "Unknown Claude proxy error." });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const model = env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

  return {
    plugins: [react(), claudeAnalyzePlugin({ apiKey: env.ANTHROPIC_API_KEY, model })],
  };
});
