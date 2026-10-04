import { generateData, type ErpData } from "./data";

export interface ReminderRecipient {
  customerId: string;
  customer: string;
  email: string;
  invoices: number;
  amount: number;
  maxDaysOverdue: number;
}

export interface Proposal {
  id: string;
  kind: "collection_reminders";
  title: string;
  description: string;
  recipients: ReminderRecipient[];
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt?: string;
}

export interface QueuedReminder {
  proposalId: string;
  email: string;
  customer: string;
  amount: number;
  queuedAt: string;
}

/** Mutable state of the fictional ERP: the data plus everything agents change. */
export interface ErpState {
  data: ErpData;
  proposals: Map<string, Proposal>;
  queuedReminders: QueuedReminder[];
  proposalSeq: number;
}

export function createState(): ErpState {
  return { data: generateData(), proposals: new Map(), queuedReminders: [], proposalSeq: 1 };
}
