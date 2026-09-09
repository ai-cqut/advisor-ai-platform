package cn.edu.cqut.advisorplatform.riskcontrol.service.filter;

import cn.edu.cqut.advisorplatform.riskcontrol.dao.RateLimitDao;
import cn.edu.cqut.advisorplatform.riskcontrol.dto.RiskCheckDetail;
import cn.edu.cqut.advisorplatform.riskcontrol.dto.RiskCheckRequest;
import cn.edu.cqut.advisorplatform.riskcontrol.dto.RiskCheckResponse;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@Order(20)
@RequiredArgsConstructor
public class RateLimitFilter implements RiskFilter {

  private static final Duration RATE_LIMIT_WINDOW = Duration.ofMinutes(1);

  private final RateLimitDao rateLimitDao;

  @Value("${advisor.risk.rate-limit.requests-per-minute:10}")
  private int requestsPerMinute;

  @Override
  public String getName() {
    return "rate-limit";
  }

  @Override
  public RiskCheckResponse check(RiskCheckRequest request) {
    if (request.getUserId() == null) {
      return passed();
    }

    String key = "rate_limit:" + request.getUserId();
    long count = rateLimitDao.incrementAndExpireOnFirstHit(key, RATE_LIMIT_WINDOW);

    if (count > requestsPerMinute) {
      log.warn("Rate limit exceeded: userId={}, count={}", request.getUserId(), count);
      return RiskCheckResponse.builder()
          .passed(false)
          .action("challenge")
          .reason("请求频率超限")
          .category("rate_limit")
          .statusCode(429)
          .message("请求过于频繁，请稍后再试")
          .checks(
              java.util.List.of(
                  RiskCheckDetail.builder()
                      .name(getName())
                      .displayName("频率限制")
                      .order(20)
                      .executed(true)
                      .passed(false)
                      .matchingMethod("REDIS_COUNTER")
                      .matched(true)
                      .action("challenge")
                      .reason("请求频率超限")
                      .details("Redis 窗口计数超过配置阈值")
                      .build()))
          .build();
    }

    return passed();
  }

  private RiskCheckResponse passed() {
    return RiskCheckResponse.builder()
        .passed(true)
        .checks(
            java.util.List.of(
                RiskCheckDetail.builder()
                    .name(getName())
                    .displayName("频率限制")
                    .order(20)
                    .executed(true)
                    .passed(true)
                    .matchingMethod("REDIS_COUNTER")
                    .details("Redis 窗口计数未超过配置阈值")
                    .build()))
        .build();
  }
}
