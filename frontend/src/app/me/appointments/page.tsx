import PageHead from '@/components/PageHead';
import GovAppointmentsView from '@/components/gov/GovAppointmentsView';

import { usePageTitle } from '@/lib/usePageTitle';


export default function MeAppointmentsPage() {
  usePageTitle('Цаг захиалга');
  return (
    <>
      <PageHead eyebrowKey="group.govServices" titleKey="nav.govAppointments" subKey="gov.appointments.sub" />
      <GovAppointmentsView />
    </>
  );
}
