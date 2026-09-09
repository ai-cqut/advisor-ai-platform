package cn.edu.cqut.advisorplatform.service.impl.memory;

import static org.assertj.core.api.Assertions.assertThat;

import cn.edu.cqut.advisorplatform.dto.request.memory.MemoryCandidateItemDTO;
import cn.edu.cqut.advisorplatform.dto.request.memory.MemoryCandidateUpsertRequestDTO;
import cn.edu.cqut.advisorplatform.entity.memory.UserMemoryDO;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class MemoryCandidateEntityFactoryTest {

  private final MemoryCandidateEntityFactory factory = new MemoryCandidateEntityFactory();

  @Test
  void createNewMemoryNormalizesCandidateFields() {
    MemoryCandidateUpsertRequestDTO request = new MemoryCandidateUpsertRequestDTO();
    request.setUserId(1L);
    request.setCandidates(List.of());

    MemoryCandidateItemDTO candidate = new MemoryCandidateItemDTO();
    candidate.setContent("  remember me  ");
    candidate.setConfidence(1.5d);
    candidate.setSourceTurnId("turn-1");
    candidate.setTags(Map.of("memory_key", " profile.name "));

    String normalizedContent = factory.normalizeContent(candidate);
    BigDecimal confidence = factory.resolveConfidence(candidate);
    UserMemoryDO row = factory.createNewMemory(request, candidate, normalizedContent, confidence);

    assertThat(normalizedContent).isEqualTo("remember me");
    assertThat(confidence).isEqualByComparingTo("1.000");
    assertThat(row.getUserId()).isEqualTo(1L);
    assertThat(row.getKnowledgeBaseId()).isZero();
    assertThat(row.getContent()).isEqualTo("remember me");
    assertThat(row.getMemoryKey()).isEqualTo("profile.name");
    assertThat(row.getIsDeleted()).isFalse();
    assertThat(row.getCreatedAt()).isNotNull();
    assertThat(row.getUpdatedAt()).isNotNull();
  }

  @Test
  void updateSimilarMemoryKeepsHigherConfidence() {
    UserMemoryDO row = new UserMemoryDO();
    row.setConfidence(BigDecimal.valueOf(0.8d));

    MemoryCandidateItemDTO candidate = new MemoryCandidateItemDTO();
    candidate.setContent("new");
    candidate.setConfidence(0.3d);

    factory.updateSimilarMemory(row, candidate, "new", factory.resolveConfidence(candidate));

    assertThat(row.getContent()).isEqualTo("new");
    assertThat(row.getConfidence()).isEqualByComparingTo("0.8");
    assertThat(row.getTags()).isEmpty();
    assertThat(row.getUpdatedAt()).isNotNull();
  }
}
