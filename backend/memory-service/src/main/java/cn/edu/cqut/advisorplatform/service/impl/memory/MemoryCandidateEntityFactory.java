package cn.edu.cqut.advisorplatform.service.impl.memory;

import cn.edu.cqut.advisorplatform.dto.request.MemoryCandidateItemDTO;
import cn.edu.cqut.advisorplatform.dto.request.MemoryCandidateUpsertRequestDTO;
import cn.edu.cqut.advisorplatform.memoryservice.entity.UserMemoryDO;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class MemoryCandidateEntityFactory {

  public boolean isBlankCandidate(MemoryCandidateItemDTO candidate) {
    return candidate == null
        || candidate.getContent() == null
        || candidate.getContent().trim().isEmpty();
  }

  public String normalizeContent(MemoryCandidateItemDTO candidate) {
    return candidate.getContent().trim();
  }

  public BigDecimal resolveConfidence(MemoryCandidateItemDTO candidate) {
    double fallback = 0.7d;
    double safe =
        candidate.getConfidence() == null
            ? fallback
            : Math.max(0d, Math.min(1d, candidate.getConfidence()));
    return BigDecimal.valueOf(safe).setScale(3, java.math.RoundingMode.HALF_UP);
  }

  public UserMemoryDO createNewMemory(
      MemoryCandidateUpsertRequestDTO request,
      MemoryCandidateItemDTO candidate,
      String normalizedContent,
      BigDecimal confidence) {
    UserMemoryDO row = new UserMemoryDO();
    row.setUserId(request.getUserId());
    row.setKnowledgeBaseId(0L);
    row.setContent(normalizedContent);
    row.setConfidence(confidence);
    row.setScore(BigDecimal.ZERO.setScale(4));
    row.setMemoryKey(extractMemoryKey(candidate.getTags()));
    row.setSourceTurnId(candidate.getSourceTurnId());
    row.setTags(candidate.getTags() == null ? new HashMap<>() : candidate.getTags());
    row.setMemoryType(resolveMemoryType(candidate));
    row.setIsCore(candidate.getIsCore() != null && candidate.getIsCore());
    row.setIsDeleted(false);
    row.setCreatedAt(LocalDateTime.now());
    row.setUpdatedAt(LocalDateTime.now());
    return row;
  }

  public void updateSimilarMemory(
      UserMemoryDO row,
      MemoryCandidateItemDTO candidate,
      String normalizedContent,
      BigDecimal confidence) {
    row.setContent(normalizedContent);
    row.setConfidence(row.getConfidence().max(confidence));
    row.setMemoryKey(extractMemoryKey(candidate.getTags()));
    row.setSourceTurnId(candidate.getSourceTurnId());
    row.setTags(candidate.getTags() == null ? new HashMap<>() : candidate.getTags());
    row.setMemoryType(resolveMemoryType(candidate));
    row.setUpdatedAt(LocalDateTime.now());
  }

  private String extractMemoryKey(Map<String, Object> tags) {
    if (tags == null) {
      return null;
    }
    Object raw = tags.get("memory_key");
    if (raw == null) {
      return null;
    }
    String value = String.valueOf(raw).trim();
    return value.isEmpty() ? null : value;
  }

  private String resolveMemoryType(MemoryCandidateItemDTO candidate) {
    String raw = candidate.getMemoryType();
    if (raw != null && !raw.trim().isEmpty()) {
      String normalized = raw.trim().toLowerCase();
      if ("episodic".equals(normalized)) {
        return "episodic";
      }
    }
    return "semantic";
  }
}
