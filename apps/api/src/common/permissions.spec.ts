import { PERMISSIONS, PLATFORM_PERMISSIONS, ROLE_PERMISSIONS } from './permissions.js';

describe('role permissions', () => {
  it('grants directors every tenant permission', () => {
    const director = ROLE_PERMISSIONS.DIRECTOR;
    expect(new Set(director).size).toBe(director.length);
    expect(director).toEqual(
      expect.arrayContaining([
        PERMISSIONS.STUDENTS_WRITE,
        PERMISSIONS.TEACHERS_WRITE,
        PERMISSIONS.FINANCE_READ,
        PERMISSIONS.SETTINGS_MANAGE,
      ]),
    );
  });

  it('keeps sensitive settings and teacher editing away from administrators', () => {
    const administrator = ROLE_PERMISSIONS.ADMINISTRATOR;
    expect(administrator).toContain(PERMISSIONS.STUDENTS_WRITE);
    expect(administrator).toContain(PERMISSIONS.FINANCE_READ);
    expect(administrator).not.toContain(PERMISSIONS.TEACHERS_WRITE);
    expect(administrator).not.toContain(PERMISSIONS.SETTINGS_MANAGE);
    expect(administrator).not.toContain(PERMISSIONS.PLATFORM_MANAGE);
  });

  it('gives teachers attendance but not finance or administration', () => {
    const teacher = ROLE_PERMISSIONS.TEACHER;
    expect(teacher).toContain(PERMISSIONS.ATTENDANCE_WRITE);
    expect(teacher).not.toContain(PERMISSIONS.FINANCE_READ);
    expect(teacher).not.toContain(PERMISSIONS.STUDENTS_WRITE);
    expect(teacher).not.toContain(PERMISSIONS.SETTINGS_MANAGE);
  });

  it('limits students to read-only portal permissions', () => {
    const student = ROLE_PERMISSIONS.STUDENT;
    expect(student).toContain(PERMISSIONS.PORTAL_READ);
    expect(student.every((permission) => !permission.endsWith('.write'))).toBe(true);
    expect(student).not.toContain(PERMISSIONS.FINANCE_READ);
    expect(student).not.toContain(PERMISSIONS.PLATFORM_MANAGE);
  });

  it('gives guardians portal access without staff permissions', () => {
    const guardian = ROLE_PERMISSIONS.GUARDIAN;
    expect(guardian).toContain(PERMISSIONS.PORTAL_READ);
    expect(guardian).toContain(PERMISSIONS.ANNOUNCEMENTS_READ);
    expect(guardian.every((permission) => !permission.endsWith('.write'))).toBe(true);
    expect(guardian).not.toContain(PERMISSIONS.STUDENTS_READ);
    expect(guardian).not.toContain(PERMISSIONS.SCHEDULE_READ);
    expect(guardian).not.toContain(PERMISSIONS.ATTENDANCE_READ);
    expect(guardian).not.toContain(PERMISSIONS.FINANCE_READ);
    expect(guardian).not.toContain(PERMISSIONS.PLATFORM_MANAGE);
  });

  it('scopes platform permissions to the platform administrator flag', () => {
    expect(PLATFORM_PERMISSIONS).toEqual([PERMISSIONS.PLATFORM_MANAGE]);
    for (const permissions of Object.values(ROLE_PERMISSIONS)) {
      expect(permissions).not.toContain(PERMISSIONS.PLATFORM_MANAGE);
    }
  });
});
