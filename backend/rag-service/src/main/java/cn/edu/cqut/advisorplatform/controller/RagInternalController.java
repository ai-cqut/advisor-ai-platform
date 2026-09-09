package cn.edu.cqut.advisorplatform.controller;

import cn.edu.cqut.advisorplatform.dto.response.ApiResponseDTO;
import cn.edu.cqut.advisorplatform.dto.response.RagDocumentResponseDTO;
import cn.edu.cqut.advisorplatform.service.RagService;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/rag")
@RequiredArgsConstructor
public class RagInternalController {

  private final RagService ragService;

  @GetMapping("/knowledge-bases/{id}/exists")
  public ApiResponseDTO<Map<String, Boolean>> existsKnowledgeBase(@PathVariable("id") Long id) {
    return ApiResponseDTO.success(Map.of("exists", ragService.existsKnowledgeBase(id)));
  }

  @GetMapping("/knowledge-bases/{id}/documents")
  public ApiResponseDTO<List<RagDocumentResponseDTO>> listDocuments(@PathVariable("id") Long id) {
    return ApiResponseDTO.success(ragService.listDocuments(id, null));
  }

  @GetMapping("/documents")
  public ApiResponseDTO<List<RagDocumentResponseDTO>> listAllDocuments() {
    return ApiResponseDTO.success(ragService.listAllDocuments());
  }
}
