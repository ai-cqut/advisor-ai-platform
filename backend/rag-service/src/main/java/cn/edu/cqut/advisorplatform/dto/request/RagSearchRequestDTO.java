package cn.edu.cqut.advisorplatform.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class RagSearchRequestDTO {

  @NotBlank private String query;

  @Min(1)
  @Max(10)
  private Integer topK = 5;
}
