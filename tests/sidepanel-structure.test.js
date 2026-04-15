import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const sidepanelHtmlPath = new URL('../sidepanel/sidepanel.html', import.meta.url);

test('sidepanel no longer renders the 当前状态 panel', async () => {
  const html = await fs.readFile(sidepanelHtmlPath, 'utf8');

  assert.equal(html.includes('当前状态'), false);
  assert.equal(html.includes('id="display-status"'), false);
  assert.equal(html.includes('id="status-bar"'), false);
  assert.equal(html.includes('id="current-account"'), false);
  assert.equal(html.includes('id="current-email"'), false);
  assert.equal(html.includes('id="ledger-count"'), false);
  assert.equal(html.includes('id="localhost-url"'), false);
});

test('sidepanel no longer renders deprecated advanced action buttons', async () => {
  const html = await fs.readFile(sidepanelHtmlPath, 'utf8');

  assert.equal(html.includes('id="sync-account"'), false);
  assert.equal(html.includes('id="find-email"'), false);
  assert.equal(html.includes('id="open-oauth"'), false);
  assert.equal(html.includes('id="complete-account"'), false);
  assert.equal(html.includes('id="reset-ledger"'), false);
});

test('sidepanel header no longer renders the prepare-account button', async () => {
  const html = await fs.readFile(sidepanelHtmlPath, 'utf8');

  assert.equal(html.includes('id="prepare-account"'), false);
});

test('advanced panel summary no longer renders the helper tip text', async () => {
  const html = await fs.readFile(sidepanelHtmlPath, 'utf8');

  assert.equal(html.includes('按步骤查看状态、手动补跑'), false);
});

test('sidepanel renders manual account picker controls', async () => {
  const html = await fs.readFile(sidepanelHtmlPath, 'utf8');

  assert.equal(html.includes('id="account-search"'), true);
  assert.equal(html.includes('id="account-search-results"'), true);
  assert.equal(html.includes('id="clear-selected-account"'), true);
  assert.equal(html.includes('指定邮箱'), true);
  assert.equal(html.includes('不指定时默认使用第一个可用邮箱'), true);
});

test('sidepanel places manual account picker below common settings and keeps it collapsed by default', async () => {
  const html = await fs.readFile(sidepanelHtmlPath, 'utf8');
  const commonSettingsIndex = html.indexOf('常用配置');
  const pickerIndex = html.indexOf('<details class="card picker-card">');
  const pickerOpenIndex = html.indexOf('<details class="card picker-card" open>');

  assert.notEqual(commonSettingsIndex, -1);
  assert.notEqual(pickerIndex, -1);
  assert.equal(pickerIndex > commonSettingsIndex, true);
  assert.equal(pickerOpenIndex, -1);
});

test('sidepanel renders sms verification toggle in common settings', async () => {
  const html = await fs.readFile(sidepanelHtmlPath, 'utf8');

  assert.equal(html.includes('id="enable-sms-verification"'), true);
  assert.equal(html.includes('开启短信验证'), true);
});
