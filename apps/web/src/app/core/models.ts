export type Role = 'DIRECTOR' | 'ADMINISTRATOR' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';

export type Permission =
  | 'students.read'
  | 'students.write'
  | 'teachers.read'
  | 'teachers.write'
  | 'academics.read'
  | 'academics.write'
  | 'schedule.read'
  | 'schedule.write'
  | 'attendance.read'
  | 'attendance.write'
  | 'finance.read'
  | 'finance.write'
  | 'finance.approve'
  | 'exams.read'
  | 'exams.write'
  | 'exams.grade'
  | 'exams.approve'
  | 'documents.read'
  | 'documents.write'
  | 'reports.read'
  | 'announcements.read'
  | 'announcements.write'
  | 'privacy.read'
  | 'privacy.manage'
  | 'settings.manage'
  | 'portal.read'
  | 'platform.manage'
  | 'crm.read'
  | 'crm.write'
  | 'events.read'
  | 'events.write'
  | 'events.curate'
  | 'events.checkin'
  | 'inventory.read'
  | 'inventory.write'
  | 'inventory.loan'
  | 'inventory.maintain';

export type StudentStatus = 'ACTIVE' | 'INACTIVE' | 'GRADUATED' | 'ARCHIVED';
export type TeacherStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'WITHDRAWN' | 'CANCELLED';
export type LessonType = 'INDIVIDUAL' | 'GROUP' | 'ENSEMBLE';
export type LessonStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED';
export type SeriesStatus = 'ACTIVE' | 'PAUSED' | 'ENDED';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
export type ChargeStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';
export type ExamStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'GRADING'
  | 'PENDING_APPROVAL'
  | 'PUBLISHED'
  | 'ARCHIVED'
  | 'CANCELLED';
export type ExamOutcome = 'PASS' | 'FAIL' | 'PENDING';
export type ExamType = 'PERIODIC' | 'PROMOTION' | 'GRADUATION';
export type ExamCommitteeRole = 'PRESIDENT' | 'EXAMINER' | 'MEMBER';
export type ExamApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
export type DocumentStatus = 'DRAFT' | 'ISSUED' | 'ARCHIVED';
export type DocumentType =
  | 'REGISTRATION_FORM'
  | 'ATTENDANCE_CERTIFICATE'
  | 'GRADE_TRANSCRIPT'
  | 'DIPLOMA'
  | 'CERTIFICATE'
  | 'EXAM_RECORD'
  | 'OTHER';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unread?: number;
  summary?: AttendanceSummary;
  from?: string;
  to?: string;
  count?: number;
}

export interface DataResponse<T> {
  data: T[];
  meta?: PageMeta | null;
}

export interface TenantRef {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export type SupportGrantStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface SupportGrant {
  id: string;
  tenantId: string;
  reason: string;
  ticketRef: string | null;
  status: SupportGrantStatus;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  tenant: Pick<TenantRef, 'id' | 'name' | 'slug'>;
  actor?: { id: string; firstName: string; lastName: string; email: string };
}

export interface SupportSession {
  grant: SupportGrant;
  tenant: Pick<TenantRef, 'id' | 'name' | 'slug'>;
}

export interface Membership {
  id: string;
  tenantId: string;
  role: Role;
  branchId: string | null;
  tenant: TenantRef;
}

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  locale: string;
  isPlatformAdmin: boolean;
}

export interface Session {
  accessToken: string;
  user: SessionUser;
  memberships: Membership[];
  activeTenant: Membership | null;
  permissions: Permission[];
  requiresTenantSelection: boolean;
}

export interface TenantSelection {
  accessToken: string;
  activeTenant: Membership;
  permissions: Permission[];
}

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  isActive: boolean;
}

export interface AcademicYear {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
}

export interface Program {
  id: string;
  name: string;
  code: string;
  color: string | null;
  isActive: boolean;
}

