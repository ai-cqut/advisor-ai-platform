-- Advisor AI Platform 演示数据
-- 用法：在项目根目录执行
-- docker exec -i advisor-postgres psql -U postgres -d advisor_ai < scripts/demo_data_seed.sql
--
-- 所有数据均使用 DEMO 标识，可重复执行，不影响非演示数据。

BEGIN;

-- 先删除本脚本上一次生成的数据，按依赖关系逆序处理。
DELETE FROM check_in_exception
 WHERE check_in_id LIKE 'DEMO-CI-%';

DELETE FROM student_check_in_record
 WHERE check_in_id LIKE 'DEMO-CI-%';

DELETE FROM check_in_activity_class
 WHERE check_in_id LIKE 'DEMO-CI-%';

DELETE FROM check_in_activity
 WHERE check_in_id LIKE 'DEMO-CI-%';

DELETE FROM attendance_work_order
 WHERE class_code LIKE 'DEMO-CLASS-%';

DELETE FROM session_attendance
 WHERE class_code LIKE 'DEMO-CLASS-%';

DELETE FROM class_session
 WHERE class_code LIKE 'DEMO-CLASS-%';

DELETE FROM course_schedule
 WHERE class_code LIKE 'DEMO-CLASS-%';

DELETE FROM student_task
 WHERE description LIKE '[DEMO]%';

DELETE FROM student_profile
 WHERE student_no LIKE 'DEMO2026%';

-- 1. 学生档案：20 条，覆盖正常、关注、预警和信息缺失。
INSERT INTO student_profile (
    student_no,
    name,
    gender,
    grade,
    major,
    class_code,
    counselor_no,
    phone,
    email,
    dormitory,
    emergency_contact,
    extra_data,
    info_completeness,
    risk_level,
    created_by,
    created_at,
    updated_by,
    updated_at,
    deleted,
    version
)
SELECT
    'DEMO2026' || lpad(i::text, 4, '0'),
    (ARRAY['张晨','李欣怡','王浩然','刘思远','陈雨桐','赵子轩','黄诗涵','周宇航',
           '吴佳琪','徐明哲','孙悦','胡文博','朱婉清','高子涵','林俊杰','何静怡',
           '郑凯文','罗雅雯','梁博文','宋安琪'])[i],
    CASE WHEN i % 2 = 0 THEN 0 ELSE 1 END,
    CASE WHEN i <= 10 THEN '2024' ELSE '2025' END,
    CASE WHEN i % 3 = 0 THEN '软件工程' WHEN i % 3 = 1 THEN '计算机科学与技术' ELSE '数据科学与大数据技术' END,
    'DEMO-CLASS-' || lpad((((i - 1) % 4) + 1)::text, 2, '0'),
    'DEMO-T' || lpad((((i - 1) % 3) + 1)::text, 3, '0'),
    CASE WHEN i IN (6, 13) THEN NULL ELSE format('1380000%04s', i) END,
    CASE WHEN i IN (9, 17) THEN NULL ELSE format('demo%02s@example.com', i) END,
    format('D%s-%s', lpad((((i - 1) % 6) + 1)::text, 2, '0'), ((i - 1) % 20) + 101),
    format('家长%s 1390000%s', i, lpad(i::text, 4, '0')),
    jsonb_build_object('demo', true, 'source', '演示数据', 'tag', CASE WHEN i % 4 = 0 THEN '重点关注' ELSE '常规' END),
    CASE WHEN i IN (6, 9, 13, 17) THEN 1 ELSE 0 END,
    CASE WHEN i IN (4, 12) THEN 2 WHEN i IN (8, 16, 20) THEN 1 ELSE 0 END,
    'demo-seed',
    CURRENT_TIMESTAMP - make_interval(days => 20 - i),
    'demo-seed',
    CURRENT_TIMESTAMP - make_interval(days => 20 - i),
    0,
    0
FROM generate_series(1, 20) AS series(i);

