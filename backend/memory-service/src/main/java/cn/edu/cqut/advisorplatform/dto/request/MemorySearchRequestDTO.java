package cn.edu.cqut.advisorplatform.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.Map;
import lombok.Data;
import org.springframework.lang.Nullable;

@Data
public class MemorySearchRequestDTO {

  @NotNull private Long userId;

  @Nullable private String query = "";

  @Min(1)
  @Max(50)
  @Nullable
  private Integer topK = 6;

  @Nullable private String mode = "hybrid";

  /** Type weights for semantic/episodic weighted retrieval. Key: "semantic" or "episodic". */
  @Nullable private Map<String, Double> typeWeights;
}
