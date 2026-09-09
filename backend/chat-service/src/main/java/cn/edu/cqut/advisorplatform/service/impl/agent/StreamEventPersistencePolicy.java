package cn.edu.cqut.advisorplatform.service.impl.agent;

class StreamEventPersistencePolicy {

  boolean shouldPersist(String eventName) {
    return switch (eventName) {
      case "tool_use",
              "tool_result",
              "tool_error",
              "sys_intent_route",
              "sys_tool_plan",
              "sys_reasoning",
              "sys_model_context",
              "sys_rag_force",
              "risk_alert" ->
          true;
      default -> false;
    };
  }
}
