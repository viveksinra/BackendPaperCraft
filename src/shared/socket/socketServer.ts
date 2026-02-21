import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { logger } from "../logger";

let io: Server | null = null;

// ─── Initialize ─────────────────────────────────────────────────────────────

export function initSocketServer(httpServer: HttpServer): Server {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // Auth middleware: validate JWT token on connection
  io.use((socket: Socket, next: (err?: Error) => void) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Authentication token required"));
    }

    try {
      // NOTE: Wire JWT verification here once auth utility is adapted for Socket.io
      // For now, accept the token and attach to socket.data
      // const decoded = verifyJwt(token);
      socket.data.token = token;
      socket.data.userId = socket.handshake.auth?.userId || "unknown";
      socket.data.role = socket.handshake.auth?.role || "student";
      next();
    } catch {
      next(new Error("Invalid or expired authentication token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const { userId, role } = socket.data;
    logger.info({
      msg: "Socket connected",
      socketId: socket.id,
      userId,
      role,
    });

    // ─── Room management ──────────────────────────────────────────────

    socket.on("join:test", (testId: string) => {
      socket.join(`test:${testId}`);
      // Notify monitor room of student connection
      if (role === "student") {
        io!.to(`test:${testId}:monitor`).emit("monitor:student-connected", {
          studentId: userId,
          studentName: socket.handshake.auth?.studentName || "Student",
          socketId: socket.id,
        });
      }
    });

    socket.on("leave:test", (testId: string) => {
      socket.leave(`test:${testId}`);
    });

    socket.on("join:monitor", (testId: string) => {
      socket.join(`test:${testId}:monitor`);
    });

    socket.on("leave:monitor", (testId: string) => {
      socket.leave(`test:${testId}:monitor`);
    });

    // ─── Client-to-server events ──────────────────────────────────────

    socket.on(
      "attempt:heartbeat",
      (data: {
        testId: string;
        currentQuestion: number;
        sectionIndex: number;
      }) => {
        io!.to(`test:${data.testId}:monitor`).emit("monitor:student-progress", {
          studentId: userId,
          answeredCount: data.currentQuestion,
          currentSection: data.sectionIndex,
        });
      }
    );

    socket.on(
      "attempt:answer",
      (data: { testId: string; questionId: string }) => {
        io!.to(`test:${data.testId}:monitor`).emit("monitor:answer-notification", {
          studentId: userId,
          questionId: data.questionId,
        });
      }
    );

    // ─── Disconnect ───────────────────────────────────────────────────

    socket.on("disconnect", (reason: string) => {
      logger.info({
        msg: "Socket disconnected",
        socketId: socket.id,
        userId,
        reason,
      });

      // Notify all test monitor rooms this student was in
      for (const room of socket.rooms) {
        if (room.startsWith("test:") && !room.endsWith(":monitor")) {
          const testId = room.replace("test:", "");
          io!.to(`test:${testId}:monitor`).emit(
            "monitor:student-disconnected",
            {
              studentId: userId,
            }
          );
        }
      }
    });
  });

  logger.info({ msg: "Socket.io server initialized" });
  return io;
}

// ─── Helper functions for services to emit events ───────────────────────────

export function getIO(): Server | null {
  return io;
}

export function emitTestEvent(
  testId: string,
  event: string,
  data: unknown
): void {
  if (io) {
    io.to(`test:${testId}`).emit(event, data);
  }
}

export function emitToStudent(
  studentId: string,
  event: string,
  data: unknown
): void {
  if (io) {
    io.to(`student:${studentId}`).emit(event, data);
  }
}

export function emitToMonitor(
  testId: string,
  event: string,
  data: unknown
): void {
  if (io) {
    io.to(`test:${testId}:monitor`).emit(event, data);
  }
}
