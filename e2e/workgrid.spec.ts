import { expect, test, type Browser, type Page } from '@playwright/test';

// These accounts and the "acme" workspace come from `pnpm seed`.
const DEMO = { email: 'demo@workgrid.dev', password: 'demo1234' };
const PRIYA = { email: 'priya@workgrid.dev', password: 'demo1234' };
const TOM_VIEWER = { email: 'tom@workgrid.dev', password: 'demo1234' };

async function signIn(browser: Browser, account: { email: string; password: string }): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // The dashboard greets by name; the login page's own heading is a bare "Welcome back".
  await expect(page.getByRole('heading', { name: /Welcome back, / })).toBeVisible();
  return page;
}

async function openBoard(page: Page, project: string) {
  await page.goto('/acme/projects');
  await page.getByRole('link', { name: project }).first().click();
  await expect(page.getByRole('heading', { name: project })).toBeVisible();
  await expect(page.getByText('Live')).toBeVisible();
}

test('rejects a wrong password and protects workspace routes', async ({ page }) => {
  await page.goto('/acme');
  await expect(page).toHaveURL(/\/login\?next=%2Facme/);
  await page.getByLabel('Email').fill(DEMO.email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Incorrect email or password')).toBeVisible();
});

test('keeps the session across a reload and scopes data to the active workspace', async ({ browser }) => {
  const page = await signIn(browser, DEMO);
  await page.goto('/acme/projects');
  await expect(page.getByRole('link', { name: 'Website Redesign' }).first()).toBeVisible();

  await page.reload(); // the access token is memory-only; the refresh cookie restores it
  await expect(page.getByRole('link', { name: 'Website Redesign' }).first()).toBeVisible();

  await page.goto('/globex/projects');
  await expect(page.getByRole('link', { name: 'Research Sprint' }).first()).toBeVisible();
  await expect(page.getByRole('main').getByText('Website Redesign')).toHaveCount(0);
});

test('syncs board changes between two users in real time', async ({ browser }) => {
  const [demo, priya] = await Promise.all([signIn(browser, DEMO), signIn(browser, PRIYA)]);
  await Promise.all([openBoard(demo, 'Platform API'), openBoard(priya, 'Platform API')]);
  await expect(demo.getByLabel('2 viewing now')).toBeVisible();

  const title = `E2E task ${Date.now()}`;
  const backlog = demo.getByRole('region', { name: 'Backlog' });
  await backlog.getByRole('button', { name: 'Add task' }).click();
  await backlog.getByLabel('New task title').fill(title);
  await backlog.getByLabel('New task title').press('Enter');

  // Priya never reloads: the card arrives over the socket.
  await expect(priya.getByRole('region', { name: 'Backlog' }).getByText(title)).toBeVisible();

  await demo.getByText(title).click();
  await demo.getByLabel('Status').selectOption('done');
  await expect(priya.getByRole('region', { name: 'Done' }).getByText(title)).toBeVisible();

  await demo.getByRole('button', { name: 'Delete task' }).click();
  await demo.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(priya.getByText(title)).toHaveCount(0);
});

test('gives viewers a read-only board', async ({ browser }) => {
  const page = await signIn(browser, TOM_VIEWER);
  await openBoard(page, 'Platform API');
  await expect(page.getByRole('button', { name: 'Add task' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Activity' })).toHaveCount(0);
  await page.goto('/acme/projects');
  await expect(page.getByRole('button', { name: 'New project' })).toHaveCount(0);
});
