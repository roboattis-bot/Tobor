import type { CaseRecord, CaseStatus, ServiceType } from '../shared/types';
import type { ModelKind } from './models/types';

export const serviceOptions: {
  id: Exclude<ServiceType, 'repeat'>;
  title: string;
  description: string;
  example: string;
  model: ModelKind;
}[] = [
  {
    id: 'custom',
    title: 'Make a part',
    description: 'Turn your idea into a useful part.',
    example: 'A holder for a small sensor',
    model: 'gear',
  },
  {
    id: 'replacement',
    title: 'Replace a part',
    description: 'Find a solution for a broken or missing part.',
    example: 'A replacement knob or mounting bracket',
    model: 'bracket',
  },
  {
    id: 'repair',
    title: 'Repair a device',
    description: 'Get a supported robot or device working again.',
    example: 'A robot arm that is not moving properly',
    model: 'robot',
  },
];
export const journey: {
  title: string;
  description: string;
  model: ModelKind;
  statuses: CaseStatus[];
}[] = [
  {
    title: 'Tell us the need',
    description: 'Describe the problem. We check what is possible.',
    model: 'blueprint',
    statuses: ['intake', 'assessment'],
  },
  {
    title: 'Agree the plan',
    description: 'Review the design, the price, and the delivery date.',
    model: 'receipt',
    statuses: ['approval'],
  },
  {
    title: 'Make or repair',
    description: 'The team makes the part or repairs the device.',
    model: 'robot',
    statuses: ['production'],
  },
  {
    title: 'Check the result',
    description: 'Check that it fits, works, and meets the agreed needs.',
    model: 'check',
    statuses: ['quality'],
  },
  {
    title: 'Deliver it',
    description: 'Send the finished item and keep its details for next time.',
    model: 'parcel',
    statuses: ['ready', 'delivered'],
  },
];
export function nextStep(item: CaseRecord): { title: string; text: string } {
  switch (item.status) {
    case 'intake':
      return {
        title: 'Review the request',
        text: 'Check the description, photos, and intended use. Add any missing details before starting the review.',
      };
    case 'assessment':
      return {
        title: 'Decide how to help',
        text: 'Confirm the size, material, and work needed. Choose who will do the job, then prepare the design and price.',
      };
    case 'approval':
      return {
        title: 'Get the plan approved',
        text: 'Record approval of the current design and price before starting the work.',
      };
    case 'production':
      return {
        title: 'Make or repair the item',
        text: 'Finish the agreed work, then send the item for its final checks.',
      };
    case 'quality':
      return {
        title: 'Finish the final checks',
        text: 'Write down the measured results. All required checks must pass before the item can be sent.',
      };
    case 'ready':
      return {
        title: 'Send it to the customer',
        text: 'Pack the checked item, arrange delivery, and mark it delivered when it arrives.',
      };
    case 'delivered':
      return {
        title: 'This job is complete',
        text: 'Keep the drawings and results. Use Saved parts when the customer needs the same item again.',
      };
    case 'blocked':
      return {
        title: 'Resolve the hold',
        text:
          item.blockedReason ||
          'Find out what is missing, record the next action, and restart the review when it is resolved.',
      };
  }
}
export function journeyIndex(status: CaseStatus) {
  return journey.findIndex((step) => step.statuses.includes(status));
}
