package cn.edu.cqut.advisorplatform.service.impl.chat;

import cn.edu.cqut.advisorplatform.entity.chat.ChatMessageDO;
import cn.edu.cqut.advisorplatform.entity.chat.ChatSessionDO;
import cn.edu.cqut.advisorplatform.entity.chat.SourceReference;
import cn.edu.cqut.advisorplatform.entity.chat.StreamEventRecord;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.lang.Nullable;

class ChatMessagePersistFactory {

  private static final String DEFAULT_TITLE = "\u65b0\u5bf9\u8bdd";
  private static final String LEGACY_DEFAULT_TITLE = "???";

  ChatMessageDO createMessage(
      ChatSessionDO session,
      String turnId,
      String role,
      String content,
      @Nullable List<SourceReference> sources,
      @Nullable List<StreamEventRecord> events,
      LocalDateTime createdAt) {
    ChatMessageDO message = new ChatMessageDO();
    message.setSession(session);
    message.setTurnId(turnId);
    message.setRole(role);
    message.setContent(content);
    message.setSources(sources);
    message.setEvents(events);
    message.setCreatedAt(createdAt);
    return message;
  }

  boolean isDefaultTitle(String title) {
    if (title == null) {
      return true;
    }
    String normalized = title.trim();
    return normalized.isEmpty()
        || DEFAULT_TITLE.equals(normalized)
        || LEGACY_DEFAULT_TITLE.equals(normalized);
  }

  String buildFallbackTitle(String userContent) {
    int limit = Math.min(3, userContent.length());
    return userContent.substring(0, limit);
  }
}
