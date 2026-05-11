import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL || 'http://localhost:3210';
  const appPort = parseInt(env.VITE_APP_PORT || '3333');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('@solana') || id.includes('bs58') || id.includes('buffer')) return 'vendor-solana';
              if (id.includes('@walletconnect') || id.includes('@reown') || id.includes('ox/_esm')) return 'vendor-walletconnect';
              if (id.includes('html2canvas')) return 'vendor-html2canvas';
              if (id.includes('jspdf') || id.includes('dompurify')) return 'vendor-pdf';
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'vendor-react';
              if (id.includes('lucide')) return 'vendor-ui';
              if (id.includes('@toruslabs') || id.includes('eccrypto')) return 'vendor-crypto';
            }
          },
        },
      },
    },
    server: {
      port: appPort,
      proxy: {
        '/api': apiUrl,
      },
    },
  };
});