-- 2. 打卡活动：20 条，每条活动对应一个演示班级。
INSERT INTO check_in_activity (
    check_in_id,
    course_id,
    course_name,
    title,
    teacher_user_id,
    teacher_no,
    start_time,
    end_time,
    status,
    late_threshold_minutes,
    created_at,
    updated_at
)
SELECT
    'DEMO-CI-' || lpad(i::text, 2, '0'),
    7000 + i,
    CASE WHEN i % 2 = 0 THEN '辅导员工作实务' ELSE '大学生心理健康教育' END,
    format('[DEMO] 第 %02s 次班级打卡', i),
    1,
    'DEMO-T' || lpad((((i - 1) % 3) + 1)::text, 3, '0'),
    CURRENT_TIMESTAMP - make_interval(days => 20 - i, hours => 9),
    CURRENT_TIMESTAMP - make_interval(days => 20 - i, hours => 8, mins => 30),
    CASE WHEN i <= 15 THEN 'CLOSED' ELSE 'ACTIVE' END,
    CASE WHEN i % 3 = 0 THEN 10 ELSE 15 END,
    CURRENT_TIMESTAMP - make_interval(days => 20 - i),
    CURRENT_TIMESTAMP - make_interval(days => 20 - i)
FROM generate_series(1, 20) AS series(i);

INSERT INTO check_in_activity_class (check_in_id, class_code, created_at)
SELECT 'DEMO-CI-' || lpad(i::text, 2, '0'),
       'DEMO-CLASS-' || lpad((((i - 1) % 4) + 1)::text, 2, '0'),
       CURRENT_TIMESTAMP
FROM generate_series(1, 20) AS series(i);

-- 3. 打卡记录：20 条，覆盖正常、迟到、缺勤和请假。
INSERT INTO student_check_in_record (
    student_id,
    check_in_id,
    class_code,
    check_date,
    checked_in,
    status,
    check_time,
    created_at,
    updated_at
)
SELECT
    student.id,
    'DEMO-CI-' || lpad(i::text, 2, '0'),
    student.class_code,
    CURRENT_DATE - (20 - i),
    i % 5 NOT IN (0, 3),
    CASE i % 5 WHEN 0 THEN 'ABSENT' WHEN 3 THEN 'LATE' WHEN 4 THEN 'LEAVE' ELSE 'NORMAL' END,
    CASE
      WHEN i % 5 IN (0, 4) THEN NULL
      ELSE CURRENT_TIMESTAMP - make_interval(days => 20 - i, hours => 8, mins => CASE WHEN i % 5 = 3 THEN -5 ELSE 15 END)
    END,
    CURRENT_TIMESTAMP - make_interval(days => 20 - i),
    CURRENT_TIMESTAMP - make_interval(days => 20 - i)
FROM generate_series(1, 20) AS series(i)
JOIN student_profile student ON student.student_no = 'DEMO2026' || lpad(i::text, 4, '0');

-- 打卡异常：20 条，给异常处理页面提供待处理和已处理数据。
INSERT INTO check_in_exception (
    student_id,
    check_in_id,
    exception_type,
    status,
    handler_id,
    handler_note,
    handled_at,
    created_at,
    updated_at
)
SELECT
    student.id,
    'DEMO-CI-' || lpad(i::text, 2, '0'),
    CASE i % 4 WHEN 0 THEN 'ABSENT' WHEN 1 THEN 'LATE' WHEN 2 THEN 'LEAVE' ELSE 'ABNORMAL' END,
    CASE WHEN i % 3 = 0 THEN 'HANDLED' ELSE 'PENDING' END,
    CASE WHEN i % 3 = 0 THEN 1 ELSE NULL END,
    CASE WHEN i % 3 = 0 THEN '[DEMO] 已电话联系学生并完成核实' ELSE NULL END,
    CASE WHEN i % 3 = 0 THEN CURRENT_TIMESTAMP - make_interval(days => 18 - i) ELSE NULL END,
    CURRENT_TIMESTAMP - make_interval(days => 20 - i),
    CURRENT_TIMESTAMP - make_interval(days => 20 - i)
FROM generate_series(1, 20) AS series(i)
JOIN student_profile student ON student.student_no = 'DEMO2026' || lpad(i::text, 4, '0');