export interface Level {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Room {
  id: string;
  branchId: string;
  name: string;
  capacity: number;
  isActive: boolean;
  branch?: Pick<Branch, 'id' | 'name'>;
}

export interface AcademicsOptions {
  branches: Branch[];
  years: AcademicYear[];
  programs: Program[];
  levels: Level[];
  rooms: Room[];
}

export interface Guardian {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  occupation: string | null;
}

export interface StudentGuardian {
  id: string;
  relationship: string | null;
  isPrimary: boolean;
  guardian: Guardian;
}

export interface TeacherRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface Enrollment {
  id: string;
  studentId: string;
  programId: string;
  levelId: string;
  academicYearId: string;
  branchId: string;
  teacherId: string | null;
  status: EnrollmentStatus;
  enrolledAt: string;
  endedAt: string | null;
  program?: Pick<Program, 'id' | 'name' | 'color'>;
  level?: Pick<Level, 'id' | 'name'>;
  academicYear?: Pick<AcademicYear, 'id' | 'name'>;
  teacher?: TeacherRef | null;
}

export interface Student {
  id: string;
  tenantId: string;
  userId: string | null;
  branchId: string;
  registrationNumber: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  status: StudentStatus;
  enrolledAt: string;
  consentData: boolean;
  consentMedia: boolean;
  branch?: Pick<Branch, 'id' | 'name' | 'code'>;
  enrollments?: Enrollment[];
  guardians?: StudentGuardian[];
  _count?: { guardians: number; attendances: number };
}

export interface AttendanceSummary {
  PRESENT: number;
  ABSENT: number;
  LATE: number;
  EXCUSED: number;
  total: number;
  rate?: number;
}

export interface Attendance {
  id: string;
  lessonId: string;
  studentId: string;
  status: AttendanceStatus;
  minutesLate: number | null;
  notes: string | null;
  markedAt: string;
  student?: Pick<Student, 'id' | 'firstName' | 'lastName' | 'registrationNumber'>;
  lesson?: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    status: LessonStatus;
    teacher?: Pick<TeacherRef, 'firstName' | 'lastName'>;
    lessonSeries?: { program?: Pick<Program, 'name' | 'color'> | null };
  };
  markedBy?: Pick<TeacherRef, 'firstName' | 'lastName'> | null;
}

export interface StudentDetail extends Student {
  guardians: StudentGuardian[];
  enrollments: Enrollment[];
  attendances: Attendance[];
  attendanceSummary: AttendanceSummary;
  financeSummary?: { billed: number; collected: number; outstanding: number } | null;
}

export interface Teacher {
  id: string;
  userId: string | null;
  employeeNo: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  specialties: string[];
  bio: string | null;
  status: TeacherStatus;
  _count?: { lessonSeries: number; enrollments: number };
  lessonSeries?: LessonSeries[];
}

export interface StudentRef {
  id: string;
  firstName: string;
  lastName: string;
  registrationNumber?: string;
}

export interface LessonSeries {
  id: string;
  branchId: string;
  roomId: string;
  teacherId: string;
  programId: string;
  levelId: string | null;
  type: LessonType;
  title: string;
  weekday: number;
  startTime: string;
  durationMinutes: number;
  validFrom: string;
  validTo: string | null;
  status: SeriesStatus;
  program?: Pick<Program, 'id' | 'name' | 'color'>;
  level?: Pick<Level, 'id' | 'name'> | null;
  branch?: Pick<Branch, 'id' | 'name' | 'code'>;
  room?: Pick<Room, 'id' | 'name'>;
  teacher?: TeacherRef;
  students?: { student: StudentRef }[];
  _count?: { students: number };
}

export interface Lesson {
  id: string;
  lessonSeriesId: string | null;
  branchId: string;
  roomId: string;
  teacherId: string;
  title: string;
  type: LessonType;
  startsAt: string;
  endsAt: string;
  status: LessonStatus;
  cancellationReason: string | null;
  originalStartsAt: string | null;
  branch?: Pick<Branch, 'id' | 'name' | 'code'>;
  room?: Pick<Room, 'id' | 'name'>;
  teacher?: TeacherRef;
  lessonSeries?: {
    id: string;
    title: string;
    type: LessonType;
    program?: Pick<Program, 'id' | 'name' | 'code' | 'color'> | null;
    level?: Pick<Level, 'id' | 'name'> | null;
  } | null;
  students?: { studentId: string; student?: StudentRef }[];
  attendances?: { studentId: string; status: AttendanceStatus; minutesLate: number | null }[];
  _count?: { students?: number; notes: number };
}

