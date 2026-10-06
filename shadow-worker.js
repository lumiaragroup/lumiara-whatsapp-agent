import { planTurn } from "./orchestrator.js";
import { parseModelJson } from "./contracts.js";

const UNDERSTANDING_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const REPLY_MODEL = "@cf/openai/gpt-oss-20b";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return Response.json({
        service: "Lumiara WhatsApp Sales Agent",
        version: "5.0.0-shadow",
        mode: "shadow_no_send",
        sendsWhatsAppMessages: false
      });
    }
    if (request.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token === env.WEBHOOK_VERIFY_TOKEN) return new Response(challenge || "", { status: 200 });
    }
    if (request.method === "POST" && url.pathname === "/shadow-evaluate") {
      if (request.headers.get("x-lumiara-secret") !== env.SALES_OS_SECRET) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      const body = await request.json();
      const result = await evaluateTurn({
        waId: String(body.waId || "test"),
        text: String(body.text || ""),
        history: Array.isArray(body.history) ? body.history : [],
        profile: body.profile && typeof body.profile === "object" ? body.profile : {},
        env
      });
      return Response.json(result);
    }
    if (request.method === "POST") {
      const payload = await request.json().catch(() => null);
      if (!payload) return new Response("Invalid JSON", { status: 400 });
      ctx.waitUntil(processWebhookInShadow(payload, env));
      return new Response("EVENT_RECEIVED", { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  }
};

async function processWebhookInShadow(payload, env) {
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      for (const message of change?.value?.messages || []) {
        if (message.type !== "text") {
          await saveShadow(env, `v5:shadow:${message.id}`, {
            messageId: message.id,
            waId: message.from,
            mode: "shadow_no_send",
            skipped: "non_text_requires_media_pipeline",
            createdAt: Date.now()
          });
          continue;
        }
        const waId = String(message.from || "").replace(/\D/g, "");
        const text = String(message.text?.body || "").trim();
        if (!waId || !text) continue;
        const profile = await readJson(env, `v5:profile:${waId}`, {});
        const history = await readJson(env, `v5:history:${waId}`, []);
        const result = await evaluateTurn({ waId, text, history, profile, env });
        const nextHistory = [...history, { role: "user", content: text, timestamp: Date.now() }].slice(-20);
        if (result.reply) nextHistory.push({ role: "assistant_shadow", content: result.reply, timestamp: Date.now() });
        await Promise.all([
          saveShadow(env, `v5:profile:${waId}`, result.profile),
          saveShadow(env, `v5:history:${waId}`, nextHistory.slice(-20)),
          saveShadow(env, `v5:shadow:${message.id}`, {
            ...result,
            messageId: message.id,
            waId,
            inboundText: text,
            mode: "shadow_no_send",
            sentToCustomer: false,
            createdAt: Date.now()
          })
        ]);
      }
    }
  }
}

async function evaluateTurn({ waId, text, history, profile, env }) {
  const ai = createAiAdapter(env);
  const catalogAvailable = Boolean(env.HOODIE_CATALOG_URLS || env.YOGA_CATALOG_URLS || text);
  const result = await planTurn({ text, history, profile, catalogAvailable, ai });
  return {
    waId,
    understanding: result.understanding,
    project: result.project,
    profile: result.profile,
    proposedAction: result.policy,
    proposedReply: result.reply,
    wouldSend: result.send,
    guard: result.guard || null
  };
}

function createAiAdapter(env) {
  return {
    async understand(prompt) {
      const result = await env.AI.run(UNDERSTANDING_MODEL, {
        messages: [{ role: "system", content: prompt }],
        max_tokens: 900,
        temperature: 0
      });
      return extractText(result);
    },
    async compose({ understanding, project, policy, history }) {
      const prompt = [
        "You write one concise B2B WhatsApp sales reply for Lumiara Group.",
        `Reply only in language code: ${understanding.language}.`,
        "Answer the latest request first. Use only supplied approved facts. Never invent freight, total delivered cost, MOQ, certification, stock, material or delivery guarantee.",
        "Do not repeat a question whose answer exists in Project state.",
        "Use at most 2 short sentences and ask at most 1 next-step question.",
        "Policy decision: " + JSON.stringify(policy),
        "Project state: " + JSON.stringify(project),
        "Buyer understanding: " + JSON.stringify(understanding),
        "Recent history: " + JSON.stringify(history.slice(-6)),
        "Return only the customer-facing reply."
      ].join("\n");
      const result = await env.AI.run(REPLY_MODEL, {
        messages: [{ role: "system", content: prompt }],
        max_tokens: 300,
        temperature: 0.1
      });
      return extractText(result);
    },
    async rewrite({ reply, language, errors, policy, project }) {
      const prompt = [
        `Rewrite the reply strictly in ${language}.`,
        "Fix every listed validation error without adding new facts or prices.",
        "Keep it to at most 2 short sentences.",
        "Validation errors: " + JSON.stringify(errors),
        "Approved policy facts: " + JSON.stringify(policy),
        "Project state: " + JSON.stringify(project),
        "Draft: " + String(reply || ""),
        "Return only the corrected customer-facing reply."
      ].join("\n");
      const result = await env.AI.run(UNDERSTANDING_MODEL, {
        messages: [{ role: "system", content: prompt }],
        max_tokens: 300,
        temperature: 0
      });
      return extractText(result);
    }
  };
}

function extractText(result) {
  let value = result?.response ?? result?.result?.response ?? result?.choices?.[0]?.message?.content ?? "";
  if (Array.isArray(value)) value = value.map(item => item?.text || item?.content || "").join("");
  if (value && typeof value === "object") value = value.text || value.content || JSON.stringify(value);
  return String(value || "").replace(/^```(?:\w+)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function store(env) {
  return env.V5_SHADOW || env.CONVERSATIONS || null;
}

async function readJson(env, key, fallback) {
  const binding = store(env);
  if (!binding) return fallback;
  try {
    const value = await binding.get(key, "json");
    return value ?? fallback;
  } catch { return fallback; }
}

async function saveShadow(env, key, value) {
  const binding = store(env);
  if (!binding) return;
  await binding.put(key, JSON.stringify(value), { expirationTtl: 60 * 60 * 24 * 30 });
}
