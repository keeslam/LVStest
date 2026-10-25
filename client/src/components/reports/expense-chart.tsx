import React from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/format-utils';

export interface ExpenseChartData {
  name: string;
  expenses: number;
  /** The category key, for a click on the bar. */
  category?: string;
}

interface ExpenseChartProps {
  data: ExpenseChartData[];
  /** Makes the bars clickable; gets the clicked bar's data. */
  onBarClick?: (point: ExpenseChartData) => void;
}

export function ExpenseChart({ data, onBarClick }: ExpenseChartProps) {
  const { t } = useTranslation('reports');
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis
          tickFormatter={(value) => formatCurrency(value)}
        />
        <Tooltip
          formatter={(value: number) => [formatCurrency(value), t('expenseChart.expenses')]}
        />
        <Legend />
        <Bar
          dataKey="expenses"
          name={t('expenseChart.expenses')}
          fill="#ef4444"
          cursor={onBarClick ? 'pointer' : undefined}
          onClick={onBarClick ? (_entry: unknown, index: number) => { const point = data[index]; if (point) onBarClick(point); } : undefined}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}