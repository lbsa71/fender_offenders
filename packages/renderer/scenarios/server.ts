import {createServer} from 'vite';
const server=await createServer({configFile:false,root:'packages/renderer/scenarios',cacheDir:'../../../work/cartoon-vite-cache',server:{port:5184,host:'127.0.0.1',strictPort:true,fs:{allow:[process.cwd()]}}});await server.listen();server.printUrls();
