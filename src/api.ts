import type { AuthState, DashboardData } from '../shared/types';
export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(!options.body || options.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== '/auth/login') {
    window.dispatchEvent(new Event('tobor:session-expired'));
  }
  if (!response.ok)
    throw new Error(payload.error || payload.message || 'Something went wrong. Please try again.');
  return payload as T;
}
export const getDashboard = () => api<DashboardData>('/dashboard');
export const getAuth = () => api<AuthState>('/auth/me');
export const money = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
export const dateLabel = (value: string) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : 'Unscheduled';
export const statusLabels: Record<string, string> = {
  intake: 'New request',
  assessment: 'In assessment',
  approval: 'Awaiting approval',
  production: 'In production',
  quality: 'Quality check',
  ready: 'Ready to dispatch',
  delivered: 'Delivered',
  blocked: 'On hold',
  printing: 'Printing',
  idle: 'Available',
  maintenance: 'Maintenance',
  draft: 'Draft',
  sent: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
};
