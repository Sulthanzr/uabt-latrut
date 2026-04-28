let ioInstance = null;

export function attachRealtime(io) {
  ioInstance = io;
  io.on('connection', (socket) => {
    socket.on('session:join', (sessionId) => {
      if (sessionId) socket.join(`session:${sessionId}`);
    });
  });
}

export function emitToSession(sessionId, event, payload) {
  if (!ioInstance || !sessionId) return;
  ioInstance.to(`session:${sessionId}`).emit(event, payload);
  ioInstance.emit(event, payload); // fallback supaya admin/player yang belum join room tetap update
}

export function emitGlobal(event, payload) {
  if (!ioInstance) return;
  ioInstance.emit(event, payload);
}
