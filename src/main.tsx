import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/index.css';
import { applySavedFontSettings } from './components/Modals/ThemeModal';

// 初始化恢复用户个性化字体配置
applySavedFontSettings();

interface ErrorBoundaryProps {
  children: React.ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Codex Desktop] Uncaught React Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', backgroundColor: '#18181b', color: '#f4f4f5', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h1 style={{ color: '#ef4444', fontSize: '20px', marginBottom: '16px' }}>⚠️ Codex Desktop 渲染异常</h1>
          <p style={{ color: '#a1a1aa', marginBottom: '12px' }}>应用在初始化或渲染组件树时遇到了未捕获的错误：</p>
          <pre style={{ backgroundColor: '#27272a', padding: '16px', borderRadius: '8px', color: '#fca5a5', overflowX: 'auto' }}>
            {this.state.error?.stack || this.state.error?.message || '未知错误'}
          </pre>
          <button
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            style={{ marginTop: '20px', padding: '10px 20px', backgroundColor: '#ea580c', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            重置本地缓存并重启
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function initApp() {
  const rootEl = document.getElementById('root');
  if (rootEl) {
    try {
      ReactDOM.createRoot(rootEl).render(
        <React.StrictMode>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </React.StrictMode>
      );
    } catch (err: any) {
      console.error('[Codex Desktop] Fatal createRoot error:', err);
      rootEl.innerHTML = `<div style="padding:24px;background:#18181b;color:#ef4444;font-family:monospace;"><h2>启动异常</h2><pre>${err?.stack || err?.message}</pre></div>`;
    }
  } else {
    window.addEventListener('DOMContentLoaded', initApp);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
