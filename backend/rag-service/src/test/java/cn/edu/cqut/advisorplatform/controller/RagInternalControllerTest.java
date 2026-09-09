package cn.edu.cqut.advisorplatform.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.cqut.advisorplatform.dto.response.RagDocumentResponseDTO;
import cn.edu.cqut.advisorplatform.dto.response.RagSearchResultDTO;
import cn.edu.cqut.advisorplatform.service.RagSearchService;
import cn.edu.cqut.advisorplatform.service.RagService;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class RagInternalControllerTest {

  @Mock private RagService ragService;

  @Mock private RagSearchService ragSearchService;

  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    RagInternalController controller = new RagInternalController(ragService, ragSearchService);
    mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
  }

  @Test
  void existsKnowledgeBase_shouldReturnBooleanPayload() throws Exception {
    when(ragService.existsKnowledgeBase(100L)).thenReturn(true);

    mockMvc
        .perform(get("/internal/rag/knowledge-bases/100/exists"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.code").value(200))
        .andExpect(jsonPath("$.data.exists").value(true));
  }

  @Test
  void listDocuments_shouldReturnInternalDocuments() throws Exception {
    RagDocumentResponseDTO doc = new RagDocumentResponseDTO();
    doc.setId(10L);
    doc.setFileName("policy.pdf");
    doc.setFileType("pdf");
    doc.setFileSize(100L);
    doc.setStatus("READY");
    when(ragService.listDocuments(100L, null)).thenReturn(List.of(doc));

    mockMvc
        .perform(get("/internal/rag/knowledge-bases/100/documents"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.code").value(200))
        .andExpect(jsonPath("$.data[0].id").value(10))
        .andExpect(jsonPath("$.data[0].fileName").value("policy.pdf"));
  }

  @Test
  void search_shouldReturnChunkContent() throws Exception {
    RagSearchResultDTO result = new RagSearchResultDTO();
    result.setDocumentId(10L);
    result.setFileName("policy.pdf");
    result.setChunkIndex(2);
    result.setContent("辅导员应具备思想理论教育能力。");
    result.setScore(0.87);
    when(ragSearchService.search(org.mockito.ArgumentMatchers.any())).thenReturn(List.of(result));

    mockMvc
        .perform(
            post("/internal/rag/search")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"query\":\"辅导员能力\",\"topK\":3}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.code").value(200))
        .andExpect(jsonPath("$.data[0].documentId").value(10))
        .andExpect(jsonPath("$.data[0].content").value("辅导员应具备思想理论教育能力。"))
        .andExpect(jsonPath("$.data[0].score").value(0.87));
  }
}
