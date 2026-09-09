# 记忆系统架构文档

## 一、概述

记忆系统是一个跨服务的分布式架构，支持长期记忆的存储、检索、决策和注入。系统采用了五层增强设计：

1. **记忆类型分层** - semantic/episodic 分类
2. **写入决策增强** - 混合决策引擎（规则 + LLM）
3. **时态建模** - valid_until/supersedes_id 生命周期
4. **记忆合并机制** - merged_into_id 追踪
5. **核心记忆常驻** - is_core 动态注入

---

## 二、架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent 编排层 (Python)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Orchestrator │  │ Decision  │  │ Writeback │  │ Retriever │    │
│  │           │  │ Engine   │  │          │  │          │    │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘    │
│        │             │             │             │          │
│  ┌─────┴─────────────┴─────────────┴─────────────┴────┐    │
│  │              MemoryApiClient                        │    │
│  └─────────────────────┬───────────────────────────────┘    │
└────────────────────────┼───────────────────────────────────┘
                         │ HTTP
┌────────────────────────┼───────────────────────────────────┐
│                   Memory Service (Java)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Controller │  │ Service  │  │ DAO      │  │ pgvector │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────┼───────────────────────────────────┐
│                  PostgreSQL + pgvector                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、核心数据模型

### 3.1 MemoryItem (Python)

```python
@dataclass
class MemoryItem:
    id: int
    user_id: int
    kb_id: int
    content: str
    confidence: float = 0.5
    score: float = 0.0
    created_at: datetime | None = None
    updated_at: datetime | None = None
    expires_at: datetime | None = None
    tags: JsonObject = field(default_factory=dict)
    memory_type: str = "semantic"        # 记忆类型
    valid_until: datetime | None = None   # 时态：失效时间
    supersedes_id: int | None = None      # 时态：替代的记忆ID
    merged_into_id: int | None = None     # 合并：合并到的记忆ID
    is_core: bool = False                 # 核心记忆标记
```

### 3.2 MemoryCandidate (Python)

```python
@dataclass
class MemoryCandidate:
    content: str
    confidence: float = 0.5
    source_turn_id: str | None = None
    tags: JsonObject = field(default_factory=dict)
    memory_type: str = "semantic"
    is_core: bool = False
```

### 3.3 MemoryDecision (Python)

```python
@dataclass
class MemoryDecision:
    decision: DecisionType  # ADD/UPDATE/MERGE/INVALIDATE/IGNORE
    reason: str
    target_memory_id: int | None = None
    target_memory_ids: list[int] | None = None
    merged_content: str | None = None
    is_core: bool = False
```

### 3.4 UserMemoryDO (Java Entity)

```java
@Entity
@Table(name = "user_memory")
public class UserMemoryDO {
    private Long id;
    private Long userId;
    private Long knowledgeBaseId;
    private String content;
    private BigDecimal confidence;
    private BigDecimal score;
    private String memoryKey;
    private String sourceTurnId;
    private Map<String, Object> tags;
    private Boolean isDeleted;
    private LocalDateTime expiresAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private String memoryType;      // "semantic" | "episodic"
    private LocalDateTime validUntil;
    private Long supersedesId;
    private Long mergedIntoId;
    private Boolean isCore;
    private Integer accessCount;
    private LocalDateTime lastAccessedAt;
}
```

---

## 四、功能详解

### 4.1 记忆类型分层（差距1）

**目的**：区分事实/偏好（semantic）和经历/事件（episodic），提升检索精度。

**写入时分类**：
- LLM Extractor 输出 `memoryType` 字段
- 规则提取根据关键词推断（"上次"→episodic）

**检索时路由**：
```python
# 查询类型推断
query_type = _infer_query_type(query)  # "semantic" | "episodic"

# 类型权重
if query_type == "episodic":
    type_weights = {"semantic": 0.3, "episodic": 0.7}
else:
    type_weights = {"semantic": 0.8, "episodic": 0.2}
```

**冲突解决**：
- 不同类型的相似记忆可以共存
- 同类型的相似记忆按 confidence 解决冲突

### 4.2 写入决策增强（差距2）

**目的**：判断"该不该记"，而不是简单地 append。

**混合决策引擎**：
```
候选记忆 → 规则快速判断：
  ├─ 低置信度(<0.4) → IGNORE
  ├─ 闲聊/问候 → IGNORE
  ├─ 临时信息 → IGNORE
  ├─ 指代不完整 → IGNORE
  ├─ 高度相似(>0.95) → UPDATE
  ├─ 无相似记忆 → ADD
  └─ 有相似但不确定 → LLM 决策
       ├─ ADD: 全新有价值信息
       ├─ UPDATE: 偏好变化/事实修正
       ├─ MERGE: 同一含义合并
       ├─ INVALIDATE: 矛盾信息
       └─ IGNORE: 无长期价值
```

