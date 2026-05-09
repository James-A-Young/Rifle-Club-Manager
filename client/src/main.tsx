import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from './context/ConfigContext';
import App from './App';
import './styles/global.css';
import { initAnalytics } from './analytics';

initAnalytics();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider>
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
