export type CaseStatus =
  | 'intake'
  | 'assessment'
  | 'approval'
  | 'production'
  | 'quality'
  | 'ready'
  | 'delivered'
  | 'blocked';
export type ServiceType = 'custom' | 'replacement' | 'repair' | 'repeat';
export type Page =
  'overview' | 'cases' | 'production' | 'quotes' | 'quality' | 'library' | 'insights' | 'settings';
export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}
export interface AuthState {
  user: User | null;
  needsSetup: boolean;
  testLoginEnabled: boolean;
}
export interface CaseRecord {
  id: number;
  reference: string;
  title: string;
  customer: string;
  email: string;
  service: ServiceType;
  status: CaseStatus;
  priority: 'normal' | 'high' | 'urgent';
  quantity: number;
  material: string;
  owner: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  description: string;
  intendedUse: string;
  dimensions: string;
  risk: string;
  route: string;
  revision: number;
  designApproved: boolean;
  quoteApproved: boolean;
  amount: number;
  cost: number;
  engineeringHours: number;
  asset: string;
  blockedReason: string;
}
export interface Machine {
  id: number;
  name: string;
  model: string;
  status: 'printing' | 'idle' | 'maintenance';
  material: string;
  progress: number;
  temperature: number;
  job: string;
  remaining: string;
  qualified: boolean;
}
export interface Quote {
  id: number;
  caseId: number;
  reference: string;
  caseTitle: string;
  customer: string;
  version: number;
  status: 'draft' | 'sent' | 'approved' | 'rejected';
  engineering: number;
  manufacturing: number;
  testing: number;
  shipping: number;
  taxRate: number;
  total: number;
  expiresAt: string;
  createdAt: string;
}
export interface QualityCheck {
  id: number;
  caseId: number;
  label: string;
  expected: string;
  actual: string;
  passed: boolean | null;
  required: boolean;
  checkedBy: string;
}
export interface Part {
  id: number;
  name: string;
  code: string;
  category: string;
  material: string;
  revision: number;
  customer: string;
  lastMade: string;
  orders: number;
  caseId: number;
}
export interface Activity {
  id: number;
  caseId: number | null;
  type: string;
  message: string;
  actor: string;
  createdAt: string;
}
export interface Settings {
  workspaceName: string;
  city: string;
  currency: string;
  monthlyOverhead: number;
  engineeringCapacity: number;
  hourlyRate: number;
  demoMode: boolean;
}
export interface DashboardData {
  cases: CaseRecord[];
  machines: Machine[];
  quotes: Quote[];
  qualityChecks: QualityCheck[];
  parts: Part[];
  activities: Activity[];
  settings: Settings;
}