export interface LessonNote {
  id: string;
  content: string;
  createdAt: string;
  author: TeacherRef;
}

export interface LessonRoster {
  lesson: Lesson & { notes: LessonNote[] };
  students: { student: StudentRef; attendance: Attendance | null }[];
  summary: AttendanceSummary;
}

export interface ScheduleOptions {
  branches: Branch[];
  rooms: Room[];
  teachers: { id: string; firstName: string; lastName: string; specialties: string[] }[];
  programs: Program[];
  levels: Level[];
  years: AcademicYear[];
  activeYear: AcademicYear | null;
}

export interface Announcement {
  id: string;
  authorId: string;
  branchId: string | null;
  audienceRoles: Role[];
  title: string;
  body: string;
  isPinned: boolean;
  publishedAt: string;
  author?: Pick<TeacherRef, 'firstName' | 'lastName'>;
  branch?: Pick<Branch, 'id' | 'name'> | null;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ChargePayment {
  id: string;
  amount: string | number;
  amountCents: number;
  receiptNumber: string;
  status: 'POSTED' | 'VOIDED';
  method: PaymentMethod;
  paidAt: string;
  reference: string | null;
  notes: string | null;
}

export interface Charge {
  id: string;
  description: string;
  period: string | null;
  amount: string | number;
  amountCents: number;
  grossAmountCents?: number;
  discountAmountCents?: number;
  dueDate: string;
  origin?: string;
  installmentNo?: number | null;
  installmentCount?: number | null;
  status: ChargeStatus;
  payments?: ChargePayment[];
  allocations?: ChargePayment[];
  paidAmount: number;
  paidAmountCents?: number;
  balance: number;
  balanceCents?: number;
}

export interface PaymentAllocation {
  id?: string;
  paymentId?: string;
  chargeId?: string;
  amountCents: number;
  charge?: { id?: string; description: string; period?: string | null } | null;
}

export interface Payment {
  id: string;
  receiptNumber: string;
  amount: string | number;
  amountCents: number;
  status: 'POSTED' | 'VOIDED';
  method: PaymentMethod;
  paidAt: string;
  reference: string | null;
  notes: string | null;
  student?: StudentRef;
  charge?: { id?: string; description: string; period?: string | null } | null;
  allocations?: PaymentAllocation[];
}

export interface FinanceOverview {
  totals: {
    billedCents: number;
    collectedCents: number;
    outstandingCents: number;
    overdueCents: number;
    billed: number;
    collected: number;
    outstanding: number;
    overdue: number;
    collectionRate: number;
    studentsWithBalance: number;
  };
  monthly: {
    month: string;
    billedCents: number;
    collectedCents: number;
    billed: number;
    collected: number;
  }[];
  topDebtors: {
    studentId: string;
    balanceCents: number;
    balance: number;
    student: StudentRef;
  }[];
  recentPayments: Payment[];
}

export interface StudentLedger {
  student: StudentRef;
  summary: {
    billedCents: number;
    collectedCents: number;
    outstandingCents: number;
    billed: number;
    collected: number;
    outstanding: number;
  };
  charges: Charge[];
  payments: Payment[];
}

export interface ExamPeriod {
  id: string;
  academicYearId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: 'PLANNED' | 'OPEN' | 'CLOSED';
  academicYear?: Pick<AcademicYear, 'id' | 'name'>;
  _count?: { exams: number };
}

export interface Exam {
  id: string;
  programId: string;
  levelId: string | null;
  periodId?: string | null;
  title: string;
  type: ExamType;
  examDate: string;
  gradingDeadline?: string | null;
  location: string | null;
  status: ExamStatus;
  notes: string | null;
  publishedAt?: string | null;
  program?: Pick<Program, 'id' | 'name' | 'color'>;
  level?: Pick<Level, 'id' | 'name'> | null;
  period?: Pick<ExamPeriod, 'id' | 'name' | 'startsOn' | 'endsOn'> | null;
  averageGrade: number | null;
  passed: number;
  participation: number;
  approved?: number;
  publishedResults?: number;
  pendingApplications?: number;
  committeeSize?: number;
  hasMinutes?: boolean;
  documents?: { id: string; title: string; protocolNumber: string | null; status: DocumentStatus }[];
  _count?: { results: number; applications?: number; committee?: number; documents?: number };
}

export interface ExamResult {
  id: string;
  examId: string;
  studentId: string;
  grade: string | number | null;
  outcome: ExamOutcome;
  submittedAt?: string | null;
  approvedAt?: string | null;
  publishedAt: string | null;
  notes: string | null;
  student?: StudentRef;
  exam?: Exam & { program?: Pick<Program, 'name' | 'color'>; level?: Pick<Level, 'name'> | null };
}

export interface ExamCommitteeMember {
  id: string;
  examId: string;
  teacherId: string;
  role: ExamCommitteeRole;
  teacher: Pick<TeacherRef, 'id' | 'firstName' | 'lastName'> & { specialties?: string[] };
}

export interface ExamApplication {
  id: string;
  examId: string;
  studentId: string;
  status: ExamApplicationStatus;
  notes: string | null;
  decisionNotes: string | null;
  createdAt: string;
  decidedAt: string | null;
  student: StudentRef;
  decidedBy?: Pick<TeacherRef, 'firstName' | 'lastName'> | null;
}

export interface ExamRosterRow {
  student: StudentRef;
  eligible: boolean;
  application: ExamApplication | null;
  result: ExamResult | null;
}

export interface ExamRoster {
  exam: Exam & { committee: ExamCommitteeMember[] };
  students: ExamRosterRow[];
  summary: { eligible: number; graded: number; approved: number; published: number };
}

export interface DocumentTemplate {
  key: string;
  title: string;
  type: DocumentType;
  default: boolean;
}

export interface DocumentRecord {
  id: string;
  studentId: string | null;
  examId?: string | null;
  type: DocumentType;
  title: string;
  referenceNumber?: string | null;
  protocolNumber?: string | null;
  templateKey?: string | null;
  templateVersion?: number | null;
  fileName: string | null;
  issuedAt: string | null;
  issuedBy?: Pick<TeacherRef, 'firstName' | 'lastName'> | null;
  preparedBy?: Pick<TeacherRef, 'firstName' | 'lastName'> | null;
  approvedBy?: Pick<TeacherRef, 'firstName' | 'lastName'> | null;
  approvedAt?: string | null;
  version?: number | null;
  status: DocumentStatus;
  signatureStatus?: string;
  notes: string | null;
  student?: StudentRef;
  exam?: { id: string; title: string; examDate: string } | null;
}

export interface DocumentsStats {
  total: number;
  issued: number;
  draft: number;
  archived: number;
  activeStudents: number;
  documentedStudents: number;
  studentsWithoutDocuments: number;
  coverage: number;
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  taxId: string | null;
  timezone: string;
  locale: string;
  status: string;
  logoUrl: string | null;
  subscription: {
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    plan: {
      code: string;
      name: string;
      priceMonthly: string;
      maxStudents: number;
      maxTeachers: number;
      features: Record<string, boolean>;
    };
  } | null;
  branches: Branch[];
  _count: { students: number; teachers: number; memberships: number };
  usage: {
    students: number;
    teachers: number;
    members: number;
    maxStudents: number;
    maxTeachers: number;
  };
}

export interface DashboardLesson extends Lesson {
  _count?: { students?: number; notes: number };
}

export interface DirectorDashboard {
  role: 'DIRECTOR';
  generatedAt: string;
  stats: {
    activeStudents: number;
    activeTeachers: number;
    attendanceRate: number | null;
    attendanceMarked: number;
    collected: number;
    outstanding: number;
    overdue: number;
    overdueCount: number;
    collectionRate: number;
  };
  enrollmentTrend: { month: string; count: number }[];
  todayLessons: DashboardLesson[];
  branchBreakdown: { id: string; name: string; code: string; students: number; series: number; rooms: number }[];
  finance: Pick<FinanceOverview, 'monthly' | 'topDebtors' | 'recentPayments'>;
  atRiskStudents: {
    id: string;
    firstName: string;
    lastName: string;
    registrationNumber: string;
    rate: number;
    absences: number;
    total: number;
  }[];
  recentAnnouncements: Announcement[];
}

export interface AdministratorDashboard {
  role: 'ADMINISTRATOR';
  generatedAt: string;
  stats: {
    lessonsToday: number;
    unmarkedPast: number;
    newStudentsThisMonth: number;
    overdueCharges: number;
    outstanding: number;
    studentsWithBalance: number;
  };
  todayLessons: DashboardLesson[];
  topDebtors: FinanceOverview['topDebtors'];
  recentPayments: Payment[];
  recentAnnouncements: Announcement[];
}

export interface TeacherDashboard {
  role: 'TEACHER';
  generatedAt: string;
  teacher: Pick<Teacher, 'id' | 'firstName' | 'lastName' | 'title' | 'specialties'> | null;
  stats: {
    lessonsToday: number;
    lessonsThisWeek: number;
    hoursThisWeek: number;
    assignedStudents: number;
    unmarkedPast: number;
    attendanceRate: number | null;
  };
  todayLessons: DashboardLesson[];
  weekLessons: DashboardLesson[];
  attendanceHighlights: {
    id: string;
    firstName: string;
    lastName: string;
    registrationNumber: string;
    rate: number;
    absences: number;
  }[];
  recentAnnouncements: Announcement[];
}

export interface StudentDashboard {
  role: 'STUDENT';
  generatedAt: string;
  student:
    | (Student & {
        branch?: Pick<Branch, 'id' | 'name'>;
        enrollments?: Enrollment[];
      })
    | null;
  stats: {
    attendanceRate: number | null;
    attendanceTotal: number;
    outstanding: number;
    unread: number;
  };
  nextLesson: DashboardLesson | null;
  weekLessons: DashboardLesson[];
  recentAttendance: (Attendance & { lesson?: { id: string; title: string; startsAt: string } })[];
  latestResults: ExamResult[];
  recentAnnouncements: Announcement[];
}

export type DashboardData =
  | DirectorDashboard
  | AdministratorDashboard
  | TeacherDashboard
  | StudentDashboard
  | GuardianDashboard;

export interface GuardianDashboard {
  role: 'GUARDIAN';
  generatedAt: string;
  children: StudentDashboard[];
}

export interface PortalChild {
  id: string;
  firstName: string;
  lastName: string;
  registrationNumber: string;
  birthDate: string | null;
  branch?: Pick<Branch, 'id' | 'name' | 'city'>;
  enrollments?: Enrollment[];
}

export interface PortalOverview {
  student: PortalChild;
  nextLesson: DashboardLesson | null;
  attendance: { total: number; rate: number | null };
  finance: { outstandingCents: number; outstanding: number };
  latestResults: ExamResult[];
}

export interface PortalProfile extends Omit<Student, 'branch'> {
  branch?: Pick<Branch, 'id' | 'name' | 'city'>;
  guardians: StudentGuardian[];
  enrollments: Enrollment[];
}

export interface PortalFinance {
  summary: {
    billedCents: number;
    collectedCents: number;
    outstandingCents: number;
    billed: number;
    collected: number;
    outstanding: number;
  };
  charges: Charge[];
  payments: Payment[];
}

export interface PlatformOverview {
  totals: {
    tenants: number;
    activeTenants: number;
    trialTenants: number;
    suspendedTenants: number;
    students: number;
    teachers: number;
    users: number;
    mrr: number;
  };
  subscriptions: {
    tenantId: string;
    tenantName: string;
    tenantStatus: string;
    status: string;
    plan: string;
    priceMonthly: number;
    seatsUsed: number;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  }[];
}

export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  plan: {
    code: string;
    name: string;
    priceMonthly: number;
    status: string;
    seatsUsed: number;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  } | null;
  usage: {
    students: number;
    teachers: number;
    members: number;
    branches: number;
    lessons: number;
    maxStudents: number;
    maxTeachers: number;
    studentUtilization: number;
    teacherUtilization: number;
  };
  branches?: { id: string; name: string; code: string; city: string | null }[];
}

