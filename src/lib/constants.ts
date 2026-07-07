/** Verified live values — tabStudent Term Subject Result.exam */
export const EXAMS = ["First Test", "Second Test", "Mid Exam", "Final Exam"] as const;
export type ExamName = (typeof EXAMS)[number];

/** Official max scores per the school's guide (display hints only; real max comes from data). */
export const EXAM_MAX: Record<ExamName, number> = {
  "First Test": 15,
  "Second Test": 15,
  "Mid Exam": 20,
  "Final Exam": 50,
};

export const NOTIFICATION_CATEGORIES = [
  "General",
  "Academic",
  "Announcements",
  "Urgent",
  "Fees",
  "Events",
  "Examinations",
] as const;

export const SICK_TYPES = ["Accident", "Headache", "Cough", "Stomach ache", "Fell down", "Other"] as const;
export const SICK_ACTIONS = ["Treated at the nurses office", "Parent not available", "Improved"] as const;
export const PERMISSION_REASONS = ["Sick", "Family Event", "Personal", "Suspension", "Other"] as const;
export const ATTENDANCE_STATUSES = ["Present", "Absent", "Leave"] as const;
