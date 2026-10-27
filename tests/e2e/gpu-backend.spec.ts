import { expect, test } from './fixtures';

test('an explicitly requested GPU is the actual game WebGL backend', async ({ page }) => {
  const expected = process.env.FENDER_E2E_EXPECTED_GPU;
  test.skip(!expected, 'Set FENDER_E2E_EXPECTED_GPU when validating a specific local GPU.');
  await page.goto('/');
  const renderer = await page.locator('#game').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl && debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
  });
  expect(renderer.toUpperCase()).toContain(expected!.toUpperCase());
});
