import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { FormatProvider } from "@/providers/format"
import { TRPCProvider } from "@/providers/trpc"
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TRPCProvider>
        <FormatProvider>
          <App />
        </FormatProvider>
      </TRPCProvider>
    </BrowserRouter>
  </StrictMode>,
)
