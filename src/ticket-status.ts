export const statuses = ['New ticket', 'In progress', 'Closed'];
export const historicalStatuses = ['Open', 'In Progress', 'Waiting for User', 'Waiting for Parts / Vendor', 'Resolved'];

export function currentStatus(status: string): string {
  switch (status) {
    case 'Open':
      return 'New ticket';
    case 'In Progress':
    case 'Waiting for User':
    case 'Waiting for Parts / Vendor':
      return 'In progress';
    case 'Resolved':
      return 'Closed';
    default:
      return status;
  }
}
