import type { Species } from '@ludo3d/shared';
import { buildFox } from './fox';
import { buildHorse } from './horse';
import { buildLion } from './lion';
import { buildPeacock } from './peacock';
import type { ProxyBuild } from './types';

export const PROXY_BUILDERS: Record<Species, () => ProxyBuild> = {
  lion: buildLion,
  peacock: buildPeacock,
  horse: buildHorse,
  fox: buildFox,
};

export type { ProxyBuild };
