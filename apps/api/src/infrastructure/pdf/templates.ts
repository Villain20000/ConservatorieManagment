import type { createPdf } from 'pdfmake';
import type { DocumentType } from '../../generated/prisma/enums.js';

export type TDocumentDefinitions = Parameters<typeof createPdf>[0];

export interface StudentSnapshot {
  firstName: string;
  lastName: string;
  registrationNumber: string;
  birthDate?: string | null;
  branch?: string | null;
  program?: string | null;
  level?: string | null;
}

export interface TemplateContext {
  tenant: { name: string; legalName?: string | null };
  student?: StudentSnapshot | null;
  protocolNumber?: string | null;
  issuedAt: Date;
  watermark: boolean;
  data: Record<string, unknown>;
}

export interface DocumentTemplate {
  key: string;
  type: DocumentType;
  title: string;
  build(context: TemplateContext): TDocumentDefinitions;
}

const COLORS = {
  ink: '#1d2433',
  muted: '#667085',
  line: '#d8dde6',
  accent: '#9a6b2f',
};

function dateLabel(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('el-GR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Athens',
  }).format(date);
}

function money(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(value);
}

function fullName(student?: StudentSnapshot | null): string {
  if (!student) return '—';
  return `${student.lastName} ${student.firstName}`.trim();
}

function baseDefinition(context: TemplateContext, content: unknown[]): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageMargins: [48, 56, 48, 56],
    ...(context.watermark
      ? {
          watermark: {
            text: 'ΜΗ ΕΠΙΣΗΜΟ',
            color: '#b42318',
            opacity: 0.12,
            bold: true,
            italics: false,
            fontSize: 64,
          },
        }
      : {}),
    defaultStyle: { font: 'DejaVuSans', fontSize: 10, color: COLORS.ink },
    styles: {
      title: { fontSize: 19, bold: true, margin: [0, 0, 0, 2] },
      subtitle: { fontSize: 10, color: COLORS.muted, margin: [0, 0, 0, 14] },
      section: { fontSize: 12, bold: true, margin: [0, 14, 0, 6] },
      label: { fontSize: 9, color: COLORS.muted },
      value: { fontSize: 10 },
      small: { fontSize: 8, color: COLORS.muted },
      statement: { fontSize: 10.5, lineHeight: 1.5, margin: [0, 8, 0, 8] },
    },
    content: content as TDocumentDefinitions['content'],
    footer: (currentPage: number, pageCount: number) => ({
      margin: [48, 16, 48, 0],
      columns: [
        {
          text: 'Εγγραφο διαχείρισης ωδείου — δεν αποτελεί επίσημο δημόσιο έγγραφο.',
          style: 'small',
        },
        { text: `${currentPage} / ${pageCount}`, alignment: 'right', style: 'small' },
      ],
    }),
  };
}

function heading(context: TemplateContext, title: string, subtitle?: string): unknown[] {
  return [
    { text: context.tenant.legalName || context.tenant.name, style: 'small' },
    { text: title, style: 'title' },
    {
      text: subtitle ?? `Αρ. Πρωτ.: ${context.protocolNumber ?? '—'} · ${dateLabel(context.issuedAt)}`,
      style: 'subtitle',
    },
  ];
}