export interface PlatformTenantDetail extends PlatformTenant {
  legalName?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  members?: { id: string; role: Role; user: { firstName: string; lastName: string; email: string } }[];
}

export type AssignmentStatusModel = 'ACTIVE' | 'CLOSED' | 'CANCELLED';
export type SubmissionStatusModel = 'SUBMITTED' | 'GRADED' | 'RETURNED';

export interface AssignmentSubmission {
  id: string;
  status: SubmissionStatusModel;
  content: string | null;
  submittedAt: string | null;
  grade: number | null;
  feedback: string | null;
  gradedAt: string | null;
  student?: StudentRef;
  gradedBy?: { id: string; firstName: string; lastName: string } | null;
}
export interface Assignment {
  id: string;
  title: string;
  description: string | null;
  assignedOn: string;
  dueAt: string | null;
  status: AssignmentStatusModel;
  program?: { id: string; name: string; color?: string | null } | null;
  teacher?: { id: string; firstName: string; lastName: string } | null;
  lessonSeries?: { id: string; title: string } | null;
  targetCount?: number;
  gradedCount?: number;
  targets?: {
    id: string;
    student: { id: string; firstName: string; lastName: string; registrationNumber: string };
  }[];
  submissions?: AssignmentSubmission[];
}
export interface PortalAssignment {
  id: string;
  title: string;
  description: string | null;
  assignedOn: string;
  dueAt: string | null;
  program?: { id: string; name: string; color?: string | null } | null;
  teacher?: { id: string; firstName: string; lastName: string } | null;
  submission: AssignmentSubmission | null;
}

