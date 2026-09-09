package cn.edu.cqut.advisorplatform.gateway.trace;

import cn.edu.cqut.advisorplatform.common.trace.TraceEvent;
import cn.edu.cqut.advisorplatform.common.trace.TraceNodeStatus;
import java.util.Map;

public class TraceEventFactory {

  public TraceEvent create(
      String traceId,
      String turnId,
      String node,
      TraceNodeStatus status,
      String message,
      long startedAt,
      String source,
      Map<String, Object> metadata) {
    Long durationMs =
        status == TraceNodeStatus.STARTED
            ? null
            : Math.max(0L, System.currentTimeMillis() - startedAt);
    return new TraceEvent(
        traceId,
        turnId,
        node,
        status,
        message,
        System.currentTimeMillis(),
        durationMs,
        source,
        metadata);
  }
}
