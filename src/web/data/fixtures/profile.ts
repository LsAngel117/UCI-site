// TEMPORARY FIXTURE - replace with CMS
// Placeholder institutional information only. The asset-free pieces live in
// `church.ts` / `navigation.ts` so the pure mappers stay testable without
// loading image binaries; they are re-exported here for compatibility.
import pillarAdoramos from '../../assets/home/pillar-adoramos.png';
import pillarAprendemos from '../../assets/home/pillar-aprendemos.png';
import pillarIntercedemos from '../../assets/home/pillar-intercedemos.png';
import type { Pillar } from '@shared/types';

export { churchProfileFixture, givingConfigFixture } from './church';
export {
  primaryActionsFixture,
  primaryNavigationFixture,
} from './navigation';

// TEMPORARY FIXTURE - replace with CMS
// The three pillars are structurally fixed per docs/04 §8; only their copy and
// imagery are content-configurable.
export const pillarsFixture: Pillar[] = [
  {
    id: 'adoramos',
    name: 'ADORAMOS',
    description: 'Exaltamos a Dios con todo nuestro corazón.',
    imageUrl: pillarAdoramos,
  },
  {
    id: 'aprendemos',
    name: 'APRENDEMOS',
    description: 'Crecemos por medio de Su Palabra.',
    imageUrl: pillarAprendemos,
  },
  {
    id: 'intercedemos',
    name: 'INTERCEDEMOS',
    description: 'Creemos en el poder de una iglesia que ora.',
    imageUrl: pillarIntercedemos,
  },
];