function studentBlock(student?: StudentSnapshot | null): unknown {
  return {
    table: {
      widths: ['28%', '72%'],
      body: [
        [{ text: 'Μαθητής/Μαθήτρια', style: 'label' }, { text: fullName(student), style: 'value' }],
        [
          { text: 'Αρ. Μητρώου', style: 'label' },
          { text: student?.registrationNumber ?? '—', style: 'value' },
        ],
        [
          { text: 'Ημ. Γέννησης', style: 'label' },
          { text: student?.birthDate ? dateLabel(student.birthDate) : '—', style: 'value' },
        ],
        [
          { text: 'Παράρτημα', style: 'label' },
          { text: student?.branch ?? '—', style: 'value' },
        ],
        [
          { text: 'Πρόγραμμα / Επίπεδο', style: 'label' },
          {
            text: [student?.program, student?.level].filter(Boolean).join(' · ') || '—',
            style: 'value',
          },
        ],
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 0, 8],
  };
}

function signatureBlock(): unknown {
  return {
    margin: [0, 48, 0, 0],
    columns: [
      { text: 'Ο/Η Διευθυντής/ντρια\n\n_______________________', alignment: 'right', style: 'small' },
    ],
  };
}

function typed<T>(context: TemplateContext): T {
  return context.data as T;
}

interface AttendanceData {
  total?: number;
  present?: number;
  late?: number;
  absent?: number;
  excused?: number;
  rate?: number | null;
  periodLabel?: string;
}

interface GradeRow {
  exam: string;
  date?: string | Date | null;
  grade?: number | string | null;
  outcome?: string | null;
}

interface PaymentData {
  receiptNumber?: string;
  amountCents?: number;
  method?: string;
  paidAt?: string | Date;
  reference?: string | null;
  allocations?: Array<{ description: string; amountCents: number }>;
}

interface ExamMinutesData {
  examTitle?: string;
  examDate?: string | Date;
  location?: string | null;
  program?: string | null;
  committee?: Array<{ name: string; role: string }>;
  results?: Array<{ student: string; grade?: number | string | null; outcome?: string | null }>;
}

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    key: 'registration-form.v1',
    type: 'REGISTRATION_FORM',
    title: 'Έντυπο εγγραφής',
    build(context) {
      const data = typed<{ guardians?: Array<{ name: string; relationship: string; phone?: string }> }>(
        context,
      );
      return baseDefinition(context, [
        ...heading(context, 'Έντυπο Εγγραφής'),
        studentBlock(context.student),
        ...(data.guardians?.length
          ? [
              { text: 'Κηδεμόνες', style: 'section' },
              {
                table: {
                  widths: ['40%', '30%', '30%'],
                  body: [
                    [
                      { text: 'Ονοματεπώνυμο', style: 'label' },
                      { text: 'Σχέση', style: 'label' },
                      { text: 'Τηλέφωνο', style: 'label' },
                    ],
                    ...data.guardians.map((guardian) => [
                      guardian.name,
                      guardian.relationship,
                      guardian.phone ?? '—',
                    ]),
                  ],
                },
                layout: 'lightHorizontalLines',
              },
            ]
          : []),
        {
          text: 'Δηλώνω ότι τα στοιχεία είναι ακριβή και ότι έχω ενημερωθεί για τους κανονισμούς λειτουργίας του ωδείου.',
          style: 'statement',
        },
        signatureBlock(),
      ]);
    },
  },
  {
    key: 'attendance-certificate.v1',
    type: 'ATTENDANCE_CERTIFICATE',
    title: 'Βεβαίωση παρακολούθησης',
    build(context) {
      const data = typed<AttendanceData>(context);
      return baseDefinition(context, [
        ...heading(context, 'Βεβαίωση Παρακολούθησης'),
        studentBlock(context.student),
        {
          text: `Βεβαιώνεται ότι ο/η ${fullName(context.student)} παρακολούθησε τα μαθήματα ${
            data.periodLabel ? `την περίοδο ${data.periodLabel}` : 'την τρέχουσα περίοδο'
          }.`,
          style: 'statement',
        },
        {
          table: {
            widths: ['25%', '25%', '25%', '25%'],
            body: [
              [
                { text: 'Παρουσίες', style: 'label' },
                { text: 'Καθυστερήσεις', style: 'label' },
                { text: 'Απουσίες', style: 'label' },
                { text: 'Ποσοστό', style: 'label' },
              ],
              [
                String(data.present ?? 0),
                String(data.late ?? 0),
                String((data.absent ?? 0) + (data.excused ?? 0)),
                data.rate == null ? '—' : `${data.rate}%`,
              ],
            ],
          },
          layout: 'lightHorizontalLines',
        },
        signatureBlock(),
      ]);
    },
  },
  {
    key: 'grade-transcript.v1',
    type: 'GRADE_TRANSCRIPT',
    title: 'Αναλυτική βαθμολογία',
    build(context) {
      const data = typed<{ grades?: GradeRow[] }>(context);
      return baseDefinition(context, [
        ...heading(context, 'Αναλυτική Βαθμολογία'),
        studentBlock(context.student),
        {
          table: {
            widths: ['45%', '20%', '15%', '20%'],
            body: [
              [
                { text: 'Εξέταση', style: 'label' },
                { text: 'Ημερομηνία', style: 'label' },
                { text: 'Βαθμός', style: 'label' },
                { text: 'Αποτέλεσμα', style: 'label' },
              ],
              ...(data.grades ?? []).map((row) => [
                row.exam,
                dateLabel(row.date),
                row.grade == null ? '—' : String(row.grade),
                row.outcome ?? '—',
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
        signatureBlock(),
      ]);
    },
  },
  {
    key: 'certificate.v1',
    type: 'CERTIFICATE',
    title: 'Πιστοποιητικό φοίτησης',
    build(context) {
      const data = typed<{ program?: string; level?: string; academicYear?: string }>(context);
      return baseDefinition(context, [
        ...heading(context, 'Πιστοποιητικό Φοίτησης'),
        studentBlock(context.student),
        {
          text: `Πιστοποιείται ότι ο/η ${fullName(context.student)} είναι εγγεγραμμένος/η και φοιτά ${
            data.program ? `στο πρόγραμμα «${data.program}»` : 'στο ωδείο'
          }${data.level ? `, επίπεδο ${data.level}` : ''}${
            data.academicYear ? `, κατά το ακαδημαϊκό έτος ${data.academicYear}` : ''
          }.`,
          style: 'statement',
        },
        signatureBlock(),
      ]);
    },
  },
  {
    key: 'diploma.v1',
    type: 'DIPLOMA',
    title: 'Δίπλωμα',
    build(context) {
      const data = typed<{ program?: string; level?: string; award?: string }>(context);
      return baseDefinition(context, [
        ...heading(context, 'Δίπλωμα'),
        {
          text: `Απονέμεται στον/στην ${fullName(context.student)}${
            data.program ? ` για την ολοκλήρωση του προγράμματος «${data.program}»` : ''
          }${data.level ? ` στο επίπεδο ${data.level}` : ''}.`,
          style: 'statement',
          alignment: 'center',
          margin: [0, 24, 0, 24],
        },
        { text: data.award ?? '', alignment: 'center', bold: true },
        signatureBlock(),
      ]);
    },
  },
  {
    key: 'exam-minutes.v1',
    type: 'EXAM_RECORD',
    title: 'Πρακτικό εξέτασης',
    build(context) {
      const data = typed<ExamMinutesData>(context);
      return baseDefinition(context, [
        ...heading(context, 'Πρακτικό Εξέτασης'),
        {
          table: {
            widths: ['30%', '70%'],
            body: [
              [
                { text: 'Εξέταση', style: 'label' },
                { text: data.examTitle ?? '—', style: 'value' },
              ],
              [
                { text: 'Πρόγραμμα', style: 'label' },
                { text: data.program ?? '—', style: 'value' },
              ],
              [
                { text: 'Ημερομηνία', style: 'label' },
                { text: dateLabel(data.examDate), style: 'value' },
              ],
              [
                { text: 'Τοποθεσία', style: 'label' },
                { text: data.location ?? '—', style: 'value' },
              ],
            ],
          },
          layout: 'lightHorizontalLines',
        },
        { text: 'Επιτροπή', style: 'section' },
        {
          table: {
            widths: ['65%', '35%'],
            body: [
              [
                { text: 'Μέλος', style: 'label' },
                { text: 'Ρόλος', style: 'label' },
              ],
              ...(data.committee ?? []).map((member) => [member.name, member.role]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
        { text: 'Αποτελέσματα', style: 'section' },
        {
          table: {
            widths: ['50%', '20%', '30%'],
            body: [
              [
                { text: 'Μαθητής/Μαθήτρια', style: 'label' },
                { text: 'Βαθμός', style: 'label' },
                { text: 'Αποτέλεσμα', style: 'label' },
              ],
              ...(data.results ?? []).map((row) => [
                row.student,
                row.grade == null ? '—' : String(row.grade),
                row.outcome ?? '—',
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
        signatureBlock(),
      ]);
    },
  },
  {
    key: 'payment-receipt.v1',
    type: 'OTHER',
    title: 'Απόδειξη πληρωμής',
    build(context) {
      const data = typed<PaymentData>(context);
      return baseDefinition(
        { ...context, watermark: false },
        [
          ...heading(
            context,
            'Απόδειξη Είσπραξης',
            `Αρ. Απόδειξης: ${data.receiptNumber ?? context.protocolNumber ?? '—'} · ${dateLabel(
              data.paidAt ?? context.issuedAt,
            )}`,
          ),
          studentBlock(context.student),
          {
            table: {
              widths: ['40%', '30%', '30%'],
              body: [
                [
                  { text: 'Περιγραφή', style: 'label' },
                  { text: 'Τρόπος', style: 'label' },
                  { text: 'Ποσό', style: 'label' },
                ],
                [
                  'Πληρωμή έναντι οφειλών',
                  data.method ?? '—',
                  { text: money(data.amountCents), bold: true },
                ],
              ],
            },
            layout: 'lightHorizontalLines',
          },
          ...(data.allocations?.length
            ? [
                { text: 'Κατανομή', style: 'section' },
                {
                  table: {
                    widths: ['70%', '30%'],
                    body: [
                      [
                        { text: 'Χρέωση', style: 'label' },
                        { text: 'Ποσό', style: 'label' },
                      ],
                      ...data.allocations.map((row) => [row.description, money(row.amountCents)]),
                    ],
                  },
                  layout: 'lightHorizontalLines',
                },
              ]
            : []),
          {
            text: `Σύνολο: ${money(data.amountCents)}${data.reference ? ` · Αναφορά: ${data.reference}` : ''}`,
            bold: true,
            margin: [0, 14, 0, 0],
            alignment: 'right',
          },
          signatureBlock(),
        ],
      );
    },
  },
];

export function getTemplate(key: string): DocumentTemplate {
  const template = DOCUMENT_TEMPLATES.find((item) => item.key === key);
  if (!template) {
    throw new Error(`Unknown document template: ${key}`);
  }
  return template;
}
