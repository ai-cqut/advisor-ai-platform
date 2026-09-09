package cn.edu.cqut.advisorplatform.memoryservice.dao;

import cn.edu.cqut.advisorplatform.memoryservice.entity.UserMemoryDO;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserMemoryDao extends JpaRepository<UserMemoryDO, Long> {

  @Query(
      """
            SELECT m FROM UserMemoryDO m
            WHERE m.userId = :userId
              AND (:knowledgeBaseId = 0 OR m.knowledgeBaseId = :knowledgeBaseId)
              AND m.isDeleted = false
              AND m.mergedIntoId IS NULL
              AND (m.expiresAt IS NULL OR m.expiresAt > :now)
              AND (m.validUntil IS NULL OR m.validUntil > :now)
              AND (:query = '' OR LOWER(m.content) LIKE LOWER(CONCAT('%', :query, '%')))
            ORDER BY m.updatedAt DESC
            """)
  List<UserMemoryDO> searchByScope(
      @Param("userId") Long userId,
      @Param("knowledgeBaseId") Long knowledgeBaseId,
      @Param("query") String query,
      @Param("now") LocalDateTime now,
      Pageable pageable);

  @Query(
      """
            SELECT m FROM UserMemoryDO m
            WHERE m.userId = :userId
              AND (:knowledgeBaseId = 0 OR m.knowledgeBaseId = :knowledgeBaseId)
              AND m.isDeleted = false
              AND m.mergedIntoId IS NULL
              AND (m.expiresAt IS NULL OR m.expiresAt > :now)
              AND (m.validUntil IS NULL OR m.validUntil > :now)
              AND (:memoryType IS NULL OR m.memoryType = :memoryType)
              AND (:query = '' OR LOWER(m.content) LIKE LOWER(CONCAT('%', :query, '%')))
            ORDER BY m.updatedAt DESC
            """)
  List<UserMemoryDO> searchByScopeAndType(
      @Param("userId") Long userId,
      @Param("knowledgeBaseId") Long knowledgeBaseId,
      @Param("query") String query,
      @Param("now") LocalDateTime now,
      @Param("memoryType") String memoryType,
      Pageable pageable);

  @Query(
      value =
          """
                    SELECT *
                    FROM user_memory
                    WHERE user_id = :userId
                      AND (:knowledgeBaseId = 0 OR knowledge_base_id = :knowledgeBaseId)
                      AND is_deleted = false
                      AND embedding IS NOT NULL
                      AND (embedding <=> CAST(:embedding AS vector)) <= :maxDistance
                    ORDER BY embedding <=> CAST(:embedding AS vector)
                    LIMIT 1
                    """,
      nativeQuery = true)
  Optional<UserMemoryDO> findMostSimilarByVector(
      @Param("userId") Long userId,
      @Param("knowledgeBaseId") Long knowledgeBaseId,
      @Param("embedding") String embedding,
      @Param("maxDistance") Double maxDistance);

  @Query(
      value =
          """
                    SELECT *
                    FROM user_memory
                    WHERE user_id = :userId
                      AND (:knowledgeBaseId = 0 OR knowledge_base_id = :knowledgeBaseId)
                      AND is_deleted = false
                      AND merged_into_id IS NULL
                      AND (valid_until IS NULL OR valid_until > NOW())
                      AND embedding IS NOT NULL
                    ORDER BY embedding <=> CAST(:embedding AS vector)
                    LIMIT :topK
                    """,
      nativeQuery = true)
  List<UserMemoryDO> searchByVector(
      @Param("userId") Long userId,
      @Param("knowledgeBaseId") Long knowledgeBaseId,
      @Param("embedding") String embedding,
      @Param("topK") Integer topK);

  @Query(
      value =
          """
                    SELECT *
                    FROM user_memory
                    WHERE user_id = :userId
                      AND (:knowledgeBaseId = 0 OR knowledge_base_id = :knowledgeBaseId)
                      AND is_deleted = false
                      AND merged_into_id IS NULL
                      AND (valid_until IS NULL OR valid_until > NOW())
                      AND memory_type = :memoryType
                      AND embedding IS NOT NULL
                    ORDER BY embedding <=> CAST(:embedding AS vector)
                    LIMIT :topK
                    """,
      nativeQuery = true)
  List<UserMemoryDO> searchByVectorAndType(
      @Param("userId") Long userId,
      @Param("knowledgeBaseId") Long knowledgeBaseId,
      @Param("embedding") String embedding,
      @Param("topK") Integer topK,
      @Param("memoryType") String memoryType);

  @Modifying
  @Query(
      value =
          """
                    UPDATE user_memory
                    SET embedding = CAST(:embedding AS vector),
                        updated_at = NOW()
                    WHERE id = :id
                    """,
      nativeQuery = true)
  int updateEmbeddingById(@Param("id") Long id, @Param("embedding") String embedding);

  @Query(
      """
            SELECT COUNT(m) FROM UserMemoryDO m
            WHERE m.userId = :userId
              AND m.knowledgeBaseId = :knowledgeBaseId
              AND m.isDeleted = false
              AND m.mergedIntoId IS NULL
              AND (m.expiresAt IS NULL OR m.expiresAt > :now)
              AND (m.validUntil IS NULL OR m.validUntil > :now)
            """)
  long countActiveByUserAndKb(
      @Param("userId") Long userId,
      @Param("knowledgeBaseId") Long knowledgeBaseId,
      @Param("now") LocalDateTime now);

  @Query(
      """
            SELECT m FROM UserMemoryDO m
            WHERE m.userId = :userId
              AND (:knowledgeBaseId = 0 OR m.knowledgeBaseId = :knowledgeBaseId)
              AND m.isDeleted = false
              AND m.isCore = true
              AND m.mergedIntoId IS NULL
              AND (m.expiresAt IS NULL OR m.expiresAt > :now)
              AND (m.validUntil IS NULL OR m.validUntil > :now)
            ORDER BY m.confidence DESC, m.updatedAt DESC
            """)
  List<UserMemoryDO> findCoreMemories(
      @Param("userId") Long userId,
      @Param("knowledgeBaseId") Long knowledgeBaseId,
      @Param("now") LocalDateTime now);

  @Query(
      """
            SELECT m FROM UserMemoryDO m
            WHERE m.isDeleted = true AND m.updatedAt < :cutoff
            """)
  List<UserMemoryDO> findSoftDeletedBefore(@Param("cutoff") LocalDateTime cutoff);

  @Query(
      """
            SELECT m FROM UserMemoryDO m
            WHERE m.isDeleted = false
              AND m.confidence < :maxConfidence
              AND m.updatedAt < :staleSince
            ORDER BY m.accessCount ASC, m.updatedAt ASC
            """)
  List<UserMemoryDO> findLowConfidenceStale(
      @Param("maxConfidence") java.math.BigDecimal maxConfidence,
      @Param("staleSince") LocalDateTime staleSince,
      Pageable pageable);

  @Modifying
  @Query(
      value =
          """
                    UPDATE user_memory
                    SET access_count = access_count + 1,
                        last_accessed_at = NOW(),
                        updated_at = NOW()
                    WHERE id = :id
                    """,
      nativeQuery = true)
  int incrementAccessCount(@Param("id") Long id);

  void deleteAllByIdInBatch(Iterable<Long> ids);
}
