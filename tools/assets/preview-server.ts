import { createServer } from 'vite';
const server=await createServer({configFile:false,root:'tools/assets',cacheDir:'../../work/art-vite-cache',server:{port:5174,host:'127.0.0.1',strictPort:true,fs:{allow:[process.cwd()]}}});
await server.listen();server.printUrls();
