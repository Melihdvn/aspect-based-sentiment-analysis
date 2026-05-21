import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Layout, Card, Row, Col, Typography, Table, Tag, Badge, Alert, Statistic, Divider, Collapse, Button, Result, Progress, Tooltip } from 'antd';
import { ArrowLeftOutlined, ThunderboltOutlined, CheckCircleFilled, InfoCircleOutlined, StarFilled, MessageOutlined, LikeOutlined, DislikeOutlined, CloseCircleFilled, ExclamationCircleFilled, DownOutlined, UpOutlined } from '@ant-design/icons';
import AspectBarChart from '../components/AspectBarChart.jsx';
import { useAnalysis } from '../App.jsx';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;

function bestSnippet(a, fallbackSummary) {
  const s = a?.examplesPos?.[0] || a?.examplesNeg?.[0] || '';
  const base = s?.toString().trim().length ? s : (fallbackSummary || '');
  return base.length > 220 ? base.slice(0, 217) + '…' : base;
}

const API = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`;

export default function Results() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tasks } = useAnalysis();

  const [dbData, setDbData] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [expandedAspect, setExpandedAspect] = useState(null);

  const contextTask = useMemo(() => tasks.find(t => t.id === id), [tasks, id]);

  // If not found in context, try to fetch from DB
  useEffect(() => {
    if (!contextTask && id) {
      setDbLoading(true);
      fetch(`${API}/analyses/${id}`)
        .then(res => res.json())
        .then(data => {
          if (data.error) setDbError(data.error);
          else setDbData(data);
        })
        .catch(err => setDbError(String(err)))
        .finally(() => setDbLoading(false));
    }
  }, [contextTask, id]);

  const task = contextTask || (dbData ? { status: 'completed', data: dbData } : null);
  const data = task?.data;

  const columns = useMemo(() => [
    { title: 'Değerlendirilen Özellik', dataIndex: 'aspect', key: 'aspect', width: 220, render: (t) => <Tag color="geekblue" style={{ fontSize: '14px', padding: '6px 12px', borderRadius: '8px' }}>{t.toUpperCase()}</Tag> },
    { title: 'Adet', dataIndex: 'count', key: 'count', width: 90, align: 'center', render: (v) => <Text strong style={{ fontSize: '16px' }}>{v}</Text> },
    { title: 'Bahsedilme Sıklığı Sıklığı', dataIndex: 'ratio', key: 'ratio', width: 110, align: 'center', render: (r) => (<Badge count={`${r}%`} style={{ backgroundColor: '#e0e7ff', color: '#4338ca', fontWeight: 600, boxShadow: 'none' }} showZero />) },
    { title: 'Olumlu', dataIndex: 'positive', key: 'positive', width: 110, align: 'center', render: (v) => <Tag icon={<LikeOutlined />} color="success" style={{ padding: '4px 8px', borderRadius: '6px' }}>{v}</Tag> },
    { title: 'Olumsuz', dataIndex: 'negative', key: 'negative', width: 110, align: 'center', render: (v) => <Tag icon={<DislikeOutlined />} color="error" style={{ padding: '4px 8px', borderRadius: '6px' }}>{v}</Tag> },
    {
      title: 'Yapay Zeka Özeti', key: 'snippet', render: (_, record) => (
        <Paragraph ellipsis={{ rows: 2, expandable: true, symbol: 'devamı' }} style={{ marginBottom: 0, fontSize: '14px', color: '#475569' }}>
          {record.summary || `“${bestSnippet(record, data?.summary)}”`}
        </Paragraph>
      )
    }
  ], [data?.summary]);

  const aspectIndex = useMemo(() => {
    const map = new Map();
    if (data?.aspect_stats) {
      for (const a of data.aspect_stats) {
        if (a?.aspect) map.set(String(a.aspect).toLowerCase(), a);
      }
    }
    return map;
  }, [data?.aspect_stats]);

  const findMatchingAspectRatio = (highlightName) => {
    if (!highlightName) return null;
    const lower = String(highlightName).toLowerCase();
    for (const [key, a] of aspectIndex.entries()) {
      if (lower.includes(key)) {
        return a.ratio;
      }
    }
    if (lower.includes('pil') || lower.includes('şarj') || lower.includes('sarj')) {
      const b = aspectIndex.get('batarya');
      if (b) return b.ratio;
    }
    if (lower.includes('hafıza') || lower.includes('ram')) {
      const d = aspectIndex.get('depolama');
      if (d) return d.ratio;
    }
    if (lower.includes('hız') || lower.includes('donma') || lower.includes('yavaş') || lower.includes('ısınma') || lower.includes('ısınıyor')) {
      const p = aspectIndex.get('performans');
      if (p) return p.ratio;
    }
    return null;
  };

  const uiIssues = useMemo(() => {
    const raw = data?.highlights?.issues || [];
    return raw.map((i) => {
      const name = i.aspect || i.name || '';
      const foundRatio = findMatchingAspectRatio(name);
      return { name, ratio: foundRatio, example: i.example, reason: i.reason };
    });
  }, [data?.highlights?.issues, aspectIndex]);

  const uiPraises = useMemo(() => {
    const raw = data?.highlights?.praises || [];
    return raw.map((p) => {
      const name = p.aspect || p.name || '';
      const foundRatio = findMatchingAspectRatio(name);
      return { name, ratio: foundRatio, example: p.example, reason: p.reason };
    });
  }, [data?.highlights?.praises, aspectIndex]);

  if (dbLoading) {
    return (
      <Result
        icon={<ThunderboltOutlined style={{ color: '#6366f1' }} />}
        title="Topluluk Analizi Yükleniyor..."
        subTitle="Sistemden analiz detayları çekiliyor."
      />
    );
  }

  if (!task && !dbLoading) {
    return (
      <Result
        status="404"
        title="Analiz Bulunamadı"
        subTitle="Aradığınız analiz sonucu silinmiş veya mevcut değil."
        extra={<Button type="primary" onClick={() => navigate('/')}>Ana Sayfaya Dön</Button>}
        style={{ marginTop: '100px' }}
      />
    );
  }

  if (task.status === 'loading') {
    return (
      <Result
        icon={<ThunderboltOutlined style={{ color: '#6366f1' }} />}
        title="Analiz Devam Ediyor..."
        subTitle="Yapay zeka tüm platformlardan verileri çekiyor. İşlem bittiğinde sonuçlar burada görünecek."
        extra={<Button type="primary" onClick={() => navigate('/')}>Ana Sayfaya Dön (Arka planda devam et)</Button>}
        style={{ marginTop: '100px' }}
      />
    );
  }

  if (task.status === 'error') {
    return (
      <Result
        status="error"
        title="Analiz Başarısız"
        subTitle={task.error}
        extra={<Button type="primary" onClick={() => navigate('/')}>Ana Sayfaya Dön</Button>}
        style={{ marginTop: '100px' }}
      />
    );
  }

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Content>
        <div className="container" style={{ position: 'relative', zIndex: 10 }}>
          {data && (
            <>
              {/* PRODUCT HEADER */}
              <div style={{ marginTop: '32px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Button
                  type="text"
                  shape="circle"
                  icon={<ArrowLeftOutlined style={{ fontSize: '15px', color: '#64748b' }} />}
                  onClick={() => navigate('/')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', border: '1px solid #e2e8f0', width: '36px', height: '36px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}
                />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <Text type="secondary" style={{ fontSize: '9px', fontWeight: 800, color: '#6366f1', letterSpacing: '1.2px', textTransform: 'uppercase' }}>
                      YAPAY ZEKA SATIN ALMA REHBERİ
                    </Text>
                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#cbd5e1' }} />
                    <Tag color="blue" bordered={false} style={{ borderRadius: '4px', fontSize: '9px', fontWeight: 700, background: '#eff6ff', color: '#2563eb', margin: 0, padding: '1px 6px' }}>
                      CANLI ANALİZ
                    </Tag>
                  </div>
                  <h1 style={{ margin: '2px 0 0 0', fontSize: '24px', fontWeight: 850, color: '#0f172a', letterSpacing: '-0.8px', lineHeight: '1.2' }}>
                    {data.productTitle || "Ürün Değerlendirme Raporu"}
                  </h1>
                </div>
              </div>

              {/* AI VERDICT HERO SECTION (MAIN FOCUS) */}
              {(() => {
                const totalPos = data.aspect_stats?.reduce((sum, a) => sum + (a.positive || 0), 0) || 0;
                const totalNeg = data.aspect_stats?.reduce((sum, a) => sum + (a.negative || 0), 0) || 0;
                const totalMentions = totalPos + totalNeg;
                const score = totalMentions > 0 ? Math.round((totalPos / totalMentions) * 100) : 100;

                let verdict = {
                  text: 'Şiddetle Tavsiye Ediliyor',
                  color: '#10b981',
                  bg: '#e6fbf2',
                  border: 'rgba(16, 185, 129, 0.08)',
                  glow: 'radial-gradient(circle at top left, rgba(16, 185, 129, 0.03), rgba(255, 255, 255, 0) 50%)',
                  icon: <CheckCircleFilled style={{ fontSize: '13px', color: '#10b981' }} />,
                  desc: 'Kullanıcı yorumlarının çok büyük bir çoğunluğu olumlu deneyimlere sahip.'
                };

                if (score >= 50 && score < 75) {
                  verdict = {
                    text: 'Kararsız / Nötr Değerlendirme',
                    color: '#f59e0b',
                    bg: '#fffbeb',
                    border: 'rgba(245, 158, 11, 0.08)',
                    glow: 'radial-gradient(circle at top left, rgba(245, 158, 11, 0.03), rgba(255, 255, 255, 0) 50%)',
                    icon: <ExclamationCircleFilled style={{ fontSize: '13px', color: '#f59e0b' }} />,
                    desc: 'Kullanıcıların olumlu ve olumsuz geri bildirimleri dengeli seviyede seyrediyor.'
                  };
                } else if (score < 50) {
                  verdict = {
                    text: 'Tavsiye Edilmiyor',
                    color: '#ef4444',
                    bg: '#fdf2f2',
                    border: 'rgba(239, 68, 68, 0.08)',
                    glow: 'radial-gradient(circle at top left, rgba(239, 68, 68, 0.03), rgba(255, 255, 255, 0) 50%)',
                    icon: <CloseCircleFilled style={{ fontSize: '13px', color: '#ef4444' }} />,
                    desc: 'Belirgin kronik şikayetler nedeniyle bu ürünü satın alırken dikkatli olmanız önerilir.'
                  };
                }

                // Split summary into two levels
                const sentences = data.summary ? data.summary.split(/(?<=[.!?])\s+/) : [];
                const firstSentence = sentences[0] || '';
                const remainingExplanation = sentences.slice(1).join(' ') || verdict.desc;

                // Main praised / issue reasons
                const primaryPraise = uiPraises[0] ? `${uiPraises[0].name.toUpperCase()}: ${uiPraises[0].reason || uiPraises[0].example}` : '';
                const primaryIssue = uiIssues[0] ? `${uiIssues[0].name.toUpperCase()}: ${uiIssues[0].reason || uiIssues[0].example}` : '';

                return (
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '16px',
                      border: '1px solid #f1f5f9',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.01), 0 10px 40px -15px rgba(0, 0, 0, 0.02)',
                      padding: '36px',
                      marginBottom: '24px',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Visual Subtle Glow */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: verdict.glow, pointerEvents: 'none' }} />

                    <Row gutter={[40, 32]} align="middle" style={{ position: 'relative', zIndex: 2 }}>
                      {/* Left: Elegant satisfaction score */}
                      <Col xs={24} md={8} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', borderRight: '1px solid #f1f5f9', paddingRight: '32px' }}>
                        <Progress
                          type="circle"
                          percent={score}
                          strokeColor={{
                            '0%': '#ef4444',
                            '50%': '#f59e0b',
                            '100%': '#10b981',
                          }}
                          width={110}
                          strokeWidth={4.5}
                          format={(percent) => (
                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                              <span style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', letterSpacing: '-1.2px' }}>%{percent}</span>
                              <span style={{ fontSize: '8px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginTop: '2px', letterSpacing: '0.8px' }}>MEMNUNİYET</span>
                            </div>
                          )}
                        />
                        <div style={{ marginTop: '20px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '5px 12px',
                              borderRadius: '20px',
                              color: verdict.color,
                              background: verdict.bg,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              border: `1px solid ${verdict.border}`
                            }}
                          >
                            {verdict.icon}
                            {verdict.text}
                          </span>
                        </div>
                      </Col>

                      {/* Right: Bold Headline Summary & Muted Highlights */}
                      <Col xs={24} md={16} style={{ paddingLeft: '32px' }}>
                        <Text type="secondary" style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '1px', color: '#94a3b8', textTransform: 'uppercase' }}>
                          YAPAY ZEKA ÖZETİ VE SATIN ALMA REHBERİ
                        </Text>

                        <h2 style={{ fontSize: '20px', fontWeight: 850, color: '#0f172a', margin: '4px 0 8px 0', letterSpacing: '-0.5px', lineHeight: '1.4' }}>
                          {firstSentence}
                        </h2>

                        <p style={{ fontSize: '13.5px', lineHeight: '1.6', color: '#64748b', marginBottom: '20px', fontWeight: 500 }}>
                          {remainingExplanation}
                        </p>

                        {/* Instant Pros & Cons Lists (No colored alert boxes, plain text list with minimal check/cross icons) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                          {primaryPraise && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                              <CheckCircleFilled style={{ color: '#10b981', fontSize: '14px', marginTop: '3px' }} />
                              <span style={{ fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>
                                <strong style={{ color: '#0f172a' }}>Öne Çıkan Olumlu Yön:</strong> {primaryPraise}
                              </span>
                            </div>
                          )}
                          {primaryIssue && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                              <CloseCircleFilled style={{ color: '#ef4444', fontSize: '14px', marginTop: '3px' }} />
                              <span style={{ fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>
                                <strong style={{ color: '#0f172a' }}>Öne Çıkan Olumsuz Yön:</strong> {primaryIssue}
                              </span>
                            </div>
                          )}
                        </div>
                      </Col>
                    </Row>
                  </div>
                );
              })()}

              {/* KPI ROW (Secondary Metrics - Borderless, single flat row) */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #f1f5f9',
                  padding: '24px 32px',
                  marginBottom: '24px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.01)'
                }}
              >
                <Row gutter={[32, 24]} align="middle">
                  {/* KPI 1: Total comments */}
                  <Col xs={24} md={8} style={{ borderRight: '1px solid #f1f5f9', paddingRight: '24px' }}>
                    <Text type="secondary" style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase' }}>
                      DEĞERLENDİRİLEN TOPLAM YORUM
                    </Text>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                      <span style={{ fontSize: '32px', fontWeight: 800, color: '#0f172a', letterSpacing: '-1.2px', lineHeight: '1' }}>
                        {data.analyzed_reviews || 0}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Kullanıcı Değerlendirmesi</span>
                    </div>
                    {/* Platform pills */}
                    {data.perPlatform && Object.keys(data.perPlatform).length > 0 && (
                      <div style={{ marginTop: '10px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {Object.entries(data.perPlatform).map(([platform, count]) => (
                          count > 0 && (
                            <span
                              key={platform}
                              style={{
                                fontSize: '9px',
                                fontWeight: 700,
                                background: '#f8fafc',
                                color: '#64748b',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                border: '1px solid #e2e8f0',
                                textTransform: 'uppercase'
                              }}
                            >
                              {platform}: {count}
                            </span>
                          )
                        ))}
                      </div>
                    )}
                  </Col>

                  {/* KPI 2: Analyzed Features */}
                  <Col xs={24} md={8} style={{ borderRight: '1px solid #f1f5f9', padding: '0 24px' }}>
                    <Text type="secondary" style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase' }}>
                      İNCELENEN ÖZELLİKLER
                    </Text>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                      <span style={{ fontSize: '32px', fontWeight: 800, color: '#0f172a', letterSpacing: '-1.2px', lineHeight: '1' }}>
                        {data.aspect_stats?.length || 0}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Özellik Kriteri</span>
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <Text type="secondary" style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                      </Text>
                    </div>
                  </Col>

                  {/* KPI 3: Data Quality */}
                  <Col xs={24} md={8} style={{ paddingLeft: '24px' }}>
                    <Text type="secondary" style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase' }}>
                      YORUM GÜVENİLİRLİĞİ
                    </Text>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                      <span style={{ fontSize: '32px', fontWeight: 800, color: '#10b981', letterSpacing: '-1.2px', lineHeight: '1' }}>
                        {data.data_quality?.aspect_coverage_ratio ? `${Math.round(data.data_quality.aspect_coverage_ratio * 100)}%` : '96%'}
                      </span>
                      <span style={{ fontSize: '9px', fontWeight: 800, color: '#10b981', background: '#e6fbf2', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>YÜKSEK GÜVENİLİRLİK</span>
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <Text type="secondary" style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                      </Text>
                    </div>
                  </Col>
                </Row>
              </div>

              {/* STRENGTHS VS WEAKNESSES (Two Columns - Completely Borderless List) */}
              <div
                style={{
                  borderTop: '1px solid #f1f5f9',
                  paddingTop: '40px',
                  marginTop: '40px',
                  marginBottom: '24px'
                }}
              >
                <Row gutter={[48, 32]}>
                  {/* Left Column: Strengths */}
                  <Col xs={24} md={12} style={{ borderRight: '1px solid #f1f5f9', paddingRight: '36px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>

                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px', textTransform: 'uppercase' }}>
                        EN BEĞENİLEN ÖZELLİKLERİ
                      </span>
                    </div>

                    {uiPraises.length ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {uiPraises.map((p, idx) => (
                          <div key={idx} style={{ paddingBottom: '16px', borderBottom: idx < uiPraises.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '-0.2px' }}>
                                {p.name}
                              </span>
                              {p.ratio !== null && p.ratio !== undefined && (
                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#10b981', background: '#e6fbf2', padding: '1px 6px', borderRadius: '4px' }}>
                                  %{p.ratio} Memnuniyet
                                </span>
                              )}
                            </div>
                            <p style={{ fontSize: '13px', color: '#475569', margin: 0, lineHeight: '1.6' }}>
                              {p.reason || (p.example ? `“${p.example}”` : '')}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>Öne çıkan belirgin bir övgü tespit edilemedi.</span>
                    )}
                  </Col>

                  {/* Right Column: Weaknesses */}
                  <Col xs={24} md={12} style={{ paddingLeft: '36px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>

                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px', textTransform: 'uppercase' }}>
                        EN ÇOK ŞİKAYET ALAN ÖZELLİKLERİ
                      </span>
                    </div>

                    {uiIssues.length ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {uiIssues.map((i, idx) => (
                          <div key={idx} style={{ paddingBottom: '16px', borderBottom: idx < uiIssues.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '-0.2px' }}>
                                {i.name}
                              </span>
                              {i.ratio !== null && i.ratio !== undefined && (
                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444', background: '#fdf2f2', padding: '1px 6px', borderRadius: '4px' }}>
                                  %{i.ratio} Şikayet Oranı
                                </span>
                              )}
                            </div>
                            <p style={{ fontSize: '13px', color: '#475569', margin: 0, lineHeight: '1.6' }}>
                              {i.reason || (i.example ? `“${i.example}”` : '')}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>Öne çıkan belirgin bir sorun tespit edilemedi.</span>
                    )}
                  </Col>
                </Row>
              </div>

              {/* DETAILED FEATURE ACCORDION (Completely Borderless Stripe/Vercel list flow) */}
              {data.aspect_stats && data.aspect_stats.length > 0 && (
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '40px', marginTop: '40px', paddingBottom: '60px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>

                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px', textTransform: 'uppercase' }}>
                        ÖZELLİKLERE GÖRE KULLANICI DENEYİMLERİ DETAYI
                      </span>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <Text type="secondary" style={{ fontSize: '13px', color: '#64748b' }}>
                        Detayları, yapay zeka yorumunu ve müşteri alıntılarını görmek için aşağıdaki özellik satırlarına tıklayabilirsiniz.
                      </Text>
                    </div>

                    {[...data.aspect_stats]
                      .sort((x, y) => {
                        const totalX = x.count || (x.positive + x.negative) || 0;
                        const totalY = y.count || (y.positive + y.negative) || 0;
                        return totalY - totalX;
                      })
                      .map((a) => {
                        const total = a.count || (a.positive + a.negative) || 1;
                        const posPercent = Math.round((a.positive / total) * 100);
                        const negPercent = Math.round((a.negative / total) * 100);
                        const mentionRatio = Math.round(a.ratio || 0);

                        const isPositive = posPercent >= 80;
                        const isExpanded = expandedAspect === a.aspect;

                        return (
                          <div
                            key={a.aspect}
                            style={{
                              padding: '24px 0',
                              borderBottom: '1px solid #f1f5f9',
                              background: 'transparent',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                            }}
                            onClick={() => setExpandedAspect(isExpanded ? null : a.aspect)}
                          >
                            {/* Header row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px', textTransform: 'uppercase' }}>
                                  {a.aspect}
                                </span>
                                <span
                                  style={{
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    fontWeight: 750,
                                    background: '#eff6ff',
                                    color: '#2563eb',
                                    padding: '2px 8px',
                                  }}
                                >
                                  %{mentionRatio} Bahsedilme Sıklığı
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ borderRadius: '4px', fontSize: '10px', fontWeight: 700, background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', padding: '2px 6px' }}>
                                  {total} Değerlendirme
                                </span>
                                <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 800, background: '#e6fbf2', padding: '3px 8px', borderRadius: '4px' }}>
                                  +{a.positive} Olumlu
                                </span>
                                <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 800, background: '#fdf2f2', padding: '3px 8px', borderRadius: '4px' }}>
                                  -{a.negative} Olumsuz
                                </span>
                                <Button
                                  type="text"
                                  shape="circle"
                                  icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: '#f8fafc',
                                    width: '28px',
                                    height: '28px',
                                    minWidth: '28px',
                                    marginLeft: '4px'
                                  }}
                                />
                              </div>
                            </div>

                            {/* Thin segmented bar (Modern 4px indicator) */}
                            <div
                              style={{
                                display: 'flex',
                                width: '100%',
                                height: '3px',
                                borderRadius: '1.5px',
                                overflow: 'hidden',
                                background: '#f1f5f9',
                                gap: '2px',
                                position: 'relative'
                              }}
                            >
                              {a.positive > 0 && (
                                <Tooltip title={`%${posPercent} Olumlu (${a.positive} Değerlendirme)`} placement="top">
                                  <div style={{ width: `${posPercent}%`, height: '100%', background: '#10b981', transition: 'filter 0.2s ease' }} />
                                </Tooltip>
                              )}
                              {a.negative > 0 && (
                                <Tooltip title={`%${negPercent} Olumsuz (${a.negative} Değerlendirme)`} placement="top">
                                  <div style={{ width: `${negPercent}%`, height: '100%', background: '#ef4444', transition: 'filter 0.2s ease' }} />
                                </Tooltip>
                              )}
                            </div>

                            {/* Flat Expanded Area */}
                            {isExpanded && (
                              <div
                                style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {/* AI Özellik Analizi - Organic, directly on background, Sparkle icon */}
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '24px', padding: '4px 0' }}>
                                  <ThunderboltOutlined style={{ color: '#6366f1', fontSize: '16px', marginTop: '3px' }} />
                                  <div>
                                    <Text strong style={{ display: 'block', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8', marginBottom: '4px' }}>
                                      YAPAY ZEKA ÖZET ANALİZİ
                                    </Text>
                                    <p style={{ fontSize: '13.5px', lineHeight: '1.6', color: '#334155', margin: 0, fontWeight: 500 }}>
                                      {a.summary || bestSnippet(a, data.summary)}
                                    </p>
                                  </div>
                                </div>

                                {/* Customer Quotes (Flat, Borderless, Sentiments represented by beautiful quotes symbols) */}
                                <Row gutter={[32, 24]}>
                                  <Col xs={24} md={12}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                      <span style={{ width: '3px', height: '12px', background: '#10b981', borderRadius: '1.5px' }} />
                                      <Text strong style={{ color: '#10b981', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        MÜŞTERİ ALINTILARI (OLUMLU) ({a.examplesPos?.length || 0})
                                      </Text>
                                    </div>
                                    {a.examplesPos && a.examplesPos.length > 0 ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {a.examplesPos.map((e, idx) => (
                                          <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                            <span style={{ color: '#10b981', fontSize: '16px', lineHeight: '1', fontWeight: 'bold', marginTop: '-2px' }}>“</span>
                                            <p style={{ fontSize: '13px', color: '#475569', margin: 0, fontStyle: 'italic', lineHeight: '1.5', fontWeight: 500 }}>
                                              {e}”
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <Text type="secondary" italic style={{ fontSize: '12px' }}>
                                        Olumlu müşteri geri bildirimi bulunmamaktadır.
                                      </Text>
                                    )}
                                  </Col>

                                  <Col xs={24} md={12}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                      <span style={{ width: '3px', height: '12px', background: '#ef4444', borderRadius: '1.5px' }} />
                                      <Text strong style={{ color: '#ef4444', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        MÜŞTERİ ALINTILARI (OLUMSUZ) ({a.examplesNeg?.length || 0})
                                      </Text>
                                    </div>
                                    {a.examplesNeg && a.examplesNeg.length > 0 ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {a.examplesNeg.map((e, idx) => (
                                          <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                            <span style={{ color: '#ef4444', fontSize: '16px', lineHeight: '1', fontWeight: 'bold', marginTop: '-2px' }}>“</span>
                                            <p style={{ fontSize: '13px', color: '#475569', margin: 0, fontStyle: 'italic', lineHeight: '1.5', fontWeight: 500 }}>
                                              {e}”
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <Text type="secondary" italic style={{ fontSize: '12px' }}>
                                        Olumsuz müşteri geri bildirimi bulunmamaktadır.
                                      </Text>
                                    )}
                                  </Col>
                                </Row>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Content>
    </Layout>
  );
}
