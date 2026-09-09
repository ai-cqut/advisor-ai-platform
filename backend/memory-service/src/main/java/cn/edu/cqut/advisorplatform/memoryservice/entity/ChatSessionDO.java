package cn.edu.cqut.advisorplatform.memoryservice.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@Entity
@Table(name = "chat_session")
public class ChatSessionDO {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = 256)
  private String title = "新对话";

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id")
  private UserDO user;

  @Column(updatable = false)
  private LocalDateTime createdAt;

  private LocalDateTime updatedAt;
}
