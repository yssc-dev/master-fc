import { test, expect } from '@playwright/test';

test('개인기록 테이블이 화면 너비를 초과하지 않아야 함', async ({ page }) => {
  await page.goto('/');
  // 375px 모바일 화면에서 수평 스크롤 없는지 확인
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

  console.log(`scrollWidth: ${scrollWidth}, clientWidth: ${clientWidth}`);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px 허용

  await page.screenshot({ path: 'tests/screenshot-mobile.png', fullPage: true });
});
