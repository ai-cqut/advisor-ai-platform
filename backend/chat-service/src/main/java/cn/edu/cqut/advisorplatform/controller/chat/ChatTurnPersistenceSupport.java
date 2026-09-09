package cn.edu.cqut.advisorplatform.controller.chat;

import cn.edu.cqut.advisorplatform.entity.chat.SourceReference;
import cn.edu.cqut.advisorplatform.entity.chat.StreamEventRecord;
import cn.edu.cqut.advisorplatform.service.chat.ChatMessageService;
import cn.edu.cqut.advisorplatform.utils.LogTraceUtil;
import java.util.List;
import lombok.extern.slf4j.Slf4j;

@Slf4j
class ChatTurnPersistenceSupport {

  void saveTurn(
      ChatMessageService chatMessageService,
      Long sessionId,
      Long userId,
      String turnId,
      String userText,
      String assistantText,
      List<SourceReference> sources,
      List<StreamEventRecord> events) {
    if ((sources == null || sources.isEmpty()) && (events == null || events.isEmpty())) {
      chatMessageService.saveTurn(sessionId, userId, turnId, userText, assistantText);
      return;
    }
    chatMessageService.saveTurn(
        sessionId, userId, turnId, userText, assistantText, sources, events);
  }

  boolean saveTurnQuietly(
      ChatMessageService chatMessageService,
      Long sessionId,
      Long userId,
      String turnId,
      String userText,
      String assistantText,
      List<SourceReference> sources,
      List<StreamEventRecord> events) {
    try {
      saveTurn(
          chatMessageService, sessionId, userId, turnId, userText, assistantText, sources, events);
      return true;
    } catch (Exception e) {
      log.warn("chat_stream save_turn_failed, reason={}", LogTraceUtil.preview(e.getMessage()));
      return false;
    }
  }
}
