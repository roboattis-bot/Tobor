import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const account = {
  name: 'Pilot Operator',
  email: 'pilot-operator@example.test',
  password: 'Tobor test phrase 2026!',
};
const requestTitle = 'E2E sensor mounting bracket';

async function signIn(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back.', exact: true })).toBeVisible();
  await page.getByLabel('Email address', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Workspace connected', { exact: true })).toBeVisible();
}

function watchRuntime(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 500) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  return errors;
}

async function saveScreenshot(page: Page, filename: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const model = page.locator('.model-view:visible').first();
  if (await model.count()) await expect(model).toHaveAttribute('data-model-ready', 'true');
  if (await page.locator('.auth-story').isVisible()) {
    await expect(page.locator('.auth-story .printer-scene')).toBeVisible();
  }
  await page.screenshot({
    path: resolve('test-results', filename),
    fullPage: true,
    animations: 'disabled',
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const sizes = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const documentWidth = document.documentElement.scrollWidth;
    const overflowing =
      documentWidth > viewport + 1
        ? [...document.body.querySelectorAll<HTMLElement>('*')]
            .filter((element) => element.getBoundingClientRect().right > viewport + 1)
            .slice(0, 16)
            .map((element) => ({
              element: `${element.tagName}.${element.className}`,
              right: Math.round(element.getBoundingClientRect().right),
              width: Math.round(element.getBoundingClientRect().width),
              overflowX: getComputedStyle(element).overflowX,
              parent: element.parentElement
                ? `${element.parentElement.tagName}.${element.parentElement.className}`
                : '',
              parentOverflowX: element.parentElement
                ? getComputedStyle(element.parentElement).overflowX
                : '',
            }))
        : [];
    return { document: documentWidth, viewport, overflowing };
  });
  expect(
    sizes.document,
    `The page must fit the viewport; tables may scroll inside their container. Overflow diagnostics: ${JSON.stringify(sizes.overflowing)}`,
  ).toBeLessThanOrEqual(sizes.viewport + 1);
}

