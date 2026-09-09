package cn.edu.cqut.advisorplatform.service.impl.agent;

import static org.assertj.core.api.Assertions.assertThat;

import cn.edu.cqut.advisorplatform.entity.chat.SourceReference;
import cn.edu.cqut.advisorplatform.entity.chat.StreamEventRecord;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class SseEventParserTest {

  private final SseEventParser parser = new SseEventParser(new ObjectMapper());

  @Test
  void extractDelta_shouldReadProtocolPayloadText() {
    String block =
        """
        event: llm_data
        data: {"payload":{"text":"hello"}}
        """;

    assertThat(parser.extractEventName(block)).isEqualTo("llm_data");
    assertThat(parser.extractDelta(block)).isEqualTo("hello");
  }

  @Test
  void extractSources_shouldReadDerivedSourcesFromToolResult() {
    String block =
        """
        event: tool_result
        data: {"payload":{"derived":{"sources":[{"id":7,"docName":"doc","snippet":"hit"}]}}}
        """;

    List<SourceReference> sources = parser.extractSources(block);

    assertThat(sources).hasSize(1);
    assertThat(sources.get(0).getDocumentId()).isEqualTo(7L);
    assertThat(sources.get(0).getDocName()).isEqualTo("doc");
    assertThat(sources.get(0).getSnippet()).isEqualTo("hit");
  }

  @Test
  void extractSources_shouldReadSourcesFromSerializedToolOutput() {
    String block =
        """
        event: tool_result
        data: {"payload":{"tool_output":"{\\"items\\":[{\\"documentId\\":8,\\"docName\\":\\"policy.pdf\\",\\"content\\":\\"原文片段\\"}]}"}}}
        """;

    List<SourceReference> sources = parser.extractSources(block);

    assertThat(sources).hasSize(1);
    assertThat(sources.get(0).getDocumentId()).isEqualTo(8L);
    assertThat(sources.get(0).getDocName()).isEqualTo("policy.pdf");
    assertThat(sources.get(0).getSnippet()).isEqualTo("原文片段");
  }

  @Test
  void extractStreamEventRecord_shouldUnwrapPayloadAndKeepTraceMetadata() {
    String block =
        """
        event: sys_intent_route
        data: {"source":"system","trace_id":"t1","timestamp":123,"payload":{"matched_by":"fallback"}}
        """;

    StreamEventRecord record = parser.extractStreamEventRecord("sys_intent_route", block);

    assertThat(record).isNotNull();
    assertThat(record.getEvent()).isEqualTo("sys_intent_route");
    assertThat(record.getSource()).isEqualTo("system");
    assertThat(record.getTraceId()).isEqualTo("t1");
    assertThat(record.getTimestamp()).isEqualTo(123L);
    assertThat(record.getPayload()).containsEntry("matched_by", "fallback");
  }
}
