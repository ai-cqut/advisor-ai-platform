package cn.edu.cqut.advisorplatform.controller.memory;

import cn.edu.cqut.advisorplatform.annotation.Auditable;
import cn.edu.cqut.advisorplatform.dto.request.memory.MemoryCandidateUpsertRequestDTO;
import cn.edu.cqut.advisorplatform.dto.request.memory.MemoryConfidenceUpdateDTO;
import cn.edu.cqut.advisorplatform.dto.request.memory.MemoryContentUpdateDTO;
import cn.edu.cqut.advisorplatform.dto.request.memory.MemoryInvalidateSupersedeDTO;
import cn.edu.cqut.advisorplatform.dto.request.memory.MemoryMarkMergedDTO;
import cn.edu.cqut.advisorplatform.dto.request.memory.MemorySearchRequestDTO;
import cn.edu.cqut.advisorplatform.dto.request.memory.MemoryTaskSubmitDTO;
import cn.edu.cqut.advisorplatform.dto.request.memory.SessionSummaryUpdateRequestDTO;
import cn.edu.cqut.advisorplatform.dto.response.ApiResponseDTO;
import cn.edu.cqut.advisorplatform.dto.response.memory.MemoryCandidateUpsertResponseDTO;
import cn.edu.cqut.advisorplatform.dto.response.memory.MemoryItemResponseDTO;
import cn.edu.cqut.advisorplatform.dto.response.memory.MemoryTaskResponseDTO;
import cn.edu.cqut.advisorplatform.dto.response.memory.SessionSummaryResponseDTO;
import cn.edu.cqut.advisorplatform.entity.audit.AuditAction;
import cn.edu.cqut.advisorplatform.entity.audit.AuditModule;
import cn.edu.cqut.advisorplatform.service.memory.MemoryService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/memory")
@RequiredArgsConstructor
public class MemoryController {

  private final MemoryService memoryService;

  @GetMapping("/health")
  public ApiResponseDTO<Map<String, Object>> health() {
    memoryService.healthCheck();
    return ApiResponseDTO.success(Map.of("ok", true));
  }

  @PostMapping("/long-term/search")
  @Auditable(
      module = AuditModule.MEMORY,
      action = AuditAction.SEARCH,
      logRequestParams = true,
      logResponseData = false)
  public ApiResponseDTO<List<MemoryItemResponseDTO>> searchLongTerm(
      @Valid @RequestBody MemorySearchRequestDTO request) {
    return ApiResponseDTO.success(memoryService.searchLongTerm(request));
  }

  @GetMapping("/long-term/core")
  public ApiResponseDTO<List<MemoryItemResponseDTO>> getCoreMemories(
      @RequestParam("userId") Long userId) {
    return ApiResponseDTO.success(memoryService.getCoreMemories(userId));
  }

  @PostMapping("/long-term/candidates")
  @Auditable(
      module = AuditModule.MEMORY,
      action = AuditAction.STORE,
      logRequestParams = true,
      logResponseData = false)
  public ApiResponseDTO<MemoryCandidateUpsertResponseDTO> upsertCandidates(
      @Valid @RequestBody MemoryCandidateUpsertRequestDTO request) {
    return ApiResponseDTO.success(memoryService.upsertCandidates(request));
  }

  @PostMapping("/long-term/{id}/invalidate")
  public ApiResponseDTO<Void> invalidateMemory(@PathVariable("id") Long id) {
    memoryService.invalidateMemory(id);
    return ApiResponseDTO.success();
  }

  @PostMapping("/long-term/{id}/invalidate-and-supersede")
  public ApiResponseDTO<Void> invalidateAndSupersede(
      @PathVariable("id") Long id, @Valid @RequestBody MemoryInvalidateSupersedeDTO request) {
    memoryService.invalidateAndSupersede(id, request.getNewMemoryId());
    return ApiResponseDTO.success();
  }

  @PostMapping("/long-term/{id}/mark-merged")
  public ApiResponseDTO<Void> markAsMerged(
      @PathVariable("id") Long id, @Valid @RequestBody MemoryMarkMergedDTO request) {
    memoryService.markAsMerged(id, request.getTargetMemoryId());
    return ApiResponseDTO.success();
  }

  @PostMapping("/long-term/{id}/confidence")
  public ApiResponseDTO<Void> updateConfidence(
      @PathVariable("id") Long id, @Valid @RequestBody MemoryConfidenceUpdateDTO request) {
    memoryService.updateConfidence(id, request.getConfidence());
    return ApiResponseDTO.success();
  }

  @PostMapping("/long-term/{id}/content")
  public ApiResponseDTO<Void> updateContent(
      @PathVariable("id") Long id, @Valid @RequestBody MemoryContentUpdateDTO request) {
    memoryService.updateContent(id, request.getContent(), request.getConfidence());
    return ApiResponseDTO.success();
  }

  @GetMapping("/session-summary/{sessionId}")
  @Auditable(
      module = AuditModule.MEMORY,
      action = AuditAction.RETRIEVE,
      logRequestParams = true,
      logResponseData = false)
  public ApiResponseDTO<SessionSummaryResponseDTO> getSessionSummary(@PathVariable Long sessionId) {
    return ApiResponseDTO.success(memoryService.getSessionSummary(sessionId));
  }

  @PutMapping("/session-summary/{sessionId}")
  @Auditable(
      module = AuditModule.MEMORY,
      action = AuditAction.UPDATE,
      logRequestParams = true,
      logResponseData = false)
  public ApiResponseDTO<Void> saveSessionSummary(
      @PathVariable Long sessionId, @Valid @RequestBody SessionSummaryUpdateRequestDTO request) {
    memoryService.saveSessionSummary(sessionId, request);
    return ApiResponseDTO.success();
  }

  @PostMapping("/cleanup")
  public ApiResponseDTO<Map<String, Integer>> cleanupExpired() {
    return ApiResponseDTO.success(memoryService.cleanupExpiredMemories());
  }

  @PostMapping("/task/submit")
  public ApiResponseDTO<MemoryTaskResponseDTO> submitTask(
      @Valid @RequestBody MemoryTaskSubmitDTO request) {
    return ApiResponseDTO.success(memoryService.submitTask(request));
  }

  @GetMapping("/task/pending")
  public ApiResponseDTO<List<MemoryTaskResponseDTO>> fetchPendingTasks(
      @RequestParam(defaultValue = "10") int limit) {
    return ApiResponseDTO.success(memoryService.fetchPendingTasks(limit));
  }

  @PostMapping("/task/{id}/done")
  public ApiResponseDTO<Void> markTaskDone(@PathVariable Long id) {
    memoryService.markTaskDone(id);
    return ApiResponseDTO.success();
  }

  @PostMapping("/task/{id}/fail")
  public ApiResponseDTO<Void> markTaskFailed(
      @PathVariable Long id, @RequestParam(required = false) String error) {
    memoryService.markTaskFailed(id, error);
    return ApiResponseDTO.success();
  }
}
