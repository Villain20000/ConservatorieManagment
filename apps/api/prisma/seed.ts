import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { eachDayOfInterval, format, getDay } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import {
  AssignmentStatus,
  ChargeStatus,
  DocumentStatus,
  DocumentType,
  EnrollmentStatus,
  ExamOutcome,
  ExamStatus,
  ExamType,
  InstallmentPlanStatus,
  LessonStatus,
  LessonType,
  MembershipRole,
  NotificationType,
  NumberScope,
  PaymentMethod,
  PaymentStatus,
  ScholarshipStatus,
  ScholarshipType,
  SeriesStatus,
  StudentStatus,
  SubmissionStatus,
  SubscriptionStatus,
  TeacherStatus,
  TenantStatus,
  UserStatus,
} from '../src/generated/prisma/enums.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

const TIMEZONE = 'Europe/Athens';
const DEMO_PASSWORD = 'MusicOS2026!';
const NOW = new Date();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const firstNames = [
  'Μαρίνα', 'Νικόλαος', 'Ελένη', 'Γιώργος', 'Σοφία', 'Δημήτρης', 'Άννα', 'Κωνσταντίνος',
  'Ιωάννα', 'Παναγιώτης', 'Αικατερίνη', 'Βασίλης', 'Χριστίνα', 'Αλέξανδρος', 'Μαρία', 'Θωμάς',
  'Δέσποινα', 'Στέφανος', 'Ευαγγελία', 'Μιχάλης', 'Καλλιόπη', 'Ανδρέας', 'Φωτεινή', 'Λουκάς',
  'Ειρήνη', 'Σπύρος', 'Ναταλία', 'Πέτρος', 'Ευθυμία', 'Άγγελος', 'Ζωή', 'Ραφαήλ',
];
const lastNames = [
  'Παπαδοπούλου', 'Νικολάου', 'Ιωάννου', 'Κωνσταντίνου', 'Αντωνίου', 'Βασιλείου',
  'Δημητρίου', 'Γεωργίου', 'Μιχαηλίδης', 'Οικονόμου', 'Παπαδάκη', 'Σταυρόπουλος',
  'Αθανασίου', 'Χατζής', 'Λαμπρόπουλος', 'Καρράς', 'Μακρής', 'Σαμαράς', 'Τσιμπούκης',
  'Ρήγας', 'Φωτίου', 'Θεοδώρου', 'Σπανός', 'Αλεξίου', 'Πετρίδης', 'Μανωλάκης',
  'Βλάχος', 'Δούκας', 'Τσακίρης', 'Καραγιάννης', 'Λύρας', 'Ξενάκης',
];

const programSeed = [
  { name: 'Πιάνο', code: 'PIANO', color: '#B08A4F', fee: 120 },
  { name: 'Βιολί', code: 'VIOLIN', color: '#6C8A7A', fee: 110 },
  { name: 'Φωνητική', code: 'VOICE', color: '#A56C7A', fee: 100 },
  { name: 'Θεωρία', code: 'THEORY', color: '#6A7896', fee: 60 },
  { name: 'Κιθάρα', code: 'GUITAR', color: '#9A7B4F', fee: 100 },
];
const levelNames = ['Προκαταρκτική', 'Κατωτέρα', 'Μέση', 'Ανωτέρα', 'Δίπλωμα'];
const startTimes = ['15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

const teacherSeed = [
  { first: 'Ελένη', last: 'Παπαδοπούλου', specialty: 'Πιάνο', program: 'PIANO' },
  { first: 'Γιώργος', last: 'Νικολάου', specialty: 'Βιολί', program: 'VIOLIN' },
  { first: 'Μαρία', last: 'Ιωάννου', specialty: 'Φωνητική', program: 'VOICE' },
  { first: 'Δημήτρης', last: 'Κωνσταντίνου', specialty: 'Θεωρία', program: 'THEORY' },
  { first: 'Σοφία', last: 'Αντωνίου', specialty: 'Κιθάρα', program: 'GUITAR' },
  { first: 'Νίκος', last: 'Βασιλείου', specialty: 'Πιάνο', program: 'PIANO' },
  { first: 'Άννα', last: 'Δημητρίου', specialty: 'Βιολί', program: 'VIOLIN' },
  { first: 'Αλέξανδρος', last: 'Μιχαηλίδης', specialty: 'Θεωρία', program: 'THEORY' },
];

function dateAtUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function athensDateTime(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, TIMEZONE);
}

function monthRange(startYear: number, startMonth: number, count: number) {
  const months: { year: number; month: number; label: string }[] = [];
  for (let i = 0; i < count; i += 1) {
    const monthIndex = (startMonth - 1 + i) % 12;
    const year = startYear + Math.floor((startMonth - 1 + i) / 12);
    months.push({ year, month: monthIndex + 1, label: `${year}-${String(monthIndex + 1).padStart(2, '0')}` });
  }
  return months;
}

function isoDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