export type LeadStage =
  | 'NEW'
  | 'CONTACTED'
  | 'TRIAL_BOOKED'
  | 'TRIAL_COMPLETED'
  | 'OFFER_SENT'
  | 'ENROLLED'
  | 'LOST';

export type LeadSource =
  | 'WEB_FORM'
  | 'PHONE'
  | 'WALK_IN'
  | 'REFERRAL'
  | 'CAMPAIGN'
  | 'SOCIAL'
  | 'OTHER';

export type LeadActivityType =
  | 'NOTE'
  | 'CALL'
  | 'EMAIL'
  | 'MEETING'
  | 'STAGE_CHANGE'
  | 'TRIAL_SCHEDULED'
  | 'FOLLOW_UP'
  | 'CONVERSION';

export interface LeadActivity {
  id: string;
  tenantId: string;
  leadId: string;
  actorId: string | null;
  type: LeadActivityType;
  fromStage: LeadStage | null;
  toStage: LeadStage | null;
  body: string | null;
  createdAt: string;
  actor?: {
    id: string;
    email: string;
  } | null;
}

export interface Lead {
  id: string;
  tenantId: string;
  branchId: string;
  studentFirstName: string;
  studentLastName: string;
  birthDate: string | null;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  relationship: string | null;
  source: LeadSource;
  stage: LeadStage;
  programId: string | null;
  notes: string | null;
  assignedToId: string | null;
  nextFollowUpAt: string | null;
  lostReason: string | null;
  consentAt: string | null;
  convertedStudentId: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
  branch?: { id: string; name: string; code: string };
  program?: { id: string; name: string; color?: string | null };
  assignedTo?: { id: string; email: string };
  activities?: LeadActivity[];
}


