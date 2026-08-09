import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '../../shared/example.css';

const root = document.getElementById('root');
if (!root) throw new Error('The example root element is missing.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
