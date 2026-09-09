import type { JsonObject } from "../../common/json/types/JsonTypes.js";
import { IntentRouteDecision } from "../../routing/model/IntentRouteDecision.js";
import type { LegacyToolRouteContext } from "../model/LegacyToolRouteContext.js";

export interface LegacyRouteContext {
  readonly categories: readonly string[];
  readonly matchedTools: readonly string[];
  readonly matchedBy: string;
  readonly confidence: number;
  readonly educationDomain: boolean;
  readonly preferredTools: readonly string[];
}

export function adjustRoutePayload(
  routePayload: JsonObject,
  routeDecision: IntentRouteDecision,
  matchedTools: readonly string[],
  rawMatchedTools: readonly string[]
): JsonObject {
  let nextPayload = routePayload;
  if (matchedTools.length !== rawMatchedTools.length || matchedTools.some((tool, index) => tool !== rawMatchedTools[index])) {
    nextPayload = {
      ...nextPayload,
      matched_tools: [...matchedTools],
      source: {
        ...(typeof nextPayload.source === "object" && nextPayload.source !== null ? nextPayload.source as JsonObject : {}),
        matched_tools: [...matchedTools]
      }
    } as JsonObject;
  }
  if (
    (routeDecision.matchedBy === "strong_rule" || routeDecision.matchedBy === "score") &&
    routeDecision.categories.size === 1 &&
    routeDecision.categories.has("search") &&
    routeDecision.matchedTools.length === 0
  ) {
    nextPayload = {
      ...nextPayload,
      matched_by: "fallback",
      source: {
        ...(typeof nextPayload.source === "object" && nextPayload.source !== null ? nextPayload.source as JsonObject : {}),
        decision: "fallback"
      }
    } as JsonObject;
  }
  return nextPayload;
}

export function buildLegacyRouteContext(
  routeDecision: IntentRouteDecision,
  matchedTools: readonly string[],
  educationDomain: boolean
): LegacyRouteContext & LegacyToolRouteContext {
  return {
    categories: [...routeDecision.categories].sort(),
    matchedTools,
    matchedBy: routeDecision.matchedBy,
    confidence: routeDecision.confidence,
    educationDomain,
    preferredTools: educationDomain ? ["rag_search"] : []
  };
}

export function buildPlannerRouteContext(
  routeDecision: IntentRouteDecision,
  matchedTools: readonly string[],
  educationDomain: boolean
): JsonObject {
  return {
    categories: [...routeDecision.categories].sort(),
    matched_tools: [...matchedTools],
    matched_by: routeDecision.matchedBy,
    confidence: routeDecision.confidence,
    education_domain: educationDomain,
    preferred_tools: educationDomain ? ["rag_search"] : []
  };
}

export function preferRetrievalFallback(routeDecision: IntentRouteDecision, hasRagTool: boolean): IntentRouteDecision {
  if (!hasRagTool) return routeDecision;
  if (routeDecision.matchedBy === "fallback") {
    return new IntentRouteDecision(
      new Set(),
      routeDecision.matchedBy,
      routeDecision.confidence,
      routeDecision.fallbackReason,
      routeDecision.scores,
      routeDecision.matchedTools,
      routeDecision.reason
    );
  }
  return routeDecision;
}
