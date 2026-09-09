package cn.edu.cqut.advisorplatform.gateway.filter.auth;

import cn.edu.cqut.advisorplatform.common.trace.TraceHeaderConstants;
import cn.edu.cqut.advisorplatform.common.trace.TraceNodeStatus;
import cn.edu.cqut.advisorplatform.gateway.trace.TraceEventFactory;
import cn.edu.cqut.advisorplatform.gateway.trace.TraceEventHub;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
public class JwtGlobalFilter implements GlobalFilter, Ordered {
  private static final Logger log = LoggerFactory.getLogger(JwtGlobalFilter.class);

  private static final List<String> WHITE_LIST =
      List.of(
          "/api/auth/login",
          "/api/auth/register",
          "/api/auth/__ready__",
          "/api/auth/refresh",
          "/api/auth/logout",
          "/api/trace/stream",
          "/internal/trace/events",
          "/actuator",
          "/internal/health");

  @Value("${advisor.jwt.secret:}")
  private String jwtSecret;

  private final JwtTokenSupport tokenSupport = new JwtTokenSupport();
  private final TraceEventHub traceEventHub;
  private final TraceEventFactory traceEventFactory = new TraceEventFactory();

  public JwtGlobalFilter() {
    this(new TraceEventHub());
  }

  @Autowired
  public JwtGlobalFilter(TraceEventHub traceEventHub) {
    this.traceEventHub = traceEventHub;
  }

  @Override
  public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
    if (exchange.getRequest().getMethod() == org.springframework.http.HttpMethod.OPTIONS) {
      return chain.filter(exchange);
    }
    String path = exchange.getRequest().getURI().getPath();
    boolean skip = WHITE_LIST.stream().anyMatch(path::startsWith);

    String traceId =
        Optional.ofNullable(
                exchange.getRequest().getHeaders().getFirst(TraceHeaderConstants.TRACE_ID_HEADER))
            .orElseGet(() -> UUID.randomUUID().toString());
    long authStartedAt = System.currentTimeMillis();
    traceEventHub.publish(
        traceEventFactory.create(
            traceId,
            exchange.getRequest().getHeaders().getFirst("X-Turn-Id"),
            "gateway.auth",
            TraceNodeStatus.STARTED,
            "正在校验 JWT",
            authStartedAt,
            "gateway",
            null));
    String token = tokenSupport.resolveBearerToken(exchange.getRequest().getHeaders());
    String userId = token == null ? null : tokenSupport.extractUserId(jwtSecret, token);
    ServerWebExchange withTrace =
        exchange
            .mutate()
            .request(
                builder -> {
                  builder.header(TraceHeaderConstants.TRACE_ID_HEADER, traceId);
                  if (userId != null) {
                    builder.header("X-User-Id", userId);
                  }
                })
            .build();

    if (skip) {
      traceEventHub.publish(
          traceEventFactory.create(
              traceId,
              exchange.getRequest().getHeaders().getFirst("X-Turn-Id"),
              "gateway.auth",
              TraceNodeStatus.SUCCESS,
              "公开接口，无需登录",
              authStartedAt,
              "gateway",
              null));
      return chain.filter(withTrace);
    }

    if (token == null) {
      log.warn("gateway jwt reject: missing bearer token, path={}, traceId={}", path, traceId);
      withTrace.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
      traceEventHub.publish(
          traceEventFactory.create(
              traceId,
              exchange.getRequest().getHeaders().getFirst("X-Turn-Id"),
              "gateway.auth",
              TraceNodeStatus.FAILED,
              "缺少 Bearer Token",
              authStartedAt,
              "gateway",
              Map.of("statusCode", 401)));
      return withTrace.getResponse().setComplete();
    }

    ValidationResult validationResult = tokenSupport.validate(jwtSecret, token);
    if (!validationResult.valid()) {
      log.warn(
          "gateway jwt reject: path={}, traceId={}, reason={}, tokenPrefix={}",
          path,
          traceId,
          validationResult.reason(),
          tokenSupport.maskToken(token));
      withTrace.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
      traceEventHub.publish(
          traceEventFactory.create(
              traceId,
              exchange.getRequest().getHeaders().getFirst("X-Turn-Id"),
              "gateway.auth",
              TraceNodeStatus.FAILED,
              "JWT 校验失败",
              authStartedAt,
              "gateway",
              Map.of("reason", validationResult.reason(), "statusCode", 401)));
      return withTrace.getResponse().setComplete();
    }

    traceEventHub.publish(
        traceEventFactory.create(
            traceId,
            exchange.getRequest().getHeaders().getFirst("X-Turn-Id"),
            "gateway.auth",
            TraceNodeStatus.SUCCESS,
            "JWT 校验通过",
            authStartedAt,
            "gateway",
            Map.of("userId", userId == null ? "" : userId)));
    return chain.filter(withTrace);
  }

  @Override
  public int getOrder() {
    return -100;
  }
}
