import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:'./',server:{host:'127.0.0.1',port:8766},build:{target:'es2022',sourcemap:false},test:{include:['tests/**/*.test.ts','src/**/*.test.ts'],environment:'node'}});
