import React, { createContext, useState, useContext, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { ConfigProvider, notification, Button, Layout } from 'antd';
import { LoadingOutlined, CheckCircleOutlined, InfoCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import Home from './pages/Home.jsx';
import Results from './pages/Results.jsx';

const API = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`;

// --- Context & State Management ---
export const AnalysisContext = createContext();

export const useAnalysis = () => useContext(AnalysisContext);

const AnalysisProvider = ({ children }) => {
  // Load tasks from localStorage if available
  const [tasks, setTasks] = useState(() => {
    try {
      const saved = localStorage.getItem('analysis_tasks');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return [];
  });

  // Save to localStorage when tasks change
  useEffect(() => {
    localStorage.setItem('analysis_tasks', JSON.stringify(tasks));
  }, [tasks]);

  const [api, contextHolder] = notification.useNotification();

  const startAnalysis = async (query) => {
    if (!query.trim()) return;
    
    const taskId = crypto.randomUUID();
    const newTask = {
      id: taskId,
      query,
      status: 'loading',
      data: null,
      error: null,
      timestamp: Date.now()
    };

    setTasks(prev => [newTask, ...prev]);

    api.info({
      key: taskId,
      message: 'Analiz Başlatıldı',
      description: `"${query}" için tüm platformlarda veriler toplanıyor...`,
      icon: <LoadingOutlined style={{ color: '#6366f1' }} />,
      duration: null, // Keep open while loading
      placement: 'topRight'
    });

    try {
      const res = await fetch(`${API}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, max_items: 500, use_llm: true })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'İstek başarısız');

      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'completed', data } : t));

      // Update notification to success
      api.success({
        key: taskId,
        message: 'Analiz Tamamlandı!',
        description: `"${query}" analizi hazır.`,
        icon: <CheckCircleOutlined style={{ color: '#10b981' }} />,
        duration: 5,
        placement: 'topRight',
        btn: (
          <Button type="primary" size="small" onClick={() => window.location.href = `/results/${taskId}`}>
            Sonuçları Gör
          </Button>
        )
      });

    } catch (error) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'error', error: String(error.message || error) } : t));
      
      api.error({
        key: taskId,
        message: 'Analiz Hatası',
        description: `"${query}" analiz edilemedi: ${error.message || error}`,
        duration: 8,
        placement: 'topRight'
      });
    }
  };

  const removeTask = (taskId) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  return (
    <AnalysisContext.Provider value={{ tasks, startAnalysis, removeTask }}>
      {contextHolder}
      {children}
    </AnalysisContext.Provider>
  );
};

// --- App Component ---
export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          fontFamily: "'Inter', sans-serif",
          colorPrimary: '#6366f1',
          colorInfo: '#6366f1',
          colorSuccess: '#10b981',
          colorError: '#ef4444',
          borderRadius: 12,
          colorBgContainer: '#ffffff',
        },
      }}
    >
      <AnalysisProvider>
        <BrowserRouter>
          {/* Global Header could go here, but Antd Notifications handle the top-right popups gracefully */}
          <div className="app-global-nav">
            <div className="container" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 24px' }}>
              <ThunderboltOutlined style={{ fontSize: '24px', color: '#6366f1' }} />
              <span style={{ fontSize: '18px', fontWeight: 800, fontFamily: "'Outfit', sans-serif", color: '#1e293b' }}>AI Insights</span>
            </div>
          </div>
          
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/results/:id" element={<Results />} />
          </Routes>
        </BrowserRouter>
      </AnalysisProvider>
    </ConfigProvider>
  );
}
