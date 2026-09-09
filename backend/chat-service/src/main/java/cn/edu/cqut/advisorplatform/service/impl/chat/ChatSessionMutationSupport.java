package cn.edu.cqut.advisorplatform.service.impl.chat;

import cn.edu.cqut.advisorplatform.common.exception.ForbiddenException;
import cn.edu.cqut.advisorplatform.common.exception.NotFoundException;
import cn.edu.cqut.advisorplatform.common.security.UserPrincipal;
import cn.edu.cqut.advisorplatform.dao.chat.ChatSessionDao;
import cn.edu.cqut.advisorplatform.entity.chat.ChatSessionDO;
import java.time.LocalDateTime;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
class ChatSessionMutationSupport {

  private final ChatSessionDao chatSessionDao;
  private final ChatSessionSupport chatSessionSupport;

  Map<String, Object> createSession(@Nullable UserPrincipal currentUser) {
    ChatSessionDO session = new ChatSessionDO();
    session.setUser(
        chatSessionSupport.toUserReference(chatSessionSupport.requireUser(currentUser)));
    session.setTitle(ChatSessionSupport.DEFAULT_SESSION_TITLE);
    LocalDateTime now = LocalDateTime.now();
    session.setCreatedAt(now);
    session.setUpdatedAt(now);
    return chatSessionSupport.toSessionMap(chatSessionDao.save(session));
  }

  void deleteSession(Long sessionId, @Nullable UserPrincipal currentUser) {
    ChatSessionDO session = getOwnedSession(sessionId, currentUser);
    chatSessionDao.deleteById(session.getId());
  }

  ChatSessionDO getOwnedSession(Long sessionId, @Nullable UserPrincipal currentUser) {
    Long currentUserId = chatSessionSupport.requireUserId(currentUser);
    ChatSessionDO session = findSession(sessionId);
    Long ownerId = session.getUser() == null ? null : session.getUser().getId();
    if (ownerId == null || !ownerId.equals(currentUserId)) {
      throw new ForbiddenException("无权访问该会话");
    }
    return session;
  }

  private ChatSessionDO findSession(Long sessionId) {
    return chatSessionDao.findById(sessionId).orElseThrow(() -> new NotFoundException("会话不存在"));
  }
}
