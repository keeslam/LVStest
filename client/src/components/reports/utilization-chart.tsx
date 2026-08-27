import React from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export interface UtilizationChartData {
  name: string;
  utilization: number;
}

interface UtilizationChartProps {
  data: UtilizationChartData[];
}

export function UtilizationChart({ data }: UtilizationChartProps) {
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
          tickFormatter={(value) => `${value}%`}
        />
        <Tooltip
          formatter={(value: number) => [`${value}%`, t('utilizationChart.utilization')]}
        />
        <Legend />
        <Bar dataKey="utilization" name={t('utilizationChart.utilizationPercent')} fill="#0ea5e9" />
      </BarChart>
    </ResponsiveContainer>
  );
}