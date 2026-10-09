import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/classical.css';
import './styles/atlas.css';
import './styles/stage.css';

createRoot(document.getElementById('root')!).render(<App />);
