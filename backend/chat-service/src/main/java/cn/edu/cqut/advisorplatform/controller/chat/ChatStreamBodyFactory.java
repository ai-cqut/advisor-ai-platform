package cn.edu.cqut.advisorplatform.controller.chat;

import cn.edu.cqut.advisorplatform.common.trace.TraceNodeStatus;
import cn.edu.cqut.advisorplatform.dto.request.chat.ChatStreamRequestDTO;
import cn.edu.cqut.advisorplatform.entity.chat.SourceReference;
import cn.edu.cqut.advisorplatform.entity.chat.StreamEventRecord;
import cn.edu.cqut.advisorplatform.service.agent.AgentProxyService;
import cn.edu.cqut.advisorplatform.service.chat.ChatMessageService;
import cn.edu.cqut.advisorplatform.service.model.ChatStreamProxyResult;
import cn.edu.cqut.advisorplatform.service.trace.TraceEventClient;
import cn.edu.cqut.advisorplatform.utils.LogTraceUtil;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@Slf4j
class ChatStreamBodyFactory {

  private static final String FAILURE_MESSAGE_PREFIX = "\u8bf7\u6c42\u5931\u8d25\uff1a";

  StreamingResponseBody create(
      ChatStreamRequestDTO request,
      Long userId,
      String traceId,
      String turnId,
      String userText,
      String assistantErrorPlaceholder,
      AgentProxyService agentProxyService,
      ChatMessageService chatMessageService,
      SseResponseWriter sseResponseWriter,
      ChatTurnPersistenceSupport turnPersistenceSupport,
      ChatControllerSupport support,
      TraceEventClient traceEventClient) {
    return outputStream -> {
      long startAt = System.currentTimeMillis();
      LogTraceUtil.put(traceId, request.getSessionId(), turnId, userId);
      long requestStartedAt = System.currentTimeMillis();
      traceEventClient.publish(
          traceId,
          turnId,
          "chat.accepted",
          TraceNodeStatus.STARTED,
          "chat-service 已接收请求",
          null,
          java.util.Map.of("sessionId", request.getSessionId()));
      String assistantText = assistantErrorPlaceholder;
      List<SourceReference> sources = List.of();
      List<StreamEventRecord> events = List.of();
      String finishReason = "stop";
      try {
        log.info("chat_stream start");
        traceEventClient.publish(
            traceId, turnId, "agent.request", TraceNodeStatus.STARTED, "正在调用 Agent", null, null);
        traceEventClient.publish(
            traceId,
            turnId,
            "chat.accepted",
            TraceNodeStatus.SUCCESS,
            "会话请求校验通过",
            support.elapsedSince(requestStartedAt),
            null);
        ChatStreamProxyResult proxyResult =
            agentProxyService.proxyChatStream(request, userId, outputStream);
        assistantText = resolveAssistantText(proxyResult, assistantErrorPlaceholder);
        sources = resolveSources(proxyResult);
        events = resolveEvents(proxyResult);
        log.info(
            "chat_stream proxy_done, assistantLen={}, elapsedMs={}",
            assistantText.length(),
            support.elapsedSince(startAt));
        traceEventClient.publish(
            traceId,
            turnId,
            "agent.request",
            TraceNodeStatus.SUCCESS,
            "Agent 返回流式结果",
            support.elapsedSince(startAt),
            java.util.Map.of("answerLength", assistantText.length()));
      } catch (Exception ex) {
        String errorMessage = support.safeMessage(ex, assistantErrorPlaceholder);
        finishReason = "error";
        sseResponseWriter.writeErrorEvent(outputStream, errorMessage);
        log.warn("chat_stream proxy_failed, reason={}", LogTraceUtil.preview(errorMessage));
        traceEventClient.publish(
            traceId,
            turnId,
            "agent.request",
            TraceNodeStatus.FAILED,
            errorMessage,
            support.elapsedSince(startAt),
            null);
        assistantText = FAILURE_MESSAGE_PREFIX + errorMessage;
      } finally {
        sseResponseWriter.writeDoneEvent(outputStream, finishReason, turnId, traceId);
        traceEventClient.publish(
            traceId,
            turnId,
            "chat.persist",
            TraceNodeStatus.STARTED,
            "开始持久化会话消息和 Agent 事件",
            null,
            java.util.Map.of(
                "stage",
                "save_messages_and_events",
                "includes",
                List.of("userMessage", "assistantMessage", "sources", "agentEvents"),
                "titleHandling",
                "首次会话同步生成标题，失败时使用备用标题"));
        boolean persisted =
            turnPersistenceSupport.saveTurnQuietly(
                chatMessageService,
                request.getSessionId(),
                userId,
                turnId,
                userText,
                assistantText,
                sources,
                events);
        traceEventClient.publish(
            traceId,
            turnId,
            "chat.persist",
            persisted ? TraceNodeStatus.SUCCESS : TraceNodeStatus.FAILED,
            persisted ? "会话消息和 Agent 事件已持久化" : "会话消息持久化失败",
            support.elapsedSince(requestStartedAt),
            java.util.Map.of("eventCount", events.size(), "persisted", persisted));
        traceEventClient.publish(
            traceId,
            turnId,
            "request.completed",
            finishReason.equals("error") || !persisted
                ? TraceNodeStatus.FAILED
                : TraceNodeStatus.SUCCESS,
            finishReason.equals("error") || !persisted ? "请求处理失败" : "请求处理完成",
            support.elapsedSince(requestStartedAt),
            java.util.Map.of("finishReason", finishReason, "persisted", persisted));
        log.info(
            "chat_stream done, assistantLen={}, elapsedMs={}",
            assistantText.length(),
            support.elapsedSince(startAt));
        LogTraceUtil.clear();
      }
    };
  }

  private String resolveAssistantText(
      ChatStreamProxyResult proxyResult, String assistantErrorPlaceholder) {
    if (proxyResult == null
        || proxyResult.getAssistantText() == null
        || proxyResult.getAssistantText().isBlank()) {
      return assistantErrorPlaceholder;
    }
    return proxyResult.getAssistantText().trim();
  }

  private List<SourceReference> resolveSources(ChatStreamProxyResult proxyResult) {
    if (proxyResult == null || proxyResult.getSources() == null) {
      return List.of();
    }
    return proxyResult.getSources();
  }

  private List<StreamEventRecord> resolveEvents(ChatStreamProxyResult proxyResult) {
    if (proxyResult == null || proxyResult.getEvents() == null) {
      return List.of();
    }
    return proxyResult.getEvents();
  }
}
