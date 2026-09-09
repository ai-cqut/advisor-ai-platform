package cn.edu.cqut.advisorplatform.riskcontrol.service.filter;

import cn.edu.cqut.advisorplatform.riskcontrol.dao.UserBehaviorStatDao;
import cn.edu.cqut.advisorplatform.riskcontrol.dao.UserViolationDao;
import cn.edu.cqut.advisorplatform.riskcontrol.dto.RiskCheckDetail;
import cn.edu.cqut.advisorplatform.riskcontrol.dto.RiskCheckRequest;
import cn.edu.cqut.advisorplatform.riskcontrol.dto.RiskCheckResponse;
import cn.edu.cqut.advisorplatform.riskcontrol.entity.UserBehaviorStat;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@Order(60)
@RequiredArgsConstructor
public class UserBehaviorFilter implements RiskFilter {

  private final UserBehaviorStatDao userBehaviorStatDao;
  private final UserViolationDao userViolationDao;

  @Value("${advisor.risk.ban.permanent-threshold:20}")
  private int permanentThreshold;

  @Override
  public String getName() {
    return "user-behavior";
  }

  @Override
  public RiskCheckResponse check(RiskCheckRequest request) {
    if (request.getUserId() == null) {
      return passed();
    }

    long violationCount =
        userViolationDao.countByUserIdSince(request.getUserId(), LocalDateTime.now().minusDays(30));

    if (violationCount >= permanentThreshold) {
      log.warn(
          "User behavior violation threshold exceeded: userId={}, violationCount={}",
          request.getUserId(),
          violationCount);
      return RiskCheckResponse.builder()
          .passed(false)
          .action("reject")
          .reason("用户行为异常，违规次数过多")
          .category("user_behavior")
          .statusCode(403)
          .message("您的账号因异常行为已被封禁")
          .checks(
              java.util.List.of(
                  RiskCheckDetail.builder()
                      .name(getName())
                      .displayName("用户行为")
                      .order(60)
                      .executed(true)
                      .passed(false)
                      .matchingMethod("BEHAVIOR_STATISTICS")
                      .matched(true)
                      .reason("用户行为异常，违规次数过多")
                      .details("近 30 天违规次数达到封禁阈值")
                      .build()))
          .build();
    }

    Optional<UserBehaviorStat> statOpt =
        userBehaviorStatDao.findByUserIdAndDate(request.getUserId(), LocalDate.now());

    if (statOpt.isPresent()) {
      UserBehaviorStat stat = statOpt.get();
      if (stat.getSuspiciousPattern() != null && !stat.getSuspiciousPattern().isEmpty()) {
        log.warn(
            "Suspicious behavior pattern detected: userId={}, pattern={}",
            request.getUserId(),
            stat.getSuspiciousPattern());
        return RiskCheckResponse.builder()
            .passed(false)
            .action("review")
            .reason("检测到可疑行为模式")
            .category("user_behavior")
            .statusCode(202)
            .message("当前请求已进入人工复核")
            .checks(
                java.util.List.of(
                    RiskCheckDetail.builder()
                        .name(getName())
                        .displayName("用户行为")
                        .order(60)
                        .executed(true)
                        .passed(false)
                        .matchingMethod("BEHAVIOR_STATISTICS")
                        .matched(true)
                        .reason("检测到可疑行为模式")
                        .details("用户行为统计命中可疑模式")
                        .build()))
            .build();
      }
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
                    .displayName("用户行为")
                    .order(60)
                    .executed(true)
                    .passed(true)
                    .matchingMethod("BEHAVIOR_STATISTICS")
                    .details("违规次数和当日行为模式均正常")
                    .build()))
        .build();
  }
}
