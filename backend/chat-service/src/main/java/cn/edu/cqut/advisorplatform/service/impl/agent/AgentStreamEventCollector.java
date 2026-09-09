package cn.edu.cqut.advisorplatform.service.impl.agent;

import cn.edu.cqut.advisorplatform.entity.chat.SourceReference;
import cn.edu.cqut.advisorplatform.entity.chat.StreamEventRecord;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

class AgentStreamEventCollector {

  private static final int DEBUG_PREVIEW_LIMIT = 200;
  private static final int MAX_PERSISTED_EVENTS = 80;

  private final SseEventParser sseEventParser;
  private final StreamEventPersistencePolicy persistencePolicy;
  private final boolean debugStream;
  private final Consumer<StreamEventRecord> eventConsumer;

  AgentStreamEventCollector(SseEventParser sseEventParser, boolean debugStream) {
    this(sseEventParser, new StreamEventPersistencePolicy(), debugStream, ignored -> {});
  }

  AgentStreamEventCollector(
      SseEventParser sseEventParser,
      StreamEventPersistencePolicy persistencePolicy,
      boolean debugStream) {
    this(sseEventParser, persistencePolicy, debugStream, ignored -> {});
  }

  AgentStreamEventCollector(
      SseEventParser sseEventParser,
      StreamEventPersistencePolicy persistencePolicy,
      boolean debugStream,
      Consumer<StreamEventRecord> eventConsumer) {
    this.sseEventParser = sseEventParser;
    this.persistencePolicy = persistencePolicy;
    this.debugStream = debugStream;
    this.eventConsumer = eventConsumer;
  }

  int collect(
      StringBuilder sseBuffer,
      StringBuilder deltaPreview,
      StringBuilder assistantText,
      List<SourceReference> sources,
      List<StreamEventRecord> events,
      AtomicBoolean sawDoneEvent,
      AtomicBoolean sawErrorEvent) {
    int count = 0;
    int blockEnd;
    while ((blockEnd = sseBuffer.indexOf("\n\n")) >= 0) {
      String block = sseBuffer.substring(0, blockEnd);
      sseBuffer.delete(0, blockEnd + 2);
      String eventName = sseEventParser.extractEventName(block);
      collectControlEvent(eventName, sawDoneEvent, sawErrorEvent);
      collectSources(eventName, block, sources);
      collectPersistentEvent(eventName, block, events);

      String delta = sseEventParser.extractDelta(block);
      if (delta == null || delta.isBlank()) {
        continue;
      }
      count++;
      assistantText.append(delta);
      appendDebugPreview(deltaPreview, delta);
    }
    return count;
  }

  private void collectControlEvent(
      String eventName, AtomicBoolean sawDoneEvent, AtomicBoolean sawErrorEvent) {
    if ("sys_done".equals(eventName)) {
      sawDoneEvent.set(true);
    } else if ("sys_error".equals(eventName)) {
      sawErrorEvent.set(true);
    }
  }

  private void collectSources(String eventName, String block, List<SourceReference> sources) {
    if (!"sources".equals(eventName) && !"tool_result".equals(eventName)) {
      return;
    }
    List<SourceReference> extractedSources = sseEventParser.extractSources(block);
    if ("sources".equals(eventName) || !extractedSources.isEmpty()) {
      sources.clear();
      sources.addAll(extractedSources);
    }
  }

  private void collectPersistentEvent(
      String eventName, String block, List<StreamEventRecord> events) {
    StreamEventRecord record = sseEventParser.extractStreamEventRecord(eventName, block);
    if (record != null) {
      eventConsumer.accept(record);
    }
    if (!persistencePolicy.shouldPersist(eventName) || events.size() >= MAX_PERSISTED_EVENTS) {
      return;
    }
    if (record != null) {
      events.add(record);
    }
  }

  private void appendDebugPreview(StringBuilder deltaPreview, String delta) {
    if (!debugStream || deltaPreview.length() >= DEBUG_PREVIEW_LIMIT) {
      return;
    }
    int remain = DEBUG_PREVIEW_LIMIT - deltaPreview.length();
    deltaPreview.append(delta, 0, Math.min(remain, delta.length()));
  }
}
