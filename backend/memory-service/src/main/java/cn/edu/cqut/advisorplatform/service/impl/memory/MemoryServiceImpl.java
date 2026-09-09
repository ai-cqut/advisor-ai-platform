package cn.edu.cqut.advisorplatform.service.impl.memory;

import cn.edu.cqut.advisorplatform.dto.request.MemoryCandidateUpsertRequestDTO;
import cn.edu.cqut.advisorplatform.dto.request.MemorySearchRequestDTO;
import cn.edu.cqut.advisorplatform.dto.request.MemoryTaskSubmitDTO;
import cn.edu.cqut.advisorplatform.dto.request.SessionSummaryUpdateRequestDTO;
import cn.edu.cqut.advisorplatform.dto.response.MemoryCandidateUpsertResponseDTO;
import cn.edu.cqut.advisorplatform.dto.response.MemoryItemResponseDTO;
import cn.edu.cqut.advisorplatform.dto.response.MemoryTaskResponseDTO;
import cn.edu.cqut.advisorplatform.dto.response.SessionSummaryResponseDTO;
import cn.edu.cqut.advisorplatform.memoryservice.dao.UserMemoryDao;
import cn.edu.cqut.advisorplatform.memoryservice.entity.UserMemoryDO;
import cn.edu.cqut.advisorplatform.service.MemoryService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class MemoryServiceImpl implements MemoryService {

  private final MemorySessionSummarySupport memorySessionSummarySupport;
  private final MemorySearchSupport memorySearchSupport;
  private final MemoryCandidateUpsertSupport memoryCandidateUpsertSupport;
  private final MemoryTaskSupport memoryTaskSupport;
  private final MemoryCleanupSupport memoryCleanupSupport;
  private final UserMemoryDao userMemoryDao;

  @Value("${advisor.memory.vector-store:pgvector}")
  private String vectorStore;

  @Value("${advisor.memory.hybrid.vector-weight:0.7}")
  private double hybridVectorWeight;

  @Value("${advisor.memory.hybrid.text-weight:0.3}")
  private double hybridTextWeight;

  @Override
  @Transactional
  public List<MemoryItemResponseDTO> searchLongTerm(MemorySearchRequestDTO request) {
    long startedAt = System.currentTimeMillis();
    int topK = request.getTopK() == null ? 6 : Math.max(1, Math.min(request.getTopK(), 50));
    String query = Optional.ofNullable(request.getQuery()).orElse("").trim();
    String mode = Optional.ofNullable(request.getMode()).orElse("hybrid").toLowerCase();
    List<UserMemoryDO> rows =
        memorySearchSupport.search(
            request, topK, query, mode, vectorStore, hybridVectorWeight, hybridTextWeight);

    memorySearchSupport.recordAccessHits(rows);

    log.info(
        "memory_search_done userId={}, topK={}, mode={}, resultCount={}, elapsedMs={}",
        request.getUserId(),
        topK,
        mode,
        rows.size(),
        System.currentTimeMillis() - startedAt);

    return rows.stream().map(MemoryItemResponseDTO::from).toList();
  }

  @Override
  @Transactional
  public List<MemoryItemResponseDTO> getCoreMemories(Long userId) {
    List<UserMemoryDO> rows = userMemoryDao.findCoreMemories(userId, 0L, LocalDateTime.now());
    return rows.stream().map(MemoryItemResponseDTO::from).toList();
  }

  @Override
  public MemoryCandidateUpsertResponseDTO upsertCandidates(
      MemoryCandidateUpsertRequestDTO request) {
    return memoryCandidateUpsertSupport.upsert(request, vectorStore);
  }

  @Override
  public SessionSummaryResponseDTO getSessionSummary(Long sessionId) {
    return memorySessionSummarySupport.getSessionSummary(sessionId);
  }

  @Override
  @Transactional
  public void saveSessionSummary(Long sessionId, SessionSummaryUpdateRequestDTO request) {
    memorySessionSummarySupport.saveSessionSummary(sessionId, request);
  }

  @Override
  public void healthCheck() {
    // no-op
  }

  @Override
  @Transactional
  public Map<String, Integer> cleanupExpiredMemories() {
    return memoryCleanupSupport.cleanupExpiredMemories();
  }

  @Override
  @Transactional
  public MemoryTaskResponseDTO submitTask(MemoryTaskSubmitDTO request) {
    return memoryTaskSupport.submitTask(request);
  }

  @Override
  @Transactional
  public List<MemoryTaskResponseDTO> fetchPendingTasks(int limit) {
    return memoryTaskSupport.fetchPendingTasks(limit);
  }

  @Override
  @Transactional
  public void markTaskDone(Long taskId) {
    memoryTaskSupport.markTaskDone(taskId);
  }

  @Override
  @Transactional
  public void markTaskFailed(Long taskId, String error) {
    memoryTaskSupport.markTaskFailed(taskId, error);
  }

  @Override
  @Transactional
  public void invalidateMemory(Long memoryId) {
    Optional<UserMemoryDO> optional = userMemoryDao.findById(memoryId);
    if (optional.isPresent()) {
      UserMemoryDO row = optional.get();
      row.setValidUntil(LocalDateTime.now());
      row.setUpdatedAt(LocalDateTime.now());
      userMemoryDao.save(row);
      log.info("memory_invalidated id={}", memoryId);
    } else {
      log.warn("memory_invalidate_not_found id={}", memoryId);
    }
  }

  @Override
  @Transactional
  public void invalidateAndSupersede(Long oldMemoryId, Long newMemoryId) {
    // Set valid_until on old memory
    invalidateMemory(oldMemoryId);
    // Set supersedes_id on new memory
    Optional<UserMemoryDO> newMemory = userMemoryDao.findById(newMemoryId);
    if (newMemory.isPresent()) {
      UserMemoryDO row = newMemory.get();
      row.setSupersedesId(oldMemoryId);
      userMemoryDao.save(row);
      log.info("memory_supersede oldId={}, newId={}", oldMemoryId, newMemoryId);
    }
  }

  @Override
  @Transactional
  public void markAsMerged(Long memoryId, Long targetMemoryId) {
    Optional<UserMemoryDO> optional = userMemoryDao.findById(memoryId);
    if (optional.isPresent()) {
      UserMemoryDO row = optional.get();
      row.setMergedIntoId(targetMemoryId);
      row.setUpdatedAt(LocalDateTime.now());
      userMemoryDao.save(row);
      log.info("memory_merged id={}, targetId={}", memoryId, targetMemoryId);
    } else {
      log.warn("memory_merge_not_found id={}", memoryId);
    }
  }

  @Override
  @Transactional
  public void updateConfidence(Long memoryId, Double confidence) {
    Optional<UserMemoryDO> optional = userMemoryDao.findById(memoryId);
    if (optional.isPresent()) {
      UserMemoryDO row = optional.get();
      BigDecimal safeConfidence = safeConfidence(confidence);
      row.setConfidence(safeConfidence);
      row.setUpdatedAt(LocalDateTime.now());
      userMemoryDao.save(row);
      log.info("memory_confidence_updated id={}, confidence={}", memoryId, safeConfidence);
    } else {
      log.warn("memory_update_not_found id={}", memoryId);
    }
  }

  @Override
  @Transactional
  public void updateContent(Long memoryId, String content, Double confidence) {
    Optional<UserMemoryDO> optional = userMemoryDao.findById(memoryId);
    if (optional.isPresent()) {
      UserMemoryDO row = optional.get();
      row.setContent(content);
      BigDecimal safeConfidence = safeConfidence(confidence);
      row.setConfidence(safeConfidence);
      row.setUpdatedAt(LocalDateTime.now());
      userMemoryDao.save(row);
      log.info("memory_content_updated id={}", memoryId);
    } else {
      log.warn("memory_update_not_found id={}", memoryId);
    }
  }

  private BigDecimal safeConfidence(Double confidence) {
    return BigDecimal.valueOf(Math.max(0, Math.min(1, confidence)))
        .setScale(3, RoundingMode.HALF_UP);
  }
}
