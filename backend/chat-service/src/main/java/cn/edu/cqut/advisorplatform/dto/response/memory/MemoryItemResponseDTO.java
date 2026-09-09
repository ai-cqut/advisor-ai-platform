package cn.edu.cqut.advisorplatform.dto.response.memory;

import cn.edu.cqut.advisorplatform.entity.memory.UserMemoryDO;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class MemoryItemResponseDTO {

  private Long id;
  private Long userId;
  private String content;
  private BigDecimal confidence;
  private BigDecimal score;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;
  private LocalDateTime expiresAt;
  private Map<String, Object> tags;
  private String memoryType;
  private LocalDateTime validUntil;
  private Long supersedesId;
  private Boolean isCore;

  public static MemoryItemResponseDTO from(UserMemoryDO entity) {
    return new MemoryItemResponseDTO(
        entity.getId(),
        entity.getUserId(),
        entity.getContent(),
        entity.getConfidence(),
        entity.getScore(),
        entity.getCreatedAt(),
        entity.getUpdatedAt(),
        entity.getExpiresAt(),
        entity.getTags(),
        entity.getMemoryType(),
        entity.getValidUntil(),
        entity.getSupersedesId(),
        entity.getIsCore());
  }
}
