import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Button, Typography, Row, Col, Card, Tag, Badge, Tooltip } from 'antd';
import { SearchOutlined, ThunderboltOutlined, LoadingOutlined, CheckCircleOutlined, ExclamationCircleOutlined, DeleteOutlined, GlobalOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useAnalysis } from '../App.jsx';

const { Title, Paragraph, Text } = Typography;
const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Home() {
  const [query, setQuery] = useState('');
  const [recentDB, setRecentDB] = useState([]);
  const { tasks, startAnalysis, removeTask } = useAnalysis();
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API}/analyses/recent?limit=6`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setRecentDB(data);
      })
      .catch(err => console.error("Could not fetch recent analyses:", err));
  }, []);

  const handleSearch = (e) => {
    e?.preventDefault?.();
    if (!query.trim()) return;
    
    startAnalysis(query);
    setQuery(''); // Clear input so user can search again immediately
  };

  const getStatusTag = (status) => {
    switch(status) {
      case 'loading': return <Tag icon={<LoadingOutlined />} color="processing">Analiz Ediliyor</Tag>;
      case 'completed': return <Tag icon={<CheckCircleOutlined />} color="success">Tamamlandı</Tag>;
      case 'error': return <Tag icon={<ExclamationCircleOutlined />} color="error">Hata</Tag>;
      default: return null;
    }
  };

  return (
    <div className="home-page" style={{ paddingTop: '80px', justifyContent: 'flex-start' }}>
      {/* Animated Background Blobs */}
      <div className="home-bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      <div className="container" style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '800px', textAlign: 'center' }}>
        <Title level={1} className="hero-title">
          Bilinçli Alışverişin<br />Yapay Zeka Hali
        </Title>
        <Paragraph className="hero-subtitle">
          Amazon, Trendyol ve Hepsiburada'daki binlerce müşteri yorumunu saniyeler içinde analiz edin. 
          Ürünlerin öne çıkan iyi ve kötü yönlerini arka planda yapay zeka ile keşfedin.
        </Paragraph>

        <form onSubmit={handleSearch}>
          <div className="search-input-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            <Input
              size="large"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ürün linkini yapıştırın veya adını yazın (örn: iPhone 15 Pro)"
              prefix={<SearchOutlined style={{ color: '#94a3b8', fontSize: '20px', marginRight: '8px' }} />}
              style={{ padding: '16px 24px', fontSize: '18px', borderRadius: '30px', width: '100%' }}
              autoFocus
            />
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              icon={<ThunderboltOutlined />}
              style={{
                height: '56px',
                padding: '0 40px',
                fontSize: '18px',
                borderRadius: '28px',
                fontWeight: 600,
                boxShadow: '0 8px 20px rgba(79, 70, 229, 0.3)'
              }}
            >
              Arka Planda Analiz Et
            </Button>
          </div>
        </form>
      </div>

      {/* Analysis History Section */}
      {tasks.length > 0 && (
        <div className="container" style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '1200px', marginTop: '60px', textAlign: 'left' }}>
          <Title level={3} style={{ fontFamily: "'Outfit', sans-serif", color: '#1e293b', marginBottom: '24px' }}>
            Arama Geçmişi & İşlemler
          </Title>
          <Row gutter={[16, 16]}>
            {tasks.map(task => (
              <Col xs={24} md={12} lg={8} key={task.id}>
                <Card 
                  className="premium-card history-card" 
                  style={{ 
                    cursor: task.status === 'completed' ? 'pointer' : 'default',
                    opacity: task.status === 'error' ? 0.7 : 1
                  }}
                  bodyStyle={{ padding: '20px' }}
                  onClick={() => {
                    if (task.status === 'completed') navigate(`/results/${task.id}`);
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    {getStatusTag(task.status)}
                    <Tooltip title="Listeden Kaldır">
                      <Button 
                        type="text" 
                        size="small" 
                        icon={<DeleteOutlined style={{ color: '#cbd5e1' }} />} 
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTask(task.id);
                        }}
                      />
                    </Tooltip>
                  </div>
                  
                  <Title level={5} style={{ margin: '0 0 8px 0', fontSize: '16px', lineHeight: '1.4' }} ellipsis={{ rows: 2 }}>
                    {task.data?.productTitle || task.query}
                  </Title>
                  
                  {task.status === 'completed' && task.data && (
                    <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
                      <div>
                        <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>Yorumlar</Text>
                        <Text strong style={{ color: '#6366f1' }}>{task.data.analyzed_reviews}</Text>
                      </div>
                      <div>
                        <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>Özellikler</Text>
                        <Text strong style={{ color: '#0ea5e9' }}>{task.data.aspect_stats?.length || 0}</Text>
                      </div>
                    </div>
                  )}

                  {task.status === 'error' && (
                    <Text type="danger" style={{ fontSize: '13px', marginTop: '8px', display: 'block' }}>
                      {task.error}
                    </Text>
                  )}
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      )}

      {/* Community / DB Recent Searches */}
      {recentDB.length > 0 && (
        <div className="container" style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '1200px', marginTop: tasks.length > 0 ? '40px' : '60px', textAlign: 'left', paddingBottom: '60px' }}>
          <Title level={3} style={{ fontFamily: "'Outfit', sans-serif", color: '#1e293b', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GlobalOutlined style={{ color: '#0ea5e9' }} /> Son Topluluk Analizleri
          </Title>
          <Row gutter={[16, 16]}>
            {recentDB.map(item => (
              <Col xs={24} md={12} lg={8} key={`db-${item.id}`}>
                <Card 
                  className="premium-card history-card" 
                  style={{ cursor: 'pointer' }}
                  bodyStyle={{ padding: '20px' }}
                  onClick={() => navigate(`/results/${item.id}`)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <Tag icon={<CheckCircleOutlined />} color="success">Sistemde Kayıtlı</Tag>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      <ClockCircleOutlined /> {new Date(item.date).toLocaleDateString('tr-TR')}
                    </Text>
                  </div>
                  
                  <Title level={5} style={{ margin: '0 0 8px 0', fontSize: '16px', lineHeight: '1.4' }} ellipsis={{ rows: 2 }}>
                    {item.query}
                  </Title>
                  
                  <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
                    <div>
                      <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>Yorumlar</Text>
                      <Text strong style={{ color: '#6366f1' }}>{item.analyzed_reviews}</Text>
                    </div>
                    <div>
                      <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>Özellikler</Text>
                      <Text strong style={{ color: '#0ea5e9' }}>{item.aspect_count}</Text>
                    </div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      )}
    </div>
  );
}
