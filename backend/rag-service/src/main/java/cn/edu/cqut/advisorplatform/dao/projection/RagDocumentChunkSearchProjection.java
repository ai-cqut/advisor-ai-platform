package cn.edu.cqut.advisorplatform.dao.projection;

public interface RagDocumentChunkSearchProjection {

  Long getDocumentId();

  String getFileName();

  Integer getChunkIndex();

  String getContent();

  Double getScore();
}
