package cn.edu.cqut.advisorplatform.gateway.trace;

import cn.edu.cqut.advisorplatform.common.trace.TraceEvent;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;

@RestController
@RequestMapping
public class TraceEventController {

  private final TraceEventHub eventHub;

  @Value("${advisor.internal.token:}")
  private String internalToken;

  public TraceEventController(TraceEventHub eventHub) {
    this.eventHub = eventHub;
  }

  @GetMapping(value = "/api/trace/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public Flux<ServerSentEvent<TraceEvent>> stream(@RequestParam String traceId) {
    return eventHub
        .subscribe(traceId)
        .map(
            event -> ServerSentEvent.<TraceEvent>builder().event("trace.node").data(event).build());
  }

  @PostMapping("/internal/trace/events")
  public void publish(
      @RequestHeader(value = "X-Internal-Token", required = false) String requestToken,
      @RequestBody TraceEvent event) {
    if (!Objects.equals(internalToken, requestToken)) {
      throw new IllegalArgumentException("invalid internal trace token");
    }
    eventHub.publish(event);
  }
}
