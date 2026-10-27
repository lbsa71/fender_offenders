import { configDefaults, defineConfig } from 'vitest/config';

// Real sockets, physics and renderer adapters belong to integration even when
// their tests live beside package sources. Pure logic stays in the unit suite.
const integration = [
  'tests/integration/**/*.test.ts',
  'tests/hosting/**/*.test.ts',
  'tests/prediction/**/*.test.ts',
  'tests/deploy-smoke/**/*.test.ts',
  'packages/sim/**/*.test.ts',
  'packages/net-server/src/{latency,lifecycle,prop-publishing,unified-rooms}.test.ts',
  'packages/net-client/src/{clock,campaign-prediction}.test.ts',
  'packages/renderer/src/{cars,combat-effects,contact-shading,environment,garage,grenade-effects,helicopter,light-detail,pedestrians,props,road-gadgets,snow-cover,target-objective,wet-surfaces,wreck-breakup,wreck-effects}.test.ts',
];

export default defineConfig({ test: { projects: [
  { test: { name: 'unit', include: ['packages/**/*.test.ts', 'tests/client/**/*.test.ts'], exclude: [...configDefaults.exclude, ...integration], testTimeout: 15000 } },
  { test: { name: 'integration', include: integration, testTimeout: 15000 } },
] } });
