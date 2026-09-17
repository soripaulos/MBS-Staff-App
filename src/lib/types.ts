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
  custom_conversation?: MessageEntry[];
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

/** Teacher-raised request to change a submitted `Student Term Subject Result`. */
export interface ResultCorrectionRow {
  name: string;
  student_term_subject_result: string;
  student: string;
  student_name?: string;
  student_group?: string;
  subject?: string;
  exam?: string;
  semester?: string;
  academic_year?: string;
  original_score?: number;
  original_max_score?: number;
  correction_type?: string;
  corrected_score?: number;
  corrected_max_score?: number;
  reason?: string;
  attachment?: string | null;
  requested_by?: string;
  requested_on?: string;
  status: "Open" | "In Review" | "Applied" | "Rejected";
  reviewed_by?: string | null;
  reviewed_on?: string | null;
  resolution?: string | null;
}

export interface DisciplineIncidentRow {
  name: string;
  student: string;
  incident_date?: string;
  status: "Open" | "Closed";
  incident_type?: string;
  severity?: string;
  description?: string | null;
  reported_by?: string | null;
  parent_response?: string | null;
  resolution?: string | null;
  supporting_image?: string | null;
}

export interface StudentLeaveRow {
  name: string;
  student: string;
  student_name?: string;
  student_group?: string | null;
  from_date: string;
  to_date: string;
  total_leave_days?: number;
  reason?: string;
  mark_as_present?: 0 | 1;
  custom_status?: "Pending" | "Approved" | "Rejected" | null;
  custom_supporting_document?: string | null;
  docstatus?: number;
}

export interface LessonPlanObjective {
  name?: string;
  idx?: number;
  objective: string;
  outcome: "Not started" | "Partially achieved" | "Achieved";
  carry_forward?: 0 | 1;
  notes?: string | null;
}

export interface LessonPlanRow {
  name: string;
  title: string;
  course: string;
  student_group: string;
  instructor?: string | null;
  plan_date: string;
  course_schedule?: string | null;
  academic_year?: string | null;
  status: "Planned" | "Taught" | "Partially taught" | "Not taught" | "Carried forward";
  unit?: string | null;
  topic?: string | null;
  objectives?: LessonPlanObjective[];
  teaching_method?: string | null;
  activities?: string | null;
  materials?: string | null;
  assessment?: string | null;
  homework?: string | null;
  coverage?: number;
  reflection?: string | null;
  carried_from?: string | null;
  carried_to?: string | null;
}

export interface TodoRow {
  name: string;
  status: "Open" | "Closed" | "Cancelled";
  priority?: "Low" | "Medium" | "High";
  date?: string | null;
  allocated_to?: string | null;
  description?: string | null;
  reference_type?: string | null;
  reference_name?: string | null;
  assigned_by?: string | null;
  assigned_by_full_name?: string | null;
}

export interface StaffFeedbackRow {
  name: string;
  subject: string;
  category: string;
  status: "Open" | "In Review" | "Resolved" | "Closed";
  details?: string;
  raised_by?: string;
  raised_on?: string;
  response?: string | null;
  responded_by?: string | null;
}

/** One turn in a `Teacher Parent Message` conversation. */
export interface MessageEntry {
  name?: string;
  idx?: number;
  sender_type: "Teacher" | "Parent";
  sender?: string | null;
  sender_name?: string | null;
  sent_on?: string | null;
  content: string;
  seen?: 0 | 1;
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
