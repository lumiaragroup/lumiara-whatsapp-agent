import test from "node:test";
import assert from "node:assert/strict";
import { fallbackLanguage, appearsInLanguage } from "../src/language.js";
import { mergeProjectState, saveProject, selectProject } from "../src/project-state.js";
import { decidePolicy, footballUnitPrice } from "../src/policy.js";
import { validateReply } from "../src/reply-guard.js";

const languageCases = [
  ["Hola, me interesan los hoodies personalizados para mi marca.", "es"],
  ["Que cuenta 20 uniforme puesto asta banco Magdalena", "es"],
  ["¿Cuánto cuesta el envío a Colombia?", "es"],
  ["Quiero poner mi logo bordado.", "es"],
  ["Gracias, necesito 80 unidades.", "es"],
  ["Olá, quero camisas de futebol.", "pt"],
  ["Qual é o preço para 100 unidades?", "pt"],
  ["Preciso calcular o frete para o Brasil.", "pt"],
  ["Hello, I need custom jerseys for my team.", "en"],
  ["What is the shipping price?", "en"],
  ["Please send the hoodie catalog.", "en"],
  ["我需要80套定制足球服。", "zh"],
  ["请问运费多少钱？", "zh"],
  ["可以先做样品吗？", "zh"],
  ["ok", "es", "es"],
  ["👍", "pt", "pt"]
];

for (const [text, expected, previous] of languageCases) {
  test(`language: ${text}`, () => {
    assert.equal(fallbackLanguage(text, previous).language, expected);
  });
}

const priceCases = [
  [1, 15.90], [30, 15.90], [31, 13.90], [50, 13.90],
  [51, 11.90], [100, 11.90], [101, 9.90], [200, 9.90]
];
for (const [quantity, expected] of priceCases) {
  test(`football price tier ${quantity}`, () => assert.equal(footballUnitPrice(quantity), expected));
}

const baseProject = {
  product: "football_jersey", quantity: 50, destinationCountry: "Colombia",
  destinationLocation: "El Banco, Magdalena", postcode: null, hasLogo: true,
  referenceReceived: true, catalogSent: true, stage: "qualified"
};

const policyCases = [
  [{ requestsHuman: true, intentConfidence: 1 }, "handoff", "customer_requested_human"],
  [{ readyToOrderOrPay: true, intentConfidence: 1 }, "handoff", "order_or_payment_ready"],
  [{ risk: "complaint", intentConfidence: 1 }, "handoff", "complaint"],
  [{ intentConfidence: 0.2 }, "clarify", "low_confidence"],
  [{ intentConfidence: 1, ambiguity: "unclear place" }, "clarify", "low_confidence"],
  [{ intentConfidence: 1, wantsCatalog: true }, "tool", "send_catalog"],
  [{ intentConfidence: 1, wantsDeliveredPrice: true }, "reply", "collect_freight_address"],
  [{ intentConfidence: 1, wantsPrice: true }, "reply", "quote_product_only"],
  [{ intentConfidence: 1, wantsPrice: true, wantsDiscount: true }, "reply", "explain_price_tier"],
  [{ intentConfidence: 1 }, "reply", "continue_qualification"]
];
for (const [understanding, action, reason] of policyCases) {
  test(`policy ${reason}`, () => {
    const result = decidePolicy({ understanding, project: baseProject, catalogAvailable: true });
    assert.equal(result.action, action);
    assert.equal(result.reason, reason);
  });
}

test("project state separates football and hoodie", () => {
  let profile = {};
  const football = mergeProjectState({}, { product: "football_jersey", quantity: 50, destinationCountry: "Colombia" });
  profile = saveProject(profile, "football_jersey", football, "es");
  const hoodie = mergeProjectState({}, { product: "hoodie", quantity: 80, destinationCountry: "Chile" });
  profile = saveProject(profile, "hoodie", hoodie, "es");
  assert.equal(profile.projects.football_jersey.quantity, 50);
  assert.equal(profile.projects.hoodie.quantity, 80);
});

test("latest quantity updates only active project", () => {
  const next = mergeProjectState(baseProject, { product: "football_jersey", quantity: 120 });
  assert.equal(next.quantity, 120);
  assert.equal(next.destinationCountry, "Colombia");
});

test("known destination is preserved", () => {
  const next = mergeProjectState(baseProject, { product: "football_jersey", quantity: 20 });
  assert.equal(next.destinationLocation, "El Banco, Magdalena");
});

test("explicit destination overrides old destination", () => {
  const next = mergeProjectState(baseProject, { destinationCountry: "Mexico", destinationLocation: "Monterrey" });
  assert.equal(next.destinationCountry, "Mexico");
  assert.equal(next.destinationLocation, "Monterrey");
});

test("select project uses product key", () => {
  const selected = selectProject({ projects: { hoodie: { product: "hoodie", quantity: 80 } } }, "hoodie");
  assert.equal(selected.project.quantity, 80);
});

test("preferred language persists in profile", () => {
  const profile = saveProject({}, "hoodie", { product: "hoodie" }, "es");
  assert.equal(profile.preferredLanguage, "es");
});

const shippingPolicy = decidePolicy({
  understanding: { intentConfidence: 1, wantsDeliveredPrice: true },
  project: baseProject,
  catalogAvailable: true
});

const guardCases = [
  ["Para 50 unidades, el subtotal es USD 700.00, sin incluir el envío.", "es", false, "unapproved_amount"],
  ["For 50 units, the product subtotal is USD 695.00 excluding shipping.", "es", false, "wrong_language"],
  ["Para 50 unidades, el subtotal del producto es USD 700.00.", "es", false, "unapproved_amount"],
  ["Para 50 unidades, el total final es USD 695.00.", "es", false, "shipping_total_claimed_without_freight"],
  ["El subtotal del producto es USD 700.00, sin envío.", "es", false, "unapproved_amount"],
  ["请提供邮编。", "zh", true, null],
  ["Please send your postcode.", "en", true, null],
  ["Envie o CEP para calcular o frete.", "pt", true, null]
];
for (const [reply, language, expectedOk, expectedError] of guardCases) {
  test(`guard ${language}: ${reply}`, () => {
    const policy = expectedError === "unapproved_amount"
      ? { ...shippingPolicy, facts: { unitPrice: 13.90, productSubtotal: 695.00, shippingIncluded: false } }
      : shippingPolicy;
    const result = validateReply({ reply, expectedLanguage: language, policy, project: baseProject });
    assert.equal(result.ok, expectedOk);
    if (expectedError) assert.ok(result.errors.includes(expectedError));
  });
}

test("Spanish catalog reply is recognized as Spanish", () => {
  assert.equal(appearsInLanguage("Listo. Le envié el catálogo de sudaderas en PDF.", "es"), true);
});

test("English catalog reply is rejected for Spanish customer", () => {
  assert.equal(appearsInLanguage("Done. I sent our hoodie catalog as a PDF.", "es"), false);
});
