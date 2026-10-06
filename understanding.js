import { fallbackLanguage } from "./language.js";
import { normalizeUnderstanding, parseModelJson } from "./contracts.js";

const UNDERSTANDING_SCHEMA = `{
  "language":"es|en|pt|zh|unknown",
  "languageConfidence":0.0,
  "intent":"catalog_request|product_inquiry|price_request|delivered_price_request|discount_request|sample_request|order_or_payment|complaint|legal|human_request|unknown",
  "intentConfidence":0.0,
  "product":"football_jersey|hoodie|yoga_wear|null",
  "quantity":null,
  "destinationCountry":null,
  "destinationLocation":null,
  "postcode":null,
  "hasLogo":null,
  "wantsCatalog":false,
  "wantsPrice":false,
  "wantsDeliveredPrice":false,
  "wantsDiscount":false,
  "wantsSample":false,
  "readyToOrderOrPay":false,
  "requestsHuman":false,
  "risk":null,
  "asks":[],
  "normalizedMeaning":"",
  "ambiguity":null
}`;

export async function understandMessage({ text, history = [], profile = {}, runModel }) {
  const previousLanguage = profile.preferredLanguage || null;
  const fallback = fallbackLanguage(text, previousLanguage);
  const prompt = [
    "You are the semantic understanding layer for Lumiara's B2B WhatsApp sales agent.",
    "Interpret the buyer's intended meaning, not merely keywords. Messages may contain misspellings, speech-to-text errors, slang, missing punctuation, or Latin American place names.",
    "Separate product-only price from delivered price including freight. A phrase asking how much items cost 'delivered/puesto hasta/to' a location is delivered_price_request.",
    "Never treat a place named El Banco as a bank account when it appears with Magdalena; it is El Banco, Magdalena, Colombia.",
    "For football conversations, Spanish uniforme/camiseta/equipación can mean a football kit.",
    "Use conversation and profile only as context. The latest buyer message controls the current intent.",
    "If uncertain, set ambiguity to a short explanation and lower intentConfidence; do not guess.",
    "Return only JSON matching this schema:",
    UNDERSTANDING_SCHEMA,
    "Stored profile: " + JSON.stringify(profile),
    "Recent conversation: " + JSON.stringify(history.slice(-8)),
    "Latest buyer message: " + String(text || "")
  ].join("\n");

  let raw = "";
  try {
    raw = await runModel(prompt);
  } catch (error) {
    console.error("Understanding model failed:", error?.message || String(error));
  }
  const parsed = normalizeUnderstanding(parseModelJson(raw) || {});
  if (parsed.language === "unknown" || parsed.languageConfidence < 0.65) {
    parsed.language = fallback.language;
    parsed.languageConfidence = fallback.confidence;
  }
  return parsed;
}
