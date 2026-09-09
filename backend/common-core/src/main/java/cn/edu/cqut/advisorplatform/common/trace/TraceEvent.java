package cn.edu.cqut.advisorplatform.common.trace;

import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TraceEvent {

  private String traceId;
  private String turnId;
  private String node;
  private TraceNodeStatus status;
  private String message;
  private long timestamp;
  private Long durationMs;
  private String source;
  private Map<String, Object> metadata;
}
