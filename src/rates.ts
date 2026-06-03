export interface Rate {
  category: string;
  type: string;
  monthly: number;
  semi: number;
  daily: number;
}

export const rateTable: Rate[] = [
  { category: 'Regular Members', type: 'No Treadmill', monthly: 600, semi: 300, daily: 60 },
  { category: 'Regular Members', type: 'With Treadmill', monthly: 800, semi: 400, daily: 80 },
  { category: 'Student/Senior Members', type: 'No Treadmill', monthly: 500, semi: 250, daily: 50 },
  { category: 'Student/Senior Members', type: 'With Treadmill', monthly: 700, semi: 350, daily: 70 },
  { category: 'Regular Non-Members', type: 'No Treadmill', monthly: 700, semi: 350, daily: 70 },
  { category: 'Regular Non-Members', type: 'With Treadmill', monthly: 900, semi: 450, daily: 90 },
  { category: 'Student/Senior Non-Members', type: 'No Treadmill', monthly: 600, semi: 300, daily: 60 },
  { category: 'Student/Senior Non-Members', type: 'With Treadmill', monthly: 800, semi: 400, daily: 80 },
];

export function parsePlan(plan: string) {
  const isNonMember = plan.includes('Non-Member');
  const isStudentSenior = plan.includes('Student/Senior');
  const category = isStudentSenior
    ? (isNonMember ? 'Student/Senior Non-Members' : 'Student/Senior Members')
    : (isNonMember ? 'Regular Non-Members' : 'Regular Members');
  const period = plan.includes('Daily') ? 'Daily'
    : plan.includes('Semi-Monthly') ? 'Semi-Monthly'
    : plan.includes('Monthly') ? 'Monthly' : '';
  const type = plan.includes('With Treadmill') ? 'With Treadmill'
    : plan.includes('No Treadmill') ? 'No Treadmill' : '';
  return { category, period, type };
}

export function lookupRate(category: string, type: string): Rate | undefined {
  return rateTable.find(r => r.category === category && r.type === type);
}
