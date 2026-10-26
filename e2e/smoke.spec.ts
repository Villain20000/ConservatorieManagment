import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'MusicOS2026!';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Σύνδεση', exact: true }).click();
}

test.describe('authentication', () => {
  test('renders the bilingual login screen', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.getByText('MusicOS').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Σύνδεση', exact: true })).toBeVisible();
  });

  test('rejects invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#login-email').fill('director@armonia.test');
    await page.locator('#login-password').fill('wrong-password');
    await page.getByRole('button', { name: 'Σύνδεση', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Λανθασμένο');
  });

  test('asks multi-tenant users to choose a conservatory', async ({ page }) => {
    await signIn(page, 'multi@musicos.test');
    await expect(page.getByRole('heading', { name: 'Επιλέξτε ωδείο' })).toBeVisible();
    await page.getByRole('button', { name: /Ωδείο Αρμονία/ }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/);
  });
});

test.describe('director console', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'director@armonia.test');
    await expect(page).toHaveURL(/\/app\/dashboard/);
  });

  test('loads the dashboard and roster pages', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Καλώς ήρθατε');
    const nav = page.locator('nav');
    await expect(nav.getByRole('link', { name: 'Μαθητές', exact: true })).toBeVisible();

    await nav.getByRole('link', { name: 'Μαθητές', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/students/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Μαθητές');
    await expect(page.locator('tbody tr').first()).toBeVisible();

    await nav.getByRole('link', { name: 'Οικονομικά', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/finance/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Οικονομικά');
  });

  test('switches language and theme', async ({ page }) => {
    await page.getByRole('button', { name: 'Γλώσσα' }).click();
    const nav = page.locator('nav');
    await expect(nav.getByRole('link', { name: 'Students', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Theme' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('records attendance for a teaching day', async ({ page }) => {
    await page.goto('/app/attendance');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Παρουσιολόγιο');

    for (let i = 0; i < 7; i++) {
      if (await page.getByRole('button', { name: 'Όλοι παρόντες' }).isVisible().catch(() => false)) {
        break;
      }
      await page.getByRole('button', { name: 'Προηγούμενη σελίδα' }).click();
      await page.waitForTimeout(300);
    }
    await expect(page.getByRole('button', { name: 'Όλοι παρόντες' })).toBeVisible();
    await page.getByRole('button', { name: 'Όλοι παρόντες' }).click();
    await page.getByRole('button', { name: 'Αποθήκευση παρουσιών' }).click();
    await expect(page.getByText('Οι παρουσίες αποθηκεύτηκαν.')).toBeVisible();
  });

  test('creates and deletes an announcement', async ({ page }) => {
    const title = `Δοκιμαστική ανακοίνωση ${Date.now()}`;
    await page.goto('/app/announcements');
    await page.getByRole('button', { name: 'Νέα ανακοίνωση' }).click();
    await page.locator('#announcement-title').fill(title);
    await page.locator('#announcement-body').fill('Αυτή η ανακοίνωση δημιουργήθηκε από αυτόματο έλεγχο.');
    await page.getByRole('button', { name: 'Δημιουργία', exact: true }).click();

    const article = page.locator('article').filter({ hasText: title });
    await expect(article).toBeVisible();

    await article.getByRole('button', { name: 'Διαγραφή' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Διαγραφή' }).click();
    await expect(article).toBeHidden();
  });
});

test.describe('multi-tenant access', () => {
  test('switches the active conservatory', async ({ page }) => {
    await signIn(page, 'multi@musicos.test');
    await page.getByRole('button', { name: /Ωδείο Αρμονία/ }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/);

    await page.locator('button[aria-expanded]').first().click();
    await page.getByRole('button', { name: /Ωδείο Μελωδία/ }).click();
    await expect(page.locator('aside').getByText('Ωδείο Μελωδία').first()).toBeVisible();
    await expect(page).toHaveURL(/\/app\/dashboard/);
  });
});

test.describe('student portal', () => {
  test('shows only portal navigation and blocks tenant screens', async ({ page }) => {
    await signIn(page, 'student@armonia.test');
    await expect(page).toHaveURL(/\/app\/dashboard/);

    const nav = page.locator('nav');
    await expect(nav.getByRole('link', { name: 'Οφειλές', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Οικονομικά', exact: true })).toHaveCount(0);

    await page.goto('/app/portal/schedule');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Το πρόγραμμά μου');
    await expect(page.getByText('Πιάνο – Ατομικό').first()).toBeVisible();

    await page.goto('/app/finance');
    await expect(page).toHaveURL(/\/app\/dashboard/);
  });
});

test.describe('platform console', () => {
  test('shows tenant subscriptions and detail', async ({ page }) => {
    await signIn(page, 'superadmin@musicos.test');
    await expect(page).toHaveURL(/\/platform/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Πλατφόρμα');
    await expect(page.getByText('Ωδείο Αρμονία').first()).toBeVisible();

    await page.locator('a.card').filter({ hasText: 'Ωδείο Αρμονία' }).click();
    await expect(page).toHaveURL(/\/platform\/tenants\//);
    await expect(page.getByText('Ωδείο Αρμονία Αστική Μη Κερδοσκοπική Εταιρεία')).toBeVisible();
    await expect(page.getByText('Νομική επωνυμία')).toBeVisible();
    await expect(page.getByText('Μέλη').first()).toBeVisible();
  });
});
