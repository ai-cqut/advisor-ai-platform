package cn.edu.cqut.advisorplatform.service.impl.memory;

import cn.edu.cqut.advisorplatform.dto.request.MemoryTaskSubmitDTO;
import cn.edu.cqut.advisorplatform.dto.response.MemoryTaskResponseDTO;
import cn.edu.cqut.advisorplatform.memoryservice.dao.MemoryTaskDao;
import cn.edu.cqut.advisorplatform.memoryservice.entity.MemoryTaskDO;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class MemoryTaskSupport {

  private final MemoryTaskDao memoryTaskDao;

  public MemoryTaskResponseDTO submitTask(MemoryTaskSubmitDTO request) {
    var existing =
        memoryTaskDao.findBySessionIdAndTurnId(request.getSessionId(), request.getTurnId());
    if (existing.isPresent()) {
      return MemoryTaskResponseDTO.from(existing.get());
    }
    var task = new MemoryTaskDO();
    task.setUserId(request.getUserId());
    task.setKnowledgeBaseId(0L);
    task.setSessionId(request.getSessionId());
    task.setTurnId(request.getTurnId());
    task.setStatus("pending");
    task.setPayload(toPayload(request));
    task.setRetryCount(0);
    task.setCreatedAt(LocalDateTime.now());
    return MemoryTaskResponseDTO.from(memoryTaskDao.save(task));
  }

  public List<MemoryTaskResponseDTO> fetchPendingTasks(int limit) {
    int safeLimit = Math.max(1, Math.min(limit, 50));
    List<MemoryTaskDO> tasks = memoryTaskDao.findPendingTasks(3, PageRequest.of(0, safeLimit));
    for (MemoryTaskDO task : tasks) {
      memoryTaskDao.updateStatus(task.getId(), "processing");
    }
    return tasks.stream().map(MemoryTaskResponseDTO::from).toList();
  }

  public void markTaskDone(Long taskId) {
    memoryTaskDao.updateStatus(taskId, "done");
  }

  public void markTaskFailed(Long taskId, String error) {
    memoryTaskDao.markFailed(taskId, error != null ? error : "unknown", LocalDateTime.now());
  }

  private Map<String, Object> toPayload(MemoryTaskSubmitDTO request) {
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
