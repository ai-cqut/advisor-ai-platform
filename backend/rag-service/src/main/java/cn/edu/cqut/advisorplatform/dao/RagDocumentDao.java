package cn.edu.cqut.advisorplatform.dao;

import cn.edu.cqut.advisorplatform.entity.RagDocumentDO;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RagDocumentDao extends JpaRepository<RagDocumentDO, Long> {

  List<RagDocumentDO> findByKnowledgeBaseIdOrderByCreatedAtDesc(Long knowledgeBaseId);

  List<RagDocumentDO> findAllByOrderByCreatedAtDesc();

  long countByKnowledgeBaseId(Long knowledgeBaseId);
}
