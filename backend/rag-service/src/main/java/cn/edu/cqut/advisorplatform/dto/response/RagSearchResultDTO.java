package cn.edu.cqut.advisorplatform.dto.response;

import cn.edu.cqut.advisorplatform.dao.projection.RagDocumentChunkSearchProjection;
import lombok.Data;

@Data
public class RagSearchResultDTO {

  private Long documentId;
  private String fileName;
  private Integer chunkIndex;
  private String content;
  private Double score;

  public static RagSearchResultDTO from(RagDocumentChunkSearchProjection projection) {
    RagSearchResultDTO result = new RagSearchResultDTO();
    result.setDocumentId(projection.getDocumentId());
    result.setFileName(projection.getFileName());
    result.setChunkIndex(projection.getChunkIndex());
    result.setContent(projection.getContent());
    result.setScore(projection.getScore());
    return result;
  }
}
