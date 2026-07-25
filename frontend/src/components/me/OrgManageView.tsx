"use client";

// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2 } from 'lucide-react';
import { useT } from '@/lib/lang';
import { getJSON } from '@/lib/client';
import OrgManagePanel from '@/components/me/OrgManagePanel';
import ImageUploadCard from '@/components/me/ImageUploadCard';
import EditOrgNameLatin from '@/components/me/EditOrgNameLatin';

interface OrgRep {
  org_etsi: string;
  org_register: string;
  org_name: string;
  org_name_en?: string;
  role?: string;
  right_type?: string;
}

/**
 * OrgManageView нь НЭГ eID байгууллагын удирдах дэлгэц — толгой мэдээлэл (нэр/РД/эрх)
 * + гарын үсэг зурагч удирдах (OrgManagePanel) + буцах холбоос. Байгууллагын жагсаалтаас
 * карт дарж ордог. Иргэн тухайн байгууллагыг төлөөлдөггүй бол "олдсонгүй".
 */
export default function OrgManageView({ regNo }: { regNo: string }) {
  const { T, lang } = useT();
  const router = useRouter();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['eid-organizations'],
    queryFn: () => getJSON<OrgRep[]>('/api/me/eid/organizations'),
  });
  const rep = q.data?.find((o) => o.org_register === regNo);

  return (
    <>
      <Link href="/me/organizations" className="btn btn--ghost btn--sm" style={{ marginBottom: 12 }}>
        <ArrowLeft size={15} strokeWidth={2} />
        <span>{T('me.orgs.back')}</span>
      </Link>

      <section className="card">
        {q.isPending ? (
          <p className="muted" style={{ padding: '4px 2px' }}>{T('me.orgs.loading')}</p>
        ) : !rep ? (
          <p className="muted" style={{ padding: '4px 2px' }}>{T('me.orgs.notfound')}</p>
        ) : (
          <>
            <div className="org-rep" style={{ cursor: 'default' }}>
              <div className="org-rep__icon" aria-hidden="true"><Building2 size={18} /></div>
              <div className="org-rep__body">
                <div className="org-rep__name">
                  {(lang === 'en' && rep.org_name_en) ? rep.org_name_en : rep.org_name}
                  {rep.right_type && <span className="chip chip--neutral" style={{ marginLeft: 8 }}>{rep.right_type}</span>}
                </div>
                <div className="org-rep__meta mono">
                  {rep.org_register}
                  {rep.role ? ` · ${rep.role}` : ''}
                </div>
              </div>
            </div>
            <OrgManagePanel
              regNo={regNo}
              onUnlinked={() => {
                void qc.invalidateQueries({ queryKey: ['eid-organizations'] });
                router.push('/me/organizations');
              }}
            />
          </>
        )}
      </section>

      {/* Байгууллагын латин нэрийг засах (зөвхөн ADMIN). */}
      {rep && rep.right_type === 'ADMIN' && (
        <EditOrgNameLatin regNo={regNo} current={rep.org_name_en || ''} />
      )}

      {/* Байгууллагын тамганы дардас (зөвхөн ADMIN оруулна). */}
      {rep && (
        <ImageUploadCard
          titleKey="me.assets.stampTitle"
          hintKey="me.assets.stampHint"
          path={`/api/me/eid/organizations/${encodeURIComponent(regNo)}/stamp`}
          queryKey={['org-stamp', regNo]}
          canEdit={rep.right_type === 'ADMIN'}
          aspect="1 / 1"
        />
      )}
    </>
  );
}
