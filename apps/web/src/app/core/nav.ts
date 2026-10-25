import type { Permission, Role } from './models';

export interface NavItem {
  labelKey: string;
  icon: string;
  route: string;
  permissions?: Permission[];
  roles?: Role[];
  exact?: boolean;
}

export interface NavSection {
  labelKey: string;
  items: NavItem[];
}

export function navSectionsFor(
  role: Role | null,
  has: (permission: Permission) => boolean,
  can?: (feature: 'finance' | 'exams' | 'portals' | 'multiBranch') => boolean,
): NavSection[] {
  if (role === 'STUDENT' || role === 'GUARDIAN') {
    return [
      {
        labelKey: 'nav.overview',
        items: [{ labelKey: 'nav.dashboard', icon: 'dashboard', route: '/app/dashboard' }],
      },
      {
        labelKey: 'nav.myMusic',
        items: [
          { labelKey: 'nav.portalSchedule', icon: 'calendar', route: '/app/portal/schedule' },
          { labelKey: 'nav.portalAttendance', icon: 'check-circle', route: '/app/portal/attendance' },
          { labelKey: 'nav.portalResults', icon: 'award', route: '/app/portal/results' },
          { labelKey: 'nav.assignments', icon: 'book', route: '/app/portal/assignments' },
          { labelKey: 'nav.portalFinance', icon: 'credit-card', route: '/app/portal/finance' },
          { labelKey: 'nav.portalDocuments', icon: 'folder', route: '/app/portal/documents' },
          { labelKey: 'nav.practice', icon: 'music', route: '/app/practice' },
        ],
      },
      {
        labelKey: 'nav.community',
        items: [{ labelKey: 'nav.announcements', icon: 'megaphone', route: '/app/announcements' }],
      },
    ];
  }

  const sections: NavSection[] = [
    {
      labelKey: 'nav.overview',
      items: [{ labelKey: 'nav.dashboard', icon: 'dashboard', route: '/app/dashboard' }],
    },
  ];

  const teaching: NavItem[] = [];
  if (has('students.read')) {
    teaching.push({ labelKey: 'nav.students', icon: 'users', route: '/app/students' });
  }
  if (has('teachers.read')) {
    teaching.push({ labelKey: 'nav.teachers', icon: 'music', route: '/app/teachers' });
  }
  if (has('academics.read')) {
    teaching.push({ labelKey: 'nav.academics', icon: 'graduation', route: '/app/academics' });
  }
  if (has('schedule.read')) {
    teaching.push({ labelKey: 'nav.schedule', icon: 'calendar', route: '/app/schedule' });
  }
  if (has('attendance.read')) {
    teaching.push({ labelKey: 'nav.attendance', icon: 'check-circle', route: '/app/attendance' });
  }
  if (has('schedule.read')) {
    teaching.push({ labelKey: 'nav.assignments', icon: 'book', route: '/app/assignments' });
  }
  teaching.push({ labelKey: 'nav.practice', icon: 'music', route: '/app/practice' });
  if (teaching.length) {
    sections.push({ labelKey: 'nav.teaching', items: teaching });
  }

  const business: NavItem[] = [];
  // A module the plan does not include is hidden rather than shown-and-blocked:
  // the API would 403 anyway, and a dead link is worse than no link.
  if (has('finance.read') && (can?.('finance') ?? true)) {
    business.push({ labelKey: 'nav.finance', icon: 'credit-card', route: '/app/finance' });
  }
  if (has('exams.read') && (can?.('exams') ?? true)) {
    business.push({ labelKey: 'nav.exams', icon: 'award', route: '/app/exams' });
  }
  if (has('documents.read')) {
    business.push({ labelKey: 'nav.documents', icon: 'folder', route: '/app/documents' });
  }
  if (business.length) {
    sections.push({ labelKey: 'nav.administration', items: business });
  }

  const community: NavItem[] = [];
  if (has('announcements.read')) {
    community.push({ labelKey: 'nav.announcements', icon: 'megaphone', route: '/app/announcements' });
  }
  if (community.length) {
    sections.push({ labelKey: 'nav.community', items: community });
  }

  return sections;
}
