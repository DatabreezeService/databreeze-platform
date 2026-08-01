import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DesktopApp } from './app.tsx';
import './styles.css';

const root = document.querySelector('#root');
if (root === null) throw new Error('DESKTOP_RENDER_ROOT_MISSING');
createRoot(root).render(
  <StrictMode>
    <DesktopApp />
  </StrictMode>,
);