export type EventType =
  | 'CONCERT'
  | 'RECITAL'
  | 'MASTERCLASS'
  | 'AUDITION'
  | 'EXAM_SESSION'
  | 'WORKSHOP'
  | 'COMPETITION';

export type EventStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type PerformanceStatus =
  | 'PROPOSED'
  | 'CONFIRMED'
  | 'STANDBY'
  | 'PERFORMED'
  | 'WITHDRAWN';

export type RegistrationStatus =
  | 'REGISTERED'
  | 'WAITLISTED'
  | 'CHECKED_IN'
  | 'CANCELLED'
  | 'NO_SHOW';

export type RsvpStatus = 'ATTENDING' | 'DECLINED' | 'TENTATIVE';

export type AssetCategory =
  | 'GRAND_PIANO'
  | 'UPRIGHT_PIANO'
  | 'DIGITAL_PIANO'
  | 'STRING_INSTRUMENT'
  | 'WOODWIND'
  | 'BRASS'
  | 'PERCUSSION'
  | 'PLUCKED_STRING'
  | 'AUDIO_EQUIPMENT'
  | 'STAGE_ACCESSORY';

export type AssetCondition =
  | 'PRISTINE'
  | 'EXCELLENT'
  | 'GOOD'
  | 'FAIR'
  | 'POOR'
  | 'NEEDS_REPAIR'
  | 'UNUSABLE';