test.describe.serial('Tobor local workspace', () => {
  test('first account, persisted request, private attachment and login lifecycle', async ({
    page,
  }) => {
    const runtimeErrors = watchRuntime(page);
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Your workshop starts here.', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Your name', { exact: true }).fill(account.name);
    await page.getByLabel('Email address', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Create workspace', exact: true }).click();

    await expect(page.getByText('Workspace connected', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening), Pilot/ }),
    ).toBeVisible();
    for (const label of ['Open requests', 'Need approval', 'Ready to send', 'Jobs delivered']) {
      await expect(page.locator('.stats-grid').getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('SAMPLE WORKSPACE', { exact: true })).toBeVisible();
    await expect(page.locator('.welcome-art .model-view')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await saveScreenshot(page, 'tobor-overview-desktop.png');

    await page.getByRole('button', { name: 'New request', exact: true }).click();
    const createDialog = page.getByRole('dialog');
    await createDialog.getByRole('button', { name: 'Next: item details', exact: true }).click();
    await expect(
      createDialog.getByRole('heading', { name: 'What can we help you with?', exact: true }),
    ).toBeVisible();
    await createDialog.getByLabel('Request title', { exact: true }).fill(requestTitle);
    await createDialog.getByLabel('Who is this for?', { exact: true }).fill('Orbit Test Lab');
    await createDialog.getByLabel('Contact email', { exact: true }).fill('lab@example.test');
    await createDialog
      .getByLabel('What do you need?', { exact: true })
      .fill('A removable bracket for a bench-mounted low-voltage sensor.');
    await createDialog.getByRole('button', { name: 'Next: item details', exact: true }).click();
    await createDialog
      .getByLabel('Where and how will it be used?', { exact: true })
      .fill(
        'Indoor supervised bench use; noncritical positioning accessory, with no lifting load.',
      );
    await createDialog
      .getByLabel('Size (if known)', { exact: true })
      .fill('60 x 40 x 5 mm; measured mounting holes 30 mm apart');
    await createDialog
      .getByLabel('Device or model (if known)', { exact: true })
      .fill('Bench sensor model TEST-01');
    await createDialog
      .getByRole('combobox', { name: 'Material (optional)', exact: true })
      .selectOption('PETG');
    await createDialog
      .getByRole('combobox', { name: 'What if the item fails?', exact: true })
      .selectOption('low');
    await createDialog.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(createDialog.getByLabel('Request title', { exact: true })).toHaveValue(
      requestTitle,
    );
    await createDialog.getByRole('button', { name: 'Next: item details', exact: true }).click();
    await expect(createDialog.getByLabel('Size (if known)', { exact: true })).toHaveValue(
      '60 x 40 x 5 mm; measured mounting holes 30 mm apart',
    );
    await createDialog.getByRole('button', { name: 'Next: timing', exact: true }).click();
    await createDialog.getByLabel('How many?', { exact: true }).fill('3');
    await createDialog
      .getByLabel('When do you need it?', { exact: true })
      .fill(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
    await createDialog.getByRole('button', { name: 'Create request', exact: true }).click();

    const details = page.getByRole('dialog', { name: requestTitle, exact: true });
    await expect(details).toBeVisible();
    await expect(details.getByLabel('Material', { exact: true })).toHaveValue('PETG');
    await expect(details.getByLabel('Dimensions & units', { exact: true })).toHaveValue(
      '60 x 40 x 5 mm; measured mounting holes 30 mm apart',
    );

    await details.getByRole('tab', { name: /^Files/ }).click();
    await details.locator('input[type="file"]').setInputFiles({
      name: 'measured-specification.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('E2E test evidence: measured mounting holes 30 mm apart.\n'),
    });
    await expect(details.getByRole('link', { name: /measured-specification.txt/ })).toBeVisible();
    await details.getByRole('button', { name: 'Close dialog', exact: true }).click();

    await page.reload();
    await expect(page.getByText('Workspace connected', { exact: true })).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Search cases, customers or assets', exact: true })
      .fill(requestTitle);
    await page
      .locator('.search-results')
      .getByRole('button', { name: new RegExp(requestTitle) })
      .click();
    await expect(details).toBeVisible();
    await expect(
      details.getByRole('textbox', { name: 'Request description', exact: true }),
    ).toHaveValue('A removable bracket for a bench-mounted low-voltage sensor.');
    await details.getByRole('tab', { name: /^Files/ }).click();
    await expect(details.getByRole('link', { name: /measured-specification.txt/ })).toBeVisible();
    await details.getByRole('button', { name: 'Close dialog', exact: true }).click();

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back.', exact: true })).toBeVisible();
    await saveScreenshot(page, 'tobor-login-desktop.png');
    await page.getByLabel('Email address', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill('An incorrect test password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Welcome back.', exact: true })).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Workspace connected', { exact: true })).toBeVisible();
    const revoked = await page.request.post('/api/auth/logout', {
      headers: { origin: new URL(page.url()).origin },
    });
    expect(revoked.ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Welcome back.', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    expect(runtimeErrors).toEqual([]);
  });

  test('all eight modules render through the actual sidebar', async ({ page }) => {
    const runtimeErrors = watchRuntime(page);
    await signIn(page);
    const modules = [
      { hash: 'cases', label: 'Requests', heading: 'Requests' },
      { hash: 'production', label: 'Make & repair', heading: 'Make & repair' },
      { hash: 'quotes', label: 'Prices & approvals', heading: 'Prices & approvals' },
      { hash: 'quality', label: 'Final checks', heading: 'Final checks' },
      { hash: 'library', label: 'Saved parts', heading: 'Saved parts' },
      { hash: 'insights', label: 'Reports', heading: 'Reports' },
    ];
    const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true });
    for (const module of modules) {
      await navigation
        .getByRole('button', { name: new RegExp(`^${module.label}(?:\\s|$)`) })
        .click();
      await expect(page).toHaveURL(new RegExp(`#${module.hash}$`));
      await expect(page.getByRole('heading', { name: module.heading, exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
    await page.getByRole('button', { name: 'Workspace settings', exact: true }).last().click();
    await expect(page).toHaveURL(/#settings$/);
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await expect(page.getByLabel('Workspace name', { exact: true })).toHaveValue('Tobor Workshop');
    await navigation.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL(/#overview$/);
    await expect(
      page.getByRole('heading', { name: 'What needs to happen next?', exact: true }),
    ).toBeVisible();
    expect(runtimeErrors).toEqual([]);
  });

  test('mobile login and navigation stay within the viewport', async ({ page }) => {
    const runtimeErrors = watchRuntime(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await expectNoHorizontalOverflow(page);
    await saveScreenshot(page, 'tobor-overview-mobile.png');

    await page.getByRole('button', { name: 'Search requests', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Search cases, customers or assets', exact: true })
      .fill(requestTitle);
    await page
      .locator('.search-results')
      .getByRole('button', { name: new RegExp(requestTitle) })
      .click();
    const searchedRequest = page.getByRole('dialog', { name: requestTitle, exact: true });
    await expect(searchedRequest).toBeVisible();
    await searchedRequest.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(page.locator('.global-search')).not.toBeVisible();

    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true });
    await expect(navigation.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
    await navigation.getByRole('button', { name: /Requests/ }).click();
    await expect(page.getByRole('heading', { name: 'Requests', exact: true })).toBeVisible();
    await expect(page.locator('.sidebar')).not.toHaveClass(/is-open/);
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: /^New (case|request)$/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Request title', { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();

    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back.', exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await saveScreenshot(page, 'tobor-login-mobile.png');
    expect(runtimeErrors).toEqual([]);
  });

  test('quote approval, quality evidence and a reviewed reorder work through the UI', async ({
    page,
  }) => {
    const runtimeErrors = watchRuntime(page);
    await signIn(page);
    const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true });
    await navigation.getByRole('button', { name: 'Prices & approvals', exact: true }).click();
    await page.getByRole('button', { name: 'Create quote', exact: true }).click();
    const quoteDialog = page.getByRole('dialog', { name: 'Build a clear quote', exact: true });
    await expect(quoteDialog).toBeVisible();
    await expect(quoteDialog).toBeFocused();
    const caseSelect = quoteDialog.getByRole('combobox', { name: 'Case', exact: true });
    const optionLabel = await caseSelect
      .locator('option')
      .filter({ hasText: requestTitle })
      .innerText();
    await caseSelect.selectOption({ label: optionLabel });
    await quoteDialog.getByRole('spinbutton', { name: /^Engineering & diagnosis/ }).fill('1500');
    await quoteDialog.getByRole('spinbutton', { name: /^Manufacturing & materials/ }).fill('500');
    await quoteDialog.getByRole('spinbutton', { name: /^Inspection & testing/ }).fill('100');
    await quoteDialog.getByRole('spinbutton', { name: /^Packing & shipping/ }).fill('100');
    await expect(quoteDialog.locator('.quote-total')).toContainText('2,596');
    await quoteDialog.getByRole('button', { name: 'Save quote draft', exact: true }).click();
    await expect(quoteDialog).not.toBeVisible();
    const quoteRow = page.locator('.quote-row').filter({ hasText: requestTitle });
    await expect(quoteRow).toContainText('2,596');
    await quoteRow.getByRole('button', { name: 'Mark as shared', exact: true }).click();
    await quoteRow.getByRole('button', { name: 'Record approval', exact: true }).click();
    const approvalDialog = page.getByRole('dialog', {
      name: 'Record customer approval',
      exact: true,
    });
    await expect(
      approvalDialog.getByRole('button', { name: 'Record approval', exact: true }),
    ).toBeDisabled();
    await approvalDialog.getByRole('checkbox').check();
    await approvalDialog.getByRole('button', { name: 'Record approval', exact: true }).click();
    await expect(quoteRow.getByText('Approval recorded', { exact: true })).toBeVisible();

    await navigation.getByRole('button', { name: 'Final checks', exact: true }).click();
    const inspectionCase = page.getByRole('button', { name: /Conveyor guide replacement/ });
    await inspectionCase.click();
    const release = page.getByRole('button', { name: 'Release to dispatch', exact: true });
    await expect(release).toBeDisabled();
    const checks = page.locator('.quality-check-row');
    expect(await checks.count()).toBeGreaterThan(0);
    for (const row of await checks.all()) {
      await row
        .getByRole('textbox')
        .fill('E2E sample inspection: verified against the approved acceptance criteria.');
      await row.getByRole('combobox').selectOption('pass');
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes('/api/quality/') &&
            response.request().method() === 'PATCH' &&
            response.ok(),
        ),
        row.getByRole('button', { name: 'Save', exact: true }).click(),
      ]);
      await expect(
        row.getByText(`Last recorded by ${account.name}`, { exact: true }),
      ).toBeVisible();
    }
    await expect(release).toBeEnabled();
    await release.click();
    await expect(inspectionCase).toHaveCount(0);

    await navigation.getByRole('button', { name: 'Saved parts', exact: true }).click();
    const part = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: 'Cable routing clips', exact: true }) });
    await part.getByRole('button', { name: 'Reorder', exact: true }).click();
    const reorderDialog = page.getByRole('dialog', {
      name: 'Make a good thing again.',
      exact: true,
    });
    await expect(reorderDialog).toBeFocused();
    await expect(
      reorderDialog.getByRole('button', { name: 'Create repeat case', exact: true }),
    ).toBeDisabled();
    await reorderDialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('4');
    await reorderDialog.getByRole('checkbox').check();
    await reorderDialog.getByRole('button', { name: 'Create repeat case', exact: true }).click();
    const repeat = page.getByRole('dialog', { name: 'Cable routing clips', exact: true });
    await expect(repeat).toBeVisible();
    await expect(
      repeat.getByRole('textbox', { name: 'Request description', exact: true }),
    ).toHaveValue(/Reorder request/);
    await expect(repeat.getByText('Being reviewed', { exact: true })).toBeVisible();
    await repeat.getByRole('tab', { name: 'Approvals', exact: true }).click();
    await expect(
      repeat.getByRole('button', { name: 'Record engineering release', exact: true }),
    ).toBeDisabled();
    expect(runtimeErrors).toEqual([]);
  });

  test('every page fits small phones, tablets and desktop; request controls stay reachable', async ({
    page,
  }) => {
    const runtimeErrors = watchRuntime(page);
    await signIn(page);
    const modules = [
      ['overview', 'What needs to happen next?'],
      ['cases', 'Requests'],
      ['quotes', 'Prices & approvals'],
      ['production', 'Make & repair'],
      ['quality', 'Final checks'],
      ['library', 'Saved parts'],
      ['insights', 'Reports'],
      ['settings', 'Settings'],
    ];
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [hash, heading] of modules) {
        await page.evaluate((hash) => {
          location.hash = hash;
          window.scrollTo(0, 0);
        }, hash);
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
        await expectNoHorizontalOverflow(page);
        if (
          (width === 390 &&
            ['quotes', 'production', 'quality', 'insights', 'settings'].includes(hash)) ||
          (width === 1440 && ['cases', 'library'].includes(hash))
        ) {
          await saveScreenshot(page, `tobor-${hash}-${width}.png`);
        }
      }
    }
    await page.setViewportSize({ width: 320, height: 640 });
    await page.evaluate(() => {
      location.hash = 'overview';
      window.scrollTo(0, 0);
    });
    await page.getByRole('button', { name: /Repair a device Get a supported robot/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: /Repair a device/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await dialog.getByLabel('Request title', { exact: true }).fill('Mobile repair request');
    await dialog
      .getByLabel('What do you need?', { exact: true })
      .fill('The small lab robot needs an inspection.');
    await dialog.getByLabel('Who is this for?', { exact: true }).fill('Mobile workshop');
    const next = dialog.getByRole('button', { name: 'Next: item details', exact: true });
    await expect(next).toBeInViewport();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: resolve('test-results', 'tobor-guided-request-320.png'),
      animations: 'disabled',
    });
    await next.click();
    await expect(
      dialog.getByRole('heading', { name: 'Tell us about the item', exact: true }),
    ).toBeFocused();
    await expect(
      dialog.getByRole('button', { name: 'Next: timing', exact: true }),
    ).toBeInViewport();
    await expectNoHorizontalOverflow(page);
    expect(runtimeErrors).toEqual([]);
  });

  test('3D scenes share a canvas, follow scroll, and respect pause and reduced motion', async ({
    page,
  }) => {
    const runtimeErrors = watchRuntime(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await signIn(page);
    const canvas = page.locator('.model-canvas');
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(canvas).toHaveAttribute('data-status', 'ready');
    await expect(canvas).toHaveAttribute('data-motion', 'running');
    const firstFrame = Number(await canvas.getAttribute('data-render-count'));
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-render-count')))
      .toBeGreaterThan(firstFrame);
    await page.getByRole('button', { name: 'Pause 3D animation', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-motion', 'paused');
    await page.waitForTimeout(150);
    const pausedFrame = await canvas.getAttribute('data-render-count');
    await page.waitForTimeout(200);
    expect(await canvas.getAttribute('data-render-count')).toBe(pausedFrame);
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Play 3D animation', exact: true }),
    ).toBeVisible();
    await page.locator('.journey-section').scrollIntoViewIfNeeded();
    for (const model of await page.locator('.journey-section .model-view').all()) {
      await expect(model).toHaveAttribute('data-model-ready', 'true');
    }
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-visible-models')))
      .toBeGreaterThanOrEqual(5);
    await page.screenshot({
      path: resolve('test-results', 'tobor-journey-3d.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Play 3D animation', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-motion', 'running');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(canvas).toHaveAttribute('data-motion', 'paused');
    await page.waitForTimeout(150);
    const reducedFrame = await canvas.getAttribute('data-render-count');
    await page.waitForTimeout(200);
    expect(await canvas.getAttribute('data-render-count')).toBe(reducedFrame);
    await canvas.evaluate((element: HTMLCanvasElement & { restoreTestContext?: () => void }) => {
      const extension = element.getContext('webgl2')?.getExtension('WEBGL_lose_context');
      if (!extension) throw new Error('The test browser must support simulated context loss.');
      element.restoreTestContext = () => extension.restoreContext();
      extension.loseContext();
    });
    await expect(canvas).toHaveAttribute('data-status', 'fallback');
    await page.waitForTimeout(180);
    await expect(page.locator('.journey-section .model-fallback').first()).toHaveCSS(
      'opacity',
      '1',
    );
    await canvas.evaluate((element: HTMLCanvasElement & { restoreTestContext?: () => void }) => {
      element.restoreTestContext?.();
      delete element.restoreTestContext;
    });
    await expect(canvas).toHaveAttribute('data-status', 'ready');
    await page.locator('.journey-section').scrollIntoViewIfNeeded();
    await expect(page.locator('.journey-section .model-view').first()).toHaveAttribute(
      'data-model-ready',
      'true',
    );
    expect(runtimeErrors).toEqual([]);
  });

  test('dashboard and request form remain usable if the 3D library cannot load', async ({
    page,
  }) => {
    await page.route(/\/assets\/three-[^/]+\.js$/, (route) => route.abort());
    await signIn(page);
    await expect(page.locator('.model-canvas')).toHaveAttribute('data-status', 'fallback');
    await expect(page.locator('.welcome-art .model-fallback')).toHaveCSS('opacity', '1');
    await page.getByRole('button', { name: 'New request', exact: true }).click();
    await expect(
      page.getByRole('dialog').getByLabel('Request title', { exact: true }),
    ).toBeEditable();
  });
});
