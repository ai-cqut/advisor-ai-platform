package cn.edu.cqut.advisorplatform.mcp.student;

import static org.junit.jupiter.api.Assertions.assertTrue;

import cn.edu.cqut.advisorplatform.dto.response.CheckInRecordItem;
import cn.edu.cqut.advisorplatform.dto.response.StudentCheckInDetailResponse;
import cn.edu.cqut.advisorplatform.dto.response.StudentCheckInSummaryResponse;
import cn.edu.cqut.advisorplatform.dto.response.StudentDetailResponse;
import java.util.List;
import org.junit.jupiter.api.Test;

class StudentMcpResultFormatterTest {

  private final StudentMcpResultFormatter formatter = new StudentMcpResultFormatter();

  @Test
  void formatsStudentList() {
    StudentDetailResponse student = new StudentDetailResponse();
    student.setId(7L);
    student.setStudentNo("2024001");
    student.setName("张三");
    student.setGrade("2024");
    student.setMajor("计算机");
    student.setClassCode("计科一班");
    student.setRiskLevelText("低");

    String text = formatter.formatStudentList(1, List.of(student));

    assertTrue(text.contains("共 1 条记录"));
    assertTrue(text.contains("ID: 7 | 学号: 2024001 | 姓名: 张三"));
    assertTrue(text.contains("风险等级: 低"));
  }

  @Test
  void formatsCheckInDetail() {
    StudentCheckInSummaryResponse summary = new StudentCheckInSummaryResponse();
    summary.setStudentNo("2024001");
    summary.setStudentName("张三");
    summary.setCheckInRate(0.75);

    CheckInRecordItem record = new CheckInRecordItem();
    record.setCheckDate("2026-05-26");
    record.setCheckedIn(true);

    StudentCheckInDetailResponse detail = new StudentCheckInDetailResponse();
    detail.setSummary(summary);
    detail.setRecentRecords(List.of(record));

    String text = formatter.formatCheckInDetail(detail);

    assertTrue(text.contains("签到率: 75.00%"));
    assertTrue(text.contains("2026-05-26 - 已签到"));
  }
}
