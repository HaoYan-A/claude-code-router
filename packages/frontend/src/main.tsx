import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { toast } from 'sonner';
import App from './App';
import { Toaster } from './components/ui/sonner';
import { ApiError } from './lib/errors';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
    mutations: {
      // 全局 mutation 错误处理：自动显示 Toast 提示
      onError: (error) => {
        if (ApiError.isApiError(error)) {
          toast.error(error.message, {
            description: `Error: ${error.code}`,
          });
        } else if (error instanceof Error) {
          toast.error(error.message);
        }
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
