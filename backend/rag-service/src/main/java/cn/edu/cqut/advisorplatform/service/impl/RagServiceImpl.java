package cn.edu.cqut.advisorplatform.service.impl;

import cn.edu.cqut.advisorplatform.common.exception.ForbiddenException;
import cn.edu.cqut.advisorplatform.common.exception.NotFoundException;
import cn.edu.cqut.advisorplatform.common.security.UserPrincipal;
import cn.edu.cqut.advisorplatform.dao.RagDocumentDao;
import cn.edu.cqut.advisorplatform.dao.RagKnowledgeBaseDao;
import cn.edu.cqut.advisorplatform.dto.response.KnowledgeBaseResponseDTO;
import cn.edu.cqut.advisorplatform.dto.response.RagDocumentResponseDTO;
import cn.edu.cqut.advisorplatform.entity.RagKnowledgeBaseDO;
import cn.edu.cqut.advisorplatform.service.RagService;
import cn.edu.cqut.advisorplatform.service.impl.rag.RagFileSupport;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class RagServiceImpl implements RagService {

  private final RagKnowledgeBaseDao knowledgeBaseDao;
  private final RagDocumentDao documentDao;
  private final RagFileSupport ragFileSupport;
  private final RagDocumentMutationSupport documentMutationSupport;
  private final RagEntityFactory entityFactory = new RagEntityFactory();

  @Value("${advisor.rag.upload-dir}")
  private String uploadDir;

  @Override
  public List<KnowledgeBaseResponseDTO> listKnowledgeBases(@Nullable UserPrincipal currentUser) {
    if (currentUser == null || currentUser.getId() == null) {
      throw new ForbiddenException("未登录或登录已失效");
    }
    return knowledgeBaseDao.findAllByOrderByCreatedAtDesc().stream()
        .map(KnowledgeBaseResponseDTO::from)
        .collect(Collectors.toList());
  }

  @Override
  @Transactional
  public KnowledgeBaseResponseDTO createKnowledgeBase(
      String name, String description, @Nullable UserPrincipal currentUser) {
    if (currentUser == null || currentUser.getId() == null) {
      throw new ForbiddenException("未登录或登录已失效");
    }
    LocalDateTime now = LocalDateTime.now();
    RagKnowledgeBaseDO kb =
        entityFactory.createKnowledgeBase(
            name, description, ragFileSupport.toUserReference(currentUser), now);
    return KnowledgeBaseResponseDTO.from(knowledgeBaseDao.save(kb));
  }

  @Override
  @Transactional
  public void deleteKnowledgeBase(Long id, @Nullable UserPrincipal currentUser) {
    RagKnowledgeBaseDO kb =
        knowledgeBaseDao.findById(id).orElseThrow(() -> new NotFoundException("知识库不存在"));
    if (!ragFileSupport.isKnowledgeBaseOwner(kb, currentUser)) {
      throw new ForbiddenException("无权限访问该知识库");
    }
    ragFileSupport.deleteDirectoryQuietly(
        ragFileSupport.resolveUploadBaseDir(uploadDir).resolve(id.toString()).normalize());
    knowledgeBaseDao.deleteById(id);
  }

  @Override
  public List<RagDocumentResponseDTO> listDocuments(
      Long knowledgeBaseId, @Nullable UserPrincipal currentUser) {
    knowledgeBaseDao.findById(knowledgeBaseId).orElseThrow(() -> new NotFoundException("知识库不存在"));
    return documentDao.findByKnowledgeBaseIdOrderByCreatedAtDesc(knowledgeBaseId).stream()
        .map(RagDocumentResponseDTO::from)
        .collect(Collectors.toList());
  }

  @Override
  public List<RagDocumentResponseDTO> listAllDocuments() {
    return documentDao.findAllByOrderByCreatedAtDesc().stream()
        .map(RagDocumentResponseDTO::from)
        .collect(Collectors.toList());
  }

  @Override
  @Transactional
  public RagDocumentResponseDTO uploadDocument(
      Long knowledgeBaseId, MultipartFile file, @Nullable UserPrincipal currentUser) {
    return documentMutationSupport.uploadDocument(knowledgeBaseId, file, currentUser, uploadDir);
  }

  @Override
  @Transactional
  public void deleteDocument(Long id, @Nullable UserPrincipal currentUser) {
    documentMutationSupport.deleteDocument(id, currentUser, uploadDir);
  }

  @Override
  public boolean existsKnowledgeBase(Long id) {
    if (id == null || id <= 0) {
      return false;
    }
    return knowledgeBaseDao.existsById(id);
  }
}
