import React from 'react';
import { Typography, Tag, Tooltip } from 'antd';
import { MessageOutlined } from '@ant-design/icons';

const { Text } = Typography;

export default function AspectBarChart({ data = [] }) {
  // Sort by total count descending
  const sortedData = [...data].sort((a, b) => b.count - a.count);

  return (
    <div style={{ padding: '8px 0' }}>
      {sortedData.map((d, index) => {
        const total = d.count || (d.positive + d.negative) || 1;
        const posPercent = Math.round((d.positive / total) * 100);
        const negPercent = Math.round((d.negative / total) * 100);
        const mentionRatio = Math.round(d.ratio || 0);

        return (
          <div 
            key={d.aspect} 
            style={{ 
              marginBottom: '24px', 
              paddingBottom: '20px', 
              borderBottom: index !== sortedData.length - 1 ? '1px solid #f1f5f9' : 'none'
            }}
          >
            {/* Line 1: Header (Left: Aspect Name & Mention Ratio, Right: Comment counts statically visible) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              {/* Left Side: Aspect Name & Mention Ratio */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px', textTransform: 'uppercase' }}>
                  {d.aspect}
                </span>
                <Tag 
                  color="blue" 
                  style={{ 
                    borderRadius: '6px', 
                    fontSize: '11px', 
                    fontWeight: 700, 
                    margin: 0,
                    background: '#eff6ff',
                    color: '#2563eb',
                    border: 'none',
                    padding: '2px 8px'
                  }}
                >
                  %{mentionRatio} Bahsedilme Oranı
                </Tag>
              </div>

              {/* Right Side: Raw Comment numbers statically visible */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tag 
                  icon={<MessageOutlined style={{ marginRight: 4 }} />} 
                  style={{ 
                    borderRadius: '6px', 
                    fontSize: '11px', 
                    fontWeight: 600,
                    margin: 0,
                    background: '#f8fafc',
                    color: '#475569',
                    border: '1px solid #e2e8f0',
                    padding: '2px 8px'
                  }}
                >
                  {total} Yorum
                </Tag>
                <span 
                  style={{ 
                    fontSize: '11px', 
                    color: '#10b981', 
                    fontWeight: 700, 
                    background: '#f0fdf4', 
                    padding: '2px 8px', 
                    borderRadius: '6px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.01)' 
                  }}
                >
                  +{d.positive} Olumlu
                </span>
                <span 
                  style={{ 
                    fontSize: '11px', 
                    color: '#ef4444', 
                    fontWeight: 700, 
                    background: '#fef2f2', 
                    padding: '2px 8px', 
                    borderRadius: '6px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.01)'
                  }}
                >
                  -{d.negative} Olumsuz
                </span>
              </div>
            </div>

            {/* Line 2: Full Width Proportional Stacked Progress Bar (Ultra-Thin 5px, hover to see percentages) */}
            <div 
              style={{ 
                display: 'flex', 
                width: '100%', 
                height: '5px', 
                borderRadius: '3px', 
                overflow: 'hidden', 
                background: '#e2e8f0',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
                position: 'relative'
              }}
            >
              {/* Positive Segment (Green) */}
              {d.positive > 0 && (
                <Tooltip title={`%${posPercent} Olumlu (${d.positive} Yorum)`} placement="top">
                  <div 
                    className="aspect-bar-segment"
                    style={{ 
                      width: `${posPercent}%`, 
                      height: '100%', 
                      background: 'linear-gradient(90deg, #10b981, #059669)', 
                      cursor: 'pointer',
                      transition: 'filter 0.2s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.filter = 'none'}
                  />
                </Tooltip>
              )}

              {/* Negative Segment (Red) */}
              {d.negative > 0 && (
                <Tooltip title={`%${negPercent} Olumsuz (${d.negative} Yorum)`} placement="top">
                  <div 
                    className="aspect-bar-segment"
                    style={{ 
                      width: `${negPercent}%`, 
                      height: '100%', 
                      background: 'linear-gradient(90deg, #f87171, #ef4444)', 
                      cursor: 'pointer',
                      transition: 'filter 0.2s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.filter = 'none'}
                  />
                </Tooltip>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
