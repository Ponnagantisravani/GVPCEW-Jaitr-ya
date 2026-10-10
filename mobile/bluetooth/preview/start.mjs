import { createPreviewServer } from './server.mjs';
const server = createPreviewServer();
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(4173, '127.0.0.1', () => console.log('Student: http://localhost:4173/?role=student\nCoordinator: http://localhost:4173/?role=coordinator'));
