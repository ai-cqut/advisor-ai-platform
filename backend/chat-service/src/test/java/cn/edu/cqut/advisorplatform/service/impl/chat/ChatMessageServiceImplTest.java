package cn.edu.cqut.advisorplatform.service.impl.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.edu.cqut.advisorplatform.dao.chat.ChatMessageDao;
import cn.edu.cqut.advisorplatform.dao.chat.ChatSessionDao;
import cn.edu.cqut.advisorplatform.entity.chat.ChatMessageDO;
import cn.edu.cqut.advisorplatform.entity.chat.ChatSessionDO;
import cn.edu.cqut.advisorplatform.entity.user.UserDO;
import cn.edu.cqut.advisorplatform.service.impl.agent.AgentTitleSummaryClient;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ChatMessageServiceImplTest {

  @Mock private ChatMessageDao chatMessageDao;

  @Mock private ChatSessionDao chatSessionDao;

  @Mock private AgentTitleSummaryClient titleSummaryClient;

  private ChatSessionOwnershipSupport sessionOwnershipSupport;

  private ChatMessageServiceImpl chatMessageService;

  private ChatSessionDO session;

  @BeforeEach
  void setUp() {
    UserDO owner = new UserDO();
    owner.setId(1L);

    session = new ChatSessionDO();
    session.setId(1001L);
    session.setUser(owner);
    session.setTitle("\u65b0\u5bf9\u8bdd");

    sessionOwnershipSupport = new ChatSessionOwnershipSupport(chatSessionDao);
    chatMessageService =
        new ChatMessageServiceImpl(
            chatMessageDao,
            sessionOwnershipSupport,
            new ChatMessageTurnPersistenceSupport(
                chatMessageDao, chatSessionDao, titleSummaryClient));
  }

  @Test
  void saveTurn_shouldUpdateTitleOnFirstUserMessage() {
    when(chatSessionDao.findById(1001L)).thenReturn(Optional.of(session));
    when(chatMessageDao.existsBySessionIdAndTurnIdAndRole(1001L, "turn-1", "assistant"))
        .thenReturn(false);
    when(chatMessageDao.existsBySessionIdAndRole(1001L, "user")).thenReturn(false);
    when(chatMessageDao.existsBySessionIdAndTurnIdAndRole(1001L, "turn-1", "user"))
        .thenReturn(false);

    chatMessageService.saveTurn(1001L, 1L, "turn-1", "abcdefghi", "ok");

    ArgumentCaptor<ChatSessionDO> sessionCaptor = ArgumentCaptor.forClass(ChatSessionDO.class);
    verify(chatSessionDao).save(sessionCaptor.capture());
    assertThat(sessionCaptor.getValue().getTitle()).isEqualTo("abc");
    verify(chatMessageDao, times(2)).save(any(ChatMessageDO.class));
  }

  @Test
  void saveTurn_shouldFallbackToFirstThreeCharactersWhenTitleAgentFails() {
    when(chatSessionDao.findById(1001L)).thenReturn(Optional.of(session));
    when(chatMessageDao.existsBySessionIdAndTurnIdAndRole(1001L, "turn-fallback", "assistant"))
        .thenReturn(false);
    when(chatMessageDao.existsBySessionIdAndRole(1001L, "user")).thenReturn(false);
    when(chatMessageDao.existsBySessionIdAndTurnIdAndRole(1001L, "turn-fallback", "user"))
        .thenReturn(false);
    when(titleSummaryClient.summarize("abcdefghi")).thenReturn(Optional.empty());

    chatMessageService.saveTurn(1001L, 1L, "turn-fallback", "abcdefghi", "ok");

    ArgumentCaptor<ChatSessionDO> sessionCaptor = ArgumentCaptor.forClass(ChatSessionDO.class);
    verify(chatSessionDao).save(sessionCaptor.capture());
    assertThat(sessionCaptor.getValue().getTitle()).isEqualTo("abc");
  }

  @Test
  void saveTurn_shouldPersistErrorPlaceholderWhenAssistantEmpty() {
    when(chatSessionDao.findById(1001L)).thenReturn(Optional.of(session));
    when(chatMessageDao.existsBySessionIdAndTurnIdAndRole(1001L, "turn-2", "assistant"))
        .thenReturn(false);
    when(chatMessageDao.existsBySessionIdAndRole(1001L, "user")).thenReturn(true);
    when(chatMessageDao.existsBySessionIdAndTurnIdAndRole(1001L, "turn-2", "user"))
        .thenReturn(false);

    chatMessageService.saveTurn(1001L, 1L, "turn-2", "hello", "   ");

    ArgumentCaptor<ChatMessageDO> msgCaptor = ArgumentCaptor.forClass(ChatMessageDO.class);
    verify(chatMessageDao, times(2)).save(msgCaptor.capture());
    List<ChatMessageDO> saved = msgCaptor.getAllValues();
    ChatMessageDO assistant =
        saved.stream().filter(m -> "assistant".equals(m.getRole())).findFirst().orElseThrow();
    assertThat(assistant.getContent())
        .isEqualTo("\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002");
  }

  @Test
  void saveTurn_shouldBeIdempotentWhenAssistantAlreadyExists() {
    when(chatSessionDao.findById(1001L)).thenReturn(Optional.of(session));
    when(chatMessageDao.existsBySessionIdAndTurnIdAndRole(1001L, "turn-3", "assistant"))
        .thenReturn(true);

    chatMessageService.saveTurn(1001L, 1L, "turn-3", "hello", "assistant reply");

    verify(chatMessageDao, never()).save(any(ChatMessageDO.class));
    verify(chatSessionDao, never()).save(any(ChatSessionDO.class));
  }

  @Test
  void findAssistantContent_shouldReturnStoredAnswer() {
    when(chatSessionDao.findById(1001L)).thenReturn(Optional.of(session));
    ChatMessageDO assistant = new ChatMessageDO();
    assistant.setContent("cached answer");
    when(chatMessageDao.findFirstBySessionIdAndTurnIdAndRole(1001L, "turn-4", "assistant"))
        .thenReturn(Optional.of(assistant));

    Optional<String> result = chatMessageService.findAssistantContent(1001L, 1L, "turn-4");

    assertThat(result).contains("cached answer");
    verify(chatMessageDao)
        .findFirstBySessionIdAndTurnIdAndRole(eq(1001L), eq("turn-4"), eq("assistant"));
  }
}
