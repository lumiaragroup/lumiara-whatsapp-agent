import { understandMessage } from "./understanding.js";
import { mergeProjectState, saveProject, selectProject } from "./project-state.js";
import { decidePolicy } from "./policy.js";
import { guardAndRepair } from "./reply-guard.js";

export async function planTurn({ text, history, profile, catalogAvailable, ai }) {
  const understanding = await understandMessage({
    text,
    history,
    profile,
    runModel: ai.understand
  });
  const selected = selectProject(profile, understanding.product);
  const project = mergeProjectState(selected.project, understanding);
  const nextProfile = saveProject(profile, selected.key, project, understanding.language);
  const policy = decidePolicy({ understanding, project, catalogAvailable });
  if (policy.action === "tool" || policy.action === "handoff") {
    return { understanding, project, profile: nextProfile, policy, reply: null, send: false };
  }
  const draft = await ai.compose({ understanding, project, policy, history });
  const guarded = await guardAndRepair({
    reply: draft,
    expectedLanguage: understanding.language,
    policy,
    project,
    rewrite: ai.rewrite
  });
  return {
    understanding,
    project,
    profile: nextProfile,
    policy,
    reply: guarded.reply,
    send: guarded.ok,
    guard: guarded
  };
}
