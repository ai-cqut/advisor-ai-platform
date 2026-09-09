package cn.edu.cqut.advisorplatform.controller.chat;

import cn.edu.cqut.advisorplatform.annotation.Auditable;
import cn.edu.cqut.advisorplatform.common.exception.ForbiddenException;
import cn.edu.cqut.advisorplatform.common.security.UserPrincipal;
import cn.edu.cqut.advisorplatform.dto.request.chat.ChatStreamRequestDTO;
import cn.edu.cqut.advisorplatform.dto.response.ApiResponseDTO;
import cn.edu.cqut.advisorplatform.entity.audit.AuditAction;
import cn.edu.cqut.advisorplatform.entity.audit.AuditModule;
import cn.edu.cqut.advisorplatform.service.agent.AgentProxyService;
import cn.edu.cqut.advisorplatform.service.chat.ChatMessageService;
import cn.edu.cqut.advisorplatform.service.chat.ChatService;
import cn.edu.cqut.advisorplatform.service.trace.TraceEventClient;
import cn.edu.cqut.advisorplatform.utils.LogTraceUtil;
import jakarta.validation.Valid;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.Nullable;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
@Slf4j
@PreAuthorize("hasAnyRole('ADMIN', 'ADVISOR')")
public class ChatController {

  private static final String ASSISTANT_ERROR_PLACEHOLDER =
      "\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002";
  private static final String LOGIN_REQUIRED_MESSAGE =
      "\u672a\u767b\u5f55\u6216\u767b\u5f55\u5df2\u5931\u6548";

  private final AgentProxyService agentProxyService;
  private final ChatService chatService;
  private final ChatMessageService chatMessageService;
  private final ChatTurnIdGenerator turnIdGenerator = new ChatTurnIdGenerator();
  private final SseResponseWriter sseResponseWriter = new SseResponseWriter();
  private final ChatControllerSupport support = new ChatControllerSupport();
  private final ChatRequestAuditContext auditContext = new ChatRequestAuditContext();
  private final ChatStreamBodyFactory streamBodyFactory = new ChatStreamBodyFactory();
  private final ChatOnceResponseHandler onceResponseHandler = new ChatOnceResponseHandler();
  private final ChatTurnPersistenceSupport turnPersistenceSupport =
      new ChatTurnPersistenceSupport();
  private final TraceEventClient traceEventClient;

  @PostMapping("/sessions/{sessionId}/messages")
  @Auditable(
      module = AuditModule.CHAT,
      action = AuditAction.CHAT,
      logRequestParams = true,
      logResponseData = false)
  public ApiResponseDTO<Map<String, Object>> sendMessage(
      @PathVariable("sessionId") Long sessionId,
      @RequestBody Map<String, String> body,
      @AuthenticationPrincipal @Nullable UserPrincipal currentUser) {
    requireLogin(currentUser);
    return ApiResponseDTO.success(
        onceResponseHandler.handle(
            sessionId,
            body,
            currentUser,
            ASSISTANT_ERROR_PLACEHOLDER,
            agentProxyService,
            chatService,
            chatMessageService,
            turnIdGenerator,
            auditContext,
            turnPersistenceSupport,
            support));
  }

  @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  @Auditable(
      module = AuditModule.CHAT,
      action = AuditAction.STREAM_CHAT,
      logRequestParams = true,
      logResponseData = false)
  public ResponseEntity<StreamingResponseBody> streamChat(
      @Valid @RequestBody ChatStreamRequestDTO request,
      @AuthenticationPrincipal @Nullable UserPrincipal currentUser) {
    requireLogin(currentUser);

    String userText = extractLastUserMessage(request);
    String turnId = buildTurnId(request, currentUser.getId());
    String traceId = auditContext.resolveTraceIdFromRequest();
    auditContext.attach(traceId, request.getSessionId(), turnId);

    log.info(
        "chat_stream accepted, traceId={}, sessionId={}, turnId={}, userId={}, userLen={}, userPreview={}",
        traceId,
        request.getSessionId(),
        turnId,
        currentUser.getId(),
        userText.length(),
        LogTraceUtil.preview(userText));

    StreamingResponseBody body =
        streamBodyFactory.create(
            request,
            currentUser.getId(),
            traceId,
            turnId,
            userText,
            ASSISTANT_ERROR_PLACEHOLDER,
            agentProxyService,
            chatMessageService,
            sseResponseWriter,
            turnPersistenceSupport,
            support,
            traceEventClient);

    return ResponseEntity.ok()
        .contentType(MediaType.TEXT_EVENT_STREAM)
        .header(HttpHeaders.CACHE_CONTROL, "no-cache")
        .header("X-Accel-Buffering", "no")
        .body(body);
  }

  private void requireLogin(@Nullable UserPrincipal currentUser) {
    if (currentUser == null || currentUser.getId() == null) {
      throw new ForbiddenException(LOGIN_REQUIRED_MESSAGE);
    }
  }

  private String extractLastUserMessage(ChatStreamRequestDTO request) {
    return support.extractLastUserMessage(request);
  }

  private String buildTurnId(ChatStreamRequestDTO request, Long userId) {
    return turnIdGenerator.build(request, userId);
  }
}
