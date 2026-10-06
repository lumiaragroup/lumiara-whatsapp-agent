import { SUPPORTED_LANGUAGES } from "./contracts.js";

const LANGUAGE_NAMES = { es: "Spanish", en: "English", pt: "Portuguese", zh: "Simplified Chinese" };

export function languageName(code) {
  return LANGUAGE_NAMES[code] || "the customer's language";
}

export function fallbackLanguage(text, previousLanguage = null) {
  const value = String(text || "").trim();
  if (/[\u4e00-\u9fff]/.test(value)) return { language: "zh", confidence: 0.99 };
  if (/[ãõç]|\b(?:ol[aá]|voc[eê]|obrigad[oa]|pre[cç]o|futebol|camisa|quantidade|frete)\b/i.test(value)) {
    return { language: "pt", confidence: 0.92 };
  }
  if (/[¿¡áéíóúñ]|\b(?:hola|gracias|quiero|necesito|cu[aá]nto|precio|env[ií]o|camiseta|uniforme|sudadera|equipo|marca|empresa|pa[ií]s)\b/i.test(value)) {
    return { language: "es", confidence: 0.92 };
  }
  if (/\b(?:hello|thanks|please|price|shipping|jersey|hoodie|quantity|country|team|brand)\b/i.test(value)) {
    return { language: "en", confidence: 0.88 };
  }
  if (SUPPORTED_LANGUAGES.has(previousLanguage)) return { language: previousLanguage, confidence: 0.65 };
  return { language: "unknown", confidence: 0 };
}

export function appearsInLanguage(text, language) {
  const value = String(text || "").trim();
  if (!value) return false;
  if (language === "zh") return /[\u4e00-\u9fff]/.test(value);
  if (language === "es") return /[¿¡áéíóúñ]|\b(?:hola|gracias|precio|env[ií]o|unidades|cat[aá]logo|ind[ií]queme|para|por|puede|desea)\b/i.test(value)
    && !/\b(?:please|shipping|which styles|estimated quantity|thanks for)\b/i.test(value);
  if (language === "pt") return /[ãõç]|\b(?:ol[aá]|obrigad[oa]|pre[cç]o|envio|unidades|cat[aá]logo|informe|para|pode)\b/i.test(value)
    && !/\b(?:please|shipping|which styles|estimated quantity|thanks for)\b/i.test(value);
  if (language === "en") return /\b(?:the|please|price|shipping|catalog|quantity|country|thanks|send)\b/i.test(value)
    && !/[\u4e00-\u9fff]/.test(value);
  return false;
}

export async function enforceReplyLanguage(reply, expectedLanguage, rewrite) {
  if (!SUPPORTED_LANGUAGES.has(expectedLanguage)) return { ok: false, reply: "", reason: "unknown_language" };
  if (appearsInLanguage(reply, expectedLanguage)) return { ok: true, reply: String(reply).trim(), rewritten: false };
  const rewritten = await rewrite(String(reply || ""), expectedLanguage);
  if (!appearsInLanguage(rewritten, expectedLanguage)) {
    return { ok: false, reply: "", reason: "language_lock_failed" };
  }
  return { ok: true, reply: String(rewritten).trim(), rewritten: true };
}
