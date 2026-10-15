import { expect, login, test } from '../src/fixtures';

test('a creator picks a manual panel by hand and it is seated in that order', async ({ page }) => {
  await login(page, 'creator1@example.com');
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/cases/new');
  const title = `Manual e2e ${Date.now()}`;
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Description').fill('The parties asked for specific jurors.');
  await page.getByLabel('Outcome 1', { exact: true }).fill('Buyer');
  await page.getByLabel('Outcome 2', { exact: true }).fill('Seller');
  // Kleros' radio input is visually hidden: pick by the visible label, as a user does.
  await page.getByText('Manual selection', { exact: true }).click();
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

  const pool = page.getByRole('list', { name: 'Eligible jurors' });
  await expect(pool.getByRole('listitem')).toHaveText(['Juror 1', 'Juror 2', 'Juror 3', 'Juror 4', 'Juror 5']);
  const assign = page.getByRole('button', { name: 'Assign jurors' });
  await expect(assign).toBeDisabled();
  for (const name of ['Juror 3', 'Juror 1', 'Juror 5']) await pool.getByLabel(name).check();
  await expect(page.getByText('Selected 3 of 3: Juror 3, Juror 1, Juror 5')).toBeVisible();
  await expect(pool.getByLabel('Juror 2')).toBeDisabled();
  await assign.click();

  const panel = page.getByRole('list', { name: 'Drawn jurors' }).getByRole('listitem');
  await expect(panel).toHaveText([/^Juror 3 · Vote by/, /^Juror 1 · Vote by/, /^Juror 5 · Vote by/]);
  await expect(page.getByText('Voting').first()).toBeVisible();
  await expect(pool).toHaveCount(0);

  await page.reload();
  await expect(panel).toHaveText([/^Juror 3 · Vote by/, /^Juror 1 · Vote by/, /^Juror 5 · Vote by/]);
  expect(consoleErrors).toEqual([]);
});
