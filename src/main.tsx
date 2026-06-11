import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// Global emoji filter: strip emojis from all input/textarea fields
// eslint-disable-next-line no-misleading-character-class
const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

document.addEventListener('input', (e) => {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
    const cleaned = target.value.replace(emojiRegex, '');
    if (cleaned !== target.value) {
      const pos = (target.selectionStart ?? 0) - (target.value.length - cleaned.length);
      target.value = cleaned;
      target.setSelectionRange(pos, pos);
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
