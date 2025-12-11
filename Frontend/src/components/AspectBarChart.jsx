import React from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts'
import { Typography } from 'antd'

const { Text } = Typography

const palette = ['#1677ff', '#52c41a', '#faad14', '#13c2c2', '#722ed1', '#eb2f96', '#fa541c', '#2f54eb']

function CustomTooltip({ active, payload, label }){
  if (active && payload && payload.length) {
    const p = payload[0]?.payload || {}
    return (
      <div style={{ background:'#fff', border:'1px solid #eee', padding:12, borderRadius:8, maxWidth:320 }}>
        <div style={{ fontWeight:600, marginBottom:6 }}>{label} — {p.ratio}%</div>
        <div style={{ fontSize:12, color:'#667085' }}>Olumlu: {p.positive} · Olumsuz: {p.negative}</div>
        {p.summary && (<div style={{ marginTop:8 }}><Text type="secondary">{p.summary}</Text></div>)}
      </div>
    )
  }
  return null
}

export default function AspectBarChart({ data = [] }){
  const chartData = data.map((d, i) => ({ name: d.aspect, ratio: d.ratio, positive: d.positive, negative: d.negative, summary: d.summary }))
  return (
    <div style={{ width:'100%', height: 320 }}>
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis unit="%" />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="ratio" name="Oran (%)">
            {chartData.map((entry, idx) => (
              <Cell key={`cell-${idx}`} fill={palette[idx % palette.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
