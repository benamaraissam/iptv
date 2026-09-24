import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './styles.css';
import { app } from './app';

function start(): void {
  app.start(document.getElementById('app')!);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
