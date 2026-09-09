package cn.edu.cqut.advisorplatform.gateway.filter.risk;

import org.springframework.web.server.ServerWebExchange;

public class RiskInputRequestContext {

  private final String path;
  private final String userId;
  private final String sessionId;
  private final String ipAddress;
  private final String traceId;
  private final String turnId;

  private RiskInputRequestContext(
      String path,
      String userId,
      String sessionId,
      String ipAddress,
      String traceId,
      String turnId) {
    this.path = path;
    this.userId = userId;
    this.sessionId = sessionId;
    this.ipAddress = ipAddress;
    this.traceId = traceId;
    this.turnId = turnId;
  }

  public static RiskInputRequestContext from(ServerWebExchange exchange) {
    String path = exchange.getRequest().getURI().getPath();
    String userId = exchange.getRequest().getHeaders().getFirst("X-User-Id");
    String sessionId = exchange.getRequest().getHeaders().getFirst("X-Session-Id");
    String ipAddress =
        exchange.getRequest().getRemoteAddress() != null
            ? exchange.getRequest().getRemoteAddress().getAddress().getHostAddress()
            : "unknown";
    String traceId = exchange.getRequest().getHeaders().getFirst("X-Trace-Id");
    String turnId = exchange.getRequest().getHeaders().getFirst("X-Turn-Id");
    return new RiskInputRequestContext(path, userId, sessionId, ipAddress, traceId, turnId);
  }

  public String getPath() {
    return path;
  }

  public String getUserId() {
    return userId;
  }

  public String getSessionId() {
    return sessionId;
  }

  public String getIpAddress() {
    return ipAddress;
  }

  public String getTraceId() {
    return traceId;
  }

  public String getTurnId() {
    return turnId;
  }
}
