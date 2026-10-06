export const SUPPORTED_LANGUAGES = new Set(["es", "en", "pt", "zh"]);
export const SUPPORTED_PRODUCTS = new Set(["football_jersey", "hoodie", "yoga_wear"]);

export function emptyUnderstanding() {
  return {
    language: "unknown",
    languageConfidence: 0,
    intent: "unknown",
    intentConfidence: 0,
    product: null,
    quantity: null,
    destinationCountry: null,
    destinationLocation: null,
    postcode: null,
    hasLogo: null,
    wantsCatalog: false,
    wantsPrice: false,
    wantsDeliveredPrice: false,
    wantsDiscount: false,
    wantsSample: false,
    readyToOrderOrPay: false,
    requestsHuman: false,
    risk: null,
    asks: [],
    normalizedMeaning: "",
    ambiguity: null
  };
}

export function normalizeUnderstanding(value = {}) {
  const base = emptyUnderstanding();
  const result = { ...base, ...(value && typeof value === "object" ? value : {}) };
  result.language = SUPPORTED_LANGUAGES.has(result.language) ? result.language : "unknown";
  result.product = SUPPORTED_PRODUCTS.has(result.product) ? result.product : null;
  result.languageConfidence = clampConfidence(result.languageConfidence);
  result.intentConfidence = clampConfidence(result.intentConfidence);
  result.quantity = Number.isFinite(Number(result.quantity)) && Number(result.quantity) > 0
    ? Number(result.quantity)
    : null;
  result.asks = Array.isArray(result.asks) ? result.asks.map(String).slice(0, 8) : [];
  return result;
}

function clampConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

export function parseModelJson(raw) {
  const text = String(raw || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}
