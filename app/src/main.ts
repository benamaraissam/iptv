import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './styles.css';
import { app } from './app';
import { diagReport, installDiag } from './diag';

function start(): void {
  app.start(document.getElementById('app')!);
  // Diagnostic depuis la console du navigateur : sp.catalog, sp.engine.stats()…
  (window as any).sp = app;
  // sp.diag() : derniers blocages de l'interface, avec ce que l'app faisait à ce moment-là.
  (app as any).diag = diagReport;
  installDiag();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
