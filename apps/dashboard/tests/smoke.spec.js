import { test, expect } from '@playwright/test'

test('login page renders core controls', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('heading', { name: 'Mneme Command Center' })).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
})

test('login failure message is shown for bad password', async ({ page }) => {
  await page.goto('/login')

  await page.getByLabel('Password').fill('definitely-wrong-password')
  await page.getByRole('button', { name: 'Login' }).click()

  await expect(page.getByText('Invalid password')).toBeVisible()
})
