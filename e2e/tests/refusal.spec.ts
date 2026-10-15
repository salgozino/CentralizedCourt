import { expect, login, test } from '../src/fixtures';

test('a juror confirms refusal, loses access, and the creator fills the vacant seat with linked history', async ({
  page,
}) => {
  await login(page, 'creator1@example.com');
  await page.goto('/cases/new');
  await page.getByLabel('Title').fill(`Refusal e2e ${Date.now()}`);
  await page.getByLabel('Description').fill('A conflict requires a replacement.');
  await page.getByLabel('Outcome 1', { exact: true }).fill('A');
  await page.getByLabel('Outcome 2', { exact: true }).fill('B');
  await page.getByText('Manual selection', { exact: true }).click();
  await expect(page.getByLabel('Refusal hours', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Refusal days', { exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByRole('heading', { name: 'Jurors', exact: true })).toBeVisible();
  const url = page.url();
  for (const name of ['Juror 1', 'Juror 2', 'Juror 3']) {
    await page.getByRole('button', { name: /Add a juror/ }).click();
    await page.getByRole('option', { name, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Assign jurors', exact: true }).click();
  await expect(page.getByText('Refusal period', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();
  await login(page, 'juror1@example.com');
  await page.goto(url);
  await page.getByRole('button', { name: 'Refuse assignment', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('permanently excluded');
  await dialog.getByRole('button', { name: 'Keep assignment' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Refuse assignment', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm refusal' }).click();
  await expect(page.getByText('Assignment refused.', { exact: false })).toBeVisible();
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Case not found' })).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();
  await login(page, 'creator1@example.com');
  await page.goto(url);
  await page.getByLabel('Replacement for seat 1').selectOption({ label: 'Juror 4' });
  await page.getByRole('button', { name: 'Fill seat 1' }).click();
  await expect(page.getByRole('list', { name: 'Assignment history' }).getByRole('listitem')).toHaveCount(4);
  await page.reload();
  await expect(page.getByRole('list', { name: 'Drawn jurors' })).toContainText('Juror 4');
  await expect(page.getByRole('list', { name: 'Assignment history' })).toContainText('Replaces assignment');
});
