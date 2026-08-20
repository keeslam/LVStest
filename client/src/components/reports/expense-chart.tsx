import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/format-utils';

export interface ExpenseChartData {
  name: string;
  expenses: number;
}

interface ExpenseChartProps {
  data: ExpenseChartData[];
}

export function ExpenseChart({ data }: ExpenseChartProps) {
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
          formatter={(value: number) => [formatCurrency(value), 'Expenses']}
        />
        <Legend />
        <Bar dataKey="expenses" name="Expenses" fill="#ef4444" />
      </BarChart>
    </ResponsiveContainer>
  );
}