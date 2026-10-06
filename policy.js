const FOOTBALL_TIERS = [
  { max: 30, price: 15.90 },
  { max: 50, price: 13.90 },
  { max: 100, price: 11.90 },
  { max: 200, price: 9.90 }
];

export function footballUnitPrice(quantity) {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0 || qty > 200) return null;
  return FOOTBALL_TIERS.find(tier => qty <= tier.max)?.price ?? null;
}

export function decidePolicy({ understanding, project, catalogAvailable = false }) {
  if (understanding.requestsHuman) return handoff("customer_requested_human");
  if (understanding.readyToOrderOrPay) return handoff("order_or_payment_ready");
  if (understanding.risk) return handoff(understanding.risk);
  if (understanding.intentConfidence < 0.55 || understanding.ambiguity) {
    return { action: "clarify", reason: "low_confidence", tool: null };
  }
  if (!project.product) return { action: "reply", reason: "collect_product", tool: null };
  if (understanding.wantsCatalog || (!project.catalogSent && catalogAvailable)) {
    return { action: "tool", reason: "send_catalog", tool: "send_catalog" };
  }
  if (understanding.wantsDeliveredPrice) {
    const unitPrice = project.product === "football_jersey" ? footballUnitPrice(project.quantity) : null;
    return {
      action: "reply",
      reason: "collect_freight_address",
      tool: null,
      facts: {
        unitPrice,
        productSubtotal: unitPrice ? Number((unitPrice * project.quantity).toFixed(2)) : null,
        shippingIncluded: false
      }
    };
  }
  if (understanding.wantsPrice && project.product === "football_jersey") {
    if (!project.quantity) return { action: "reply", reason: "collect_quantity", tool: null };
    if (project.quantity > 200) return handoff("quantity_over_200");
    const unitPrice = footballUnitPrice(project.quantity);
    return {
      action: "reply",
      reason: understanding.wantsDiscount ? "explain_price_tier" : "quote_product_only",
      tool: null,
      facts: { unitPrice, productSubtotal: Number((unitPrice * project.quantity).toFixed(2)), shippingIncluded: false }
    };
  }
  if (understanding.wantsPrice && ["hoodie", "yoga_wear"].includes(project.product)) {
    const ready = project.quantity && project.destinationCountry && (project.referenceReceived || project.hasLogo !== null);
    return ready ? handoff("custom_product_quote_ready") : { action: "reply", reason: "collect_custom_quote_fields", tool: null };
  }
  return { action: "reply", reason: "continue_qualification", tool: null };
}

function handoff(reason) {
  return { action: "handoff", reason, tool: "create_handoff" };
}
