/* global document */
import { base, now } from './environment.mjs';
export async function prepare(context, extras, state) {
  await context.addInitScript(
    ({ extras, state, now }) => {
      Date.now = () => now;
      const NativeDate = Date;
      globalThis.Date = class extends NativeDate {
        constructor(...args) {
          super(...(args.length ? args : [now]));
        }
        static now() {
          return now;
        }
      };
      const folders = extras.projects
        .filter((p) => p.id === extras.project.id)
        .map((p) => ({
          name: p.name ?? p.canonical.split('/').at(-1),
          directory: p.canonical,
        }));
      localStorage.setItem(
        'opencodex:projects',
        JSON.stringify(state === 'home-no-project' ? [] : folders),
      );
      if (state !== 'home-no-project')
        localStorage.setItem(
          'opencodex:project',
          JSON.stringify({ name: 'atlas-api', directory: extras.project.canonical }),
        );
      localStorage.setItem('opencodex:threadView', 'projects');
    },
    { extras, state, now },
  );
}
export async function reach(page, state, c, extras) {
  const click = (name) =>
    page.getByRole('button', { name, exact: true }).filter({ visible: true }).first().click();
  const menu = (name) => page.getByRole('menuitem', { name, exact: true }).click();
  await page.goto(base);
  await page.locator('.sidebar').waitFor();
  await page.waitForFunction(() => document.documentElement.dataset.platform === 'darwin');
  await page.addStyleTag({
    content:
      '*,*::before,*::after { animation-delay:0s!important;animation-play-state:paused!important;transition:none!important;caret-color:transparent!important }',
  });
  let point;
  if (state === 'home-no-project') {
    await page.getByRole('heading', { name: 'Open a project', exact: true }).waitFor();
    return {};
  }
  await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
  if (c.session !== undefined) {
    const title = extras.sessions[c.session].goldenPrompt;
    // Match native --session without changing the four-row sidebar presentation.
    await click('Search threads');
    await page.getByRole('searchbox', { name: 'Search threads', exact: true }).fill(title);
    await page.locator('.thread-search-row').filter({ hasText: title }).first().click();
    await page.locator('.chat[data-empty="false"]').waitFor();
    await page.locator('.chat-scroll').waitFor();
  }
  const message = page.getByRole('textbox', { name: 'Message', exact: true });
  if (state === 'composer-focused') await message.focus();
  if (state === 'composer-text' || state === 'composer-attachment')
    await message.fill('Review the API changes and suggest a test plan.');
  if (state === 'composer-attachment')
    await page.locator('input[type=file]').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Golden attachment review notes'),
    });
  if (state === 'composer-slash' || state === 'composer-mention')
    await message.fill(state.endsWith('slash') ? '/' : '@');
  if (state.startsWith('model-picker-')) {
    await click('Model');
    if (state.endsWith('filtered')) await page.locator('.model-picker-search input').fill('big');
  }
  if (state === 'worktree-picker-open' || state === 'worktree-new-selected') {
    await click('Where this chat works');
    if (state === 'worktree-new-selected')
      await page.getByRole('option', { name: /New worktree/ }).click();
  }
  if (state === 'sidebar-hidden') await click('Hide sidebar');
  if (state === 'sidebar-project-collapsed') await click('atlas-api');
  if (state === 'sidebar-focus-view') await click('Focus view');
  if (state === 'project-picker-open') await click('Switch project');
  if (state === 'project-open-dialog') await click('Open project');
  if (state === 'thread-search-open') await click('Search threads');
  if (state === 'app-menu-open') await click('OpenCodex menu');
  if (state === 'tasks-empty') await click('Tasks');
  if (state === 'apps-empty') await click('Apps');
  if (
    state.startsWith('settings-') ||
    [
      'project-actions-open',
      'project-edit-open',
      'project-copy-feedback',
      'worktrees-empty',
    ].includes(state)
  ) {
    await click('Settings');
    const tab = state.startsWith('settings-')
      ? state
          .slice(9)
          .replace('-bottom', '')
          .split('-')
          .join(' ')
          .replace(/^./, (c) => c.toUpperCase())
      : 'Projects';
    await click(tab);
    if (state === 'settings-general-bottom')
      await page.locator('.main').evaluate((e) => {
        e.scrollTop = e.scrollHeight;
      });
    if (
      [
        'project-actions-open',
        'project-edit-open',
        'project-copy-feedback',
        'worktrees-empty',
      ].includes(state)
    ) {
      const button = page.getByRole('button', { name: 'Actions for atlas-api', exact: true });
      const box = await button.boundingBox();
      point = `${box.x + box.width - 176},${box.y + box.height + 4}`;
      await button.click();
      if (state === 'project-edit-open') await menu('Edit project');
      if (state === 'project-copy-feedback') {
        await menu('Copy path');
        await page.getByText('Project path copied.', { exact: true }).waitFor();
      }
      if (state === 'worktrees-empty') await menu('Manage worktrees');
    }
  }
  if (state === 'usage-limits-open') await click('Usage limits');
  if (/^(tool|thought)/.test(state)) {
    await page.getByRole('button', { name: /Worked for/ }).click();
    if (['tool-rows-expanded', 'tool-detail-open', 'thoughts-expanded'].includes(state))
      await page.locator('.activity-group .disclosure-trigger').first().click();
    if (state === 'tool-detail-open')
      await page.locator('.activity-item .disclosure-trigger').first().click();
    if (state === 'thoughts-expanded') await page.locator('.activity-thought').first().click();
    await page.locator('.chat-scroll').evaluate((e) => {
      e.scrollTop = e.scrollHeight - e.clientHeight;
    });
  }
  if (state.startsWith('question-')) {
    await page.locator('.question-choice').filter({ hasText: 'Local' }).first().click();
    if (state === 'question-review') await click('Review answers');
  }
  if (
    state.startsWith('panel-') ||
    ['side-chat-new', 'subagents-list', 'subagent-conversation'].includes(state)
  ) {
    const panel =
      {
        'panel-diff-open': 'Changes',
        'panel-file-open': 'Files',
        'side-chat-new': 'Side chat',
        'subagents-list': 'Subagents',
        'subagent-conversation': 'Subagents',
      }[state] ??
      state
        .slice(6)
        .replaceAll('-', ' ')
        .replace(/^./, (c) => c.toUpperCase());
    await click(panel);
    if (state === 'panel-diff-open')
      await page.locator('[aria-label="index.ts"]').filter({ visible: true }).first().click();
    if (state === 'panel-file-open')
      await page.locator('[aria-label="README.md"]').filter({ visible: true }).first().click();
    if (state === 'subagent-conversation')
      await page
        .locator('.subagents-panel button')
        .filter({ hasText: 'Explore source' })
        .first()
        .click();
    if (state === 'panel-terminal') await page.evaluate(() => document.activeElement?.blur());
    if (state === 'panel-side-chat') {
      await page.getByRole('tab', { name: 'Side chat 1', exact: true }).click();
    }
    if (state === 'side-chat-new') {
      // Attach both rejection handlers immediately: a missing/disabled button
      // must become a failed state, not an unhandled response-wait rejection
      // that aborts the entire sweep before its cleanup and evidence capture.
      const [created] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith('/side-chats') && response.request().method() === 'POST',
        ),
        click('New side chat'),
      ]);
      if (!created.ok()) throw new Error('New side chat failed');
      const side = await created.json();
      c.flags.push('--file', side.id);
      c.createdSide = side.id;
      await page.locator(`.side-chat[data-session-id="${side.id}"]`).waitFor();
    }
  }
  if (state === 'thread-actions-open') {
    const box = await page
      .getByRole('button', { name: 'Thread actions', exact: true })
      .boundingBox();
    point = `${box.x + box.width - 180},${box.y + box.height + 4}`;
    await click('Thread actions');
  }
  if (state === 'session-details-open') await click('Session details');
  if (state.startsWith('find-')) {
    await page.keyboard.press('Meta+f');
    await page.locator('.find-input').waitFor();
  }
  if (state === 'sidebar-row-hover' || state === 'thread-context-menu') {
    const row = page
      .locator('.session-row')
      .filter({ hasText: extras.sessions[7].goldenPrompt })
      .first();
    if (state === 'sidebar-row-hover') await row.hover();
    else {
      const box = await row.boundingBox();
      point = `${box.x + box.width / 2},${box.y + box.height / 2}`;
      await row.click({ button: 'right' });
    }
  }
  if (/^chat-.*-(top|middle|bottom)$/.test(state)) {
    if (state === 'chat-long-top' || state === 'chat-long-middle') {
      const scroll = page.locator('.chat-scroll');
      await scroll.hover();
      await page.mouse.wheel(0, -120);
      for (let attempt = 0; attempt < 12; attempt++) {
        await scroll.evaluate((e) => {
          e.scrollTop = 300;
        });
        await page.waitForTimeout(80);
        await scroll.evaluate((e) => {
          e.scrollTop = 0;
        });
        await page.waitForTimeout(250);
        if (await page.getByText('Beginning of conversation', { exact: true }).isVisible()) break;
        if (attempt === 11) throw new Error('Could not load the complete long-history viewport');
      }
    }
    if (state === 'chat-long-middle') {
      // LegendList's scrollHeight still contains estimates after paging to the
      // beginning. Realize the complete fixture before asking for a fraction:
      // otherwise 50% means different content as the two virtualizers overscan
      // different windows. This is finite capture setup, never app frame work.
      const scroll = page.locator('.chat-scroll');
      await page.evaluate(() => document.fonts.ready);
      let next = 0;
      for (let step = 0; step < 80; step++) {
        await scroll.evaluate((e, y) => {
          e.scrollTop = y;
        }, next);
        await page.waitForTimeout(80);
        const at = await scroll.evaluate((e) => ({
          offset: e.scrollTop,
          viewport: e.clientHeight,
          height: e.scrollHeight,
        }));
        if (at.offset + at.viewport >= at.height - 1) break;
        if (step === 79) throw new Error('Could not measure the complete long-history extent');
        next = at.offset + at.viewport * 0.75;
      }
    }
    const fraction = { top: 0, middle: 0.5, bottom: 1 }[state.split('-').at(-1)];
    await page.locator('.chat-scroll').evaluate((e, f) => {
      e.scrollTop = (e.scrollHeight - e.clientHeight) * f;
    }, fraction);
  }
  if (state === 'connection-offline') {
    await page.route('**/api/**', (route) => route.abort());
    await page.reload();
    await page.waitForTimeout(1500);
  }
  if (state !== 'sidebar-row-hover') {
    const viewport = page.viewportSize();
    await page.mouse.move(viewport.width - 2, viewport.height - 2);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return { ...(point ? { OCR_MENU_POINT: point } : {}) };
}
