package cn.edu.cqut.advisorplatform.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@Entity
@Table(name = "rag_document_chunk")
public class RagDocumentChunkDO {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private Long documentId;

  @Column(nullable = false)
  private Integer chunkIndex;

  @Column(nullable = false, columnDefinition = "TEXT")
  private String content;
}
