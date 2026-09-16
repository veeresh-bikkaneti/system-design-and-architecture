import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './store/display'; // side effects: apply + subscribe the theme/motion store
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
