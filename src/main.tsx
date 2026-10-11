import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { installStorageGuard } from './lib/storageGuard';
import { installApiFetch } from './lib/api';

// must run before any component reads storage or calls /api
installStorageGuard();
installApiFetch();

import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
