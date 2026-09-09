package cn.edu.cqut.advisorplatform.mcp.student;

import cn.edu.cqut.advisorplatform.dto.response.StudentCheckInDetailResponse;
import cn.edu.cqut.advisorplatform.dto.response.StudentCheckInSummaryResponse;
import cn.edu.cqut.advisorplatform.dto.response.StudentDetailResponse;
import java.util.List;

class StudentMcpResultFormatter {

  String formatStudentList(long totalElements, List<StudentDetailResponse> students) {
    StringBuilder sb = new StringBuilder();
    sb.append("共 ").append(totalElements).append(" 条记录\n\n");
    for (StudentDetailResponse student : students) {
      sb.append("ID: ")
          .append(student.getId())
          .append(" | 学号: ")
          .append(student.getStudentNo())
          .append(" | 姓名: ")
          .append(student.getName())
          .append(" | 年级: ")
          .append(student.getGrade())
          .append(" | 专业: ")
          .append(student.getMajor())
          .append(" | 班级: ")
          .append(student.getClassCode())
          .append(" | 风险等级: ")
          .append(student.getRiskLevelText())
          .append("\n");
    }
    return sb.toString();
  }

  String formatStudentDetail(StudentDetailResponse student) {
    StringBuilder sb = new StringBuilder();
    sb.append("=== 学生详情 ===\n");
    sb.append("ID: ").append(student.getId()).append("\n");
    sb.append("学号: ").append(student.getStudentNo()).append("\n");
    sb.append("姓名: ").append(student.getName()).append("\n");
    sb.append("性别: ").append(student.getGenderText()).append("\n");
    sb.append("年级: ").append(student.getGrade()).append("\n");
    sb.append("专业: ").append(student.getMajor()).append("\n");
    sb.append("班级: ").append(student.getClassCode()).append("\n");
    sb.append("辅导员号: ").append(student.getCounselorNo()).append("\n");
    sb.append("电话: ").append(student.getPhone()).append("\n");
    sb.append("邮箱: ").append(student.getEmail()).append("\n");
    sb.append("宿舍: ").append(student.getDormitory()).append("\n");
    sb.append("紧急联系人: ").append(student.getEmergencyContact()).append("\n");
    sb.append("信息完整度: ").append(student.getInfoCompletenessText()).append("\n");
    sb.append("风险等级: ").append(student.getRiskLevelText()).append("\n");
    sb.append("创建时间: ").append(student.getCreatedAt()).append("\n");
    sb.append("更新时间: ").append(student.getUpdatedAt()).append("\n");
    return sb.toString();
  }

  String formatCheckInSummary(StudentCheckInSummaryResponse summary) {
    StringBuilder sb = new StringBuilder();
    sb.append("=== 签到汇总 ===\n");
    sb.append("学号: ").append(summary.getStudentNo()).append("\n");
    sb.append("姓名: ").append(summary.getStudentName()).append("\n");
    sb.append("总次数: ").append(summary.getTotalCount()).append("\n");
    sb.append("已签到: ").append(summary.getCheckedInCount()).append("\n");
    sb.append("未签到: ").append(summary.getMissedCount()).append("\n");
    sb.append("签到率: ").append(String.format("%.2f%%", summary.getCheckInRate() * 100)).append("\n");
    sb.append("最后签到时间: ").append(summary.getLastCheckInTime()).append("\n");
    return sb.toString();
  }

  String formatCheckInDetail(StudentCheckInDetailResponse detail) {
    StringBuilder sb = new StringBuilder();
    sb.append("=== 签到详情 ===\n");
    var summary = detail.getSummary();
    sb.append("学号: ").append(summary.getStudentNo()).append("\n");
    sb.append("姓名: ").append(summary.getStudentName()).append("\n");
    sb.append("签到率: ")
        .append(String.format("%.2f%%", summary.getCheckInRate() * 100))
        .append("\n\n");
    sb.append("=== 最近签到记录 ===\n");

    for (var record : detail.getRecentRecords()) {
      String status = Boolean.TRUE.equals(record.getCheckedIn()) ? "已签到" : "未签到";
      sb.append(record.getCheckDate()).append(" - ").append(status).append("\n");
    }
    return sb.toString();
  }
}
