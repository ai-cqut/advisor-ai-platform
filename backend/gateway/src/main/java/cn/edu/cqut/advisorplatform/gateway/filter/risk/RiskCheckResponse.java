package cn.edu.cqut.advisorplatform.gateway.filter.risk;

import java.util.List;

public class RiskCheckResponse {
  private boolean passed;
  private String action;
  private String reason;
  private String category;
  private Integer statusCode;
  private String message;
  private List<Object> checks;

  public static RiskCheckResponse passed() {
    RiskCheckResponse response = new RiskCheckResponse();
    response.setPassed(true);
    response.setStatusCode(200);
    return response;
  }

  public boolean isPassed() {
    return passed;
  }

  public void setPassed(boolean passed) {
    this.passed = passed;
  }

  public String getAction() {
    return action;
  }

  public void setAction(String action) {
    this.action = action;
  }

  public String getReason() {
    return reason;
  }

  public void setReason(String reason) {
    this.reason = reason;
  }

  public String getCategory() {
    return category;
  }

  public void setCategory(String category) {
    this.category = category;
  }

  public Integer getStatusCode() {
    return statusCode == null ? 200 : statusCode;
  }

  public void setStatusCode(Integer statusCode) {
    this.statusCode = statusCode;
  }

  public String getMessage() {
    return message;
  }

  public void setMessage(String message) {
    this.message = message;
  }

  public List<Object> getChecks() {
    return checks;
  }

  public void setChecks(List<Object> checks) {
    this.checks = checks;
  }
}
