package cn.edu.cqut.advisorplatform.service.trace;

import cn.edu.cqut.advisorplatform.common.trace.TraceEvent;
import cn.edu.cqut.advisorplatform.common.trace.TraceNodeStatus;
import cn.edu.cqut.advisorplatform.entity.chat.StreamEventRecord;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class TraceEventClient {

  private final HttpClient httpClient = HttpClient.newHttpClient();
  private final ObjectMapper objectMapper;
  private final String gatewayBaseUrl;
  private final String internalToken;
  private final ConcurrentMap<String, CompletableFuture<Void>> publishChains =
      new ConcurrentHashMap<>();

  public TraceEventClient(
      ObjectMapper objectMapper,
      @Value("${advisor.trace.gateway-base-url:http://127.0.0.1:8080}") String gatewayBaseUrl,
      @Value("${advisor.internal.token:}") String internalToken) {
    this.objectMapper = objectMapper;
    this.gatewayBaseUrl = gatewayBaseUrl;
    this.internalToken = internalToken;
  }

  public void publish(
      String traceId,
      String turnId,
      String node,
      TraceNodeStatus status,
      String message,
      Long durationMs,
      Map<String, Object> metadata) {
    if (traceId == null || traceId.isBlank()) {
      return;
    }
    TraceEvent event =
        new TraceEvent(
            traceId,
            turnId,
            node,
            status,
            message,
            System.currentTimeMillis(),
            durationMs,
            "chat-service",
            metadata);
    send(event);
  }

  public void publishAgentEvent(StreamEventRecord record) {
    if (record == null) {
      return;
    }
    String event = record.getEvent();
    String node = nodeFor(event);
    if (node == null) {
      return;
    }
    TraceNodeStatus status =
        "tool_use".equals(event)
            ? TraceNodeStatus.STARTED
            : ("llm_delta".equals(event) || "llm_data".equals(event))
                ? TraceNodeStatus.STARTED
                : TraceNodeStatus.SUCCESS;
    if ("tool_result".equals(event)
        && "error".equals(String.valueOf(record.getPayload().get("status")))) {
      status = TraceNodeStatus.FAILED;
    }
    send(
        new TraceEvent(
            record.getTraceId(),
            null,
            node,
            status,
            eventMessage(event, record),
            record.getTimestamp() == null ? System.currentTimeMillis() : record.getTimestamp(),
            null,
            "agent-ts",
            record.getPayload()));
  }

  private void send(TraceEvent event) {
    String traceId = event.getTraceId();
    publishChains.compute(
        traceId,
        (ignored, previous) -> {
          CompletableFuture<Void> before =
              previous == null
                  ? CompletableFuture.completedFuture(null)
                  : previous.handle((result, error) -> null);
          CompletableFuture<Void> next = before.thenCompose(ignoredResult -> sendNow(event));
          next.whenComplete((result, error) -> publishChains.remove(traceId, next));
          return next;
        });
  }

  private CompletableFuture<Void> sendNow(TraceEvent event) {
    try {
      String body = objectMapper.writeValueAsString(event);
      HttpRequest request =
          HttpRequest.newBuilder()
              .uri(URI.create(gatewayBaseUrl + "/internal/trace/events"))
              .timeout(Duration.ofSeconds(2))
              .header("Content-Type", "application/json")
              .header("X-Internal-Token", internalToken)
              .POST(HttpRequest.BodyPublishers.ofString(body))
              .build();
      return httpClient
          .sendAsync(request, HttpResponse.BodyHandlers.discarding())
          .thenAccept(
              response -> {
                if (response.statusCode() >= 400) {
                  log.debug(
                      "trace event publish failed: status={}, node={}",
                      response.statusCode(),
                      event.getNode());
                }
              })
          .exceptionally(
              error -> {
                log.debug("trace event publish failed: {}", error.getMessage());
                return null;
              });
    } catch (Exception e) {
      log.debug("trace event serialization failed: {}", e.getMessage());
      return CompletableFuture.completedFuture(null);
    }
  }

  private String nodeFor(String event) {
    return switch (event) {
      case "sys_intent_route" -> "agent.intent.route";
      case "sys_tool_plan" -> "agent.task.plan";
      case "tool_use", "tool_result", "tool_error" -> "tool.execute";
      case "sys_reasoning" -> "agent.reasoning";
      case "llm_delta", "llm_data", "sys_done" -> "llm.stream";
      default -> null;
    };
  }

  private String eventMessage(String event, StreamEventRecord record) {
    Object toolName = record.getPayload().get("tool_name");
    return toolName == null ? event : event + ": " + toolName;
  }
}
