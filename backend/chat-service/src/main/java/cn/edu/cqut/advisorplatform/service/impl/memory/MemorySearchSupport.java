package cn.edu.cqut.advisorplatform.service.impl.memory;

import cn.edu.cqut.advisorplatform.dao.memory.UserMemoryDao;
import cn.edu.cqut.advisorplatform.dto.request.memory.MemorySearchRequestDTO;
import cn.edu.cqut.advisorplatform.entity.memory.UserMemoryDO;
import cn.edu.cqut.advisorplatform.service.vector.EmbeddingService;
import cn.edu.cqut.advisorplatform.service.vector.MemoryServiceFactory;
import cn.edu.cqut.advisorplatform.service.vector.MemoryVectorService;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class MemorySearchSupport {

  private final UserMemoryDao userMemoryDao;
  private final MemoryServiceFactory memoryServiceFactory;
  private final EmbeddingService embeddingService;
  private final MemoryHybridResultMerger hybridResultMerger = new MemoryHybridResultMerger();

  public List<UserMemoryDO> search(
      MemorySearchRequestDTO request,
      int topK,
      String query,
      String mode,
      String vectorStore,
      double hybridVectorWeight,
      double hybridTextWeight) {
    // Type-weighted retrieval: search each type separately and fuse by weight
    Map<String, Double> typeWeights = request.getTypeWeights();
    if (typeWeights != null && !typeWeights.isEmpty()) {
      return searchWithTypeWeights(
          request,
          topK,
          query,
          mode,
          vectorStore,
          hybridVectorWeight,
          hybridTextWeight,
          typeWeights);
    }

    boolean hasVectorService = !query.isEmpty() && memoryServiceFactory.hasService(vectorStore);

    if ("vector".equals(mode) && hasVectorService) {
      return searchByVector(request, vectorStore, topK);
    }
    if ("text".equals(mode)) {
      return searchText(request, query, topK);
    }
    if (hasVectorService) {
      return searchHybrid(request, query, vectorStore, topK, hybridVectorWeight, hybridTextWeight);
    }
    return searchText(request, query, topK);
  }

  public void recordAccessHits(List<UserMemoryDO> rows) {
    if (rows.isEmpty()) {
      return;
    }
    List<Long> ids = rows.stream().map(UserMemoryDO::getId).toList();
    for (Long id : ids) {
      userMemoryDao.incrementAccessCount(id);
    }
  }

  private List<UserMemoryDO> searchByVector(
      MemorySearchRequestDTO request, String vectorStore, int topK) {
    try {
      MemoryVectorService vectorService = memoryServiceFactory.getService(vectorStore);
      double[] queryEmbedding = embeddingService.embed(request.getQuery());
      return vectorService.search(request.getUserId(), 0L, queryEmbedding, topK);
    } catch (Exception exc) {
      log.warn(
          "memory_vector_search_failed userId={}, err={}", request.getUserId(), exc.getMessage());
      return searchText(request, request.getQuery(), topK);
    }
  }

  private List<UserMemoryDO> searchText(MemorySearchRequestDTO request, String query, int topK) {
    return userMemoryDao.searchByScope(
        request.getUserId(), 0L, query, LocalDateTime.now(), PageRequest.of(0, topK));
  }

  private List<UserMemoryDO> searchHybrid(
      MemorySearchRequestDTO request,
      String query,
      String vectorStore,
      int topK,
      double hybridVectorWeight,
      double hybridTextWeight) {
    int recallK = Math.min(topK * 3, 50);

    List<UserMemoryDO> vectorResults;
    try {
      MemoryVectorService vectorService = memoryServiceFactory.getService(vectorStore);
      double[] queryEmbedding = embeddingService.embed(query);
      vectorResults = vectorService.search(request.getUserId(), 0L, queryEmbedding, recallK);
    } catch (Exception exc) {
      log.warn("memory_hybrid_vector_fallback userId={}", request.getUserId());
      return searchText(request, query, topK);
    }

    List<UserMemoryDO> textResults =
        userMemoryDao.searchByScope(
            request.getUserId(), 0L, query, LocalDateTime.now(), PageRequest.of(0, recallK));

    return hybridResultMerger.merge(
        vectorResults, textResults, topK, hybridVectorWeight, hybridTextWeight);
  }

  /**
   * Type-weighted retrieval: search each memory type separately, then fuse results by type weight.
   */
  private List<UserMemoryDO> searchWithTypeWeights(
      MemorySearchRequestDTO request,
      int topK,
      String query,
      String mode,
      String vectorStore,
      double hybridVectorWeight,
      double hybridTextWeight,
      Map<String, Double> typeWeights) {
    Map<Long, UserMemoryDO> allItems = new LinkedHashMap<>();
    Map<Long, Double> fusedScores = new LinkedHashMap<>();

    for (Map.Entry<String, Double> entry : typeWeights.entrySet()) {
      String memoryType = entry.getKey();
      double typeWeight = entry.getValue();
      if (typeWeight <= 0) {
        continue;
      }

      List<UserMemoryDO> typeResults;
      boolean hasVectorService = !query.isEmpty() && memoryServiceFactory.hasService(vectorStore);

      if ("vector".equals(mode) && hasVectorService) {
        typeResults = searchByVectorByType(request, vectorStore, topK, memoryType);
      } else if ("text".equals(mode)) {
        typeResults = searchTextByType(request, query, topK, memoryType);
      } else if (hasVectorService) {
        typeResults =
            searchHybridByType(
                request,
                query,
                vectorStore,
                topK,
                hybridVectorWeight,
                hybridTextWeight,
                memoryType);
      } else {
        typeResults = searchTextByType(request, query, topK, memoryType);
      }

      // Filter by memoryType and accumulate scores
      for (int i = 0; i < typeResults.size(); i++) {
        UserMemoryDO item = typeResults.get(i);
        if (!memoryType.equals(item.getMemoryType())) {
          continue;
        }
        allItems.putIfAbsent(item.getId(), item);
        double rankScore = 1.0 - ((double) i / Math.max(typeResults.size(), 1));
        double weightedScore = typeWeight * rankScore;
        fusedScores.merge(item.getId(), weightedScore, Double::sum);
      }
    }

    // Sort by fused score and return topK
    return fusedScores.entrySet().stream()
        .sorted((a, b) -> Double.compare(b.getValue(), a.getValue()))
        .limit(topK)
        .map(entry -> allItems.get(entry.getKey()))
        .filter(item -> item != null)
        .toList();
  }

  private List<UserMemoryDO> searchTextByType(
      MemorySearchRequestDTO request, String query, int topK, String memoryType) {
    return userMemoryDao.searchByScopeAndType(
        request.getUserId(), 0L, query, LocalDateTime.now(), memoryType, PageRequest.of(0, topK));
  }

  private List<UserMemoryDO> searchHybridByType(
      MemorySearchRequestDTO request,
      String query,
      String vectorStore,
      int topK,
      double hybridVectorWeight,
      double hybridTextWeight,
      String memoryType) {
    int recallK = Math.min(topK * 3, 50);

    List<UserMemoryDO> vectorResults;
    try {
      MemoryVectorService vectorService = memoryServiceFactory.getService(vectorStore);
      double[] queryEmbedding = embeddingService.embed(query);
      vectorResults =
          vectorService.searchByType(request.getUserId(), 0L, queryEmbedding, recallK, memoryType);
    } catch (Exception exc) {
      log.warn("memory_hybrid_vector_fallback userId={}", request.getUserId());
      return searchTextByType(request, query, topK, memoryType);
    }

    List<UserMemoryDO> textResults =
        userMemoryDao.searchByScopeAndType(
            request.getUserId(),
            0L,
            query,
            LocalDateTime.now(),
            memoryType,
            PageRequest.of(0, recallK));

    return hybridResultMerger.merge(
        vectorResults, textResults, topK, hybridVectorWeight, hybridTextWeight);
  }

  private List<UserMemoryDO> searchByVectorByType(
      MemorySearchRequestDTO request, String vectorStore, int topK, String memoryType) {
    try {
      MemoryVectorService vectorService = memoryServiceFactory.getService(vectorStore);
      double[] queryEmbedding = embeddingService.embed(request.getQuery());
      return vectorService.searchByType(request.getUserId(), 0L, queryEmbedding, topK, memoryType);
    } catch (Exception exc) {
      log.warn(
          "memory_vector_search_by_type_failed userId={}, memoryType={}, err={}",
          request.getUserId(),
          memoryType,
          exc.getMessage());
      return searchTextByType(request, request.getQuery(), topK, memoryType);
    }
  }
}
