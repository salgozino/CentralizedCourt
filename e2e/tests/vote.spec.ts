import { expect, login, test } from '../src/fixtures';

test('drawn jurors vote in the browser and the case becomes "Resolved: Buyer"', async ({ page, browser }) => {
  await login(page, 'creator1@example.com');
  await page.goto('/cases/new');
  const title = `Vote e2e ${Date.now()}`;
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Description').fill('The seller shipped two weeks after the agreed date.');
  await page.getByLabel('Outcome 1', { exact: true }).fill('Buyer');
  await page.getByLabel('Outcome 2', { exact: true }).fill('Seller');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Draw jurors' }).click();

  const jurors = page.getByRole('list', { name: 'Drawn jurors' }).getByRole('listitem');
  await expect(jurors).toHaveCount(3);
  const caseUrl = page.url();
  // Seeded jurors are "Juror N" <jurorN@example.com>; the UI never shows emails.
  const names = (await jurors.allTextContents()).map((text) => text.split(' · ')[0]);
  const choices = ['Buyer', 'Buyer', 'Seller'];

  for (const [i, name] of names.entries()) {
    const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const juror = await context.newPage();
    await login(juror, `${name.replace(' ', '').toLowerCase()}@example.com`);
    await juror.goto(caseUrl);
    const vote = juror.getByRole('region', { name: 'Your vote' });
    // Kleros' radio input is visually hidden: pick the outcome by its visible label, as a user does.
    await vote.getByText(choices[i], { exact: true }).click();
    await expect(vote.getByRole('radio', { name: choices[i] })).toBeChecked();
    await vote.getByRole('button', { name: 'Cast vote' }).click();
    if (i < names.length - 1) {
      await expect(vote).toContainText(`You voted: ${choices[i]}`);
      await expect(juror.getByRole('list', { name: 'Drawn jurors' }).getByRole('listitem').nth(i)).toContainText(
        'Voted',
      );
    } else {
      await expect(juror.getByRole('region', { name: 'Result' })).toContainText('Resolved: Buyer');
    }
    await context.close();
  }

  await page.reload();
  await expect(page.getByRole('region', { name: 'Result' })).toContainText('Resolved: Buyer');
  await expect(jurors).toHaveText([/Voted Buyer$/, /Voted Buyer$/, /Voted Seller$/]);
  await page.goto('/cases');
  await expect(page.getByRole('listitem').filter({ hasText: title })).toContainText('Result: Buyer');
});
