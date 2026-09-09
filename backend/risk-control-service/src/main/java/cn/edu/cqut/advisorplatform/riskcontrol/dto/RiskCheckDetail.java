package cn.edu.cqut.advisorplatform.riskcontrol.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RiskCheckDetail {

  private String name;
  private String displayName;
  private int order;
  private boolean executed;
  private boolean passed;
  private String matchingMethod;
  private int ruleCount;
  private boolean matched;
  private String matchedRule;
  private String action;
  private String reason;
  private long durationMs;
  private String details;
}
