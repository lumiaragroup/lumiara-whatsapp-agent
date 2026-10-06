export function emptyProject(product = null) {
  return {
    product,
    quantity: null,
    destinationCountry: null,
    destinationLocation: null,
    postcode: null,
    hasLogo: null,
    referenceReceived: false,
    sizes: [],
    colors: [],
    timing: null,
    catalogSent: false,
    sampleRequested: null,
    stage: "new",
    updatedAt: Date.now()
  };
}

export function mergeProjectState(previous = {}, understanding = {}) {
  const product = understanding.product || previous.product || null;
  const base = { ...emptyProject(product), ...previous, product };
  const merged = {
    ...base,
    quantity: understanding.quantity ?? base.quantity,
    destinationCountry: understanding.destinationCountry || base.destinationCountry,
    destinationLocation: understanding.destinationLocation || base.destinationLocation,
    postcode: understanding.postcode || base.postcode,
    hasLogo: understanding.hasLogo ?? base.hasLogo,
    sampleRequested: understanding.wantsSample ? true : base.sampleRequested,
    updatedAt: Date.now()
  };
  const known = [merged.product, merged.quantity, merged.destinationCountry, merged.hasLogo !== null].filter(Boolean).length;
  merged.stage = merged.catalogSent ? (known >= 3 ? "qualified" : "catalog_sent") : "new";
  return merged;
}

export function selectProject(profile = {}, product = null) {
  const projects = profile.projects && typeof profile.projects === "object" ? profile.projects : {};
  const key = product || profile.activeProduct || "unclassified";
  return { key, project: projects[key] || emptyProject(product) };
}

export function saveProject(profile = {}, key, project, language) {
  return {
    ...profile,
    preferredLanguage: language || profile.preferredLanguage || null,
    activeProduct: project.product || profile.activeProduct || null,
    projects: { ...(profile.projects || {}), [key]: project },
    updatedAt: Date.now()
  };
}
