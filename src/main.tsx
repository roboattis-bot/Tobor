import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ModelSceneProvider } from './ModelScene';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './styles.css';
import './simple.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ModelSceneProvider>
      <App />
    </ModelSceneProvider>
  </React.StrictMode>,
);