async function main() {
  console.log('Resetting demo data...');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      outbox_messages, number_sequences, stored_files, payment_allocations, installment_plans,
      scholarships, document_records, exam_committee_members, exam_applications, exam_results,
      exam_periods, exams, payments, charges, notifications,
      announcements, lesson_notes, attendances, lesson_students, lessons,
      lesson_series_students, lesson_series, enrollments, student_guardians,
      assignment_submissions, assignment_targets, assignments,
      guardians, students, teachers, rooms, levels, programs, academic_years,
      refresh_tokens, memberships, branches, subscriptions, audit_logs, tenants,
      plans, users
    RESTART IDENTITY CASCADE;
  `);

  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const plans = await Promise.all([
    prisma.plan.create({
      data: {
        code: 'starter',
        name: 'Starter',
        priceMonthly: 39,
        maxStudents: 75,
        maxTeachers: 5,
        features: { finance: false, exams: false, portals: true },
      },
    }),
    prisma.plan.create({
      data: {
        code: 'professional',
        name: 'Professional',
        priceMonthly: 89,
        maxStudents: 300,
        maxTeachers: 25,
        features: { finance: true, exams: true, portals: true },
      },
    }),
    prisma.plan.create({
      data: {
        code: 'enterprise',
        name: 'Enterprise',
        priceMonthly: 199,
        maxStudents: 2000,
        maxTeachers: 100,
        features: { finance: true, exams: true, portals: true, multiBranch: true },
      },
    }),
  ]);

  const [starter, professional] = plans;

  const superAdmin = await prisma.user.create({
    data: {
      email: 'superadmin@musicos.test',
      passwordHash,
      firstName: 'MusicOS',
      lastName: 'Admin',
      isPlatformAdmin: true,
      locale: 'el',
      status: UserStatus.ACTIVE,
    },
  });

  const directorUser = await prisma.user.create({
    data: {
      email: 'director@armonia.test',
      passwordHash,
      firstName: 'Κατερίνα',
      lastName: 'Λεονταρίδου',
      phone: '210 3612 400',
      locale: 'el',
      status: UserStatus.ACTIVE,
    },
  });
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@armonia.test',
      passwordHash,
      firstName: 'Βίκυ',
      lastName: 'Σταματοπούλου',
      phone: '210 3612 401',
      locale: 'el',
      status: UserStatus.ACTIVE,
    },
  });
  const teacherUser = await prisma.user.create({
    data: {
      email: 'teacher@armonia.test',
      passwordHash,
      firstName: 'Ελένη',
      lastName: 'Παπαδοπούλου',
      phone: '697 400 1001',
      locale: 'el',
      status: UserStatus.ACTIVE,
    },
  });
  const studentUser = await prisma.user.create({
    data: {
      email: 'student@armonia.test',
      passwordHash,
      firstName: 'Μαρίνα',
      lastName: 'Φωτίου',
      phone: '698 200 2002',
      locale: 'el',
      status: UserStatus.ACTIVE,
    },
  });
  const guardianUser = await prisma.user.create({
    data: {
      email: 'guardian@armonia.test',
      passwordHash,
      firstName: 'Νίκη',
      lastName: 'Φωτίου',
      phone: '690 111 1000',
      locale: 'el',
      status: UserStatus.ACTIVE,
    },
  });
  const melodiaDirectorUser = await prisma.user.create({
    data: {
      email: 'director@melodia.test',
      passwordHash,
      firstName: 'Παύλος',
      lastName: 'Ροντήρης',
      phone: '261 022 3400',
      locale: 'el',
      status: UserStatus.ACTIVE,
    },
  });
  const multiUser = await prisma.user.create({
    data: {
      email: 'multi@musicos.test',
      passwordHash,
      firstName: 'Αλέξανδρος',
      lastName: 'Μιχαηλίδης',
      phone: '694 500 5005',
      locale: 'el',
      status: UserStatus.ACTIVE,
    },
  });
  // A suspended tenant, so suspension behaviour can be exercised end to end.
  const dokimiDirectorUser = await prisma.user.create({
    data: {
      email: 'director@dokimi.test',
      passwordHash,
      firstName: 'Ελένη',
      lastName: 'Σταύρου',
      phone: '231 044 5500',
      locale: 'el',
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.user.create({
    data: {
      email: 'marina.parent@example.test',
      passwordHash,
      firstName: 'Ελένη',
      lastName: 'Φωτίου',
      phone: '690 111 1111',
      locale: 'el',
      status: UserStatus.INACTIVE,
    },
  }).catch(() => undefined);

  const armonia = await prisma.tenant.create({
    data: {
      name: 'Ωδείο Αρμονία',
      slug: 'armonia',
      legalName: 'Ωδείο Αρμονία Αστική Μη Κερδοσκοπική Εταιρεία',
      taxId: '801234567',
      status: TenantStatus.ACTIVE,
      locale: 'el',
      timezone: TIMEZONE,
    },
  });
  const melodia = await prisma.tenant.create({
    data: {
      name: 'Ωδείο Μελωδία',
      slug: 'melodia',
      legalName: 'Ωδείο Μελωδία Ι.Κ.Ε.',
      taxId: '802345678',
      status: TenantStatus.TRIAL,
      locale: 'el',
      timezone: TIMEZONE,
    },
  });

  const dokimi = await prisma.tenant.create({
    data: {
      name: 'Ωδείο Δοκιμή',
      slug: 'dokimi',
      legalName: 'Ωδείο Δοκιμή Ο.Ε.',
      taxId: '803456789',
      status: TenantStatus.SUSPENDED,
      suspendedAt: dateAtUtc('2026-09-15'),
      suspensionReason: 'trial_expired',
      locale: 'el',
      timezone: TIMEZONE,
    },
  });

  await prisma.subscription.createMany({
    data: [
      {
        tenantId: armonia.id,
        planId: professional.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: dateAtUtc('2027-09-01'),
      },
      {
        tenantId: melodia.id,
        planId: starter.id,
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: dateAtUtc('2026-12-01'),
        currentPeriodEnd: dateAtUtc('2026-12-01'),
      },
      {
        tenantId: dokimi.id,
        planId: starter.id,
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: dateAtUtc('2026-09-01'),
        currentPeriodEnd: dateAtUtc('2026-09-01'),
      },
    ],
  });

  const armoniaAth = await prisma.branch.create({
    data: {
      tenantId: armonia.id,
      name: 'Κεντρικό – Αθήνα',
      code: 'ATH',
      address: 'Σόλωνος 84',
      city: 'Αθήνα',
      phone: '210 3612 400',
    },
  });
  const armoniaSkg = await prisma.branch.create({
    data: {
      tenantId: armonia.id,
      name: 'Παράρτημα – Θεσσαλονίκη',
      code: 'SKG',
      address: 'Παύλου Μελά 12',
      city: 'Θεσσαλονίκη',
      phone: '2310 220 330',
    },
  });
  const melodiaPat = await prisma.branch.create({
    data: {
      tenantId: melodia.id,
      name: 'Κεντρικό – Πάτρα',
      code: 'PAT',
      address: 'Μαιζώνος 45',
      city: 'Πάτρα',
      phone: '261 022 3400',
    },
  });

  const dokimiBranch = await prisma.branch.create({
    data: {
      tenantId: dokimi.id,
      name: 'Κεντρικό – Θεσσαλονίκη',
      code: 'DKT',
      address: 'Εγνατία 100',
      city: 'Θεσσαλονίκη',
      phone: '231 044 5500',
    },
  });

  await prisma.membership.createMany({
    data: [
      { userId: directorUser.id, tenantId: armonia.id, role: MembershipRole.DIRECTOR },
      { userId: adminUser.id, tenantId: armonia.id, role: MembershipRole.ADMINISTRATOR },
      { userId: teacherUser.id, tenantId: armonia.id, role: MembershipRole.TEACHER },
      { userId: studentUser.id, tenantId: armonia.id, role: MembershipRole.STUDENT, branchId: armoniaAth.id },
      { userId: guardianUser.id, tenantId: armonia.id, role: MembershipRole.GUARDIAN },
      { userId: melodiaDirectorUser.id, tenantId: melodia.id, role: MembershipRole.DIRECTOR },
      { userId: dokimiDirectorUser.id, tenantId: dokimi.id, role: MembershipRole.DIRECTOR, branchId: dokimiBranch.id },
      { userId: multiUser.id, tenantId: armonia.id, role: MembershipRole.TEACHER },
      { userId: multiUser.id, tenantId: melodia.id, role: MembershipRole.TEACHER },
    ],
  });

  async function createAcademicSetup(tenantId: string) {
    const previousYear = await prisma.academicYear.create({
      data: {
        tenantId,
        name: '2025–2026',
        startsOn: isoDate(2025, 9, 1),
        endsOn: isoDate(2026, 6, 30),
        isActive: false,
      },
    });
    const currentYear = await prisma.academicYear.create({
      data: {
        tenantId,
        name: '2026–2027',
        startsOn: isoDate(2026, 9, 1),
        endsOn: isoDate(2027, 6, 30),
        isActive: true,
      },
    });
    const programs = [] as {
      id: string;
      code: string;
      name: string;
      color: string | null;
      fee: number;
    }[];
    for (const program of programSeed) {
      const created = await prisma.program.create({
        data: {
          tenantId,
          name: program.name,
          code: program.code,
          color: program.color,
        },
      });
      programs.push({ ...created, fee: program.fee });
    }
    const levels = [] as { id: string; name: string }[];
    for (const [index, name] of levelNames.entries()) {
      levels.push(
        await prisma.level.create({
          data: { tenantId, name, sortOrder: index + 1 },
        }),
      );
    }
    return { previousYear, currentYear, programs, levels };
  }

  const armoniaAcademics = await createAcademicSetup(armonia.id);
  const melodiaAcademics = await createAcademicSetup(melodia.id);

  // Greek school-year calendar: national holidays plus the December break,
  // scoped to the whole tenant. The scheduling engine skips these dates when it
  // materialises a weekly series, so the demo schedule has real gaps.
  const greekCalendar = [
    { date: isoDate(2026, 10, 28), kind: 'HOLIDAY', name: 'Επέτειος της 28ης Οκτωβρίου' },
    { date: isoDate(2026, 12, 24), kind: 'CLOSED', name: 'Παραμονή Χριστουγέννων' },
    { date: isoDate(2026, 12, 25), kind: 'HOLIDAY', name: 'Χριστούγεννα' },
    { date: isoDate(2026, 12, 26), kind: 'HOLIDAY', name: 'Σύναξη της Θεοτόκου' },
    { date: isoDate(2026, 12, 31), kind: 'CLOSED', name: 'Παραμονή Πρωτοχρονιάς' },
    { date: isoDate(2027, 1, 1), kind: 'HOLIDAY', name: 'Πρωτοχρονιά' },
    { date: isoDate(2027, 1, 6), kind: 'HOLIDAY', name: 'Θεοφάνεια' },
    { date: isoDate(2027, 3, 15), kind: 'HOLIDAY', name: 'Καθαρά Δευτέρα' },
    { date: isoDate(2027, 3, 25), kind: 'HOLIDAY', name: 'Επέτειος της 25ης Μαρτίου' },
    { date: isoDate(2027, 4, 30), kind: 'CLOSED', name: 'Διακοπές Πάσχα' },
    { date: isoDate(2027, 5, 3), kind: 'HOLIDAY', name: 'Δευτέρα του Πάσχα' },
    { date: isoDate(2027, 6, 21), kind: 'MAKEUP_DAY', name: 'Ημέρα αναπληρώσεων Ιουνίου' },
  ] as const;
  for (const tenantId of [armonia.id, melodia.id]) {
    await prisma.calendarDay.createMany({
      data: greekCalendar.map((day) => ({
        tenantId,
        date: day.date,
        kind: day.kind,
        name: day.name,
        branchId: null,
      })),
      skipDuplicates: true,
    });
  }

  const armoniaRooms = await Promise.all([
    prisma.room.create({ data: { tenantId: armonia.id, branchId: armoniaAth.id, name: 'Αίθουσα Πιάνου 1', capacity: 2 } }),
    prisma.room.create({ data: { tenantId: armonia.id, branchId: armoniaAth.id, name: 'Αίθουσα Πιάνου 2', capacity: 2 } }),
    prisma.room.create({ data: { tenantId: armonia.id, branchId: armoniaAth.id, name: 'Αίθουσα Βιολιού', capacity: 2 } }),
    prisma.room.create({ data: { tenantId: armonia.id, branchId: armoniaAth.id, name: 'Αίθουσα Θεωρίας', capacity: 12 } }),
    prisma.room.create({ data: { tenantId: armonia.id, branchId: armoniaAth.id, name: 'Αίθουσα Συνόλου', capacity: 18 } }),
    prisma.room.create({ data: { tenantId: armonia.id, branchId: armoniaSkg.id, name: 'Αίθουσα 1', capacity: 2 } }),
    prisma.room.create({ data: { tenantId: armonia.id, branchId: armoniaSkg.id, name: 'Αίθουσα 2', capacity: 8 } }),
  ]);
  const melodiaRooms = await Promise.all([
    prisma.room.create({ data: { tenantId: melodia.id, branchId: melodiaPat.id, name: 'Αίθουσα Πιάνου', capacity: 2 } }),
    prisma.room.create({ data: { tenantId: melodia.id, branchId: melodiaPat.id, name: 'Αίθουσα Θεωρίας', capacity: 10 } }),
  ]);

  const armoniaTeachers: {
    id: string;
    userId: string | null;
    programCode: string;
    first: string;
    last: string;
  }[] = [];
  for (const [index, teacher] of teacherSeed.entries()) {
    const linkedUserId = index === 0 ? teacherUser.id : index === 7 ? multiUser.id : null;
    const created = await prisma.teacher.create({
      data: {
        tenantId: armonia.id,
        userId: linkedUserId,
        employeeNo: `ARM-T-${String(index + 1).padStart(2, '0')}`,
        firstName: teacher.first,
        lastName: teacher.last,
        email: index === 0 ? 'teacher@armonia.test' : `${teacher.last.toLowerCase().replace(/[^a-zα-ω]/gi, '')}@armonia.test`,
        phone: `697 400 10${String(index + 1).padStart(2, '0')}`,
        title: teacher.specialty,
        specialties: [teacher.specialty],
        status: TeacherStatus.ACTIVE,
      },
    });
    armoniaTeachers.push({
      id: created.id,
      userId: created.userId,
      programCode: teacher.program,
      first: created.firstName,
      last: created.lastName,
    });
  }

  const melodiaTeachers: {
    id: string;
    userId: string | null;
    programCode: string;
    first: string;
    last: string;
  }[] = [];
  const melodiaTeacherSeed = [
    { first: 'Χρήστος', last: 'Παππάς', specialty: 'Πιάνο', program: 'PIANO' },
    { first: 'Έλενα', last: 'Σταύρου', specialty: 'Βιολί', program: 'VIOLIN' },
    { first: 'Θανάσης', last: 'Ρίζος', specialty: 'Θεωρία', program: 'THEORY' },
    { first: 'Αλέξανδρος', last: 'Μιχαηλίδης', specialty: 'Θεωρία', program: 'THEORY' },
  ];
  for (const [index, teacher] of melodiaTeacherSeed.entries()) {
    const created = await prisma.teacher.create({
      data: {
        tenantId: melodia.id,
        userId: index === 3 ? multiUser.id : null,
        employeeNo: `MEL-T-${String(index + 1).padStart(2, '0')}`,
        firstName: teacher.first,
        lastName: teacher.last,
        email: `teacher${index + 1}@melodia.test`,
        title: teacher.specialty,
        specialties: [teacher.specialty],
        status: TeacherStatus.ACTIVE,
      },
    });
    melodiaTeachers.push({
      id: created.id,
      userId: created.userId,
      programCode: teacher.program,
      first: created.firstName,
      last: created.lastName,
    });
  }

  async function createStudents(
    tenantId: string,
    branchId: string,
    count: number,
    startIndex: number,
    registrationPrefix: string,
    firstStudentUserId?: string,
    firstStudentBranchId?: string,
  ) {
    const students = [] as {
      id: string;
      userId: string | null;
      firstName: string;
      lastName: string;
      branchId: string;
      status: StudentStatus;
    }[];
    for (let i = 0; i < count; i += 1) {
      const globalIndex = startIndex + i;
      const firstName = firstNames[globalIndex % firstNames.length];
      const lastName = lastNames[globalIndex % lastNames.length];
      const student = await prisma.student.create({
        data: {
          tenantId,
          userId: i === 0 ? (firstStudentUserId ?? null) : null,
          branchId: i === 0 && firstStudentBranchId ? firstStudentBranchId : branchId,
          registrationNumber: `${registrationPrefix}-${String(i + 1).padStart(3, '0')}`,
          firstName,
          lastName,
          birthDate: isoDate(2008 + (i % 9), ((i * 3) % 12) + 1, ((i * 5) % 27) + 1),
          gender: i % 2 === 0 ? 'F' : 'M',
          email: i === 0 && firstStudentUserId ? 'student@armonia.test' : `${registrationPrefix.toLowerCase()}${i + 1}@student.test`,
          phone: `698 200 ${String(2000 + i).padStart(4, '0')}`,
          address: `Οδός Μουσικής ${12 + i}`,
          city: tenantId === armonia.id && branchId === armoniaSkg.id ? 'Θεσσαλονίκη' : tenantId === melodia.id ? 'Πάτρα' : 'Αθήνα',
          status: i === count - 1 && count > 10 ? StudentStatus.INACTIVE : StudentStatus.ACTIVE,
          enrolledAt: isoDate(2026, 9, 1 + (i % 20)),
          consentData: true,
          consentMedia: i % 3 !== 0,
        },
      });
      students.push({
        id: student.id,
        userId: student.userId,
        firstName: student.firstName,
        lastName: student.lastName,
        branchId: student.branchId,
        status: student.status as StudentStatus,
      });
    }
    return students;
  }

  const armoniaAthStudents = await createStudents(
    armonia.id,
    armoniaAth.id,
    24,
    0,
    'ARM-ath',
    studentUser.id,
    armoniaAth.id,
  );
  const armoniaSkgStudents = await createStudents(
    armonia.id,
    armoniaSkg.id,
    8,
    24,
    'ARM-skg',
  );
  const armoniaStudents = [...armoniaAthStudents, ...armoniaSkgStudents];
  const melodiaStudents = await createStudents(
    melodia.id,
    melodiaPat.id,
    12,
    8,
    'MEL',
  );

  async function createGuardians(
    tenantId: string,
    students: { id: string; firstName: string; lastName: string; branchId: string }[],
  ) {
    const guardians = [] as { id: string; firstName: string; lastName: string }[];
    for (let i = 0; i < students.length; i += 1) {
      const student = students[i];
      const guardian = await prisma.guardian.create({
        data: {
          tenantId,
          firstName: i % 3 === 0 ? 'Νίκη' : 'Στέλιος',
          lastName: student.lastName,
          email: `guardian${i + 1}@family.test`,
          phone: `690 111 ${String(1000 + i).padStart(4, '0')}`,
          address: `Οδός Μουσικής ${12 + i}`,
          taxId: `1${String(23456789 + i).slice(0, 8)}`,
          occupation: i % 2 === 0 ? 'Εκπαιδευτικός' : 'Ελεύθερος επαγγελματίας',
        },
      });
      await prisma.studentGuardian.create({
        data: {
          tenantId,
          studentId: student.id,
          guardianId: guardian.id,
          relationship: i % 3 === 0 ? 'Μητέρα' : 'Πατέρας',
          isPrimary: true,
        },
      });
      guardians.push({ id: guardian.id, firstName: guardian.firstName, lastName: guardian.lastName });
    }
    return guardians;
  }

  const armoniaGuardians = await createGuardians(armonia.id, armoniaStudents);
  await createGuardians(melodia.id, melodiaStudents);
  // Link the demo guardian login to the first student's primary guardian so the
  // guardian portal (children, schedule, attendance, results, finance) resolves.
  await prisma.guardian.update({
    where: { id: armoniaGuardians[0].id },
    data: { userId: guardianUser.id },
  });

  const programById = new Map(armoniaAcademics.programs.map((program) => [program.code, program]));
  const levelIds = armoniaAcademics.levels.map((level) => level.id);

  for (const [index, student] of armoniaStudents.entries()) {
    const teacher = armoniaTeachers[index % armoniaTeachers.length];
    const program = programById.get(teacher.programCode) ?? armoniaAcademics.programs[0];
    await prisma.enrollment.create({
      data: {
        tenantId: armonia.id,
        studentId: student.id,
        programId: program.id,
        levelId: levelIds[index % levelIds.length],
        academicYearId: armoniaAcademics.currentYear.id,
        branchId: student.branchId,
        teacherId: teacher.id,
        status: EnrollmentStatus.ACTIVE,
        enrolledAt: isoDate(2026, 9, 1 + (index % 20)),
      },
    });
  }

  for (const [index, student] of melodiaStudents.entries()) {
    const teacher = melodiaTeachers[index % melodiaTeachers.length];
    const program = melodiaAcademics.programs.find((item) => item.code === teacher.programCode) ?? melodiaAcademics.programs[0];
    await prisma.enrollment.create({
      data: {
        tenantId: melodia.id,
        studentId: student.id,
        programId: program.id,
        levelId: melodiaAcademics.levels[index % melodiaAcademics.levels.length].id,
        academicYearId: melodiaAcademics.currentYear.id,
        branchId: student.branchId,
        teacherId: teacher.id,
        status: EnrollmentStatus.ACTIVE,
      },
    });
  }

  interface SeriesPlan {
    teacherIndex: number;
    programCode: string;
    type: LessonType;
    title: string;
    weekday: number;
    startTime: string;
    durationMinutes: number;
    roomId: string;
    branchId: string;
    teacherId: string;
    studentIds: string[];
  }

  function buildSeriesPlans(options: {
    students: { id: string; branchId: string }[];
    branchId: string;
    branchStudentIds: string[];
    teachers: { id: string; programCode: string }[];
    rooms: { id: string; branchId: string }[];
    count: number;
    offset: number;
  }): SeriesPlan[] {
    const branchRooms = options.rooms.filter((room) => room.branchId === options.branchId);
    const plans: SeriesPlan[] = [];
    for (let i = 0; i < options.count; i += 1) {
      const globalIndex = options.offset + i;
      const teacher = options.teachers[globalIndex % options.teachers.length];
      const program = programById.get(teacher.programCode) ?? armoniaAcademics.programs[0];
      const type = i % 4 === 3 ? LessonType.GROUP : LessonType.INDIVIDUAL;
      // Single and group lessons both draw from the tenant's own student pool.
      // (This used to fall back to the Armonia pool for any branch that was not
      // Thessaloniki, which leaked Armonia student ids into Melodia series.)
      const studentPool = options.students;
      const groupSize = options.branchId === armoniaSkg.id ? 2 : 4;
      const start = (globalIndex * 2) % Math.max(studentPool.length, 1);
      const studentIds =
        type === LessonType.GROUP
          ? Array.from({ length: groupSize }, (_, j) => studentPool[(start + j) % studentPool.length].id)
          : [studentPool[globalIndex % studentPool.length].id];

      plans.push({
        teacherIndex: globalIndex,
        programCode: program.code,
        type,
        title: `${program.name} – ${type === LessonType.GROUP ? 'Ομαδικό' : 'Ατομικό'}`,
        weekday: 1 + (globalIndex % 5),
        startTime: startTimes[Math.floor(globalIndex / 5) % startTimes.length],
        durationMinutes: type === LessonType.GROUP ? 60 : 45,
        roomId: branchRooms[i % branchRooms.length].id,
        branchId: options.branchId,
        teacherId: teacher.id,
        studentIds,
      });
    }
    return plans;
  }

  const armoniaSeriesPlans = [
    ...buildSeriesPlans({
      students: armoniaAthStudents,
      branchId: armoniaAth.id,
      branchStudentIds: armoniaAthStudents.map((s) => s.id),
      teachers: armoniaTeachers,
      rooms: armoniaRooms,
      count: 16,
      offset: 0,
    }),
    ...buildSeriesPlans({
      students: armoniaSkgStudents,
      branchId: armoniaSkg.id,
      branchStudentIds: armoniaSkgStudents.map((s) => s.id),
      teachers: armoniaTeachers,
      rooms: armoniaRooms,
      count: 8,
      offset: 40,
    }),
  ];

  const melodiaSeriesPlans = buildSeriesPlans({
    students: melodiaStudents,
    branchId: melodiaPat.id,
    branchStudentIds: melodiaStudents.map((s) => s.id),
    teachers: melodiaTeachers,
    rooms: melodiaRooms,
    count: 8,
    offset: 0,
  }).map((plan) => ({
    ...plan,
    teacherId:
      plan.teacherIndex % melodiaTeachers.length === 3
        ? melodiaTeachers[3].id
        : melodiaTeachers[plan.teacherIndex % melodiaTeachers.length].id,
  }));

  async function createSeriesAndLessons(tenantId: string, plans: SeriesPlan[], academicYearId: string, teacherRecords: { id: string; userId: string | null }[]) {
    const seriesByPlan = [] as { id: string; teacherId: string; userId: string | null }[];
    for (const plan of plans) {
      const series = await prisma.lessonSeries.create({
        data: {
          tenantId,
          branchId: plan.branchId,
          roomId: plan.roomId,
          teacherId: plan.teacherId,
          programId: (tenantId === armonia.id ? programById : new Map(melodiaAcademics.programs.map((p) => [p.code, p]))).get(plan.programCode)!.id,
          levelId: null,
          type: plan.type,
          title: plan.title,
          weekday: plan.weekday,
          startTime: plan.startTime,
          durationMinutes: plan.durationMinutes,
          validFrom: isoDate(2026, 9, 1),
          validTo: isoDate(2027, 6, 30),
          status: SeriesStatus.ACTIVE,
        },
      });
      await prisma.lessonSeriesStudent.createMany({
        data: plan.studentIds.map((studentId) => ({
          tenantId,
          lessonSeriesId: series.id,
          studentId,
        })),
        skipDuplicates: true,
      });
      const teacherRecord = teacherRecords.find((t) => t.id === plan.teacherId);
      seriesByPlan.push({ id: series.id, teacherId: plan.teacherId, userId: teacherRecord?.userId ?? null });
    }

    const lessonsToCreate: {
      seriesId: string;
      tenantId: string;
      branchId: string;
      roomId: string;
      teacherId: string;
      title: string;
      type: LessonType;
      startsAt: Date;
      endsAt: Date;
      status: LessonStatus;
    }[] = [];

    for (const [index, plan] of plans.entries()) {
      const series = seriesByPlan[index];
      const dates = eachDayOfInterval({
        start: isoDate(2026, 9, 1),
        end: isoDate(2027, 6, 30),
      }).filter((date) => ((getDay(date) + 6) % 7) + 1 === plan.weekday);

      for (const date of dates) {
        const dateString = format(date, 'yyyy-MM-dd');
        const startsAt = athensDateTime(dateString, plan.startTime);
        const endsAt = new Date(startsAt.getTime() + plan.durationMinutes * 60_000);
        lessonsToCreate.push({
          seriesId: series.id,
          tenantId,
          branchId: plan.branchId,
          roomId: plan.roomId,
          teacherId: plan.teacherId,
          title: plan.title,
          type: plan.type,
          startsAt,
          endsAt,
          status: endsAt < NOW ? LessonStatus.COMPLETED : LessonStatus.SCHEDULED,
        });
      }
    }

    await prisma.lesson.createMany({
      data: lessonsToCreate.map((lesson) => ({
        tenantId: lesson.tenantId,
        lessonSeriesId: lesson.seriesId,
        branchId: lesson.branchId,
        roomId: lesson.roomId,
        teacherId: lesson.teacherId,
        title: lesson.title,
        type: lesson.type,
        startsAt: lesson.startsAt,
        endsAt: lesson.endsAt,
        status: lesson.status,
      })),
      skipDuplicates: true,
    });

    const seriesIds = seriesByPlan.map((series) => series.id);
    const lessons = await prisma.lesson.findMany({
      where: { tenantId, lessonSeriesId: { in: seriesIds } },
      select: { id: true, lessonSeriesId: true, teacherId: true, startsAt: true, endsAt: true, status: true },
      orderBy: { startsAt: 'asc' },
    });
    const seriesStudents = await prisma.lessonSeriesStudent.findMany({
      where: { tenantId, lessonSeriesId: { in: seriesIds } },
      select: { lessonSeriesId: true, studentId: true },
    });
    const studentsBySeries = new Map<string, string[]>();
    for (const row of seriesStudents) {
      const list = studentsBySeries.get(row.lessonSeriesId) ?? [];
      list.push(row.studentId);
      studentsBySeries.set(row.lessonSeriesId, list);
    }

    await prisma.lessonStudent.createMany({
      data: lessons.flatMap((lesson) =>
        (studentsBySeries.get(lesson.lessonSeriesId ?? '') ?? []).map((studentId) => ({
          tenantId,
          lessonId: lesson.id,
          studentId,
        })),
      ),
      skipDuplicates: true,
    });

    const pastLessons = lessons.filter((lesson) => lesson.status === LessonStatus.COMPLETED);
    const attendanceData: {
      tenantId: string;
      lessonId: string;
      studentId: string;
      status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
      minutesLate: number | null;
      markedById: string | null;
    }[] = [];
    for (const [lessonIndex, lesson] of pastLessons.entries()) {
      const studentIds = studentsBySeries.get(lesson.lessonSeriesId ?? '') ?? [];
      const teacherUser = seriesByPlan.find((s) => s.id === lesson.lessonSeriesId)?.userId ?? null;
      for (const [studentIndex, studentId] of studentIds.entries()) {
        const pattern = (lessonIndex + studentIndex) % 20;
        attendanceData.push({
          tenantId,
          lessonId: lesson.id,
          studentId,
          status: pattern < 16 ? 'PRESENT' : pattern < 18 ? 'ABSENT' : pattern === 18 ? 'LATE' : 'EXCUSED',
          minutesLate: pattern === 18 ? 10 : null,
          markedById: teacherUser,
        });
      }
    }
    await prisma.attendance.createMany({ data: attendanceData, skipDuplicates: true });

    const noteLessons = pastLessons
      .filter((lesson) => {
        const series = seriesByPlan.find((s) => s.id === lesson.lessonSeriesId);
        return series?.userId;
      })
      .slice(0, 8);
    for (const [index, lesson] of noteLessons.entries()) {
      const series = seriesByPlan.find((s) => s.id === lesson.lessonSeriesId);
      if (!series?.userId) continue;
      await prisma.lessonNote.create({
        data: {
          tenantId,
          lessonId: lesson.id,
          authorId: series.userId,
          content:
            index % 2 === 0
              ? 'Δουλέψαμε τεχνική και ανεξαρτησία χεριών. Επόμενη εβδομάδα: κλίμακες με σταθερό tempo.'
              : 'Επανάληψη του ρεπερτορίου και φραστική. Καλή πρόοδος στην ανάγνωση παρτιτούρας.',
        },
      });
    }

    return seriesByPlan.length;
  }

  const armoniaSeriesCount = await createSeriesAndLessons(
    armonia.id,
    armoniaSeriesPlans,
    armoniaAcademics.currentYear.id,
    armoniaTeachers,
  );
  const melodiaSeriesCount = await createSeriesAndLessons(
    melodia.id,
    melodiaSeriesPlans,
    melodiaAcademics.currentYear.id,
    melodiaTeachers,
  );

  // Demo assignments for the primary tenant: one graded, one open with a
  // submission awaiting grading.
  {
    const tenantId = armonia.id;
    const assignmentTeacher = armoniaTeachers[0];
    if (!assignmentTeacher) throw new Error('Seed: no armonia teacher for assignments');
    const assignmentStudents = armoniaAthStudents.slice(0, 4);
    const athensToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
    const today = new Date(`${athensToday}T00:00:00.000Z`);
    const day = (n: number) => new Date(today.getTime() + n * 24 * 3600 * 1000);
    const open = await prisma.assignment.create({
      data: {
        tenantId,
        createdById: teacherUser.id,
        teacherId: assignmentTeacher.id,
        title: 'Κλίμακες Ρε μείζονος – δύο οκτάβες',
        description:
          'Εξασκηθείτε στις κλίμακες Ρε μείζονος με σταθερό tempo 80. Ηχογραφήστε τις παρατηρήσεις σας.',
        assignedOn: today,
        dueAt: day(7),
      },
    });
    await prisma.assignmentTarget.createMany({
      data: assignmentStudents.map((student) => ({
        tenantId,
        assignmentId: open.id,
        studentId: student.id,
      })),
    });
    // First student submitted; the teacher grades it in-app.
    await prisma.assignmentSubmission.create({
      data: {
        tenantId,
        assignmentId: open.id,
        studentId: assignmentStudents[0].id,
        content: 'Εξασκήθηκα 25 λεπτά την ημέρα. Το σολέζ δυσκολεύει στο τέλος.',
        submittedAt: new Date(),
      },
    });

    const graded = await prisma.assignment.create({
      data: {
        tenantId,
        createdById: teacherUser.id,
        teacherId: assignmentTeacher.id,
        title: 'Σολφέζ – ρυθμική ανάγνωση 4/4',
        description: 'Διαβάστε τα δύο πρώτα μέτρα με μετρόνο 60 και σημειώστε τις δυσκολίες.',
        assignedOn: day(-7),
        dueAt: day(-1),
      },
    });
    await prisma.assignmentTarget.createMany({
      data: assignmentStudents.map((student) => ({
        tenantId,
        assignmentId: graded.id,
        studentId: student.id,
      })),
    });
    for (const [index, student] of assignmentStudents.entries()) {
      await prisma.assignmentSubmission.create({
        data: {
          tenantId,
          assignmentId: graded.id,
          studentId: student.id,
          content: 'Ολοκλήρωσα τη ρυθμική ανάγνωση.',
          submittedAt: day(-2),
          grade: index === 0 ? 92 : index === 1 ? 85 : index === 2 ? 74 : 88,
          feedback:
            index === 0
              ? 'Πολύ καλή δουλειά στη φραστική.'
              : 'Καλή προσπάθεια, δουλέψτε σταθερότητα.',
          gradedById: teacherUser.id,
          gradedAt: day(-1),
          status: SubmissionStatus.GRADED,
        },
      });
    }
  }

  async function createFinance(
    tenantId: string,
    students: { id: string; firstName: string; lastName: string }[],
    programsByStudent: Map<string, { fee: number; name: string }>,
    monthCount: number,
  ) {
    const months = monthRange(2026, 5, monthCount);
    for (const [studentIndex, student] of students.entries()) {
      if (studentIndex === students.length - 1) continue;
      const program = programsByStudent.get(student.id) ?? { fee: 90, name: 'Μουσική' };
      for (const [monthIndex, month] of months.entries()) {
        const dueDate = isoDate(month.year, month.month, 5);
        const amountCents = program.fee * 100;
        let status: ChargeStatus = ChargeStatus.PENDING;
        let paidAmountCents = 0;

        if (monthIndex < monthCount - 3) {
          status = ChargeStatus.PAID;
          paidAmountCents = amountCents;
        } else if (monthIndex === monthCount - 3) {
          if (studentIndex % 3 === 0) {
            status = ChargeStatus.OVERDUE;
          } else {
            status = ChargeStatus.PAID;
            paidAmountCents = amountCents;
          }
        } else if (monthIndex === monthCount - 2) {
          if (studentIndex % 4 === 0) {
            status = ChargeStatus.PARTIAL;
            paidAmountCents = Math.round(amountCents / 2);
          } else if (studentIndex % 5 === 0) {
            status = ChargeStatus.OVERDUE;
          } else {
            status = ChargeStatus.PAID;
            paidAmountCents = amountCents;
          }
        } else if (studentIndex % 2 === 0) {
          status = ChargeStatus.OVERDUE;
        }

        const charge = await prisma.charge.create({
          data: {
            tenantId,
            studentId: student.id,
            description: `Δίδακτρα ${program.name} – ${month.label}`,
            period: month.label,
            amountCents,
            grossAmountCents: amountCents,
            paidAmountCents,
            dueDate,
            status,
          },
        });

        if (paidAmountCents > 0) {
          const receiptNumber = `REC-${month.label.replace('-', '')}-${String(studentIndex + 1).padStart(3, '0')}`;
          const paidAt = new Date(dueDate.getTime() + (studentIndex % 4) * 86_400_000);
          const payment = await prisma.payment.create({
            data: {
              tenantId,
              studentId: student.id,
              chargeId: charge.id,
              receiptNumber,
              amountCents: paidAmountCents,
              method: studentIndex % 3 === 0 ? PaymentMethod.CARD : studentIndex % 3 === 1 ? PaymentMethod.BANK_TRANSFER : PaymentMethod.CASH,
              status: PaymentStatus.POSTED,
              paidAt,
              reference: `PAY-${month.label}-${String(studentIndex + 1).padStart(3, '0')}`,
            },
          });
          await prisma.paymentAllocation.create({
            data: {
              tenantId,
              paymentId: payment.id,
              chargeId: charge.id,
              amountCents: paidAmountCents,
            },
          });
        }
      }
    }
  }

  async function createFinanceExtras(
    tenantId: string,
    students: { id: string; firstName: string; lastName: string }[],
    programsByStudent: Map<string, { fee: number; name: string }>,
  ) {
    const student = students[0];
    if (!student) return;
    const program = programsByStudent.get(student.id) ?? { fee: 90, name: 'Μουσική' };

    await prisma.scholarship.create({
      data: {
        tenantId,
        studentId: student.id,
        type: ScholarshipType.PERCENTAGE,
        percentage: 20,
        reason: 'Αριστείο προόδου',
        validFrom: isoDate(2026, 1, 1),
        validTo: isoDate(2026, 12, 31),
        status: ScholarshipStatus.APPROVED,
      },
    });

    const count = 3;
    const totalAmountCents = program.fee * 100 * count;
    const plan = await prisma.installmentPlan.create({
      data: {
        tenantId,
        studentId: student.id,
        count,
        startDate: isoDate(2026, 10, 5),
        intervalDays: 30,
        totalAmountCents,
        status: InstallmentPlanStatus.ACTIVE,
      },
    });
    const perInstallment = Math.floor(totalAmountCents / count);
    for (let index = 0; index < count; index += 1) {
      const dueDate = new Date(Date.UTC(2026, 9 + index, 5));
      const first = index === 0;
      await prisma.charge.create({
        data: {
          tenantId,
          studentId: student.id,
          description: `Δόση ${index + 1}/${count} – ${program.name}`,
          period: '2026-10',
          amountCents: perInstallment,
          grossAmountCents: perInstallment,
          paidAmountCents: first ? perInstallment : 0,
          origin: 'TUITION',
          installmentPlanId: plan.id,
          installmentNo: index + 1,
          installmentCount: count,
          dueDate,
          status: first ? ChargeStatus.PAID : ChargeStatus.PENDING,
          sourceKey: `extras-installment:${plan.id}:${index + 1}`,
        },
      });
    }
    const firstCharge = await prisma.charge.findFirst({
      where: { installmentPlanId: plan.id, installmentNo: 1 },
    });
    if (firstCharge) {
      const payment = await prisma.payment.create({
        data: {
          tenantId,
          studentId: student.id,
          receiptNumber: `REC-EXTRA-${tenantId.slice(0, 4).toUpperCase()}-001`,
          amountCents: perInstallment,
          method: PaymentMethod.BANK_TRANSFER,
          status: PaymentStatus.POSTED,
          paidAt: isoDate(2026, 10, 6),
          reference: 'Δόση 1/3',
        },
      });
      await prisma.paymentAllocation.create({
        data: {
          tenantId,
          paymentId: payment.id,
          chargeId: firstCharge.id,
          amountCents: perInstallment,
        },
      });
    }

    await prisma.payment.create({
      data: {
        tenantId,
        studentId: student.id,
        receiptNumber: `REC-EXTRA-${tenantId.slice(0, 4).toUpperCase()}-VOID`,
        amountCents: 5000,
        method: PaymentMethod.CASH,
        status: PaymentStatus.VOIDED,
        paidAt: isoDate(2026, 9, 20),
        voidReason: 'Λάθος καταχώριση ποσού',
        voidedAt: isoDate(2026, 9, 21),
      },
    });
  }

  const armoniaProgramsByStudent = new Map<string, { fee: number; name: string }>();
  for (const [index, student] of armoniaStudents.entries()) {
    const teacher = armoniaTeachers[index % armoniaTeachers.length];
    const program = programById.get(teacher.programCode) ?? armoniaAcademics.programs[0];
    armoniaProgramsByStudent.set(student.id, { fee: program.fee, name: program.name });
  }
  const melodiaProgramsByStudent = new Map<string, { fee: number; name: string }>();
  for (const [index, student] of melodiaStudents.entries()) {
    const teacher = melodiaTeachers[index % melodiaTeachers.length];
    const program = melodiaAcademics.programs.find((p) => p.code === teacher.programCode) ?? melodiaAcademics.programs[0];
    melodiaProgramsByStudent.set(student.id, { fee: program.fee, name: program.name });
  }

  await createFinance(armonia.id, armoniaStudents, armoniaProgramsByStudent, 6);
  await createFinance(melodia.id, melodiaStudents, melodiaProgramsByStudent, 4);
  await createFinanceExtras(armonia.id, armoniaStudents, armoniaProgramsByStudent);
  await createFinanceExtras(melodia.id, melodiaStudents, melodiaProgramsByStudent);

  const pianoProgram = armoniaAcademics.programs.find((program) => program.code === 'PIANO')!;
  const theoryProgram = armoniaAcademics.programs.find((program) => program.code === 'THEORY')!;
  const pastExam = await prisma.exam.create({
    data: {
      tenantId: armonia.id,
      programId: pianoProgram.id,
      levelId: armoniaAcademics.levels[2].id,
      title: 'Θερινές Εξετάσεις Πιάνου 2026',
      type: ExamType.PROMOTION,
      examDate: athensDateTime('2026-06-20', '18:00'),
      location: 'Αίθουσα Συνόλου',
      status: ExamStatus.PUBLISHED,
      notes: 'Ενδεικτικά αποτελέσματα για το demo.',
    },
  });
  const upcomingExam = await prisma.exam.create({
    data: {
      tenantId: armonia.id,
      programId: theoryProgram.id,
      levelId: armoniaAcademics.levels[1].id,
      title: 'Περιοδική Αξιολόγηση Θεωρίας – Νοέμβριος',
      type: ExamType.PERIODIC,
      examDate: athensDateTime('2026-11-20', '17:30'),
      location: 'Αίθουσα Θεωρίας',
      status: ExamStatus.SCHEDULED,
    },
  });
  await prisma.exam.create({
    data: {
      tenantId: armonia.id,
      programId: theoryProgram.id,
      levelId: armoniaAcademics.levels[3].id,
      title: 'Προαγωγικές Εξετάσεις Θεωρίας 2027',
      type: ExamType.PROMOTION,
      examDate: athensDateTime('2027-05-15', '10:00'),
      location: 'Αίθουσα Συνόλου',
      status: ExamStatus.SCHEDULED,
    },
  });
  await prisma.exam.create({
    data: {
      tenantId: melodia.id,
      programId: melodiaAcademics.programs[0].id,
      title: 'Χειμερινή Αξιολόγηση Πιάνου',
      type: ExamType.PERIODIC,
      examDate: athensDateTime('2026-12-12', '17:00'),
      status: ExamStatus.SCHEDULED,
    },
  });

  for (let i = 0; i < Math.min(8, armoniaStudents.length); i += 1) {
    const student = armoniaStudents[i];
    await prisma.examResult.create({
      data: {
        tenantId: armonia.id,
        examId: pastExam.id,
        studentId: student.id,
        grade: 88 + (i % 10),
        outcome: ExamOutcome.PASS,
        publishedAt: athensDateTime('2026-06-25', '12:00'),
        notes: i === 0 ? 'Εξαιρετική τεχνική και μουσικότητα.' : null,
      },
    });
  }

  const documentTypes = [
    DocumentType.REGISTRATION_FORM,
    DocumentType.ATTENDANCE_CERTIFICATE,
    DocumentType.GRADE_TRANSCRIPT,
  ];
  let seededDocumentCount = 0;
  for (const [index, student] of armoniaStudents.slice(0, 12).entries()) {
    for (const [docIndex, type] of documentTypes.entries()) {
      // Protocol numbers follow the PRT numbering used by the documents
      // module (PRT-<year>-<sequence>); referenceNumber mirrors it for
      // backward compatibility with older readers.
      const protocolNumber = `PRT-2026-${String(index * documentTypes.length + docIndex + 1).padStart(6, '0')}`;
      await prisma.documentRecord.create({
        data: {
          tenantId: armonia.id,
          studentId: student.id,
          type,
          title:
            type === DocumentType.REGISTRATION_FORM
              ? 'Δελτίο Εγγραφής 2026–2027'
              : type === DocumentType.ATTENDANCE_CERTIFICATE
                ? 'Βεβαίωση Φοίτησης'
                : 'Αναλυτική Βαθμολογία',
          protocolNumber,
          referenceNumber: protocolNumber,
          fileName: `${type.toLowerCase()}-${index + 1}.pdf`,
          issuedAt: athensDateTime('2026-09-15', '11:00'),
          issuedById: directorUser.id,
          preparedById: adminUser.id,
          status: DocumentStatus.ISSUED,
        },
      });
      seededDocumentCount += 1;
    }
  }

  // Seeded protocol numbers bypass the numbering service, so align the
  // DOCUMENT sequence with them; otherwise the first issued document would
  // reuse PRT-2026-000001 and violate the unique protocol constraint.
  await prisma.numberSequence.upsert({
    where: {
      tenantId_scope_period: {
        tenantId: armonia.id,
        scope: NumberScope.DOCUMENT,
        period: 2026,
      },
    },
    create: {
      tenantId: armonia.id,
      scope: NumberScope.DOCUMENT,
      period: 2026,
      prefix: 'PRT',
      value: seededDocumentCount,
    },
    update: { value: seededDocumentCount },
  });

  const announcementData = [
    {
      title: 'Καλώς ήρθατε στη νέα ακαδημαϊκή χρονιά',
      body: 'Η διδασκαλία ξεκινά τη Δευτέρα 7 Σεπτεμβρίου. Το αναλυτικό πρόγραμμα είναι διαθέσιμο στην ενότητα Πρόγραμμα. Καλή μουσική χρονιά σε όλους!',
      audienceRoles: [] as MembershipRole[],
      isPinned: true,
    },
    {
      title: 'Συνάντηση εκπαιδευτικού προσωπικού',
      body: 'Την Τετάρτη στις 18:00 θα πραγματοποιηθεί συνάντηση καθηγητών στην Αίθουσα Συνόλου με θέμα τον προγραμματισμό της χρονιάς.',
      audienceRoles: [MembershipRole.TEACHER],
      isPinned: false,
    },
    {
      title: 'Χριστουγεννιάτικη συναυλία – δηλώσεις συμμετοχής',
      body: 'Οι μαθητές που επιθυμούν να συμμετάσχουν στη συναυλία της 20ής Δεκεμβρίου μπορούν να δηλώσουν συμμετοχή στον καθηγητή τους έως τις 30 Νοεμβρίου.',
      audienceRoles: [MembershipRole.STUDENT, MembershipRole.TEACHER],
      isPinned: false,
    },
    {
      title: 'Υπενθύμιση διδάκτρων Οκτωβρίου',
      body: 'Υπενθυμίζουμε ότι η προθεσμία εξόφλησης των διδάκτρων Οκτωβρίου είναι η 5η Νοεμβρίου. Για διευκρινίσεις επικοινωνήστε με τη γραμματεία.',
      audienceRoles: [MembershipRole.STUDENT],
      isPinned: false,
    },
  ];
  const armoniaAnnouncements: { id: string; audienceRoles: MembershipRole[]; title: string; body: string }[] = [];
  for (const data of announcementData) {
    const announcement = await prisma.announcement.create({
      data: {
        tenantId: armonia.id,
        authorId: directorUser.id,
        title: data.title,
        body: data.body,
        audienceRoles: data.audienceRoles,
        isPinned: data.isPinned,
        publishedAt: new Date(Date.now() - (armoniaAnnouncements.length + 1) * 86_400_000),
      },
    });
    armoniaAnnouncements.push({
      id: announcement.id,
      audienceRoles: data.audienceRoles,
      title: data.title,
      body: data.body,
    });
  }
  await prisma.announcement.create({
    data: {
      tenantId: melodia.id,
      authorId: melodiaDirectorUser.id,
      title: 'Έναρξη μαθημάτων Μελωδία',
      body: 'Τα μαθήματα ξεκινούν στις 15 Σεπτεμβρίου. Καλή χρονιά!',
      audienceRoles: [],
      isPinned: true,
    },
  });

  const armoniaTenantUsers = [
    { id: directorUser.id, role: MembershipRole.DIRECTOR },
    { id: adminUser.id, role: MembershipRole.ADMINISTRATOR },
    { id: teacherUser.id, role: MembershipRole.TEACHER },
    { id: studentUser.id, role: MembershipRole.STUDENT },
    { id: guardianUser.id, role: MembershipRole.GUARDIAN },
    { id: multiUser.id, role: MembershipRole.TEACHER },
  ];
  for (const [announcementIndex, announcement] of armoniaAnnouncements.entries()) {
    for (const user of armoniaTenantUsers) {
      if (user.id === directorUser.id) continue;
      if (announcement.audienceRoles.length > 0 && !announcement.audienceRoles.includes(user.role)) continue;
      await prisma.notification.create({
        data: {
          tenantId: armonia.id,
          userId: user.id,
          type: NotificationType.ANNOUNCEMENT,
          title: announcement.title,
          body: announcement.body,
          entityType: 'Announcement',
          entityId: announcement.id,
          readAt: announcementIndex === armoniaAnnouncements.length - 1 ? null : new Date(),
        },
      });
    }
  }
  await prisma.notification.create({
    data: {
      tenantId: armonia.id,
      userId: teacherUser.id,
      type: NotificationType.LESSON_CHANGED,
      title: 'Αλλαγή ώρας μαθήματος',
      body: 'Το μάθημα Πιάνου της Πέμπτης μεταφέρθηκε στις 18:00.',
      entityType: 'Lesson',
      entityId: upcomingExam.id,
    },
  });
  await prisma.notification.create({
    data: {
      tenantId: melodia.id,
      userId: melodiaDirectorUser.id,
      type: NotificationType.SYSTEM,
      title: 'Καλώς ήρθατε στο MusicOS',
      body: 'Το demo περιβάλλον του Ωδείου Μελωδία είναι έτοιμο.',
      readAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: armonia.id,
      actorId: directorUser.id,
      action: 'seed.demo',
      entityType: 'Tenant',
      entityId: armonia.id,
      metadata: { note: 'Deterministic demo dataset' },
    },
  });

  const lessonCount = await prisma.lesson.count();
  const attendanceCount = await prisma.attendance.count();
  console.log('Seed complete.');
  console.table({
    tenants: 2,
    users: 8,
    students: armoniaStudents.length + melodiaStudents.length,
    teachers: armoniaTeachers.length + melodiaTeachers.length,
    'lesson series': armoniaSeriesCount + melodiaSeriesCount,
    lessons: lessonCount,
    attendance: attendanceCount,
  });
  console.log('Demo password for all accounts:', DEMO_PASSWORD);
  console.log('Accounts: superadmin@musicos.test, director@armonia.test, admin@armonia.test,');
  console.log('teacher@armonia.test, student@armonia.test, guardian@armonia.test, director@melodia.test,');
  console.log('director@dokimi.test (SUSPENDED tenant), multi@musicos.test');
  console.log('Super admin:', superAdmin.email);
  console.log('Plans:', starter.code, professional.code);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
