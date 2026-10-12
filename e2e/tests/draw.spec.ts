import { expect, login, test } from '../src/fixtures';

test('a creator draws a random jury and sees the jurors by name with their deadlines', async ({ page }) => {
  await login(page, 'creator1@example.com');

  // After login: the anonymous `/api/me` 401s before it are expected. React warnings (e.g. missing keys) land here.
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/cases/new');
  const title = `Draw e2e ${Date.now()}`;
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Description').fill('The seller shipped two weeks after the agreed date.');
  await page.getByLabel('Outcome 1', { exact: true }).fill('Buyer');
  await page.getByLabel('Outcome 2', { exact: true }).fill('Seller');
  await page.getByRole('button', { name: 'Create case' }).click();

  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText('Awaiting jurors').first()).toBeVisible();

  await page.getByRole('button', { name: 'Draw jurors' }).click();

  const jurors = page.getByRole('list', { name: 'Drawn jurors' }).getByRole('listitem');
  // Default panel size is 3; seeded jurors are named "Juror 1".."Juror 5" and emails must never be shown.
  await expect(jurors).toHaveCount(3);
  for (const juror of await jurors.all()) {
    await expect(juror).toHaveText(/^Juror [1-5] · Vote by .+\d/);
    await expect(juror).not.toHaveText(/@|undefined|Invalid Date/);
  }
  const drawn = await jurors.allTextContents();
  expect(new Set(drawn.map((text) => text.split(' · ')[0])).size).toBe(3);

  await expect(page.getByText('Voting').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Draw jurors' })).toHaveCount(0);

  // The panel is persisted: a fresh load of the detail shows the same jurors, order and deadlines.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(jurors).toHaveText(drawn);
  await expect(page.getByRole('button', { name: 'Draw jurors' })).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});
