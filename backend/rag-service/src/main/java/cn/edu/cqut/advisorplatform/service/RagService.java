package cn.edu.cqut.advisorplatform.service;

import cn.edu.cqut.advisorplatform.common.security.UserPrincipal;
import cn.edu.cqut.advisorplatform.dto.response.KnowledgeBaseResponseDTO;
import cn.edu.cqut.advisorplatform.dto.response.RagDocumentResponseDTO;
import java.util.List;
import org.springframework.lang.Nullable;
import org.springframework.web.multipart.MultipartFile;

public interface RagService {

  List<KnowledgeBaseResponseDTO> listKnowledgeBases(@Nullable UserPrincipal currentUser);

  KnowledgeBaseResponseDTO createKnowledgeBase(
      String name, String description, @Nullable UserPrincipal currentUser);

  void deleteKnowledgeBase(Long id, @Nullable UserPrincipal currentUser);

  List<RagDocumentResponseDTO> listDocuments(
      Long knowledgeBaseId, @Nullable UserPrincipal currentUser);

  List<RagDocumentResponseDTO> listAllDocuments();

  RagDocumentResponseDTO uploadDocument(
      Long knowledgeBaseId, MultipartFile file, @Nullable UserPrincipal currentUser);

  void deleteDocument(Long id, @Nullable UserPrincipal currentUser);

  boolean existsKnowledgeBase(Long id);
}
