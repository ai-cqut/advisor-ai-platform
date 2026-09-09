package cn.edu.cqut.advisorplatform.service;

import cn.edu.cqut.advisorplatform.dto.request.RagSearchRequestDTO;
import cn.edu.cqut.advisorplatform.dto.response.RagSearchResultDTO;
import java.util.List;

public interface RagSearchService {

  List<RagSearchResultDTO> search(RagSearchRequestDTO request);
}