-- 4. 课程考勤：20 条课程、20 条课次、20 条学生考勤。
INSERT INTO course_schedule (
    term,
    class_code,
    course_code,
    course_name,
    teacher_no,
    teacher_name,
    week_start,
    week_end,
    weekday,
    period_start,
    period_end,
    location,
    created_by,
    created_at,
    updated_at
)
SELECT
    '2026-2027-1',
    'DEMO-CLASS-' || lpad((((i - 1) % 4) + 1)::text, 2, '0'),
    'DEMO-C' || lpad(i::text, 3, '0'),
    CASE WHEN i % 2 = 0 THEN '学生事务管理' ELSE '职业生涯规划' END,
    'DEMO-T' || lpad((((i - 1) % 3) + 1)::text, 3, '0'),
    (ARRAY['演示教师甲','演示教师乙','演示教师丙'])[((i - 1) % 3) + 1],
    1,
    16,
    ((i - 1) % 5) + 1,
    1 + ((i - 1) % 6),
    2 + ((i - 1) % 6),
    format('明德楼 DEMO-%s', lpad((((i - 1) % 8) + 1)::text, 2, '0')),
    1,
    CURRENT_TIMESTAMP - make_interval(days => 20 - i),
    CURRENT_TIMESTAMP - make_interval(days => 20 - i)
FROM generate_series(1, 20) AS series(i);

INSERT INTO class_session (
    schedule_id,
    term,
    class_code,
    course_code,
    course_name,
    teacher_no,
    teacher_name,
    week_no,
    weekday,
    period_start,
    period_end,
    session_date,
    start_time,
    end_time,
    location,
    status,
    created_at,
    updated_at
)
SELECT
    schedule.id,
    schedule.term,
    schedule.class_code,
    schedule.course_code,
    schedule.course_name,
    schedule.teacher_no,
    schedule.teacher_name,
    i,
    schedule.weekday,
    schedule.period_start,
    schedule.period_end,
    CURRENT_DATE - (20 - i),
    CURRENT_TIMESTAMP - make_interval(days => 20 - i, hours => 10),
    CURRENT_TIMESTAMP - make_interval(days => 20 - i, hours => 8),
    schedule.location,
    CASE WHEN i <= 16 THEN 'FINISHED' ELSE 'SCHEDULED' END,
    CURRENT_TIMESTAMP - make_interval(days => 20 - i),
    CURRENT_TIMESTAMP - make_interval(days => 20 - i)
FROM generate_series(1, 20) AS series(i)
JOIN course_schedule schedule ON schedule.course_code = 'DEMO-C' || lpad(i::text, 3, '0');

INSERT INTO session_attendance (
    session_id,
    student_id,
    student_no,
    student_name,
    class_code,
    status,
    remark,
    recorded_by,
    recorded_at,
    created_at,
    updated_at
)
SELECT
    session.id,
    student.id,
    student.student_no,
    student.name,
    session.class_code,
    CASE i % 5 WHEN 0 THEN 'ABSENT' WHEN 1 THEN 'LATE' WHEN 2 THEN 'LEAVE' ELSE 'PRESENT' END,
    CASE i % 5 WHEN 0 THEN '[DEMO] 未签到' WHEN 1 THEN '[DEMO] 迟到 8 分钟' WHEN 2 THEN '[DEMO] 事假' ELSE '[DEMO] 正常出勤' END,
    1,
    CURRENT_TIMESTAMP - make_interval(days => 20 - i),
    CURRENT_TIMESTAMP - make_interval(days => 20 - i),
    CURRENT_TIMESTAMP - make_interval(days => 20 - i)
FROM generate_series(1, 20) AS series(i)
JOIN class_session session ON session.course_code = 'DEMO-C' || lpad(i::text, 3, '0')
JOIN student_profile student ON student.student_no = 'DEMO2026' || lpad(i::text, 4, '0');

