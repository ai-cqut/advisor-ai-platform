package cn.edu.cqut.advisorplatform.dto.response;

import java.time.LocalDateTime;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MemoryTaskResponseDTO {

  private Long id;
  private Long userId;
  private Long sessionId;
  private String turnId;
  private String status;
  private Map<String, Object> payload;
  private Integer retryCount;
  private String errorMessage;
  private LocalDateTime createdAt;
  private LocalDateTime processedAt;

  public static MemoryTaskResponseDTO from(
      cn.edu.cqut.advisorplatform.memoryservice.entity.MemoryTaskDO task) {
    return MemoryTaskResponseDTO.builder()
        .id(task.getId())
        .userId(task.getUserId())
        .sessionId(task.getSessionId())
        .turnId(task.getTurnId())
        .status(task.getStatus())
        .payload(task.getPayload())
        .retryCount(task.getRetryCount())
        .errorMessage(task.getErrorMessage())
        .createdAt(task.getCreatedAt())
        .processedAt(task.getProcessedAt())
        .build();
  }
}
