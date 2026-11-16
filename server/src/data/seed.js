/**
 * Demo dataset. Dates are expressed as offsets from "today" so the demo always
 * shows a realistic mix of healthy, at-risk and critical work whenever it runs.
 *
 * In production, replace this with an adapter over MetroBlue's system of record
 * (see src/data/repository.js — only `loadDataset()` needs to change).
 */
import { addDays } from '../engine/dates.js';

export function buildSeed(now = new Date()) {
  const d = (offset) => addDays(now, offset).toISOString().slice(0, 10);
  const ts = (offset, hour = 15) => {
    const day = addDays(now, offset);
    day.setUTCHours(hour, 0, 0, 0);
    return day.toISOString();
  };

  const users = [
    { id: 'u-exec', name: 'Dana Whitfield', email: 'dana.whitfield@metroblue.example', role: 'executive', title: 'VP Delivery', token: 'dev-token-dana' },
    { id: 'u-dm1', name: 'Marcus Lee', email: 'marcus.lee@metroblue.example', role: 'delivery_manager', title: 'Delivery Manager — East', token: 'dev-token-marcus', teamMemberIds: ['u-ao1', 'u-ao2'] },
    { id: 'u-ao1', name: 'Priya Raman', email: 'priya.raman@metroblue.example', role: 'account_owner', title: 'Account Director', token: 'dev-token-priya' },
    { id: 'u-ao2', name: 'Tom Becker', email: 'tom.becker@metroblue.example', role: 'account_owner', title: 'Account Manager', token: 'dev-token-tom' },
    { id: 'u-ao3', name: 'Elena García', email: 'elena.garcia@metroblue.example', role: 'account_owner', title: 'Account Director', token: 'dev-token-elena' },
    { id: 'u-pm1', name: 'Sam Okafor', email: 'sam.okafor@metroblue.example', role: 'project_manager', title: 'Project Manager', token: 'dev-token-sam' },
  ];

  const clients = [
    { id: 'c-northwind', name: 'Northwind Logistics', accountOwnerId: 'u-ao1', region: 'East', tier: 'Strategic' },
    { id: 'c-harbor', name: 'Harbor Health', accountOwnerId: 'u-ao1', region: 'East', tier: 'Growth' },
    { id: 'c-crescent', name: 'Crescent Retail', accountOwnerId: 'u-ao2', region: 'East', tier: 'Strategic' },
    { id: 'c-pinecrest', name: 'Pinecrest Bank', accountOwnerId: 'u-ao2', region: 'East', tier: 'Growth' },
    { id: 'c-atlas', name: 'Atlas Manufacturing', accountOwnerId: 'u-ao3', region: 'Central', tier: 'Strategic' },
    { id: 'c-brightline', name: 'Brightline Energy', accountOwnerId: 'u-ao3', region: 'Central', tier: 'Standard' },
  ];

  const projects = [
    { id: 'p-nw-wms', clientId: 'c-northwind', name: 'Warehouse Management Rollout', projectManagerId: 'u-pm1', memberIds: ['u-pm1'], phase: 'Build', startDate: d(-120), endDate: d(45), contractValue: 480000 },
    { id: 'p-nw-portal', clientId: 'c-northwind', name: 'Customer Portal Refresh', projectManagerId: 'u-pm1', memberIds: ['u-pm1'], phase: 'Discovery', startDate: d(-20), endDate: d(110), contractValue: 150000 },
    { id: 'p-hh-ehr', clientId: 'c-harbor', name: 'EHR Integration', projectManagerId: 'u-pm1', memberIds: ['u-pm1'], phase: 'Testing', startDate: d(-200), endDate: d(9), contractValue: 720000 },
    { id: 'p-hh-analytics', clientId: 'c-harbor', name: 'Clinical Analytics Dashboard', projectManagerId: null, memberIds: [], phase: 'Build', startDate: d(-60), endDate: d(70), contractValue: 95000 },
    { id: 'p-cr-pos', clientId: 'c-crescent', name: 'POS Modernisation', projectManagerId: null, memberIds: [], phase: 'Deploy', startDate: d(-150), endDate: d(20), contractValue: 640000 },
    { id: 'p-cr-loyalty', clientId: 'c-crescent', name: 'Loyalty Programme Launch', projectManagerId: null, memberIds: [], phase: 'Build', startDate: d(-45), endDate: d(60), contractValue: 210000 },
    { id: 'p-pb-kyc', clientId: 'c-pinecrest', name: 'KYC Automation', projectManagerId: 'u-pm1', memberIds: ['u-pm1'], phase: 'Build', startDate: d(-90), endDate: d(30), contractValue: 330000 },
    { id: 'p-at-mes', clientId: 'c-atlas', name: 'MES Upgrade', projectManagerId: null, memberIds: [], phase: 'Testing', startDate: d(-180), endDate: d(14), contractValue: 905000 },
    { id: 'p-at-iot', clientId: 'c-atlas', name: 'Shop-floor IoT Pilot', projectManagerId: null, memberIds: [], phase: 'Build', startDate: d(-40), endDate: d(80), contractValue: 120000 },
    { id: 'p-bl-billing', clientId: 'c-brightline', name: 'Billing Platform Migration', projectManagerId: null, memberIds: [], phase: 'Build', startDate: d(-100), endDate: d(50), contractValue: 410000 },
    { id: 'p-bl-field', clientId: 'c-brightline', name: 'Field Service Mobile App', projectManagerId: null, memberIds: [], phase: 'Discovery', startDate: d(-15), endDate: d(120), contractValue: 88000 },
  ];

  let n = 0;
  const id = (p) => `${p}-${++n}`;
  const milestones = [];
  const checklistItems = [];
  const blockers = [];
  const activities = [];
  const updates = [];

  const ms = (projectId, name, due, progress, { done = false, isKey = false } = {}) =>
    milestones.push({ id: id('m'), projectId, name, dueDate: d(due), progress, isKey, completedAt: done ? d(due - 1) : null });
  const chk = (projectId, title, due, done = false) => checklistItems.push({ id: id('k'), projectId, title, dueDate: d(due), done });
  const blk = (projectId, title, severity, raised, resolved = null, ownerName = 'Unassigned') =>
    blockers.push({ id: id('b'), projectId, title, severity, raisedAt: d(raised), resolvedAt: resolved === null ? null : d(resolved), ownerName });
  const act = (projectId, type, title, when, status, rescheduleCount = 0) =>
    activities.push({ id: id('a'), projectId, type, title, scheduledFor: d(when), status, rescheduleCount, lastRescheduledAt: rescheduleCount ? d(Math.min(when, 0)) : null });
  const upd = (projectId, authorId, daysAgo, summary) => updates.push({ id: id('u'), projectId, authorId, postedAt: ts(-daysAgo), summary });

  // --- Northwind: WMS rollout — CRITICAL (key milestone 10 days overdue, high blocker 8 days old)
  ms('p-nw-wms', 'Solution design sign-off', -60, 100, { done: true, isKey: true });
  ms('p-nw-wms', 'Integration build complete', -10, 70, { isKey: true });
  ms('p-nw-wms', 'UAT start', 12, 10);
  chk('p-nw-wms', 'Confirm SKU master data owner', -6);
  chk('p-nw-wms', 'Share interface specs with carrier', -3);
  chk('p-nw-wms', 'Update RAID log', 2);
  blk('p-nw-wms', 'Carrier API sandbox credentials not provided', 'high', -8, null, 'Northwind IT');
  act('p-nw-wms', 'Status call', 'Weekly status call', -7, 'completed');
  act('p-nw-wms', 'Workshop', 'Pick-path design workshop', -4, 'completed', 2);
  upd('p-nw-wms', 'u-pm1', 5, 'Integration build slipping; waiting on carrier sandbox.');

  // --- Northwind: Portal refresh — HEALTHY
  ms('p-nw-portal', 'Discovery read-out', 18, 40);
  chk('p-nw-portal', 'Stakeholder interviews', 5);
  act('p-nw-portal', 'Workshop', 'Persona workshop', -3, 'completed');
  upd('p-nw-portal', 'u-pm1', 2, 'Interviews on track; 6 of 10 complete.');

  // --- Harbor Health: EHR integration — AT RISK (go-live in 9 days at 45%, missed calls)
  ms('p-hh-ehr', 'Interface testing complete', -20, 100, { done: true });
  ms('p-hh-ehr', 'Go-live readiness review', 6, 45, { isKey: true });
  chk('p-hh-ehr', 'Cutover runbook draft', 3);
  act('p-hh-ehr', 'Client meeting', 'Clinical steering committee', -12, 'missed');
  act('p-hh-ehr', 'Status call', 'Weekly status call', -5, 'missed');
  act('p-hh-ehr', 'Status call', 'Weekly status call', 2, 'scheduled');
  upd('p-hh-ehr', 'u-pm1', 4, 'Readiness review prep underway; clinical lead availability limited.');

  // --- Harbor Health: Analytics — AT RISK (no update for 18 days)
  ms('p-hh-analytics', 'Data model approved', -15, 100, { done: true });
  ms('p-hh-analytics', 'Dashboard beta', 25, 30);
  upd('p-hh-analytics', 'u-ao1', 18, 'Data model approved by client.');

  // --- Crescent: POS modernisation — CRITICAL (3 at-risk signals combined)
  ms('p-cr-pos', 'Pilot store deployment', -4, 85);
  ms('p-cr-pos', 'Wave 1 rollout', 5, 30, { isKey: true });
  chk('p-cr-pos', 'Store manager training schedule', -9);
  chk('p-cr-pos', 'Hardware delivery confirmation', -5);
  chk('p-cr-pos', 'Payment terminal certification', -2);
  chk('p-cr-pos', 'Hypercare rota', 4);
  act('p-cr-pos', 'Status call', 'Weekly status call', -6, 'completed');
  upd('p-cr-pos', 'u-ao2', 3, 'Pilot store live but terminal certification outstanding.');

  // --- Crescent: Loyalty — HEALTHY (one watch item)
  ms('p-cr-loyalty', 'Rewards engine configured', 13, 70);
  chk('p-cr-loyalty', 'Legal review of T&Cs', 7);
  blk('p-cr-loyalty', 'Awaiting brand assets', 'low', -3, null, 'Crescent Marketing');
  act('p-cr-loyalty', 'Client meeting', 'Sprint review', -2, 'completed');
  upd('p-cr-loyalty', 'u-ao2', 1, 'Sprint 4 complete.');

  // --- Pinecrest: KYC — AT RISK (medium blocker, reschedules)
  ms('p-pb-kyc', 'Rules engine MVP', 20, 55);
  chk('p-pb-kyc', 'Data processing agreement signed', 4);
  blk('p-pb-kyc', 'Sanctions list vendor contract pending', 'medium', -6, null, 'Pinecrest Procurement');
  blk('p-pb-kyc', 'Test data masking approach', 'medium', -20, -12, 'MetroBlue');
  act('p-pb-kyc', 'Workshop', 'Compliance rules workshop', -2, 'completed', 2);
  act('p-pb-kyc', 'Client meeting', 'Monthly business review', 3, 'scheduled', 1);
  upd('p-pb-kyc', 'u-pm1', 6, 'MVP rules drafted; vendor contract still blocking integration.');

  // --- Atlas: MES upgrade — CRITICAL (stale 34 days, overdue milestone, missed activities)
  ms('p-at-mes', 'Line 3 cutover', -5, 60);
  ms('p-at-mes', 'Plant-wide go-live', 14, 20, { isKey: true });
  chk('p-at-mes', 'Rollback plan approved', -12);
  blk('p-at-mes', 'PLC firmware incompatibility', 'high', -3, null, 'Atlas Engineering');
  act('p-at-mes', 'Status call', 'Weekly status call', -20, 'missed');
  act('p-at-mes', 'Status call', 'Weekly status call', -13, 'missed');
  act('p-at-mes', 'Client meeting', 'Plant manager check-in', -8, 'missed', 1);
  upd('p-at-mes', 'u-ao3', 34, 'Line 3 testing started.');

  // --- Atlas: IoT pilot — HEALTHY
  ms('p-at-iot', 'Sensor install (pilot line)', 30, 35);
  act('p-at-iot', 'Workshop', 'Use-case prioritisation', -9, 'completed');
  upd('p-at-iot', 'u-ao3', 3, 'Sensors ordered.');

  // --- Brightline: Billing migration — HEALTHY with watch items (8-day stale, 1 overdue checklist item)
  ms('p-bl-billing', 'Data migration dry run #1', -14, 100, { done: true });
  ms('p-bl-billing', 'Dry run #2', 21, 40);
  chk('p-bl-billing', 'Reconciliation report template', -1);
  act('p-bl-billing', 'Status call', 'Weekly status call', -7, 'completed');
  upd('p-bl-billing', 'u-ao3', 8, 'Dry run #1 reconciled at 99.7%.');

  // --- Brightline: Field app — HEALTHY
  ms('p-bl-field', 'Discovery complete', 28, 25);
  act('p-bl-field', 'Workshop', 'Field technician ride-along', -1, 'completed');
  upd('p-bl-field', 'u-ao3', 1, 'Kick-off complete.');

  // Last week's recorded statuses — lets the weekly summary show movement on day one.
  const baselineSnapshot = {
    weekStart: null, // filled in by the repository
    statuses: {
      'p-nw-wms': 'At Risk',
      'p-nw-portal': 'Healthy',
      'p-hh-ehr': 'Healthy',
      'p-hh-analytics': 'Healthy',
      'p-cr-pos': 'At Risk',
      'p-cr-loyalty': 'Healthy',
      'p-pb-kyc': 'At Risk',
      'p-at-mes': 'Critical',
      'p-at-iot': 'Healthy',
      'p-bl-billing': 'At Risk',
      'p-bl-field': 'Healthy',
    },
  };

  return { users, clients, projects, milestones, checklistItems, blockers, activities, updates, baselineSnapshot };
}