**决策执行**：
- ADD → 写入新记忆
- UPDATE → 更新目标记忆 confidence
- MERGE → LLM 合并内容，更新目标记忆
- INVALIDATE → 设置旧记忆 valid_until，写入新记忆
- IGNORE → 跳过

### 4.3 时态建模（差距3）

**目的**：处理偏好变化，使旧记忆正确失效。

**数据库字段**：
- `valid_until TIMESTAMP` - 记忆失效时间（NULL = 当前有效）
- `supersedes_id BIGINT` - 指向被此记忆替代的旧记忆

**检索过滤**：
```sql
WHERE (valid_until IS NULL OR valid_until > NOW())
```

**INVALIDATE 流程**：
```
旧记忆: "喜欢 Java" (id=100)
新记忆: "现在改用 Python"
  ↓
LLM 决策: INVALIDATE
target_memory_ids: [100]
  ↓
执行:
1. 旧记忆 100: valid_until = NOW()
2. 新记忆写入
```

### 4.4 记忆合并机制（差距4）

**目的**：避免相似记忆膨胀，智能合并。

**数据库字段**：
- `merged_into_id BIGINT` - 指向合并到的目标记忆

**MERGE 流程**：
```
已有记忆: "用户喜欢 Python" (id=100)
新记忆: "用户偏好 Python 做数据科学"
  ↓
LLM 判断: MERGE
merged_content: "用户偏好 Python，常用于数据科学"
target_memory_id: 100
  ↓
执行:
1. 更新记忆 100: content = "用户偏好 Python，常用于数据科学"
2. 写入新记忆
3. 标记新记忆: merged_into_id = 100
```

**检索过滤**：
```sql
WHERE merged_into_id IS NULL
```

### 4.5 核心记忆常驻（差距5）

**目的**：少量关键信息每次都注入上下文。

**数据库字段**：
- `is_core BOOLEAN` - 是否为核心记忆

**写入时标记**：
- LLM 决策时判断 `is_core`
- 核心记忆 = 用户核心偏好、身份、目标、约束

**加载方式**：
```python
# 并行加载
long_term_task = retrieval.retrieve(...)
core_task = retrieval.retrieve_core(...)
long_term, core_memories = await asyncio.gather(long_term_task, core_task)
```

**注入位置**：
```
[user prompt 开头]
[core_memory]
- 用户是计科专业
- 偏好简洁回答
- 使用 Python
[session_summary] ...
[long_term_memory] ...
[recent_dialogue] ...
```

**动态 Token 预算**：
```python
def _render_core_memories(memories, max_tokens=500):
    sorted_memories = sorted(memories, key=lambda m: m.confidence, reverse=True)
    for m in sorted_memories:
        estimated_tokens = len(m.content) // 2
        if current_tokens + estimated_tokens > max_tokens:
            break
        lines.append(f"- {m.content}")
```

---

## 五、数据库迁移

| 版本 | 文件 | 内容 |
|------|------|------|
| V5 | `V5__memory_schema.sql` | 基础表结构 |
| V8 | `V8__user_memory_add_vector_support.sql` | 向量支持 |
| V11 | `V11__memory_storage_opt.sql` | 访问热度优化 |
| V12 | `V12__memory_task.sql` | 异步任务队列 |
| V22 | `V22__memory_add_type.sql` | 记忆类型分层 |
| V23 | `V23__memory_add_temporal.sql` | 时态建模 |
| V24 | `V24__memory_add_merged_into.sql` | 合并机制 |
| V25 | `V25__memory_add_is_core.sql` | 核心记忆 |

---

## 六、API 端点

### 6.1 记忆检索

```
POST /api/memory/long-term/search
{
  "userId": 1,
  "knowledgeBaseId": 1,
  "query": "用户偏好",
  "topK": 6,
  "mode": "hybrid",
  "typeWeights": {"semantic": 0.8, "episodic": 0.2}
}
```

### 6.2 核心记忆加载

```
GET /api/memory/long-term/core?userId=1&knowledgeBaseId=1
```

### 6.3 记忆写入

```
POST /api/memory/long-term/candidates
{
  "userId": 1,
  "knowledgeBaseId": 1,
  "candidates": [
    {
      "content": "用户喜欢 Python",
      "confidence": 0.8,
      "memoryType": "semantic",
      "isCore": true
    }
  ]
}
```

### 6.4 记忆失效

```
POST /api/memory/long-term/{id}/invalidate
```

### 6.5 记忆合并

```
POST /api/memory/long-term/{id}/mark-merged
{
  "targetMemoryId": 100
}
```