export type AssetStatus =
  | 'AVAILABLE'
  | 'IN_USE_STUDIO'
  | 'ON_LOAN'
  | 'RESERVED_EVENT'
  | 'IN_MAINTENANCE'
  | 'DECOMMISSIONED'
  | 'LOST';

export type LoanStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'RETURN_OVERDUE'
  | 'RETURNED'
  | 'DAMAGED_RETURN'
  | 'LOST';

export type MaintenanceType =
  | 'PIANO_TUNING'
  | 'VOICING_REGULATION'
  | 'RESTRINGING'
  | 'LUTHIER_REPAIR'
  | 'PAD_REPLACEMENT'
  | 'CLEANING_OVERHAUL'
  | 'ELECTRICAL_SAFETY'
  | 'ROUTINE_INSPECTION';

export type MaintenanceStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface EventPerformance {
  id: string;
  tenantId: string;
  eventId: string;
  orderIndex: number;
  part: number;
  studentId: string | null;
  teacherId: string | null;
  accompanistTeacherId: string | null;
  performerDisplayName: string;
  pieceTitle: string;
  composer: string;
  movement: string | null;
  durationSeconds: number;
  actualDurationSeconds: number | null;
  stageNotes: string | null;
  status: PerformanceStatus;
  isEnsemble: boolean;
  ensembleName: string | null;
  additionalPerformerIds: string[];
  stagePosition: string | null;
  createdAt: string;
  updatedAt: string;
  student?: { id: string; firstName: string; lastName: string; registrationNumber: string } | null;
  teacher?: { id: string; firstName: string; lastName: string } | null;
  accompanistTeacher?: { id: string; firstName: string; lastName: string } | null;
}

