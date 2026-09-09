package cn.edu.cqut.advisorplatform.service.impl;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Slf4j
@Service
public class RagEmbeddingService {

  private final RestClient restClient;

  @Value("${advisor.ollama.base-url:http://localhost:11434}")
  private String ollamaBaseUrl;

  @Value("${advisor.embedding.model:bge-m3}")
  private String embeddingModel;

  RagEmbeddingService() {
    this.restClient = RestClient.create();
  }

  public double[] embed(String content) {
    if (content == null || content.isBlank()) {
      throw new IllegalArgumentException("检索内容不能为空");
    }
    Map<String, Object> response =
        restClient
            .post()
            .uri(ollamaBaseUrl + "/api/embed")
            .body(Map.of("model", embeddingModel, "input", content))
            .retrieve()
            .body(Map.class);
    List<List<Number>> embeddings = readEmbeddings(response);
    if (embeddings.isEmpty() || embeddings.get(0) == null || embeddings.get(0).isEmpty()) {
      throw new IllegalStateException("embedding 服务返回空向量");
    }
    return embeddings.get(0).stream().mapToDouble(Number::doubleValue).toArray();
  }

  private List<List<Number>> readEmbeddings(Map<String, Object> response) {
    if (response == null || !(response.get("embeddings") instanceof List<?> rawEmbeddings)) {
      log.warn("embedding 服务返回格式异常: {}", response);
      throw new IllegalStateException("embedding 服务返回格式异常");
    }
    @SuppressWarnings("unchecked")
    List<List<Number>> embeddings = (List<List<Number>>) (List<?>) rawEmbeddings;
    return embeddings;
  }

  String vectorToString(double[] embedding) {
    return Arrays.toString(embedding);
  }
}
