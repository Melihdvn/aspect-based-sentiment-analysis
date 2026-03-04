import React, { useMemo, useState } from 'react'
import { Layout, Card, Space, Input, Button, Typography, Row, Col, Table, Tag, message, Alert, Statistic, Badge, Divider, Collapse, Skeleton, ConfigProvider, theme } from 'antd'
import { SearchOutlined, ThunderboltOutlined, CheckCircleFilled, CloseCircleFilled, InfoCircleOutlined, StarFilled, MessageOutlined, LikeOutlined, DislikeOutlined } from '@ant-design/icons'
import AspectBarChart from './components/AspectBarChart.jsx'

const { Header, Content } = Layout
const { Title, Text, Paragraph } = Typography

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function bestSnippet(a, fallbackSummary){
  const s = a?.examplesPos?.[0] || a?.examplesNeg?.[0] || ''
  const base = s?.toString().trim().length ? s : (fallbackSummary || '')
  return base.length > 220 ? base.slice(0, 217) + '…' : base
}

export default function App(){
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const run = async (e) => {
    e?.preventDefault?.()
    if (!query.trim()) {
      message.warning('Lütfen aramak için bir ürün adı veya link girin.');
      return;
    }
    setLoading(true); setError(null); setData(null)
    try{
      const res = await fetch(`${API}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ query, max_items: 200, use_llm: true })
      })
      const j = await res.json()
      if(!res.ok) throw new Error(j.error || 'İstek başarısız')
      setData(j)
      message.success('Analiz başarıyla tamamlandı!');
    }catch(err){
      setError(String(err.message || err))
      message.error('Analiz sırasında hata: ' + (err?.message || err))
    }finally{
      setLoading(false)
    }
  }

  const columns = useMemo(()=>[
    { title: 'Değerlendirilen Özellik', dataIndex: 'aspect', key: 'aspect', width: 200, render: (t) => <><Tag color="blue" style={{ fontSize: '14px', padding: '4px 8px' }}>{t}</Tag></> },
    { title: 'Adet', dataIndex: 'count', key: 'count', width: 80, align: 'center', render: (v) => <Text strong>{v}</Text> },
    { title: 'Bahsedilme', dataIndex: 'ratio', key: 'ratio', width: 100, align: 'center', render: (r) => (<Badge count={`${r}%`} style={{ backgroundColor: '#bae0ff', color: '#0958d9' }} showZero />) },
    { title: 'Olumlu', dataIndex: 'positive', key: 'positive', width: 100, align: 'center', render: (v) => <Tag icon={<LikeOutlined />} color="success">{v}</Tag> },
    { title: 'Olumsuz', dataIndex: 'negative', key: 'negative', width: 100, align: 'center', render: (v) => <Tag icon={<DislikeOutlined />} color="error">{v}</Tag> },
    {
      title: 'Yapay Zeka Özeti', key: 'snippet', render: (_, record) => (
        <Paragraph ellipsis={{ rows: 2, expandable: true, symbol: 'devamı' }} style={{ marginBottom: 0 }}>
          {record.summary || `“${bestSnippet(record, data?.summary)}”`}
        </Paragraph>
    ) }
  ], [data?.summary])

  const aspectIndex = useMemo(() => {
    const map = new Map();
    if (data?.aspect_stats) {
      for (const a of data.aspect_stats) {
        if (a?.aspect) map.set(String(a.aspect).toLowerCase(), a);
      }
    }
    return map;
  }, [data?.aspect_stats])

  const uiIssues = useMemo(() => {
    const raw = data?.highlights?.issues || [];
    return raw.map((i) => {
      const name = i.aspect || i.name || '';
      const found = aspectIndex.get(String(name).toLowerCase());
      return { name, ratio: found?.ratio ?? '—', example: i.example, reason: i.reason };
    });
  }, [data?.highlights?.issues, aspectIndex])

  const uiPraises = useMemo(() => {
    const raw = data?.highlights?.praises || [];
    return raw.map((p) => {
      const name = p.aspect || p.name || '';
      const found = aspectIndex.get(String(name).toLowerCase());
      return { name, ratio: found?.ratio ?? '—', example: p.example, reason: p.reason };
    });
  }, [data?.highlights?.praises, aspectIndex])

  return (
    <ConfigProvider
      theme={{
        token: {
          fontFamily: "'Inter', sans-serif",
          colorPrimary: '#4f46e5',
          colorInfo: '#4f46e5',
          borderRadius: 8,
          colorBgContainer: '#ffffff',
        },
      }}
    >
      <Layout style={{ minHeight: '100vh', background: 'transparent' }}>

        {/* Modern Header Banner */}
        <div className="app-header">
          <div className="container">
            <Row align="middle" justify="space-between">
              <Col>
                <Title level={2} className="app-title"><StarFilled style={{ color: '#fbbf24', marginRight: 12 }} /> AI Ürün Analiz Platformu</Title>
                <div className="app-subtitle">Müşteri yorumlarını saniyeler içinde analiz edin, bilinçli alışveriş yapın.</div>
              </Col>
            </Row>
          </div>
        </div>

        <Content>
          <div className="container" style={{ position: 'relative', zIndex: 10 }}>
            {/* Search Card */}
            <Card className="premium-card">
              <form onSubmit={run}>
                <Row gutter={[16, 16]} align="middle">
                  <Col xs={24} md={18}>
                    <Input
                      size="large"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Ürün adı veya Hepsiburada/Trendyol URL'si (örn: iPhone 15 Pro)"
                      prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                      style={{ padding: '12px 16px', fontSize: '16px', borderRadius: '12px' }}
                      autoFocus
                    />
                  </Col>
                  <Col xs={24} md={6}>
                    <Button
                      type="primary"
                      htmlType="submit"
                      size="large"
                      icon={<ThunderboltOutlined />}
                      loading={loading}
                      style={{ width: '100%', height: '50px', fontSize: '16px', borderRadius: '12px', fontWeight: 600 }}
                    >
                      Analiz Et
                    </Button>
                  </Col>
                </Row>
              </form>

              {error && (
                <Alert
                  type="error"
                  showIcon
                  message="Analiz Hatası"
                  description={error}
                  style={{ marginTop: 24, borderRadius: 12 }}
                />
              )}
            </Card>

            {loading && (
              <div className="section">
                <Card className="premium-card">
                  <Skeleton active avatar paragraph={{ rows: 4 }} />
                  <Divider />
                  <Skeleton active paragraph={{ rows: 2 }} />
                </Card>
              </div>
            )}

            {data && !loading && (
              <>
                {/* Stats Row */}
                <div className="section">
                  <Row gutter={[24, 24]}>
                    <Col xs={24} sm={8}>
                      <Card className="premium-card stat-card">
                        <Statistic
                          title="Toplam Analiz Edilen Yorum"
                          value={data.analyzed_reviews}
                          prefix={<MessageOutlined style={{ marginRight: 8 }} />}
                          valueStyle={{ color: '#4f46e5' }}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Card className="premium-card stat-card">
                        <Statistic
                          title="Belirlenen Öne Çıkan Özellikler"
                          value={data.aspect_stats?.length || 0}
                          prefix={<InfoCircleOutlined style={{ marginRight: 8 }} />}
                          valueStyle={{ color: '#0ea5e9' }}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Card className="premium-card stat-card">
                        <Statistic
                          title="Veri Kaynağı"
                          value={Array.isArray(data.sources) && data.sources.includes('database') ? 'Önbellek (Veritabanı)' : 'Gerçek Zamanlı'}
                          valueStyle={{ color: Array.isArray(data.sources) && data.sources.includes('database') ? '#10b981' : '#f59e0b', fontSize: '20px', marginTop: 8 }}
                          prefix={Array.isArray(data.sources) && data.sources.includes('database') ? <CheckCircleFilled /> : <ThunderboltOutlined />}
                        />
                      </Card>
                    </Col>
                  </Row>
                </div>

                {/* Overall Summary */}
                <div className="section">
                  <Card className="premium-card" style={{ background: '#f0fdf4 !important', borderColor: '#bbf7d0 !important' }}>
                    <Title level={4} style={{ color: '#166534', marginTop: 0 }}>
                      <StarFilled style={{ marginRight: 8 }} />
                      Yapay Zeka Genel Değerlendirmesi
                    </Title>
                    <Text style={{ fontSize: '16px', lineHeight: '1.6', color: '#14532d' }}>
                      {data.summary}
                    </Text>
                  </Card>
                </div>

                {/* Highlights */}
                <div className="section">
                  <Row gutter={[24, 24]}>
                    <Col xs={24} md={12}>
                      <Card className="premium-card" title={<><LikeOutlined style={{ color: '#10b981', marginRight: 8 }} /> En Çok Övülen Yönleri</>} headStyle={{ borderBottomColor: '#f0fdf4' }}>
                        {uiPraises.length ? (
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {uiPraises.map((p, idx) => (
                              <div key={idx} className="highlight-box box-praise">
                                <Row justify="space-between" align="middle" style={{ marginBottom: 4 }}>
                                  <Text strong style={{ fontSize: '16px', color: '#047857' }}>{p.name.toUpperCase()}</Text>
                                  <Tag color="success" bordered={false}>{typeof p.ratio === 'number' ? `${p.ratio}% bahsedildi` : ''}</Tag>
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
                      <Card className="premium-card" title={<><DislikeOutlined style={{ color: '#ef4444', marginRight: 8 }} /> En Çok Şikayet Edilen Yönleri</>} headStyle={{ borderBottomColor: '#fef2f2' }}>
                        {uiIssues.length ? (
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {uiIssues.map((i, idx) => (
                              <div key={idx} className="highlight-box box-issue">
                                <Row justify="space-between" align="middle" style={{ marginBottom: 4 }}>
                                  <Text strong style={{ fontSize: '16px', color: '#b91c1c' }}>{i.name.toUpperCase()}</Text>
                                  <Tag color="error" bordered={false}>{typeof i.ratio === 'number' ? `${i.ratio}% bahsedildi` : ''}</Tag>
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
                  <Card className="premium-card" title="Tüm Özelliklerin Detaylı İncelemesi" bodyStyle={{ padding: 0 }}>
                    <Table
                      rowKey={(r) => r.aspect}
                      columns={columns}
                      dataSource={data.aspect_stats}
                      pagination={{ pageSize: 10, showSizeChanger: false, position: ['bottomCenter'] }}
                      scroll={{ x: 'max-content' }}
                    />
                  </Card>
                </div>

                {/* Specific Comments */}
                <div className="section" style={{ paddingBottom: 60 }}>
                  <Card className="premium-card" title="Seçilmiş Müşteri Alıntıları (Örnekler)">
                    <Collapse accordion bordered={false} style={{ background: 'transparent' }} expandIconPosition="end">
                      {data.aspect_stats.map((a) => (
                        <Collapse.Panel
                          header={
                            <Row align="middle" justify="space-between" style={{ width: '100%', paddingRight: 24 }}>
                              <Text strong style={{ fontSize: 15 }}>{a.aspect.toUpperCase()}</Text>
                              <div>
                                <Badge count={a.positive} style={{ backgroundColor: '#10b981', marginRight: 8 }} overflowCount={999} />
                                <Badge count={a.negative} style={{ backgroundColor: '#ef4444' }} overflowCount={999} />
                              </div>
                            </Row>
                          }
                          key={a.aspect}
                          style={{
                            marginBottom: 12,
                            background: '#f8fafc',
                            borderRadius: 12,
                            border: '1px solid #e2e8f0',
                            overflow: 'hidden'
                          }}
                        >
                          <div style={{ padding: '0 8px' }}>
                            <Alert type="info" message={a.summary || "Bu özellik hakkında genel bir değerlendirme."} style={{ marginBottom: 16 }} />

                            <Row gutter={[24, 24]}>
                              <Col xs={24} md={12}>
                                <Text strong style={{ color: '#10b981', display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                                  <LikeOutlined style={{ marginRight: 8 }} /> Pozitif Yorum Örnekleri
                                </Text>
                                {a.examplesPos && a.examplesPos.length > 0 ? (
                                  a.examplesPos.map((e, i) => (
                                    <div key={i} className="aspect-list-item" style={{ borderLeft: '3px solid #10b981' }}>
                                      <Text type="secondary">"{e}"</Text>
                                    </div>
                                  ))
                                ) : <Text type="secondary" italic>Pozitif örnek alıntısı bulunamadı.</Text>}
                              </Col>
                              <Col xs={24} md={12}>
                                <Text strong style={{ color: '#ef4444', display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                                  <DislikeOutlined style={{ marginRight: 8 }} /> Negatif Yorum Örnekleri
                                </Text>
                                {a.examplesNeg && a.examplesNeg.length > 0 ? (
                                  a.examplesNeg.map((e, i) => (
                                    <div key={i} className="aspect-list-item" style={{ borderLeft: '3px solid #ef4444' }}>
                                      <Text type="secondary">"{e}"</Text>
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
    </ConfigProvider>
  )
}
