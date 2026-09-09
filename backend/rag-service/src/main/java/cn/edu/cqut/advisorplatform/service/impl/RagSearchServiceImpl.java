package cn.edu.cqut.advisorplatform.service.impl;

import cn.edu.cqut.advisorplatform.dao.RagDocumentChunkDao;
import cn.edu.cqut.advisorplatform.dto.request.RagSearchRequestDTO;
import cn.edu.cqut.advisorplatform.dto.response.RagSearchResultDTO;
import cn.edu.cqut.advisorplatform.service.RagSearchService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class RagSearchServiceImpl implements RagSearchService {

  private final RagDocumentChunkDao documentChunkDao;
  private final RagEmbeddingService embeddingService;

  @Override
  @Transactional(readOnly = true)
  public List<RagSearchResultDTO> search(RagSearchRequestDTO request) {
    int topK = Math.max(1, Math.min(request.getTopK() == null ? 5 : request.getTopK(), 10));
    double[] embedding = embeddingService.embed(request.getQuery());
    return documentChunkDao
        .searchByVector(embeddingService.vectorToString(embedding), topK)
        .stream()
        .map(RagSearchResultDTO::from)
        .toList();
  }
}
