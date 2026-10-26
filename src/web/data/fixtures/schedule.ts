// TEMPORARY FIXTURE - replace with CMS
// Service times are placeholders. Real day/time come from CMS-managed church
// schedule data (docs/04 §6.6, docs/05 §5).
import type { ServiceSchedule } from '@shared/types';

export const serviceSchedulesFixture: ServiceSchedule[] = [
  {
    id: 'svc-domingo-09',
    name: 'Servicio de adoración',
    dayOfWeek: 0, // Sunday
    startTime: '09:00',
    endTime: '11:00',
    locationId: 'loc-primary',
    description: 'Servicio principal de adoración y enseñanza.',
    active: false,
    validFrom: '2026-01-01',
  },
  {
    id: 'svc-domingo-11',
    name: 'Segundo servicio',
    dayOfWeek: 0,
    startTime: '11:00',
    endTime: '13:00',
    locationId: 'loc-primary',
    description: 'Segundo encuentro dominical.',
    active: false,
    validFrom: '2026-01-01',
  },
];