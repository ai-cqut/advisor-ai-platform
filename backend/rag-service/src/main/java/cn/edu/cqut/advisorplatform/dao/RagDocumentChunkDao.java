package cn.edu.cqut.advisorplatform.dao;

import cn.edu.cqut.advisorplatform.dao.projection.RagDocumentChunkSearchProjection;
import cn.edu.cqut.advisorplatform.entity.RagDocumentChunkDO;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RagDocumentChunkDao extends JpaRepository<RagDocumentChunkDO, Long> {

  @Query(
      value =
          """
          SELECT
              chunk.document_id AS "documentId",
              document.file_name AS "fileName",
              chunk.chunk_index AS "chunkIndex",
              chunk.content AS "content",
              1 - (chunk.embedding <=> CAST(:embedding AS vector)) AS "score"
          FROM rag_document_chunk chunk
          JOIN rag_document document ON document.id = chunk.document_id
          WHERE document.status = 'READY'
            AND chunk.embedding IS NOT NULL
          ORDER BY chunk.embedding <=> CAST(:embedding AS vector)
          LIMIT :topK
          """,
      nativeQuery = true)
  List<RagDocumentChunkSearchProjection> searchByVector(
      @Param("embedding") String embedding, @Param("topK") int topK);
}
