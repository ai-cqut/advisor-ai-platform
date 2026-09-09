package cn.edu.cqut.advisorplatform.service.impl.chat;

import cn.edu.cqut.advisorplatform.dao.chat.ChatMessageDao;
import cn.edu.cqut.advisorplatform.dao.chat.ChatSessionDao;
import cn.edu.cqut.advisorplatform.entity.chat.ChatMessageDO;
import cn.edu.cqut.advisorplatform.entity.chat.ChatSessionDO;
import cn.edu.cqut.advisorplatform.entity.chat.SourceReference;
import cn.edu.cqut.advisorplatform.entity.chat.StreamEventRecord;
import cn.edu.cqut.advisorplatform.service.impl.agent.AgentTitleSummaryClient;
import cn.edu.cqut.advisorplatform.utils.LogTraceUtil;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
class ChatMessageTurnPersistenceSupport {

  private static final String ASSISTANT_ERROR_PLACEHOLDER = "请求失败，请稍后重试。";

  private final ChatMessageDao chatMessageDao;
  private final ChatSessionDao chatSessionDao;
  private final AgentTitleSummaryClient titleSummaryClient;
  private final ChatMessagePersistFactory messageFactory = new ChatMessagePersistFactory();

  void saveTurn(
      ChatSessionDO session,
      @Nullable String turnId,
      @Nullable String userContent,
      @Nullable String assistantContent,
      @Nullable List<SourceReference> sources,
      @Nullable List<StreamEventRecord> events) {
    String safeTurnId = turnId == null ? "" : turnId.trim();
    if (safeTurnId.isBlank()) {
      log.warn("chat_persist skip_blank_turn");
      return;
    }

    Long sessionId = session.getId();
    if (chatMessageDao.existsBySessionIdAndTurnIdAndRole(
        sessionId, safeTurnId, ChatMessageRoles.ASSISTANT)) {
      log.info("chat_persist idempotent_hit, role=assistant");
      return;
    }

    String safeUserContent = userContent == null ? "" : userContent.trim();
    String safeAssistantContent = normalizeAssistantContent(assistantContent);

    LocalDateTime now = LocalDateTime.now();
    boolean shouldInitTitle = shouldInitTitle(session, safeUserContent);
    persistUserMessageIfNeeded(session, safeTurnId, safeUserContent, now);
    persistAssistantMessageIfNeeded(
        session, safeTurnId, safeAssistantContent, sources, events, now.plusNanos(1));

    if (shouldInitTitle) {
      updateSessionTitle(session, safeUserContent);
    }
    session.setUpdatedAt(now);
    chatSessionDao.save(session);
    log.info(
        "chat_persist done, userLen={}, assistantLen={}",
        safeUserContent.length(),
        safeAssistantContent.length());
  }

  private String normalizeAssistantContent(@Nullable String assistantContent) {
    String safeAssistantContent = assistantContent == null ? "" : assistantContent.trim();
    if (safeAssistantContent.isBlank()) {
      return ASSISTANT_ERROR_PLACEHOLDER;
    }
    return safeAssistantContent;
  }

  private boolean shouldInitTitle(ChatSessionDO session, String safeUserContent) {
    boolean firstUserMessage =
        !chatMessageDao.existsBySessionIdAndRole(session.getId(), ChatMessageRoles.USER);
    return firstUserMessage
        && !safeUserContent.isBlank()
        && messageFactory.isDefaultTitle(session.getTitle());
  }

  private void persistUserMessageIfNeeded(
      ChatSessionDO session, String turnId, String safeUserContent, LocalDateTime createdAt) {
    if (safeUserContent.isBlank()
        || chatMessageDao.existsBySessionIdAndTurnIdAndRole(
            session.getId(), turnId, ChatMessageRoles.USER)) {
      return;
    }
    insertMessage(session, turnId, ChatMessageRoles.USER, safeUserContent, null, null, createdAt);
  }

  private void persistAssistantMessageIfNeeded(
      ChatSessionDO session,
      String turnId,
      String safeAssistantContent,
      @Nullable List<SourceReference> sources,
      @Nullable List<StreamEventRecord> events,
      LocalDateTime createdAt) {
    if (chatMessageDao.existsBySessionIdAndTurnIdAndRole(
        session.getId(), turnId, ChatMessageRoles.ASSISTANT)) {
      return;
    }
    insertMessage(
        session,
        turnId,
        ChatMessageRoles.ASSISTANT,
        safeAssistantContent,
        sources,
        events,
        createdAt);
  }

  private void updateSessionTitle(ChatSessionDO session, String safeUserContent) {
    String title =
        titleSummaryClient
            .summarize(safeUserContent)
            .orElseGet(() -> messageFactory.buildFallbackTitle(safeUserContent));
    session.setTitle(title);
    log.info("chat_persist update_title, titlePreview={}", LogTraceUtil.preview(title));
  }

  private void insertMessage(
      ChatSessionDO session,
      String turnId,
      String role,
      String content,
      @Nullable List<SourceReference> sources,
      @Nullable List<StreamEventRecord> events,
      LocalDateTime createdAt) {
    ChatMessageDO message =
        messageFactory.createMessage(session, turnId, role, content, sources, events, createdAt);
    try {
      chatMessageDao.save(message);
      log.info(
          "chat_persist save_message, role={}, contentLen={}, preview={}",
          role,
          content == null ? 0 : content.length(),
          LogTraceUtil.preview(content));
    } catch (DataIntegrityViolationException ignored) {
      log.info("chat_persist idempotent_conflict, role={}", role);
    }
  }
}
