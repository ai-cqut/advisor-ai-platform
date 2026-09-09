package cn.edu.cqut.advisorplatform.service.impl.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class AgentTitleSummaryClient {

  private final ObjectMapper objectMapper;
  private final HttpClient httpClient;
  private final String agentBaseUrl;
  private final String agentApiToken;
  private final long timeoutMs;

  public AgentTitleSummaryClient(
      ObjectMapper objectMapper,
      @Value("${advisor.agent.base-url:http://127.0.0.1:8001}") String agentBaseUrl,
      @Value("${advisor.agent.api-token:${INTERNAL_SERVICE_TOKEN:}}") String agentApiToken,
      @Value("${advisor.agent.title-timeout-ms:10000}") long timeoutMs) {
    this.objectMapper = objectMapper;
    this.agentBaseUrl = agentBaseUrl;
    this.agentApiToken = agentApiToken;
    this.timeoutMs = Math.max(timeoutMs, 1000L);
    this.httpClient =
        HttpClient.newBuilder().connectTimeout(Duration.ofMillis(this.timeoutMs)).build();
  }

  public Optional<String> summarize(String question) {
    String normalizedQuestion = question == null ? "" : question.trim();
    if (normalizedQuestion.isBlank()) {
      return Optional.empty();
    }
    try {
      String payload = objectMapper.writeValueAsString(Map.of("question", normalizedQuestion));
      HttpRequest.Builder requestBuilder =
          HttpRequest.newBuilder()
              .uri(URI.create(agentBaseUrl + "/chat/title"))
              .timeout(Duration.ofMillis(timeoutMs))
              .header("Content-Type", "application/json")
              .header("Accept", "application/json")
              .POST(HttpRequest.BodyPublishers.ofString(payload));
      if (!agentApiToken.isBlank()) {
        requestBuilder.header("Authorization", "Bearer " + agentApiToken);
      }
      HttpResponse<String> response =
          httpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() >= 400) {
        log.warn("agent_title failed, status={}", response.statusCode());
        return Optional.empty();
      }
      return readTitle(response.body());
    } catch (IOException e) {
      log.warn("agent_title unavailable, reason={}", e.getMessage());
      return Optional.empty();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      log.warn("agent_title interrupted");
      return Optional.empty();
    } catch (RuntimeException e) {
      log.warn("agent_title invalid response, reason={}", e.getMessage());
      return Optional.empty();
    }
  }

  private Optional<String> readTitle(String body) throws IOException {
    JsonNode titleNode = objectMapper.readTree(body).get("title");
    if (titleNode == null || !titleNode.isTextual()) {
      return Optional.empty();
    }
    String title = titleNode.asText().trim();
    if (title.isBlank() || "???".equals(title)) {
      return Optional.empty();
    }
    return Optional.of(title);
  }
}
