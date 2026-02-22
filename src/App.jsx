import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Home from './pages/Home';
import Visualizer from './pages/Visualizer';
import ServiceAuth from './pages/ServiceAuth';
import ServiceCallback from './pages/ServiceCallback';
import './index.css';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/file" element={<ServiceAuth />} />
          <Route path="/auth/:service" element={<ServiceAuth />} />
          <Route path="/callback/:service" element={<ServiceCallback />} />
          <Route path="/visualizer" element={<Visualizer />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
