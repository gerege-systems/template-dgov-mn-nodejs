// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import type {
  GovAppointment,
  GovApplication,
  GovApplicationEvent,
  GovLifeEvent,
  GovNotification,
  GovOverview,
  GovPayment,
  GovQueueStats,
  GovReference,
  GovService,
} from '../../../domain/gov.js';

export const govLifeEventResponse = (e: GovLifeEvent) => ({
  code: e.code,
  name: e.name,
  kind: e.kind,
  eu_code: e.euCode,
  en_label: e.enLabel,
});

export const govServiceResponse = (s: GovService) => ({
  id: s.id,
  code: s.code,
  name: s.name,
  category: s.category,
  agency: s.agency,
  description: s.description,
  fee: s.fee,
  processing_days: s.processingDays,
  processing_time: s.processingTime,
  cofog_code: s.cofogCode,
  cofog_label: s.cofogLabel,
  main_activity: s.mainActivity,
  sdg_code: s.sdgCode,
  output_type: s.outputType,
  output_ref_type: s.outputRefType,
  evidence: s.evidence,
  legal_basis: s.legalBasis,
  assurance_level: s.assuranceLevel,
  lifecycle: s.lifecycle,
  fulfilment: s.fulfilment,
  has_discretion: s.hasDiscretion,
  has_assessment: s.hasAssessment,
  sla_hours: s.slaHours,
  tacit_approval: s.tacitApproval,
  life_events: s.lifeEvents.map(govLifeEventResponse),
  online: s.online,
  enabled: s.enabled,
  created_at: s.createdAt,
});

export const govServiceListResponse = (list: GovService[]) => list.map(govServiceResponse);

export const govApplicationResponse = (a: GovApplication) => ({
  id: a.id,
  service_id: a.serviceId,
  service_code: a.serviceCode,
  service_name: a.serviceName,
  reference_no: a.referenceNo,
  status: a.status,
  result: a.result,
  note: a.note,
  payload: a.payload,
  assigned_to: a.assignedTo,
  assigned_at: a.assignedAt,
  decided_at: a.decidedAt,
  decision_note: a.decisionNote,
  due_at: a.dueAt,
  sla_breached: a.slaBreached,
  suspended_at: a.suspendedAt,
  output_ref_id: a.outputRefId,
  tacit: a.tacit,
  submitted_at: a.submittedAt,
  updated_at: a.updatedAt,
});

export const govApplicationListResponse = (list: GovApplication[]) =>
  list.map(govApplicationResponse);

export const govEventListResponse = (list: GovApplicationEvent[]) =>
  list.map((e) => ({
    id: e.id,
    actor_role: e.actorRole,
    from_status: e.fromStatus,
    to_status: e.toStatus,
    type: e.type,
    detail: e.detail,
    created_at: e.createdAt,
  }));

export const govReferenceResponse = (r: GovReference) => ({
  id: r.id,
  type: r.type,
  title: r.title,
  reference_no: r.referenceNo,
  status: r.status,
  issued_at: r.issuedAt,
  valid_until: r.validUntil,
  data: r.data,
});

export const govReferenceListResponse = (list: GovReference[]) => list.map(govReferenceResponse);

export const govNotificationListResponse = (list: GovNotification[]) =>
  list.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    category: n.category,
    read: n.read,
    created_at: n.createdAt,
  }));

export const govPaymentListResponse = (list: GovPayment[]) =>
  list.map((p) => ({
    id: p.id,
    title: p.title,
    category: p.category,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    due_date: p.dueDate,
    paid_at: p.paidAt,
    created_at: p.createdAt,
  }));

export const govAppointmentResponse = (a: GovAppointment) => ({
  id: a.id,
  service_id: a.serviceId,
  service_name: a.serviceName,
  agency: a.agency,
  location: a.location,
  scheduled_at: a.scheduledAt,
  status: a.status,
  note: a.note,
  created_at: a.createdAt,
});

export const govAppointmentListResponse = (list: GovAppointment[]) =>
  list.map(govAppointmentResponse);

export const govOverviewResponse = (o: GovOverview) => ({
  open_applications: o.openApplications,
  unread_notifications: o.unreadNotifications,
  unpaid_count: o.unpaidCount,
  unpaid_amount: o.unpaidAmount,
  upcoming_count: o.upcomingCount,
  issued_references: o.issuedReferences,
  recent_applications: govApplicationListResponse(o.recentApplications),
  upcoming_appointments: govAppointmentListResponse(o.upcomingAppointments),
});

export const govQueueStatsResponse = (s: GovQueueStats) => ({
  open: s.open,
  unassigned: s.unassigned,
  mine: s.mine,
  overdue: s.overdue,
  due_soon: s.dueSoon,
});
