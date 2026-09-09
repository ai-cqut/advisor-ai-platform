package cn.edu.cqut.advisorplatform.riskcontrol.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RiskCheckResponse {

  private boolean passed;
  private String action;
  private String reason;
  private String category;
  private String matchedKeyword;
  private int statusCode;
  private String message;
  private List<RiskCheckDetail> checks;
}
