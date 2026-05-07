import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Layout, Card, Row, Col, Typography, Table, Tag, Badge, Alert, Statistic, Divider, Collapse, Button, Result } from 'antd';
import { ArrowLeftOutlined, ThunderboltOutlined, CheckCircleFilled, InfoCircleOutlined, StarFilled, MessageOutlined, LikeOutlined, DislikeOutlined } from '@ant-design/icons';
import AspectBarChart from '../components/AspectBarChart.jsx';
import { useAnalysis } from '../App.jsx';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;

function bestSnippet(a, fallbackSummary){
  const s = a?.examplesPos?.[0] || a?.examplesNeg?.[0] || '';
  const base = s?.toString().trim().length ? s : (fallbackSummary || '');
  return base.length > 220 ? base.slice(0, 217) + '…' : base;
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Results() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tasks } = useAnalysis();

  const [dbData, setDbData] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState(null);

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
    { title: 'Bahsedilme', dataIndex: 'ratio', key: 'ratio', width: 110, align: 'center', render: (r) => (<Badge count={`${r}%`} style={{ backgroundColor: '#e0e7ff', color: '#4338ca', fontWeight: 600, boxShadow: 'none' }} showZero />) },
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

  const uiIssues = useMemo(() => {
    const raw = data?.highlights?.issues || [];
    return raw.map((i) => {
      const name = i.aspect || i.name || '';
      const found = aspectIndex.get(String(name).toLowerCase());
      return { name, ratio: found?.ratio ?? '—', example: i.example, reason: i.reason };
    });
  }, [data?.highlights?.issues, aspectIndex]);

  const uiPraises = useMemo(() => {
    const raw = data?.highlights?.praises || [];
    return raw.map((p) => {
      const name = p.aspect || p.name || '';
      const found = aspectIndex.get(String(name).toLowerCase());
      return { name, ratio: found?.ratio ?? '—', example: p.example, reason: p.reason };
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
      
      {/* Results Header (Sticky) */}
      <div className="results-header">
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', width: '100%' }}>
            <Link to="/">
              <Button type="text" icon={<ArrowLeftOutlined />} style={{ color: 'white', opacity: 0.8 }} />
            </Link>
            
            <Title level={4} style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center' }}>
              <StarFilled style={{ color: '#fbbf24', marginRight: 10 }} /> 
              AI Analiz Raporu
            </Title>
          </div>
        </div>
      </div>

      <Content>
        <div className="container" style={{ position: 'relative', zIndex: 10 }}>
          
          {data && (
            <>
              {/* Detected Product Title */}
              {data.productTitle && (
                <div className="section" style={{ marginTop: '16px', marginBottom: '32px' }}>
                  <Title level={2} style={{ color: '#0f172a', fontWeight: 800 }}>
                    {data.productTitle}
                  </Title>
                  <Divider style={{ marginTop: 12, marginBottom: 0 }} />
                </div>
              )}

              {/* Stats Row */}
              <div className="section" style={{ marginTop: '16px' }}>
                <Row gutter={[24, 24]}>
                  <Col xs={24} sm={12}>
                    <Card className="premium-card stat-card" style={{ height: '100%' }}>
                      <Statistic
                        title="Analiz Edilen Yorum"
                        value={data.analyzed_reviews}
                        prefix={<MessageOutlined style={{ marginRight: 8, color: '#8b5cf6' }} />}
                        valueStyle={{ color: '#4f46e5' }}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Card className="premium-card stat-card" style={{ height: '100%' }}>
                      <Statistic
                        title="Öne Çıkan Özellik"
                        value={data.aspect_stats?.length || 0}
                        prefix={<InfoCircleOutlined style={{ marginRight: 8, color: '#0ea5e9' }} />}
                        valueStyle={{ color: '#0284c7' }}
                      />
                    </Card>
                  </Col>
                </Row>
              </div>

              {/* Overall Summary */}
              <div className="section">
                <Card className="premium-card" style={{ background: 'rgba(240, 253, 244, 0.8) !important', borderColor: 'rgba(187, 247, 208, 0.5) !important' }}>
                  <Title level={4} style={{ color: '#166534', marginTop: 0 }}>
                    <StarFilled style={{ marginRight: 8 }} />
                    Yapay Zeka Genel Değerlendirmesi
                  </Title>
                  <Text style={{ fontSize: '17px', lineHeight: '1.7', color: '#14532d' }}>
                    {data.summary}
                  </Text>
                </Card>
              </div>

              {/* Platform Summary */}
              {data.perPlatform && Object.keys(data.perPlatform).length > 0 && (
                <div className="section">
                  <Card className="premium-card" title={<><InfoCircleOutlined style={{ color: '#4f46e5', marginRight: 8 }} /> Platformlara Göre Değerlendirme</>}>
                    <Row gutter={[24, 24]}>
                      {['amazon', 'trendyol', 'hepsiburada'].map(platform => {
                        const count = data.perPlatform[platform] || 0;
                        const pSummary = data.per_platform_summary?.[platform];
                        if (!count) return null;
                        return (
                          <Col xs={24} md={8} key={platform}>
                            <Card size="small" style={{ background: '#f8fafc', height: '100%', borderColor: '#e2e8f0', borderRadius: '12px' }}>
                              <Statistic
                                title={<span style={{ textTransform: 'capitalize', fontWeight: 'bold', color: '#475569' }}>{platform}</span>}
                                value={count}
                                suffix={<span style={{ fontSize: '14px', color: '#94a3b8' }}>yorum</span>}
                                valueStyle={{ fontSize: '24px', color: '#334155', fontWeight: 700 }}
                              />
                              {pSummary && (
                                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
                                  <Text type="secondary" style={{ fontSize: '14px', lineHeight: '1.5' }}>{pSummary}</Text>
                                </div>
                              )}
                            </Card>
                          </Col>
                        );
                      })}
                    </Row>
                  </Card>
                </div>
              )}

              {/* Highlights */}
              <div className="section">
                <Row gutter={[24, 24]}>
                  <Col xs={24} md={12}>
                    <Card className="premium-card" title={<><LikeOutlined style={{ color: '#10b981', marginRight: 8 }} /> En Çok Övülen Yönleri</>}>
                      {uiPraises.length ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {uiPraises.map((p, idx) => (
                            <div key={idx} className="highlight-box box-praise">
                              <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
                                <Text strong style={{ fontSize: '16px', color: '#047857' }}>{p.name.toUpperCase()}</Text>
                                <Tag color="success" bordered={false} style={{ borderRadius: '6px' }}>{typeof p.ratio === 'number' ? `%${p.ratio} oranında` : ''}</Tag>
                              </Row>
                              {p.reason && <div><Text type="secondary">{p.reason}</Text></div>}
                              {!p.reason && p.example && <div><Text italic>“{p.example}”</Text></div>}
                            </div>
                          ))}
                        </div>
                      ) : <Alert type="info" message="Öne çıkan belirgin bir övgü tespit edilemedi." showIcon />}
                    </Card>
                  </Col>

                  <Col xs={24} md={12}>
                    <Card className="premium-card" title={<><DislikeOutlined style={{ color: '#ef4444', marginRight: 8 }} /> En Çok Şikayet Edilen Yönleri</>}>
                      {uiIssues.length ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {uiIssues.map((i, idx) => (
                            <div key={idx} className="highlight-box box-issue">
                              <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
                                <Text strong style={{ fontSize: '16px', color: '#b91c1c' }}>{i.name.toUpperCase()}</Text>
                                <Tag color="error" bordered={false} style={{ borderRadius: '6px' }}>{typeof i.ratio === 'number' ? `%${i.ratio} oranında` : ''}</Tag>
                              </Row>
                              {i.reason && <div><Text type="secondary">{i.reason}</Text></div>}
                              {!i.reason && i.example && <div><Text italic>“{i.example}”</Text></div>}
                            </div>
                          ))}
                        </div>
                      ) : <Alert type="success" message="Öne çıkan belirgin bir sorun tespit edilemedi." showIcon />}
                    </Card>
                  </Col>
                </Row>
              </div>

              {/* Aspect Bar Chart */}
              {data.aspect_stats && data.aspect_stats.length > 0 && (
                <div className="section">
                  <Card className="premium-card" title="Özelliklere Göre Kullanıcı Memnuniyeti Grafiği">
                    <div style={{ height: 400, marginTop: 16 }}>
                      <AspectBarChart data={data.aspect_stats} />
                    </div>
                  </Card>
                </div>
              )}

              {/* Detailed Table */}
              <div className="section">
                <Card className="premium-card" title="Tüm Özelliklerin Detaylı İncelemesi" bodyStyle={{ padding: 0, overflow: 'hidden', borderRadius: '0 0 20px 20px' }}>
                  <div className="premium-table">
                    <Table
                      rowKey={(r) => r.aspect}
                      columns={columns}
                      dataSource={data.aspect_stats}
                      pagination={{ pageSize: 10, showSizeChanger: false, position: ['bottomCenter'] }}
                      scroll={{ x: 'max-content' }}
                    />
                  </div>
                </Card>
              </div>

              {/* Specific Comments */}
              <div className="section" style={{ paddingBottom: 60 }}>
                <Card className="premium-card" title="Seçilmiş Müşteri Alıntıları">
                  <Collapse accordion bordered={false} style={{ background: 'transparent' }} expandIconPosition="end">
                    {data.aspect_stats.map((a) => (
                      <Collapse.Panel
                        header={
                          <Row align="middle" justify="space-between" style={{ width: '100%', paddingRight: 24 }}>
                            <Text strong style={{ fontSize: 16 }}>{a.aspect.toUpperCase()}</Text>
                            <div>
                              <Badge count={a.positive} style={{ backgroundColor: '#10b981', marginRight: 8, boxShadow: 'none' }} overflowCount={999} />
                              <Badge count={a.negative} style={{ backgroundColor: '#ef4444', boxShadow: 'none' }} overflowCount={999} />
                            </div>
                          </Row>
                        }
                        key={a.aspect}
                        style={{
                          marginBottom: 16,
                          background: '#ffffff',
                          borderRadius: 16,
                          border: '1px solid #f1f5f9',
                          overflow: 'hidden',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                        }}
                      >
                        <div style={{ padding: '8px' }}>
                          <Row gutter={[24, 24]}>
                            <Col xs={24} md={12}>
                              <Text strong style={{ color: '#10b981', display: 'flex', alignItems: 'center', marginBottom: 16, fontSize: '15px' }}>
                                <LikeOutlined style={{ marginRight: 8 }} /> Pozitif Yorum Örnekleri
                              </Text>
                              {a.examplesPos && a.examplesPos.length > 0 ? (
                                a.examplesPos.map((e, i) => (
                                  <div key={i} className="aspect-list-item" style={{ borderLeft: '4px solid #10b981' }}>
                                    <Text type="secondary" style={{ fontSize: '14px', lineHeight: '1.6' }}>"{e}"</Text>
                                  </div>
                                ))
                              ) : <Text type="secondary" italic>Pozitif örnek alıntısı bulunamadı.</Text>}
                            </Col>
                            <Col xs={24} md={12}>
                              <Text strong style={{ color: '#ef4444', display: 'flex', alignItems: 'center', marginBottom: 16, fontSize: '15px' }}>
                                <DislikeOutlined style={{ marginRight: 8 }} /> Negatif Yorum Örnekleri
                              </Text>
                              {a.examplesNeg && a.examplesNeg.length > 0 ? (
                                a.examplesNeg.map((e, i) => (
                                  <div key={i} className="aspect-list-item" style={{ borderLeft: '4px solid #ef4444' }}>
                                    <Text type="secondary" style={{ fontSize: '14px', lineHeight: '1.6' }}>"{e}"</Text>
                                  </div>
                                ))
                              ) : <Text type="secondary" italic>Negatif örnek alıntısı bulunamadı.</Text>}
                            </Col>
                          </Row>
                        </div>
                      </Collapse.Panel>
                    ))}
                  </Collapse>
                </Card>
              </div>
            </>
          )}
        </div>
      </Content>
    </Layout>
  );
}
