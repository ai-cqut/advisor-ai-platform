package cn.edu.cqut.advisorplatform.riskcontrol.service.filter;

import cn.edu.cqut.advisorplatform.riskcontrol.dao.RiskRuleDao;
import cn.edu.cqut.advisorplatform.riskcontrol.dto.RiskCheckDetail;
import cn.edu.cqut.advisorplatform.riskcontrol.dto.RiskCheckRequest;
import cn.edu.cqut.advisorplatform.riskcontrol.dto.RiskCheckResponse;
import cn.edu.cqut.advisorplatform.riskcontrol.entity.RiskRule;
import cn.edu.cqut.advisorplatform.riskcontrol.service.RiskActionDecider;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@Order(40)
@RequiredArgsConstructor
public class PromptInjectionFilter implements RiskFilter {

  private final RiskRuleDao riskRuleDao;
  private final RiskActionDecider riskActionDecider;
  private final RiskPatternSupport riskPatternSupport;

  @Override
  public String getName() {
    return "prompt-injection";
  }

  @Override
  public RiskCheckResponse check(RiskCheckRequest request) {
    String content = request.getContent();
    if (content == null || content.isBlank()) {
      return passed(0);
    }

    List<RiskRule> rules =
        riskRuleDao.findByRuleTypeAndDirectionEnabled("prompt_injection", request.getDirection());
    for (RiskRule rule : rules) {
      Optional<java.util.regex.Pattern> pattern =
          riskPatternSupport.compile(rule.getName(), rule.getPattern());
      if (pattern.isEmpty()) {
        continue;
      }
      if (pattern.get().matcher(content).find()) {
        log.warn(
            "Prompt injection detected: userId={}, rule={}, matched={}",
            request.getUserId(),
            rule.getName(),
            rule.getPattern());
        return RiskCheckResponse.builder()
            .passed(false)
            .action(riskActionDecider.decideAction(rule, "reject"))
            .reason("Prompt 注入风险")
            .category("prompt_injection")
            .matchedKeyword(rule.getName())
            .statusCode(400)
            .message("检测到异常请求，请重新描述您的问题")
            .checks(
                java.util.List.of(
                    RiskCheckDetail.builder()
                        .name(getName())
                        .displayName("Prompt Injection")
                        .order(40)
                        .executed(true)
                        .passed(false)
                        .matchingMethod("REGEX")
                        .ruleCount(rules.size())
                        .matched(true)
                        .matchedRule(rule.getName())
                        .reason("Prompt 注入风险")
                        .details("正则规则命中")
                        .build()))
            .build();
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
                    .displayName("Prompt Injection")
                    .order(40)
                    .executed(true)
                    .passed(true)
                    .matchingMethod("REGEX")
                    .ruleCount(ruleCount)
                    .details("已检查启用规则，未命中")
                    .build()))
        .build();
  }
}
