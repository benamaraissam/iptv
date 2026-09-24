import './styles.css';
import { App } from './app';

function start(): void {
  new App(document.getElementById('app')!);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
