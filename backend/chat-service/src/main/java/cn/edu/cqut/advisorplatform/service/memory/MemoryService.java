package cn.edu.cqut.advisorplatform.service.memory;

import cn.edu.cqut.advisorplatform.dto.request.memory.MemoryCandidateUpsertRequestDTO;
import cn.edu.cqut.advisorplatform.dto.request.memory.MemorySearchRequestDTO;
import cn.edu.cqut.advisorplatform.dto.request.memory.MemoryTaskSubmitDTO;
import cn.edu.cqut.advisorplatform.dto.request.memory.SessionSummaryUpdateRequestDTO;
import cn.edu.cqut.advisorplatform.dto.response.memory.MemoryCandidateUpsertResponseDTO;
import cn.edu.cqut.advisorplatform.dto.response.memory.MemoryItemResponseDTO;
import cn.edu.cqut.advisorplatform.dto.response.memory.MemoryTaskResponseDTO;
import cn.edu.cqut.advisorplatform.dto.response.memory.SessionSummaryResponseDTO;
import java.util.List;
import java.util.Map;

public interface MemoryService {

  List<MemoryItemResponseDTO> searchLongTerm(MemorySearchRequestDTO request);

  List<MemoryItemResponseDTO> getCoreMemories(Long userId);

  MemoryCandidateUpsertResponseDTO upsertCandidates(MemoryCandidateUpsertRequestDTO request);

  SessionSummaryResponseDTO getSessionSummary(Long sessionId);

  void saveSessionSummary(Long sessionId, SessionSummaryUpdateRequestDTO request);

  void healthCheck();

  Map<String, Integer> cleanupExpiredMemories();

  MemoryTaskResponseDTO submitTask(MemoryTaskSubmitDTO request);

  List<MemoryTaskResponseDTO> fetchPendingTasks(int limit);

  void markTaskDone(Long taskId);

  void markTaskFailed(Long taskId, String error);

  void invalidateMemory(Long memoryId);

  void invalidateAndSupersede(Long oldMemoryId, Long newMemoryId);

  void markAsMerged(Long memoryId, Long targetMemoryId);

  void updateConfidence(Long memoryId, Double confidence);

  void updateContent(Long memoryId, String content, Double confidence);
}
