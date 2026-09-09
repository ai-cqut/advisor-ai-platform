package cn.edu.cqut.advisorplatform.dto.request;

import jakarta.validation.constraints.NotNull;
import java.util.List;
import lombok.Data;
import org.springframework.lang.Nullable;

@Data
public class MemoryCandidateUpsertRequestDTO {

  @NotNull private Long userId;

  @Nullable private List<MemoryCandidateItemDTO> candidates;
}
