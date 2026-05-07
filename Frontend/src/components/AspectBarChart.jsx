import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Typography, Row, Badge } from 'antd';

const { Text } = Typography;

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const p = payload[0]?.payload || {};
    return (
      <div style={{
        background: 'rgba(255, 255, 255, 0.95)',
        border: '1px solid #e2e8f0',
        padding: '16px',
        borderRadius: '12px',
        maxWidth: '320px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        backdropFilter: 'blur(8px)'
      }}>
        <div style={{ fontWeight: 700, fontSize: '16px', color: '#1e293b', marginBottom: '8px', textTransform: 'uppercase' }}>
          {label}
        </div>
        <Row justify="space-between" style={{ marginBottom: '8px' }}>
          <Text type="secondary" style={{ fontSize: '13px' }}>Genel Memnuniyet (Oran)</Text>
          <Text strong style={{ color: p.ratio > 50 ? '#10b981' : (p.ratio < 30 ? '#ef4444' : '#f59e0b') }}>{p.ratio}%</Text>
        </Row>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '13px' }}>
          <div><Badge color="#10b981" text={`Olumlu: ${p.positive}`} /></div>
          <div><Badge color="#ef4444" text={`Olumsuz: ${p.negative}`} /></div>
        </div>
        {p.summary && (
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1' }}>
            <Text type="secondary" style={{ fontSize: '13px', lineHeight: '1.5' }}>{p.summary}</Text>
          </div>
        )}
      </div>
    );
  }
  return null;
}

export default function AspectBarChart({ data = [] }) {
  // Sort data by total mentions (positive + negative) to show the most discussed first
  const chartData = [...data].sort((a, b) => b.count - a.count).map(d => ({
    name: d.aspect,
    ratio: Math.round(d.ratio),
    positive: d.positive,
    negative: d.negative,
    summary: d.summary,
    count: d.count
  }));

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '380px' }}>
      <ResponsiveContainer>
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 20, bottom: 40, left: 0 }}
          barSize={40}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="name"
            tick={{ fill: '#64748b', fontSize: 13, fontWeight: 500 }}
            tickMargin={12}
            axisLine={{ stroke: '#cbd5e1' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 13 }}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }} />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <Bar
            dataKey="positive"
            stackId="a"
            name="Olumlu Yorumlar"
            fill="#10b981"
            animationDuration={1500}
            animationEasing="ease-out"
          />
          <Bar
            dataKey="negative"
            stackId="a"
            name="Olumsuz Yorumlar"
            fill="#ef4444"
            animationDuration={1500}
            animationEasing="ease-out"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
