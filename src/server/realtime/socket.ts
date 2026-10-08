import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import type { ClientToServer, ServerToClient } from "@/lib/types";
import {
  authenticate,
  castVote,
  everyoneReady,
  getSnapshot,
  likesNeededFor,
  listParticipants,
  resetReady,
  setWish,
  setReady,
  startRoom,
  UserError,
  type AuthedParticipant,
} from "@/server/services/rooms";

type IO = Server<ClientToServer, ServerToClient, Record<string, never>, { auth?: AuthedParticipant }>;
type Sock = Socket<ClientToServer, ServerToClient, Record<string, never>, { auth?: AuthedParticipant }>;

// Presence: roomId -> participantId -> number of open sockets (a phone may reconnect / open 2 tabs).
const presence = new Map<string, Map<string, number>>();

function online(roomId: string) {
  return new Set(presence.get(roomId)?.keys() ?? []);
}
function addPresence(roomId: string, pid: string) {
  const m = presence.get(roomId) ?? new Map<string, number>();
  m.set(pid, (m.get(pid) ?? 0) + 1);
  presence.set(roomId, m);
}
function removePresence(roomId: string, pid: string) {
  const m = presence.get(roomId);
  if (!m) return;
  const n = (m.get(pid) ?? 1) - 1;
  if (n <= 0) m.delete(pid);
  else m.set(pid, n);
  if (!m.size) presence.delete(roomId);
}

function errorMessage(e: unknown) {
  if (e instanceof UserError) return e.message;
  console.error(e);
  return "Something went wrong. Try again.";
}

export function attachRealtime(server: HttpServer) {
  const io: IO = new Server(server, {
    path: "/socket.io",
    cors: { origin: false },
    // Share the HTTP server with Next.js: leave other WebSocket upgrades (like Next's
    // hot-reload connection in dev) alone instead of closing them after a second.
    destroyUpgrade: false,
  });

  async function broadcastParticipants(roomId: string) {
    const participants = await listParticipants(roomId, online(roomId));
    io.to(roomId).emit("room:participants", { participants, likesNeeded: likesNeededFor(participants.length) });
  }

  /** Each participant gets their own snapshot, because snapshots include private votes. */
  async function sendSnapshots(roomId: string) {
    const sockets = await io.in(roomId).fetchSockets();
    const on = online(roomId);
    await Promise.all(
      sockets.map(async (s) => {
        if (!s.data.auth) return;
        s.emit("room:snapshot", await getSnapshot(roomId, s.data.auth.participantId, on));
      }),
    );
  }

  async function begin(roomId: string) {
    io.to(roomId).emit("room:starting");
    try {
      const started = await startRoom(roomId);
      if (started) await sendSnapshots(roomId);
    } catch (e) {
      io.to(roomId).emit("room:error", { message: errorMessage(e) });
      await resetReady(roomId); // let the group retry from the lobby
      await sendSnapshots(roomId); // put everyone back in the lobby state
    }
  }

  io.on("connection", (socket: Sock) => {
    socket.on("room:join", async ({ code, participantId, token }, ack) => {
      try {
        const auth = await authenticate(String(code), String(participantId), String(token));
        if (!auth) return ack({ ok: false, error: "not_member" });
        if (socket.data.auth) {
          removePresence(socket.data.auth.roomId, socket.data.auth.participantId);
          socket.leave(socket.data.auth.roomId);
        }
        socket.data.auth = auth;
        socket.join(auth.roomId);
        addPresence(auth.roomId, auth.participantId);
        ack({ ok: true });
        socket.emit("room:snapshot", await getSnapshot(auth.roomId, auth.participantId, online(auth.roomId)));
        await broadcastParticipants(auth.roomId);
      } catch (e) {
        ack({ ok: false, error: errorMessage(e) });
      }
    });

    socket.on("room:ready", async ({ ready }) => {
      const auth = socket.data.auth;
      if (!auth) return;
      try {
        await setReady(auth.roomId, auth.participantId, Boolean(ready));
        await broadcastParticipants(auth.roomId);
        if (ready && (await everyoneReady(auth.roomId))) await begin(auth.roomId);
      } catch (e) {
        socket.emit("room:error", { message: errorMessage(e) });
      }
    });

    // Host override: start without waiting for everyone to tap Ready.
    socket.on("room:start", async () => {
      const auth = socket.data.auth;
      if (!auth?.isHost) return;
      await begin(auth.roomId);
    });

    socket.on("wish:set", async ({ text }, ack) => {
      const auth = socket.data.auth;
      if (!auth) return ack?.({ ok: false, error: "not_joined" });
      try {
        const prefs = await setWish(auth.roomId, auth.participantId, String(text ?? ""));
        ack?.({ ok: true, prefs });
        await broadcastParticipants(auth.roomId);
      } catch (e) {
        ack?.({ ok: false, error: errorMessage(e) });
      }
    });

    socket.on("vote:cast", async ({ restaurantId, liked }, ack) => {
      const auth = socket.data.auth;
      if (!auth) return ack?.({ ok: false, error: "not_joined" });
      try {
        const result = await castVote(auth.roomId, auth.participantId, String(restaurantId), Boolean(liked));
        ack?.({ ok: true });
        if (result.newMatch) io.to(auth.roomId).emit("match:new", result.newMatch);
        await broadcastParticipants(auth.roomId);
        if (result.finalTally) io.to(auth.roomId).emit("room:tally", result.finalTally);
      } catch (e) {
        ack?.({ ok: false, error: errorMessage(e) });
      }
    });

    socket.on("disconnect", () => {
      const auth = socket.data.auth;
      if (!auth) return;
      removePresence(auth.roomId, auth.participantId);
      broadcastParticipants(auth.roomId).catch(() => {});
    });
  });

  return io;
}
