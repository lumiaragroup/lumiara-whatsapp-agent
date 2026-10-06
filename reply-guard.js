import { appearsInLanguage } from "./language.js";

const MONEY_PATTERN = /(?:USD|US\$|\$)\s*([0-9]+(?:\.[0-9]{1,2})?)/gi;

export function validateReply({ reply, expectedLanguage, policy, project }) {
  const errors = [];
  const text = String(reply || "").trim();
  if (!text) errors.push("empty_reply");
  if (!appearsInLanguage(text, expectedLanguage)) errors.push("wrong_language");
  if (text.length > 600) errors.push("reply_too_long");
  const amounts = [...text.matchAll(MONEY_PATTERN)].map(match => Number(match[1])).filter(Number.isFinite);
  const allowed = new Set([
    policy?.facts?.unitPrice,
    policy?.facts?.productSubtotal
  ].filter(Number.isFinite).map(value => Number(value).toFixed(2)));
  for (const amount of amounts) {
    if (!allowed.has(amount.toFixed(2))) errors.push("unapproved_amount");
  }
  if (policy?.facts?.shippingIncluded === false && mentionsDeliveredTotalAsFinal(text, expectedLanguage)) {
    errors.push("shipping_total_claimed_without_freight");
  }
  if (policy?.reason === "collect_freight_address" && project?.postcode && asksForPostcodeAgain(text, expectedLanguage)) {
    errors.push("repeated_known_postcode_question");
  }
  return { ok: errors.length === 0, errors };
}

export async function guardAndRepair({ reply, expectedLanguage, policy, project, rewrite }) {
  const first = validateReply({ reply, expectedLanguage, policy, project });
  if (first.ok) return { ok: true, reply, repaired: false, errors: [] };
  const repairedReply = await rewrite({
    reply,
    language: expectedLanguage,
    errors: first.errors,
    policy,
    project,
    instruction: "Rewrite in the required language and remove every unsupported amount or claim. Use only approved policy facts."
  });
  const second = validateReply({ reply: repairedReply, expectedLanguage, policy, project });
  return { ok: second.ok, reply: second.ok ? repairedReply : "", repaired: true, errors: second.errors };
}

function mentionsDeliveredTotalAsFinal(text, language) {
  const patterns = {
    es: /\btotal(?:\s+final)?\s+(?:es|de)\b/i,
    en: /\b(?:final|delivered)\s+total\b/i,
    pt: /\btotal(?:\s+final)?\s+(?:é|de)\b/i,
    zh: /(?:含运费)?总价(?:是|为)/
  };
  return patterns[language]?.test(text) || false;
}

function asksForPostcodeAgain(text, language) {
  const patterns = { es: /c[oó]digo postal/i, en: /post\s?code|zip code/i, pt: /\bCEP\b/i, zh: /邮编/ };
  return patterns[language]?.test(text) || false;
}
