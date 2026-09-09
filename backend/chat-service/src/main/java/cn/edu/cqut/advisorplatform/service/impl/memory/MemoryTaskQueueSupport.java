package cn.edu.cqut.advisorplatform.service.impl.memory;

import cn.edu.cqut.advisorplatform.dao.memory.MemoryTaskDao;
import cn.edu.cqut.advisorplatform.dto.request.memory.MemoryTaskSubmitDTO;
import cn.edu.cqut.advisorplatform.dto.response.memory.MemoryTaskResponseDTO;
import cn.edu.cqut.advisorplatform.entity.memory.MemoryTaskDO;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
class MemoryTaskQueueSupport {

  private static final int MAX_PENDING_LIMIT = 50;
  private static final int MAX_RETRIES = 3;
  private static final String STATUS_PENDING = "pending";
  private static final String STATUS_PROCESSING = "processing";
  private static final String STATUS_DONE = "done";

  private final MemoryTaskDao memoryTaskDao;

  MemoryTaskResponseDTO submitTask(MemoryTaskSubmitDTO request) {
    var existing =
        memoryTaskDao.findBySessionIdAndTurnId(request.getSessionId(), request.getTurnId());
    if (existing.isPresent()) {
      return MemoryTaskResponseDTO.from(existing.get());
    }
    return MemoryTaskResponseDTO.from(memoryTaskDao.save(createTask(request)));
  }

  List<MemoryTaskResponseDTO> fetchPendingTasks(int limit) {
    int safeLimit = Math.max(1, Math.min(limit, MAX_PENDING_LIMIT));
    List<MemoryTaskDO> tasks =
        memoryTaskDao.findPendingTasks(MAX_RETRIES, PageRequest.of(0, safeLimit));
    for (MemoryTaskDO task : tasks) {
      memoryTaskDao.updateStatus(task.getId(), STATUS_PROCESSING);
    }
    return tasks.stream().map(MemoryTaskResponseDTO::from).toList();
  }

  void markTaskDone(Long taskId) {
    memoryTaskDao.updateStatus(taskId, STATUS_DONE);
  }

  void markTaskFailed(Long taskId, String error) {
    memoryTaskDao.markFailed(taskId, error != null ? error : "unknown", LocalDateTime.now());
  }

  private MemoryTaskDO createTask(MemoryTaskSubmitDTO request) {
    MemoryTaskDO task = new MemoryTaskDO();
    task.setUserId(request.getUserId());
    task.setKnowledgeBaseId(0L);
    task.setSessionId(request.getSessionId());
    task.setTurnId(request.getTurnId());
    task.setStatus(STATUS_PENDING);
    task.setPayload(createPayload(request));
    task.setRetryCount(0);
    task.setCreatedAt(LocalDateTime.now());
    return task;
  }

  private Map<String, Object> createPayload(MemoryTaskSubmitDTO request) {
    Map<String, Object> payload = new HashMap<>();
    if (request.getUserText() != null) {
      payload.put("user_text", request.getUserText());
    }
    if (request.getAssistantText() != null) {
      payload.put("assistant_text", request.getAssistantText());
    }
    if (request.getRecentMessages() != null) {
      payload.put("recent_messages", request.getRecentMessages());
    }
    return payload;
  }
}
