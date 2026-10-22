import {createRoot} from 'react-dom/client';
import App from './app/App';
import './shared/ui/global.css';
import {prepareSiteEntry} from './infrastructure/site-transfer';
// Android's host consumes window insets. Browser safe areas remain CSS-owned.
if(window.CampusNative?.postMessage)document.documentElement.dataset.platform='android';
void prepareSiteEntry().then(ready=>{if(ready)createRoot(document.getElementById('root')!).render(<App/>);});
