package cn.edu.cqut.advisorplatform.service.impl.chat;

import cn.edu.cqut.advisorplatform.common.exception.ForbiddenException;
import cn.edu.cqut.advisorplatform.common.security.UserPrincipal;
import cn.edu.cqut.advisorplatform.entity.chat.ChatMessageDO;
import cn.edu.cqut.advisorplatform.entity.chat.ChatSessionDO;
import cn.edu.cqut.advisorplatform.entity.user.UserDO;
import cn.edu.cqut.advisorplatform.entity.user.UserRole;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class ChatSessionSupport {

  public static final String DEFAULT_SESSION_TITLE = "\u65b0\u5bf9\u8bdd";
  private static final DateTimeFormatter TIME_FORMATTER =
      DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

  public Map<String, Object> toSessionMap(ChatSessionDO session) {
    LocalDateTime time =
        session.getUpdatedAt() == null ? session.getCreatedAt() : session.getUpdatedAt();
    String title =
        session.getTitle() == null || session.getTitle().isBlank()
            ? DEFAULT_SESSION_TITLE
            : session.getTitle();
    if ("???".equals(title)) {
      title = DEFAULT_SESSION_TITLE;
    }
    return Map.of("id", session.getId(), "title", title, "updatedAt", formatTime(time));
  }

  public Map<String, Object> toMessageMap(ChatMessageDO message) {
    return Map.of(
        "id", message.getId(),
        "role", message.getRole(),
        "content", message.getContent(),
        "sources", message.getSources() == null ? List.of() : message.getSources(),
        "events", message.getEvents() == null ? List.of() : message.getEvents());
  }

  public UserDO toUserReference(UserPrincipal currentUser) {
    UserDO user = new UserDO();
    user.setId(currentUser.getId());
    user.setUsername(currentUser.getUsername());
    user.setRealName(currentUser.getRealName());
    user.setRole(UserRole.valueOf(currentUser.getRole().name()));
    user.setEnabled(currentUser.isEnabled());
    return user;
  }

  public UserPrincipal requireUser(UserPrincipal currentUser) {
    if (currentUser == null || currentUser.getId() == null) {
      throw new ForbiddenException("未登录或登录已失效");
    }
    return currentUser;
  }

  public Long requireUserId(UserPrincipal currentUser) {
    UserPrincipal safeUser = requireUser(currentUser);
    Long userId = safeUser.getId();
    if (userId == null) {
      throw new ForbiddenException("未登录或登录已失效");
    }
    return userId;
  }

  private String formatTime(LocalDateTime value) {
    if (value == null) {
      return "";
    }
    return TIME_FORMATTER.format(value);
  }
}
