package cn.edu.cqut.advisorplatform.service.impl.memory;

import cn.edu.cqut.advisorplatform.dao.memory.UserMemoryDao;
import cn.edu.cqut.advisorplatform.dto.request.memory.MemoryCandidateItemDTO;
import cn.edu.cqut.advisorplatform.dto.request.memory.MemoryCandidateUpsertRequestDTO;
import cn.edu.cqut.advisorplatform.dto.response.memory.MemoryCandidateUpsertResponseDTO;
import cn.edu.cqut.advisorplatform.entity.memory.UserMemoryDO;
import cn.edu.cqut.advisorplatform.service.vector.EmbeddingService;
import cn.edu.cqut.advisorplatform.service.vector.MemoryServiceFactory;
import cn.edu.cqut.advisorplatform.service.vector.MemoryVectorService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class MemoryCandidateUpsertSupport {

  private static final double SIMILARITY_THRESHOLD = 0.85d;

  private final UserMemoryDao userMemoryDao;
  private final MemoryServiceFactory memoryServiceFactory;
  private final EmbeddingService embeddingService;
  private final MemoryCandidateEntityFactory entityFactory;

  public MemoryCandidateUpsertResponseDTO upsert(
      MemoryCandidateUpsertRequestDTO request, String vectorStore) {
    long startedAt = System.currentTimeMillis();
    List<MemoryCandidateItemDTO> candidates = request.getCandidates();
    if (candidates == null || candidates.isEmpty()) {
      return MemoryCandidateUpsertResponseDTO.of(0, 0, "no_candidates");
    }

    MemoryVectorService vectorService =
        memoryServiceFactory.hasService(vectorStore)
            ? memoryServiceFactory.getService(vectorStore)
            : null;

    int accepted = 0;
    int rejected = 0;
    for (MemoryCandidateItemDTO candidate : candidates) {
      if (entityFactory.isBlankCandidate(candidate)) {
        rejected++;
        continue;
      }

      String normalizedContent = entityFactory.normalizeContent(candidate);
      BigDecimal confidence = entityFactory.resolveConfidence(candidate);

      try {
        double[] embedding = embeddingService.embed(normalizedContent);
        if (vectorService != null) {
          Optional<UserMemoryDO> similar =
              vectorService.findSimilar(request.getUserId(), 0L, embedding, SIMILARITY_THRESHOLD);
          if (similar.isPresent()) {
            entityFactory.updateSimilarMemory(
                similar.get(), candidate, normalizedContent, confidence);
            UserMemoryDO row = userMemoryDao.save(similar.get());
            vectorService.updateEmbedding(row.getId(), embedding);
            accepted++;
            continue;
          }
        }

        UserMemoryDO row =
            entityFactory.createNewMemory(request, candidate, normalizedContent, confidence);
        row = userMemoryDao.save(row);
        if (vectorService != null) {
          vectorService.updateEmbedding(row.getId(), embedding);
        }
        accepted++;
      } catch (Exception exc) {
        log.warn("memory_write_failed userId={}, err={}", request.getUserId(), exc.getMessage());
        rejected++;
      }
    }

    log.info(
        "memory_write_done userId={}, accepted={}, rejected={}, elapsedMs={}",
        request.getUserId(),
        accepted,
        rejected,
        System.currentTimeMillis() - startedAt);

    return MemoryCandidateUpsertResponseDTO.of(accepted, rejected, "ok");
  }
}
