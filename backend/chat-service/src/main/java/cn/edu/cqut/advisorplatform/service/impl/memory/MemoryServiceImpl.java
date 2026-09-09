package cn.edu.cqut.advisorplatform.service.impl.memory;

import cn.edu.cqut.advisorplatform.dao.chat.ChatSessionDao;
import cn.edu.cqut.advisorplatform.dao.chat.SessionSummaryDao;
import cn.edu.cqut.advisorplatform.dao.memory.MemoryTaskDao;
import cn.edu.cqut.advisorplatform.dao.memory.UserMemoryDao;
import cn.edu.cqut.advisorplatform.dto.request.memory.MemoryCandidateUpsertRequestDTO;
import cn.edu.cqut.advisorplatform.dto.request.memory.MemorySearchRequestDTO;
import cn.edu.cqut.advisorplatform.dto.request.memory.MemoryTaskSubmitDTO;
import cn.edu.cqut.advisorplatform.dto.request.memory.SessionSummaryUpdateRequestDTO;
import cn.edu.cqut.advisorplatform.dto.response.memory.MemoryCandidateUpsertResponseDTO;
import cn.edu.cqut.advisorplatform.dto.response.memory.MemoryItemResponseDTO;
import cn.edu.cqut.advisorplatform.dto.response.memory.MemoryTaskResponseDTO;
import cn.edu.cqut.advisorplatform.dto.response.memory.SessionSummaryResponseDTO;
import cn.edu.cqut.advisorplatform.entity.memory.UserMemoryDO;
import cn.edu.cqut.advisorplatform.service.memory.MemoryService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class MemoryServiceImpl implements MemoryService {

  private final UserMemoryDao userMemoryDao;
  private final MemoryTaskDao memoryTaskDao;
  private final SessionSummaryDao sessionSummaryDao;
  private final ChatSessionDao chatSessionDao;
  private final MemorySearchSupport memorySearchSupport;
  private final MemoryCandidateUpsertSupport memoryCandidateUpsertSupport;
  private final MemoryAdministrationSupport memoryAdministrationSupport;

  @Value("${advisor.memory.vector-store:pgvector}")
  private String vectorStore;

  @Value("${advisor.memory.hybrid.vector-weight:0.7}")
  private double hybridVectorWeight;

  @Value("${advisor.memory.hybrid.text-weight:0.3}")
  private double hybridTextWeight;

  @Override
  public List<MemoryItemResponseDTO> searchLongTerm(MemorySearchRequestDTO request) {
    long startedAt = System.currentTimeMillis();
    int topK = request.getTopK() == null ? 6 : Math.max(1, Math.min(request.getTopK(), 50));
    String query = java.util.Optional.ofNullable(request.getQuery()).orElse("").trim();
    String mode = java.util.Optional.ofNullable(request.getMode()).orElse("hybrid").toLowerCase();
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
  @Transactional
  public MemoryCandidateUpsertResponseDTO upsertCandidates(
      MemoryCandidateUpsertRequestDTO request) {
    return memoryCandidateUpsertSupport.upsert(request, vectorStore);
  }

  @Override
  public SessionSummaryResponseDTO getSessionSummary(Long sessionId) {
    return memoryAdministrationSupport.getSessionSummary(sessionId);
  }

  @Override
  @Transactional
  public void saveSessionSummary(Long sessionId, SessionSummaryUpdateRequestDTO request) {
    memoryAdministrationSupport.saveSessionSummary(sessionId, request);
  }

  @Override
  public void healthCheck() {
    // no-op
  }

  @Override
  @Transactional
  public Map<String, Integer> cleanupExpiredMemories() {
    return memoryAdministrationSupport.cleanupExpiredMemories();
  }

  @Override
  @Transactional
  public MemoryTaskResponseDTO submitTask(MemoryTaskSubmitDTO request) {
    return memoryAdministrationSupport.submitTask(request);
  }

  @Override
  public List<MemoryTaskResponseDTO> fetchPendingTasks(int limit) {
    return memoryAdministrationSupport.fetchPendingTasks(limit);
  }

  @Override
  @Transactional
  public void markTaskDone(Long taskId) {
    memoryAdministrationSupport.markTaskDone(taskId);
  }

  @Override
  @Transactional
  public void markTaskFailed(Long taskId, String error) {
    memoryAdministrationSupport.markTaskFailed(taskId, error);
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
