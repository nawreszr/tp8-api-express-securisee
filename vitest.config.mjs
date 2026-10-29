import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Charge dotenv AVANT tous les imports
    setupFiles: ['dotenv/config'], 
  },
});