export interface EventRegistration {
  id: string;
  tenantId: string;
  eventId: string;
  studentId: string | null;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone: string | null;
  ticketCode: string;
  seatNumber: string | null;
  isVip: boolean;
  ticketCount: number;
  rsvpStatus: RsvpStatus;
  status: RegistrationStatus;
  checkedInAt: string | null;
  checkInNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventItem {
  id: string;
  tenantId: string;
  branchId: string;
  roomId: string | null;
  academicYearId: string | null;
  title: string;
  slug: string;
  eventType: EventType;
  status: EventStatus;
  description: string | null;
  startsAt: string;
  endsAt: string;
  doorsOpenAt: string | null;
  maxCapacity: number;
  isPublic: boolean;
  requiresRegistration: boolean;
  ticketPriceCents: number;
  programNotes: string | null;
  intermissionDurationMinutes: number;
  protocolNumber: string | null;
  createdAt: string;
  updatedAt: string;
  branch?: { id: string; name: string; code: string };
  room?: { id: string; name: string; capacity: number } | null;
  performances?: EventPerformance[];
  registrations?: EventRegistration[];
  _count?: {
    performances: number;
    registrations: number;
  };
}

export interface AssetLoan {
  id: string;
  tenantId: string;
  assetId: string;
  studentId: string;
  guardianId: string | null;
  loanDate: string;
  expectedReturnDate: string;
  returnedAt: string | null;
  loanFeeCents: number;
  depositCents: number;
  depositReturned: boolean;
  agreementSigned: boolean;
  protocolNumber: string | null;
  checkoutCondition: AssetCondition;
  checkoutAccessories: string[];
  checkoutNotes: string | null;
  returnCondition: AssetCondition | null;
  returnAccessories: string[];
  returnNotes: string | null;
  damageFeeCents: number;
  status: LoanStatus;
  createdAt: string;
  updatedAt: string;
  student?: { id: string; firstName: string; lastName: string; registrationNumber: string };
  guardian?: { id: string; firstName: string; lastName: string; phone: string | null } | null;
  asset?: { id: string; assetTag: string; manufacturer: string; model: string };
}

export interface AssetMaintenance {
  id: string;
  tenantId: string;
  assetId: string;
  maintenanceType: MaintenanceType;
  technicianName: string;
  technicianCompany: string | null;
  technicianPhone: string | null;
  costCents: number;
  serviceDate: string;
  nextServiceDue: string | null;
  pitchMeasuredHz: number | null;
  pitchLeftHz: number | null;
  humidityPercentage: number | null;
  temperatureCelsius: number | null;
  workPerformed: string;
  notes: string | null;
  invoiceNumber: string | null;
  status: MaintenanceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  tenantId: string;
  branchId: string;
  studioRoomId: string | null;
  assetTag: string;
  category: AssetCategory;
  manufacturer: string;
  model: string;
  serialNumber: string | null;
  manufactureYear: number | null;
  condition: AssetCondition;
  status: AssetStatus;
  purchaseDate: string | null;
  purchaseCostCents: number | null;
  replacementValueCents: number | null;
  insurancePolicyNo: string | null;
  isLoanable: boolean;
  maxLoanDays: number;
  requiresTuning: boolean;
  lastTunedAt: string | null;
  nextTuningDueAt: string | null;
  tuningIntervalDays: number | null;
  pitchStandardHz: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  branch?: { id: string; name: string; code: string };
  studioRoom?: { id: string; name: string } | null;
  loans?: AssetLoan[];
  maintenance?: AssetMaintenance[];
}

export interface MyDataTransmission {
  id: string;
  tenantId: string;
  paymentId: string | null;
  chargeId: string | null;
  invoiceType: string;
  series: string;
  aa: string;
  issueDate: string;
  mark: string | null;
  uid: string | null;
  qrCodeUrl: string | null;
  vatExemptionCategory: number;
  totalNetCents: number;
  totalVatCents: number;
  totalGrossCents: number;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  currency: string;
  statusCode: string;
  counterpartyTaxId: string | null;
  counterpartyName: string | null;
  payloadXml: string | null;
  errorDetails?: string | null;
  transmittedAt: string;
  payment?: {
    id: string;
    receiptNumber: string;
    amountCents: number;
    paidAt: string;
    method: string;
  } | null;
}

export interface SubscriptionInvoice {
  id: string;
  subscriptionId: string;
  externalId: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  status: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE';
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  subscription?: {
    tenant: { id: string; name: string; status: string };
    plan: { id: string; name: string; code: string };
  };
  payments?: Array<{
    id: string;
    amountCents: number;
    status: 'SUCCEED' | 'FAILED' | 'PENDING';
    method: string | null;
    attemptedAt: string;
    failureCode?: string | null;
  }>;
}

export interface BillingMetrics {
  mrr: number;
  arr: number;
  totalInvoiced: number;
  totalCollected: number;
  totalOverdue: number;
  paidInvoicesCount: number;
  openInvoicesCount: number;
  pastDueSubscriptionsCount: number;
  activeSubscriptionsCount: number;
}