-- 5. 考勤工单：20 条，覆盖待审核、处理中、已通过和已驳回。
INSERT INTO attendance_work_order (
    session_id,
    class_code,
    type,
    status,
    reason,
    target_session_date,
    target_start_time,
    target_end_time,
    target_location,
    applicant_id,
    reviewer_id,
    review_note,
    reviewed_at,
    created_at,
    updated_at
)
SELECT
    session.id,
    session.class_code,
    CASE i % 3 WHEN 0 THEN 'MAKEUP' WHEN 1 THEN 'EXCEPTION' ELSE 'ADJUSTMENT' END,
    CASE i % 4 WHEN 0 THEN 'PENDING' WHEN 1 THEN 'PROCESSING' WHEN 2 THEN 'APPROVED' ELSE 'REJECTED' END,
    format('[DEMO] 学生考勤记录需要%s处理', CASE i % 3 WHEN 0 THEN '补签' WHEN 1 THEN '异常核验' ELSE '更正' END),
    session.session_date,
    session.start_time,
    session.end_time,
    session.location,
    1,
    CASE WHEN i % 4 IN (2, 3) THEN 1 ELSE NULL END,
    CASE WHEN i % 4 = 2 THEN '[DEMO] 审核通过' WHEN i % 4 = 3 THEN '[DEMO] 材料不足，暂不通过' ELSE NULL END,
    CASE WHEN i % 4 IN (2, 3) THEN CURRENT_TIMESTAMP - make_interval(days => 18 - i) ELSE NULL END,
    CURRENT_TIMESTAMP - make_interval(days => 20 - i),
    CURRENT_TIMESTAMP - make_interval(days => 20 - i)
FROM generate_series(1, 20) AS series(i)
JOIN class_session session ON session.course_code = 'DEMO-C' || lpad(i::text, 3, '0');

-- 6. 学生工单/待办：20 条，覆盖信息补全、谈心谈话、风险跟进和材料审核。
INSERT INTO student_task (
    student_id,
    task_type,
    task_status,
    assignee_no,
    assignee_name,
    description,
    handle_note,
    handle_time,
    created_by,
    created_at,
    updated_by,
    updated_at
)
SELECT
    student.id,
    CASE i % 4 WHEN 0 THEN 'INFO_MISSING' WHEN 1 THEN 'TALK' WHEN 2 THEN 'RISK_FOLLOWUP' ELSE 'MATERIAL_REVIEW' END,
    i % 4,
    'DEMO-T' || lpad((((i - 1) % 3) + 1)::text, 3, '0'),
    (ARRAY['演示辅导员甲','演示辅导员乙','演示辅导员丙'])[((i - 1) % 3) + 1],
    format('[DEMO] %s：%s', student.name,
      CASE i % 4
        WHEN 0 THEN '补充联系方式和宿舍信息'
        WHEN 1 THEN '安排一次重点学生谈心谈话'
        WHEN 2 THEN '跟进近期考勤异常并记录处理结果'
        ELSE '审核学生提交的证明材料'
      END),
    CASE WHEN i % 4 >= 2 THEN '[DEMO] 已完成首轮核验' ELSE NULL END,
    CASE WHEN i % 4 >= 2 THEN CURRENT_TIMESTAMP - make_interval(days => 10 - i) ELSE NULL END,
    'demo-seed',
    CURRENT_TIMESTAMP - make_interval(days => 20 - i),
    CASE WHEN i % 4 >= 2 THEN 'demo-seed' ELSE NULL END,
    CURRENT_TIMESTAMP - make_interval(days => 20 - i)
FROM generate_series(1, 20) AS series(i)
JOIN student_profile student ON student.student_no = 'DEMO2026' || lpad(i::text, 4, '0');

COMMIT;

-- 输出各模块演示数据数量，便于验收。
SELECT '学生档案' AS module, COUNT(*) AS total FROM student_profile WHERE student_no LIKE 'DEMO2026%'
UNION ALL
SELECT '打卡活动', COUNT(*) FROM check_in_activity WHERE check_in_id LIKE 'DEMO-CI-%'
UNION ALL
SELECT '打卡记录', COUNT(*) FROM student_check_in_record WHERE check_in_id LIKE 'DEMO-CI-%'
UNION ALL
SELECT '打卡异常', COUNT(*) FROM check_in_exception WHERE check_in_id LIKE 'DEMO-CI-%'
UNION ALL
SELECT '课程考勤', COUNT(*) FROM course_schedule WHERE course_code LIKE 'DEMO-C%'
UNION ALL
SELECT '课次考勤', COUNT(*) FROM class_session WHERE course_code LIKE 'DEMO-C%'
UNION ALL
SELECT '学生考勤', COUNT(*) FROM session_attendance WHERE class_code LIKE 'DEMO-CLASS-%'
UNION ALL
SELECT '考勤工单', COUNT(*) FROM attendance_work_order WHERE class_code LIKE 'DEMO-CLASS-%'
UNION ALL
SELECT '学生待办', COUNT(*) FROM student_task WHERE description LIKE '[DEMO]%';
