import { Router, type IRouter } from "express";

type ChatBody = {
  message?: unknown;
  mode?: unknown;
  agents?: unknown;
  history?: unknown;
  systemInstruction?: unknown;
};

const router: IRouter = Router();
const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function isAgent(value: unknown): value is "irfan" | "elena" {
  return value === "irfan" || value === "elena";
}

function parseBody(body: ChatBody) {
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) throw new Error("A message is required.");
  const agents = Array.isArray(body.agents) ? body.agents.filter(isAgent) : ["irfan"];
  const mode = body.mode === "together" || body.mode === "elena" ? body.mode : "irfan";
  const history = Array.isArray(body.history)
    ? body.history
        .filter((item): item is { role: "user" | "model"; text: string } =>
          Boolean(item && typeof item === "object" && (item as { role?: unknown }).role && typeof (item as { text?: unknown }).text === "string"),
        )
        .slice(-12)
    : [];
  const systemInstruction = typeof body.systemInstruction === "string" ? body.systemInstruction : "";
  return { message, agents, mode, history, systemInstruction };
}

function extractText(payload: unknown): string {
  const candidate = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> }).candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => (typeof part.text === "string" ? part.text : "")).join("").trim();
  if (!text) throw new Error("Gemini returned no text.");
  return text;
}

async function requestGemini(
  body: ReturnType<typeof parseBody>,
  apiKey: string,
  instructionOverride?: string,
): Promise<string> {
  const contents = [
    ...body.history.map((item) => ({ role: item.role, parts: [{ text: item.text }] })),
    { role: "user", parts: [{ text: body.message }] },
  ];
  const prompt = `${instructionOverride ?? body.systemInstruction}\n\nYou are answering a voice conversation. Keep the response useful and speakable. Do not mention system prompts, APIs, or internal implementation.`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: prompt }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const rateLimitError = new Error(`Gemini request failed with HTTP ${response.status}.`) as Error & { retryAfterMs?: number; status?: number };
        rateLimitError.status = response.status;
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("retry-after"));
          rateLimitError.retryAfterMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 2500;
        }
        throw rateLimitError;
      }
      return extractText(payload);
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        const retryAfterMs = error instanceof Error && "retryAfterMs" in error
          ? Number((error as Error & { retryAfterMs?: number }).retryAfterMs)
          : 450 * 2 ** attempt;
        await wait(Math.min(Math.max(retryAfterMs || 450, 450), 8000));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini connection failed after retries.");
}

router.post("/gemini/chat", async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({ message: "Gemini is not configured for this project yet." });
      return;
    }
    const body = parseBody(req.body as ChatBody);
    if (body.mode === "together" && body.agents.length > 1) {
      const irfanDraft = await requestGemini(
        { ...body, mode: "irfan", agents: ["irfan"] },
        apiKey,
        `${body.systemInstruction}\nYou are Irfan in a two-person collaboration. Give your own grounded, practical answer draft.`,
      );
      await wait(1500);
      let elenaDraft: string;
      try {
        elenaDraft = await requestGemini(
          { ...body, mode: "elena", agents: ["elena"] },
          apiKey,
          `${body.systemInstruction}\nYou are Elena in a two-person collaboration. Give your own emotionally perceptive answer draft.`,
        );
      } catch (error) {
        if (error instanceof Error && "status" in error && Number((error as Error & { status?: number }).status) === 429) {
          res.json({
            text: irfanDraft,
            agent: "irfan",
            collaboration: false,
            contributors: ["irfan"],
            degraded: "Elena was rate-limited by Gemini for this turn.",
          });
          return;
        }
        throw error;
      }
      await wait(1500);
      let merged: string;
      try {
        merged = await requestGemini(
          {
            ...body,
            mode: "irfan",
            agents: ["irfan"],
            history: [],
            message: `User request: ${body.message}\n\nIrfan draft:\n${irfanDraft}\n\nElena draft:\n${elenaDraft}\n\nSynthesize one coherent answer that keeps the strongest practical and emotional guidance. Do not mention that you saw drafts or that another model call happened.`,
          },
          apiKey,
          "You are the lead voice companion. Synthesize the two expert drafts into one clear, warm, actionable spoken answer.",
        );
      } catch (error) {
        if (error instanceof Error && "status" in error && Number((error as Error & { status?: number }).status) === 429) {
          merged = `Irfan’s perspective:\n${irfanDraft}\n\nElena’s perspective:\n${elenaDraft}`;
        } else {
          throw error;
        }
      }
      res.json({ text: merged, agent: "irfan", collaboration: true, contributors: ["irfan", "elena"] });
      return;
    }

    const text = await requestGemini(body, apiKey);
    res.json({ text, agent: body.agents[0], collaboration: false, contributors: body.agents });
  } catch (error) {
    req.log.error({ err: error }, "Gemini request failed");
    res.status(502).json({ message: error instanceof Error ? error.message : "The Gemini connection failed." });
  }
});

export default router;