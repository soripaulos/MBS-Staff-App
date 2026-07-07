export interface StudentGroup {
  name: string;
  student_group_name: string;
  program?: string;
  academic_year?: string;
  academic_term?: string | null;
  group_based_on?: string;
  custom_homeroom_teacher?: string | null;
  custom_homeroom?: string | null;
  disabled?: 0 | 1;
}

export interface GroupStudent {
  student: string;
  student_name: string;
  group_roll_number?: number;
  active?: 0 | 1;
}

export interface CourseScheduleRow {
  name: string;
  course: string;
  student_group: string;
  instructor?: string;
  instructor_name?: string;
  room?: string | null;
  schedule_date: string;
  from_time: string;
  to_time: string;
  class_schedule_color?: string | null;
  color?: string | null;
}

export interface SubjectResultRow {
  name: string;
  student: string;
  student_name: string;
  subject: string;
  student_group: string;
  exam: string;
  score: number;
  max_score: number;
  percentage: number;
  semester?: string;
  academic_year?: string;
  examiner?: string;
  docstatus?: number;
}

export interface TermReportRow {
  name: string;
  student: string;
  student_name: string;
  student_group: string;
  academic_term: string;
  academic_year?: string;
  term_average: number;
  rank_in_group: number;
}

export interface YearReportRow {
  name: string;
  student: string;
  student_name: string;
  student_group: string;
  academic_year: string;
  year_average: number;
  rank_in_group: number;
}

export interface StudentDoc {
  name: string;
  first_name?: string;
  student_name?: string;
  image?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  joining_date?: string | null;
  student_email_id?: string | null;
  custom_school_id?: string | null;
  custom_government_student_id?: string | null;
  custom_student_category?: string | null;
  custom_mode_of_transport?: string | null;
  enabled?: 0 | 1;
  guardians?: { guardian: string; guardian_name?: string; relation?: string }[];
  siblings?: Record<string, unknown>[];
}

export interface AttendanceRow {
  name: string;
  student: string;
  student_name?: string;
  student_group?: string;
  course_schedule?: string | null;
  date: string;
  status: "Present" | "Absent" | "Leave";
  docstatus?: number;
}

export interface NotificationLogRow {
  name: string;
  subject: string;
  email_content?: string | null;
  type?: string;
  document_type?: string | null;
  document_name?: string | null;
  read: 0 | 1;
  creation: string;
}

export interface AppNotificationRow {
  name: string;
  title: string;
  status: "Draft" | "Sent" | "Failed";
  sent_date?: string | null;
  notification_category: string;
  message: string;
  send_to_all_students?: 0 | 1;
  creation?: string;
}

export interface TeacherParentMessageRow {
  name: string;
  student?: string | null;
  student_group?: string | null;
  teacher?: string;
  message_date?: string | null;
  status: "Unread" | "Read" | "Responded";
  subject?: string | null;
  message?: string | null;
  parent_response?: string | null;
  parent_response_date?: string | null;
  teacher_followup?: string | null;
  teacher_followup_date?: string | null;
}

export interface AppealRow {
  name: string;
  student: string;
  student_name?: string;
  student_group?: string;
  academic_year?: string;
  semester?: string;
  subject?: string;
  exam?: string;
  original_score?: number;
  original_max_score?: number;
  reason?: string;
  attachment?: string | null;
  status: "Open" | "In Review" | "Resolved" | "Rejected";
  resolution?: string | null;
  creation?: string;
}

export interface LeaveApplicationRow {
  name: string;
  employee: string;
  employee_name?: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  total_leave_days?: number;
  status: string;
  description?: string | null;
  docstatus?: number;
}
