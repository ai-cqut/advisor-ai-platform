package cn.edu.cqut.advisorplatform.gateway.trace;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class TraceEventConfig {

  @Bean
  public TraceEventHub traceEventHub() {
    return new TraceEventHub();
  }
}
