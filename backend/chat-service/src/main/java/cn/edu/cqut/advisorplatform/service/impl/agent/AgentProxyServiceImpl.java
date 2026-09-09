package cn.edu.cqut.advisorplatform.service.impl.agent;

import cn.edu.cqut.advisorplatform.dto.request.chat.ChatStreamRequestDTO;
import cn.edu.cqut.advisorplatform.service.agent.AgentProxyService;
import cn.edu.cqut.advisorplatform.service.model.ChatStreamProxyResult;
import cn.edu.cqut.advisorplatform.service.trace.TraceEventClient;
import cn.edu.cqut.advisorplatform.utils.LogTraceUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class AgentProxyServiceImpl implements AgentProxyService {

  private static final int DEBUG_PREVIEW_LIMIT = 200;

  private final AgentPayloadBuilder payloadBuilder;
  private final AgentProxyTransportSupport transportSupport = new AgentProxyTransportSupport();
  private final AgentStreamResponseReader responseReader;
  private final AgentProxyHttpClientSupport httpClientSupport;
  private final String agentBaseUrl;
  private final String agentApiToken;
  private final boolean aiGatewayEnabled;
  private final String aiGatewayBaseUrl;
  private final String aiGatewayApiKey;
  private final String aiGatewayModel;
  private final boolean debugStream;
  private final long requestTimeoutMs;

  public AgentProxyServiceImpl(
      ObjectMapper objectMapper,
      @Value("${advisor.agent.base-url:http://127.0.0.1:8001}") String agentBaseUrl,
      @Value("${advisor.agent.api-token:${MEMORY_API_TOKEN:}}") String agentApiToken,
      @Value("${advisor.ai-gateway.enabled:false}") boolean aiGatewayEnabled,
      @Value("${advisor.ai-gateway.base-url:http://127.0.0.1:8090}") String aiGatewayBaseUrl,
      @Value("${advisor.ai-gateway.api-key:}") String aiGatewayApiKey,
      @Value("${advisor.ai-gateway.model:gpt-4.1-mini}") String aiGatewayModel,
      @Value("${advisor.agent.timeout-ms:600000}") long timeoutMs,
      @Value("${advisor.agent.first-chunk-timeout-ms:120000}") long firstChunkTimeoutMs,
      @Value("${advisor.agent.debug-stream:${DEBUG_STREAM:false}}") boolean debugStream,
      TraceEventClient traceEventClient) {
    SseEventParser parser = new SseEventParser(objectMapper);
    AgentStreamEventCollector streamEventCollector =
        new AgentStreamEventCollector(
            parser,
            new StreamEventPersistencePolicy(),
            debugStream,
            traceEventClient::publishAgentEvent);
    this.payloadBuilder = new AgentPayloadBuilder(objectMapper);
    this.agentBaseUrl = agentBaseUrl;
    this.agentApiToken = agentApiToken;
    this.aiGatewayEnabled = aiGatewayEnabled;
    this.aiGatewayBaseUrl = aiGatewayBaseUrl;
    this.aiGatewayApiKey = aiGatewayApiKey;
    this.aiGatewayModel = aiGatewayModel;
    this.debugStream = debugStream;
    this.requestTimeoutMs = Math.max(timeoutMs, 1000L);
    long normalizedFirstChunkTimeoutMs = Math.max(firstChunkTimeoutMs, 1000L);
    this.responseReader =
        new AgentStreamResponseReader(
            streamEventCollector, transportSupport, debugStream, normalizedFirstChunkTimeoutMs);
    this.httpClientSupport =
        new AgentProxyHttpClientSupport(transportSupport, this.requestTimeoutMs);
  }

  @Override
  public ChatStreamProxyResult proxyChatStream(
      ChatStreamRequestDTO request, Long userId, OutputStream outputStream) throws IOException {
    return proxyInternal(request, userId, outputStream);
  }

  @Override
  public ChatStreamProxyResult proxyChatOnce(ChatStreamRequestDTO request, Long userId)
      throws IOException {
    return proxyInternal(request, userId, null);
  }

  private ChatStreamProxyResult proxyInternal(
      ChatStreamRequestDTO request, Long userId, OutputStream outputStream) throws IOException {
    long startAt = System.currentTimeMillis();
    String payload =
        aiGatewayEnabled
            ? payloadBuilder.buildAiGatewayPayload(request, aiGatewayModel)
            : payloadBuilder.buildAgentPayload(request, userId);
    byte[] payloadBytes = payload.getBytes(StandardCharsets.UTF_8);

    log.info(
        "agent_proxy start, traceId={}, sessionId={}, turnId={}, userId={}, payloadBytes={}, streamMode={}",
        LogTraceUtil.get(LogTraceUtil.TRACE_ID),
        request.getSessionId(),
        LogTraceUtil.get(LogTraceUtil.TURN_ID),
        userId,
        payloadBytes.length,
        outputStream != null);

    if (debugStream) {
      log.info(
          "debug_stream java request: sessionId={}, userId={}, payload_length={}, payload_preview={}",
          request.getSessionId(),
          userId,
          payloadBytes.length,
          transportSupport.preview(payload, DEBUG_PREVIEW_LIMIT));
    }
    String traceId = LogTraceUtil.get(LogTraceUtil.TRACE_ID);
    String turnId = LogTraceUtil.get(LogTraceUtil.TURN_ID);
    HttpRequest httpRequest =
        transportSupport.buildRequest(
            payload,
            aiGatewayEnabled,
            aiGatewayBaseUrl,
            agentBaseUrl,
            aiGatewayApiKey,
            agentApiToken,
            requestTimeoutMs,
            traceId,
            turnId);

    HttpResponse<InputStream> response =
        httpClientSupport.send(httpRequest, payloadBytes.length, startAt);

    return responseReader.read(
        response.body(), outputStream, request.getSessionId(), userId, startAt);
  }
}