### 6.6 置信度更新

```
POST /api/memory/long-term/{id}/confidence
{
  "confidence": 0.9
}
```

### 6.7 内容更新

```
POST /api/memory/long-term/{id}/content
{
  "content": "合并后的内容",
  "confidence": 0.8
}
```

---

## 七、测试覆盖

### 7.1 测试文件

| 文件 | 测试数 | 覆盖场景 |
|------|--------|----------|
| `test_memory_decision_engine.py` | 18 | 决策引擎：规则判断、LLM 解析、异步决策 |
| `test_memory_type_routing.py` | 15 | 类型分层：查询推断、权重计算、冲突隔离 |
| `test_memory_core_feature.py` | 10 | 核心记忆：渲染、注入、token 预算 |
| `test_memory_temporal.py` | 15 | 时态建模：字段、mapper、TTL、衰减 |
| `test_memory_governance.py` | 16 | 治理：去重、冲突解决、时间衰减 |
| `test_memory_deepeval.py` | 15 | DeepEval 评估：决策质量、类型分类、核心记忆判断 |
| `test_memory_api_client.py` | 4 | API 客户端：重试、错误处理 |
| `test_memory_injector.py` | 1 | 记忆注入 |
| `test_failure_memory.py` | 2 | 失败记忆 |

**总计：101 个测试，全部通过**

### 7.2 运行测试

```bash
cd agent

# 运行全部记忆功能测试（101 个）
.venv/Scripts/python.exe -m pytest tests/test_memory_decision_engine.py tests/test_memory_type_routing.py tests/test_memory_core_feature.py tests/test_memory_temporal.py tests/test_memory_governance.py tests/test_memory_deepeval.py tests/test_memory_api_client.py tests/test_memory_injector.py tests/test_failure_memory.py -v

# 只运行单元测试（86 个，快速）
.venv/Scripts/python.exe -m pytest tests/test_memory_decision_engine.py tests/test_memory_type_routing.py tests/test_memory_core_feature.py tests/test_memory_temporal.py tests/test_memory_governance.py -v

# 只运行 DeepEval 评估测试（15 个，需要 LLM API）
.venv/Scripts/python.exe -m pytest tests/test_memory_deepeval.py -v
```

---

## 八、关键文件索引

### Agent 侧

| 文件 | 用途 |
|------|------|
| `agent-ts/src/memory/model/entity/MemoryItem.ts` | 记忆条目数据模型 |
| `agent-ts/src/memory/model/input/MemoryCandidateInput.ts` | 候选记忆输入模型 |
| `agent-ts/src/memory/failure/model/FailureMemoryItem.ts` | 失败记忆条目数据模型 |
| `agent-ts/src/memory/context/core/MemoryContextBuilder.ts` | 记忆上下文构建 |
| `agent-ts/src/memory/context/loading/MemoryContextLoader.ts` | 记忆加载 |
| `agent-ts/src/memory/context/injection/MemoryContextMessageInjector.ts` | 记忆注入 Prompt |
| `agent-ts/src/memory/context/gate/MemoryContextRequestGate.ts` | 记忆请求门控 |
| `agent-ts/src/memory/context/rendering/prompt/MemoryPromptRenderer.ts` | 记忆 Prompt 渲染 |
| `agent-ts/src/memory/context/rendering/message/MemorySystemMessageFactory.ts` | 记忆系统消息构造 |
| `agent-ts/src/memory/api/core/MemoryApiClient.ts` | Memory API 客户端 |
| `agent-ts/src/memory/api/http/MemoryApiHttpClient.ts` | Memory API HTTP 传输 |
| `agent-ts/src/memory/api/factory/request/MemoryApiPostRequestFactory.ts` | 请求构造 |

### Java 侧

| 文件 | 用途 |
|------|------|
| `memoryservice/entity/UserMemoryDO.java` | Entity |
| `memoryservice/dao/UserMemoryDao.java` | DAO |
| `service/impl/MemoryServiceImpl.java` | Service 实现 |
| `service/impl/MemorySearchSupport.java` | 检索支持 |
| `service/impl/MemoryCandidateEntityFactory.java` | Entity 工厂 |
| `controller/MemoryController.java` | REST Controller |
| `dto/request/MemoryCandidateItemDTO.java` | 请求 DTO |
| `dto/response/MemoryItemResponseDTO.java` | 响应 DTO |

---

## 九、Commit 消息汇总

```
feat: 记忆系统增加 semantic/episodic 类型分层
feat: 增强记忆写入决策机制
feat: 记忆系统增加时态建模支持
feat: 记忆系统增加合并机制
feat: 记忆系统增加核心记忆常驻机制
test: 记忆功能单元测试覆盖全部场景
```
