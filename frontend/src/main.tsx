// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root элемент олдсонгүй');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
