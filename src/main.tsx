import {createRoot} from 'react-dom/client';
import App from './app/App';
import './shared/ui/global.css';
import {prepareSiteEntry} from './infrastructure/site-transfer';
// Native bars are handled once by the host; regular browser chrome owns its top area.
// Older iOS standalone windows expose this flag before display-mode is available.
if((navigator as Navigator & {standalone?:boolean}).standalone===true)document.documentElement.dataset.standalone='true';
if(window.CampusNative?.postMessage)document.documentElement.dataset.platform='android';
void prepareSiteEntry().then(ready=>{if(ready)createRoot(document.getElementById('root')!).render(<App/>);});
