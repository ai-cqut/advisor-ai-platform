package cn.edu.cqut.advisorplatform.service.impl.memory;

import cn.edu.cqut.advisorplatform.dto.request.MemoryCandidateItemDTO;
import cn.edu.cqut.advisorplatform.dto.request.MemoryCandidateUpsertRequestDTO;
import cn.edu.cqut.advisorplatform.dto.response.MemoryCandidateUpsertResponseDTO;
import cn.edu.cqut.advisorplatform.memoryservice.dao.UserMemoryDao;
import cn.edu.cqut.advisorplatform.memoryservice.entity.UserMemoryDO;
import cn.edu.cqut.advisorplatform.service.vector.EmbeddingService;
import cn.edu.cqut.advisorplatform.service.vector.MemoryServiceFactory;
import cn.edu.cqut.advisorplatform.service.vector.MemoryVectorService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Slf4j
@Component
@RequiredArgsConstructor
public class MemoryCandidateUpsertSupport {

  private static final double SIMILARITY_THRESHOLD = 0.85d;

  private final UserMemoryDao userMemoryDao;
  private final MemoryServiceFactory memoryServiceFactory;
  private final EmbeddingService embeddingService;
  private final PlatformTransactionManager transactionManager;
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
    TransactionTemplate txTemplate = new TransactionTemplate(transactionManager);
    txTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    for (MemoryCandidateItemDTO candidate : candidates) {
      if (entityFactory.isBlankCandidate(candidate)) {
        rejected++;
        continue;
      }

      String normalizedContent = entityFactory.normalizeContent(candidate);
      BigDecimal confidence = entityFactory.resolveConfidence(candidate);

      try {
        double[] embedding = embeddingService.embed(normalizedContent);
        txTemplate.executeWithoutResult(
            status ->
                upsertOne(
                    request, candidate, vectorService, normalizedContent, confidence, embedding));
        accepted++;
      } catch (Exception exc) {
        log.warn(
            "memory_write_failed userId={}, contentHash={}",
            request.getUserId(),
            Integer.toHexString(normalizedContent.hashCode()),
            exc);
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

  private void upsertOne(
      MemoryCandidateUpsertRequestDTO request,
      MemoryCandidateItemDTO candidate,
      MemoryVectorService vectorService,
      String normalizedContent,
      BigDecimal confidence,
      double[] embedding) {
    if (vectorService != null) {
      Optional<UserMemoryDO> similar =
          vectorService.findSimilar(request.getUserId(), 0L, embedding, SIMILARITY_THRESHOLD);
      if (similar.isPresent()) {
        entityFactory.updateSimilarMemory(similar.get(), candidate, normalizedContent, confidence);
        UserMemoryDO row = userMemoryDao.save(similar.get());
        vectorService.updateEmbedding(row.getId(), embedding);
        return;
      }
    }

    UserMemoryDO row =
        entityFactory.createNewMemory(request, candidate, normalizedContent, confidence);
    row = userMemoryDao.save(row);
    if (vectorService != null) {
      vectorService.updateEmbedding(row.getId(), embedding);
    }
  }
}
