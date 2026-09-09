package cn.edu.cqut.advisorplatform.riskcontrol.service.filter;

import cn.edu.cqut.advisorplatform.riskcontrol.dao.RiskRuleDao;
import cn.edu.cqut.advisorplatform.riskcontrol.dto.RiskCheckDetail;
import cn.edu.cqut.advisorplatform.riskcontrol.dto.RiskCheckRequest;
import cn.edu.cqut.advisorplatform.riskcontrol.dto.RiskCheckResponse;
import cn.edu.cqut.advisorplatform.riskcontrol.entity.RiskRule;
import cn.edu.cqut.advisorplatform.riskcontrol.service.RiskActionDecider;
import java.util.List;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@Order(50)
@RequiredArgsConstructor
public class BusinessComplianceFilter implements RiskFilter {

  private final RiskRuleDao riskRuleDao;
  private final RiskActionDecider riskActionDecider;

  @Override
  public String getName() {
    return "business-compliance";
  }

  @Override
  public RiskCheckResponse check(RiskCheckRequest request) {
    String content = request.getContent();
    if (content == null || content.isBlank()) {
      return passed(0);
    }

    List<RiskRule> rules =
        riskRuleDao.findByRuleTypeAndDirectionEnabled(
            "business_compliance", request.getDirection());
    for (RiskRule rule : rules) {
      try {
        Pattern pattern = Pattern.compile(rule.getPattern(), Pattern.CASE_INSENSITIVE);
        if (pattern.matcher(content).find()) {
          log.warn(
              "Business compliance violation: userId={}, rule={}, matched={}",
              request.getUserId(),
              rule.getName(),
              rule.getPattern());
          return RiskCheckResponse.builder()
              .passed(false)
              .action(riskActionDecider.decideAction(rule, "review"))
              .reason("业务合规限制")
              .category("business_compliance")
              .matchedKeyword(rule.getName())
              .statusCode(400)
              .message("您的问题超出服务范围，请咨询相关专业人士")
              .checks(
                  java.util.List.of(
                      RiskCheckDetail.builder()
                          .name(getName())
                          .displayName("业务合规")
                          .order(50)
                          .executed(true)
                          .passed(false)
                          .matchingMethod("REGEX")
                          .ruleCount(rules.size())
                          .matched(true)
                          .matchedRule(rule.getName())
                          .reason("业务合规限制")
                          .details("正则规则命中")
                          .build()))
              .build();
        }
      } catch (Exception e) {
        log.error("Invalid regex pattern in rule {}: {}", rule.getName(), rule.getPattern(), e);
      }
    }
    return passed(rules.size());
  }

  private RiskCheckResponse passed(int ruleCount) {
    return RiskCheckResponse.builder()
        .passed(true)
        .checks(
            java.util.List.of(
                RiskCheckDetail.builder()
                    .name(getName())
                    .displayName("业务合规")
                    .order(50)
                    .executed(true)
                    .passed(true)
                    .matchingMethod("REGEX")
                    .ruleCount(ruleCount)
                    .details("已检查启用规则，未命中")
                    .build()))
        .build();
  }
}
