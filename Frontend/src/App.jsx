import React, { useMemo, useState } from 'react'
import { Layout, Card, Space, Input, Button, Typography, Row, Col, Table, Tag, message, Alert, Statistic, Tabs, Badge, Divider, Collapse, Skeleton } from 'antd'
import { SearchOutlined, BarChartOutlined, ThunderboltOutlined } from '@ant-design/icons'
import AspectBarChart from './components/AspectBarChart.jsx'

const { Header, Content } = Layout
const { Title, Text } = Typography

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function bestSnippet(a, fallbackSummary){
  const s = a?.examplesPos?.[0] || a?.examplesNeg?.[0] || ''
  const base = s?.toString().trim().length ? s : (fallbackSummary || '')
  return base.length > 220 ? base.slice(0, 217) + '…' : base
}

export default function App(){
  const [query, setQuery] = useState('iPhone 13')
  // Offline mod kaldırıldı, her zaman LLM + canlı/sağlanan veri
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [useLLM] = useState(true)

  const run = async (e) => {
    e?.preventDefault?.()
    setLoading(true); setError(null); setData(null)
    try{
      const res = await fetch(`${API}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ query, max_items: 200, use_llm: useLLM })
      })
      const j = await res.json()
      if(!res.ok) throw new Error(j.error || 'İstek başarısız')
      setData(j)
    }catch(err){
      setError(String(err.message || err))
      message.error('Analiz sırasında hata: ' + (err?.message || err))
    }finally{
      setLoading(false)
    }
  }

  const runSample = async () => {
    setLoading(true); setError(null); setData(null)
    try{
      const res = await fetch(`${API}/analyze/sample`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ query, max_items: 120 })
      })
      const j = await res.json()
      if(!res.ok) throw new Error(j.error || 'İstek başarısız')
      setData(j)
    }catch(err){
      setError(String(err.message || err))
      message.error('Sample analiz hatası: ' + (err?.message || err))
    }finally{
      setLoading(false)
    }
  }

  const columns = useMemo(()=>[
    { title: 'Boyut', dataIndex: 'aspect', key: 'aspect', width: 140, render:(t)=> <Text strong>{t}</Text> },
    { title: 'Adet', dataIndex: 'count', key: 'count', width: 80 },
    { title: 'Oran (%)', dataIndex: 'ratio', key: 'ratio', width: 100, render: (r)=> (<span>{r}%</span>) },
    { title: 'Olumlu', dataIndex: 'positive', key: 'positive', width: 90, render:(v)=> <Tag color="green">{v}</Tag> },
    { title: 'Olumsuz', dataIndex: 'negative', key: 'negative', width: 90, render:(v)=> <Tag color="red">{v}</Tag> },
    { title: 'Konuya Özel Yorum', key: 'snippet', render: (_, record) => (
      <Text type="secondary">{record.summary || `“${bestSnippet(record, data?.summary)}”`}</Text>
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
    <Layout>
      <Header style={{ background:'#fff', borderBottom:'1px solid #f0f0f0' }}>
        <div className="container">
          <Title level={3} style={{ margin:12 }}><BarChartOutlined /> AI Destekli Satın Alma Yardımcısı</Title>
        </div>
      </Header>
      <Content>
        <div className="container">
          <Card className="card" style={{ marginTop:16 }}>
            <Space direction="vertical" style={{ width:'100%' }} size="large">
              <Row gutter={[16,16]} align="middle">
                <Col xs={24} md={16}>
                  <Input size="large" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ürün adı veya URL (örn: iPhone 13)" />
                </Col>
                <Col xs={24} md={8}>
                  <div style={{ width:'100%', display:'flex', justifyContent:'flex-end', gap:8 }}>
                    <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={run}>Analiz Et</Button>
                    <Button icon={<ThunderboltOutlined />} loading={loading} onClick={runSample}>Sample ile Analiz</Button>
                  </div>
                </Col>
              </Row>
              <Row>
                <Col span={24}>
                  <Alert type="info" showIcon message="Analiz LLM ile yapılır" description={<span>Sample ile hızlıca deneyebilir, canlı veri için <code>/analyze/raw</code> ile yorum gönderebilirsiniz.</span>} />
                </Col>
              </Row>
              {error && <Alert type="error" showIcon message="Hata" description={error} />}
            </Space>
          </Card>

          {loading && (
            <div className="section"><Card className="card"><Skeleton active paragraph={{ rows: 4 }} /></Card></div>
          )}

          {data && !loading && (
            <>
              <div className="section">
                <Row gutter={[16,16]}>
                  <Col xs={24} md={8}><Card className="card"><Statistic title="Analiz Edilen Yorum" value={data.analyzed_reviews} /></Card></Col>
                  <Col xs={24} md={8}><Card className="card"><Statistic title="Toplam Yorum" value={data.total_reviews} /></Card></Col>
                  <Col xs={24} md={8}><Card className="card"><Statistic title="Boyut Sayısı" value={data.aspect_stats?.length || 0} /></Card></Col>
                </Row>
              </div>

              <div className="section">
                <Card className="card" title="Genel Özet">
                  <Space direction="vertical" style={{ width:'100%' }}>
                    <Text>{data.summary}</Text>
                    <Text type="secondary">Kaynaklar: {Array.isArray(data.sources) ? data.sources.join(', ') : '—'}</Text>
                  </Space>
                </Card>
              </div>

              <div className="section">
                <Row gutter={[16,16]}>
                  <Col xs={24} md={12}>
                    <Card className="card" title="Öne Çıkan Sorunlar" extra={<Badge color="red" text="negatif" />}>
                      {uiIssues.length ? (
                        <Space direction="vertical" style={{ width:'100%' }}>
                          {uiIssues.map((i,idx)=> (
                            <div key={idx}>
                              <Text strong>{i.name}</Text> — <Text type="secondary">{typeof i.ratio === 'number' ? `${i.ratio}%` : '— %'}</Text>
                              {i.reason && <div><Text type="secondary">{i.reason}</Text></div>}
                              {!i.reason && i.example && <div><Text italic>“{i.example}”</Text></div>}
                            </div>
                          ))}
                        </Space>
                      ) : <Text type="secondary">Belirgin sorun yok</Text>}
                    </Card>
                  </Col>
                  <Col xs={24} md={12}>
                    <Card className="card" title="Öne Çıkan Övgüler" extra={<Badge color="green" text="pozitif" />}>
                      {uiPraises.length ? (
                        <Space direction="vertical" style={{ width:'100%' }}>
                          {uiPraises.map((p,idx)=> (
                            <div key={idx}>
                              <Text strong>{p.name}</Text> — <Text type="secondary">{typeof p.ratio === 'number' ? `${p.ratio}%` : '— %'}</Text>
                              {p.reason && <div><Text type="secondary">{p.reason}</Text></div>}
                              {!p.reason && p.example && <div><Text italic>“{p.example}”</Text></div>}
                            </div>
                          ))}
                        </Space>
                      ) : <Text type="secondary">Belirgin övgü yok</Text>}
                    </Card>
                  </Col>
                </Row>
              </div>

              <div className="section">
                <Card className="card" title="Boyut Dağılımı (Bar)">
                  <AspectBarChart data={data.aspect_stats} />
                </Card>
              </div>

              <div className="section">
                <Card className="card" title="Konuya Özel Yorumlar">
                  <Collapse accordion>
                    {data.aspect_stats.map((a)=> (
                      <Collapse.Panel header={<span><Text strong>{a.aspect}</Text> <Text type="secondary">— {a.ratio}%</Text></span>} key={a.aspect}>
                        <Text type="secondary">{a.summary || `“${bestSnippet(a, data?.summary)}”`}</Text>
                        <Divider />
                        <Row gutter={[12,12]}>
                          <Col xs={24} md={12}>
                            <Text strong>Olumlu Örnekler</Text>
                            <ul>{(a.examplesPos||[]).map((e,i)=> <li key={i}><Text type="secondary">{e}</Text></li>)}</ul>
                          </Col>
                          <Col xs={24} md={12}>
                            <Text strong>Olumsuz Örnekler</Text>
                            <ul>{(a.examplesNeg||[]).map((e,i)=> <li key={i}><Text type="secondary">{e}</Text></li>)}</ul>
                          </Col>
                        </Row>
                      </Collapse.Panel>
                    ))}
                  </Collapse>
                </Card>
              </div>

              <div className="section">
                <Card className="card" title="Detaylı Tablo">
                  <Table
                    rowKey={(r)=>r.aspect}
                    columns={columns}
                    dataSource={data.aspect_stats}
                    pagination={{ pageSize: 8, showSizeChanger:false }}
                  />
                </Card>
              </div>
            </>
          )}
        </div>
      </Content>
    </Layout>
  )
}
