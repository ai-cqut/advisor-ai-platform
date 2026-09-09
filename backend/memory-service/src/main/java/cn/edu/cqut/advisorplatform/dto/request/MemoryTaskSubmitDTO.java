package cn.edu.cqut.advisorplatform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.Map;
import lombok.Data;
import org.springframework.lang.Nullable;

@Data
public class MemoryTaskSubmitDTO {

  @NotNull private Long userId;

  @NotNull private Long sessionId;

  @NotBlank private String turnId;

  @Nullable private String userText;

  @Nullable private String assistantText;

  @Nullable private List<Map<String, String>> recentMessages;
}
