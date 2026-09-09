package cn.edu.cqut.advisorplatform.gateway.trace;

import cn.edu.cqut.advisorplatform.common.trace.TraceEvent;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;

public class TraceEventHub {

  private final Map<String, Sinks.Many<TraceEvent>> streams = new ConcurrentHashMap<>();

  public void publish(TraceEvent event) {
    if (event == null || event.getTraceId() == null || event.getTraceId().isBlank()) {
      return;
    }
    Sinks.Many<TraceEvent> sink =
        streams.computeIfAbsent(
            event.getTraceId(), ignored -> Sinks.many().multicast().onBackpressureBuffer());
    sink.tryEmitNext(event);
  }

  public Flux<TraceEvent> subscribe(String traceId) {
    Sinks.Many<TraceEvent> sink =
        streams.computeIfAbsent(
            traceId, ignored -> Sinks.many().multicast().onBackpressureBuffer());
    return sink.asFlux()
        .timeout(Duration.ofMinutes(10))
        .doFinally(ignored -> streams.remove(traceId, sink));
  }
}
