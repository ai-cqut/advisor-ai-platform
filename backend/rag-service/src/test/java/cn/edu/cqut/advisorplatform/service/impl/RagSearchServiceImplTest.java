package cn.edu.cqut.advisorplatform.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.edu.cqut.advisorplatform.dao.RagDocumentChunkDao;
import cn.edu.cqut.advisorplatform.dao.projection.RagDocumentChunkSearchProjection;
import cn.edu.cqut.advisorplatform.dto.request.RagSearchRequestDTO;
import cn.edu.cqut.advisorplatform.dto.response.RagSearchResultDTO;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RagSearchServiceImplTest {

  @Mock private RagDocumentChunkDao documentChunkDao;

  @Mock private RagEmbeddingService embeddingService;

  @Test
  void search_shouldEmbedQueryAndReturnChunkContent() {
    RagSearchRequestDTO request = new RagSearchRequestDTO();
    request.setQuery("辅导员能力");
    request.setTopK(20);
    double[] embedding = new double[] {0.1, 0.2, 0.3};
    when(embeddingService.embed("辅导员能力")).thenReturn(embedding);
    when(embeddingService.vectorToString(embedding)).thenReturn("[0.1, 0.2, 0.3]");
    when(documentChunkDao.searchByVector("[0.1, 0.2, 0.3]", 10)).thenReturn(List.of(projection()));
    RagSearchServiceImpl service = new RagSearchServiceImpl(documentChunkDao, embeddingService);

    List<RagSearchResultDTO> results = service.search(request);

    assertThat(results).hasSize(1);
    assertThat(results.get(0).getContent()).isEqualTo("辅导员应具备思想理论教育能力。");
    assertThat(results.get(0).getFileName()).isEqualTo("policy.pdf");
    verify(documentChunkDao).searchByVector("[0.1, 0.2, 0.3]", 10);
  }

  private RagDocumentChunkSearchProjection projection() {
    return new RagDocumentChunkSearchProjection() {
      @Override
      public Long getDocumentId() {
        return 10L;
      }

      @Override
      public String getFileName() {
        return "policy.pdf";
      }

      @Override
      public Integer getChunkIndex() {
        return 2;
      }

      @Override
      public String getContent() {
        return "辅导员应具备思想理论教育能力。";
      }

      @Override
      public Double getScore() {
        return 0.87;
      }
    };
  }
}
