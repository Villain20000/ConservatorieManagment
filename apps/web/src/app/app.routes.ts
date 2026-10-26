import type { Routes } from '@angular/router';
import {
  authGuard,
  guestGuard,
  permissionGuard,
  platformGuard,
  roleGuard,
  rootGuard,
} from './core/guards';

export const routes: Routes = [
  {
    path: 'login',
    title: 'MusicOS · Σύνδεση',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.LoginPage),
  },
  {
    path: 'forgot-password',
    title: 'MusicOS · Επαναφορά κωδικού',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/forgot-password').then((m) => m.ForgotPasswordPage),
  },
  {
    path: 'reset-password',
    title: 'MusicOS · Νέος κωδικός',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/reset-password').then((m) => m.ResetPasswordPage),
  },
  {
    // Deliberately not guestGuard: the user has a valid password but no session
    // yet, so `isAuthenticated` is still false while the challenge is pending.
    path: 'mfa',
    title: 'MusicOS · Επαλήθευση',
    loadComponent: () =>
      import('./features/auth/mfa-challenge').then((m) => m.MfaChallengePage),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/app-shell').then((m) => m.AppShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'MusicOS · Πίνακας',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardPage),
      },
      {
        path: 'students',
        title: 'MusicOS · Μαθητές',
        canActivate: [permissionGuard('students.read')],
        loadComponent: () => import('./features/students/students').then((m) => m.StudentsPage),
      },
      {
        path: 'crm',
        title: 'MusicOS · Υποψήφιοι (CRM)',
        canActivate: [permissionGuard('crm.read')],
        loadComponent: () => import('./features/crm/crm').then((m) => m.CrmPage),
      },
      {
        path: 'students/:id',
        title: 'MusicOS · Μαθητής',
        canActivate: [permissionGuard('students.read')],
        loadComponent: () =>
          import('./features/students/student-detail').then((m) => m.StudentDetailPage),
      },
      {
        path: 'teachers',
        title: 'MusicOS · Καθηγητές',
        canActivate: [permissionGuard('teachers.read')],
        loadComponent: () => import('./features/teachers/teachers').then((m) => m.TeachersPage),
      },
      {
        path: 'teachers/:id',
        title: 'MusicOS · Καθηγητής',
        canActivate: [permissionGuard('teachers.read')],
        loadComponent: () =>
          import('./features/teachers/teacher-detail').then((m) => m.TeacherDetailPage),
      },
      {
        path: 'academics',
        title: 'MusicOS · Ακαδημαϊκά',
        canActivate: [permissionGuard('academics.read')],
        loadComponent: () =>
          import('./features/academics/academics').then((m) => m.AcademicsPage),
      },
      {
        path: 'schedule',
        title: 'MusicOS · Πρόγραμμα',
        canActivate: [permissionGuard('schedule.read')],
        loadComponent: () => import('./features/schedule/schedule').then((m) => m.SchedulePage),
      },
      {
        path: 'attendance',
        title: 'MusicOS · Παρουσιολόγιο',
        canActivate: [permissionGuard('attendance.read'), roleGuard('DIRECTOR', 'ADMINISTRATOR', 'TEACHER')],
        loadComponent: () =>
          import('./features/attendance/attendance').then((m) => m.AttendancePage),
      },
      {
        path: 'finance',
        title: 'MusicOS · Οικονομικά',
        canActivate: [permissionGuard('finance.read')],
        loadComponent: () => import('./features/finance/finance').then((m) => m.FinancePage),
      },
      {
        path: 'exams',
        title: 'MusicOS · Εξετάσεις',
        canActivate: [permissionGuard('exams.read')],
        loadComponent: () => import('./features/exams/exams').then((m) => m.ExamsPage),
      },
      {
        path: 'documents',
        title: 'MusicOS · Έγγραφα',
        canActivate: [permissionGuard('documents.read')],
        loadComponent: () =>
          import('./features/documents/documents').then((m) => m.DocumentsPage),
      },
      {
        path: 'events',
        title: 'MusicOS · Εκδηλώσεις & Συναυλίες',
        canActivate: [permissionGuard('events.read')],
        loadComponent: () => import('./features/events/events').then((m) => m.EventsComponent),
      },
      {
        path: 'inventory',
        title: 'MusicOS · Όργανα & Εξοπλισμός',
        canActivate: [permissionGuard('inventory.read')],
        loadComponent: () => import('./features/inventory/inventory').then((m) => m.InventoryComponent),
      },
      {
        path: 'assignments',
        title: 'MusicOS · Εργασίες',
        canActivate: [permissionGuard('schedule.read')],
        loadComponent: () =>
          import('./features/assignments/assignments').then((m) => m.AssignmentsPage),
      },
      {
        path: 'announcements',
        title: 'MusicOS · Ανακοινώσεις',
        canActivate: [permissionGuard('announcements.read')],
        loadComponent: () =>
          import('./features/announcements/announcements').then((m) => m.AnnouncementsPage),
      },
      {
        path: 'settings',
        title: 'MusicOS · Ρυθμίσεις',
        loadComponent: () => import('./features/settings/settings').then((m) => m.SettingsPage),
      },
      {
        path: 'portal/schedule',
        title: 'MusicOS · Πρόγραμμα',
        canActivate: [permissionGuard('portal.read'), roleGuard('STUDENT', 'GUARDIAN')],
        loadComponent: () =>
          import('./features/portal/portal-schedule').then((m) => m.PortalSchedulePage),
      },
      {
        path: 'portal/attendance',
        title: 'MusicOS · Παρουσίες',
        canActivate: [permissionGuard('portal.read'), roleGuard('STUDENT', 'GUARDIAN')],
        loadComponent: () =>
          import('./features/portal/portal-attendance').then((m) => m.PortalAttendancePage),
      },
      {
        path: 'portal/results',
        title: 'MusicOS · Αποτελέσματα',
        canActivate: [permissionGuard('portal.read'), roleGuard('STUDENT', 'GUARDIAN')],
        loadComponent: () =>
          import('./features/portal/portal-results').then((m) => m.PortalResultsPage),
      },
      {
        path: 'portal/finance',
        title: 'MusicOS · Οφειλές',
        canActivate: [permissionGuard('portal.read'), roleGuard('STUDENT', 'GUARDIAN')],
        loadComponent: () =>
          import('./features/portal/portal-finance').then((m) => m.PortalFinancePage),
      },
      {
        path: 'portal/documents',
        title: 'MusicOS · Έγγραφα',
        canActivate: [permissionGuard('portal.read'), roleGuard('STUDENT', 'GUARDIAN')],
        loadComponent: () =>
          import('./features/portal/portal-documents').then((m) => m.PortalDocumentsPage),
      },
      {
        path: 'portal/assignments',
        title: 'MusicOS · Εργασίες',
        canActivate: [permissionGuard('portal.read'), roleGuard('STUDENT', 'GUARDIAN')],
        loadComponent: () =>
          import('./features/portal/portal-assignments').then((m) => m.PortalAssignmentsPage),
      },
      {
        path: 'practice',
        title: 'MusicOS · Χώρος μελέτης',
        loadComponent: () =>
          import('./features/practice/practice').then((m) => m.PracticePage),
      },
    ],
  },
  {
    path: 'platform',
    canActivate: [platformGuard],
    loadComponent: () => import('./layout/platform-shell').then((m) => m.PlatformShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'MusicOS · Πλατφόρμα',
        loadComponent: () =>
          import('./features/platform/platform-overview').then((m) => m.PlatformOverviewPage),
      },
      {
        path: 'tenants/:id',
        title: 'MusicOS · Ωδείο',
        loadComponent: () =>
          import('./features/platform/platform-tenant').then((m) => m.PlatformTenantPage),
      },
    ],
  },
  { path: '', canActivate: [rootGuard], children: [] },
  {
    path: '**',
    title: 'MusicOS · 404',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFoundPage),
  },
];
