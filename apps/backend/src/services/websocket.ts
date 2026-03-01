import { Server as SocketIOServer, Socket } from 'socket.io';
import { WS_EVENTS, CollabUser, CollabChange } from '@code-native/shared';
import { v4 as uuid } from 'uuid';

interface Room {
    id: string;
    fileId: string;
    users: Map<string, CollabUser>;
    content: string;
}

const rooms = new Map<string, Room>();

export function setupWebSocket(io: SocketIOServer) {
    io.on('connection', (socket: Socket) => {
        console.log(`🔌 Client connected: ${socket.id}`);

        let currentRoomId: string | null = null;
        let currentUser: CollabUser | null = null;

        // Join collaboration room
        socket.on(WS_EVENTS.JOIN_ROOM, ({ roomId, fileId, userName }: { roomId: string; fileId: string; userName: string }) => {
            currentRoomId = roomId;
            currentUser = {
                id: socket.id,
                name: userName,
                color: generateColor(),
            };

            // Create room if doesn't exist
            if (!rooms.has(roomId)) {
                rooms.set(roomId, {
                    id: roomId,
                    fileId,
                    users: new Map(),
                    content: '',
                });
            }

            const room = rooms.get(roomId)!;
            room.users.set(socket.id, currentUser);

            socket.join(roomId);

            // Notify others in room
            socket.to(roomId).emit(WS_EVENTS.USER_JOINED, {
                user: currentUser,
                users: Array.from(room.users.values()),
            });

            // Send current room state to new user
            socket.emit(WS_EVENTS.SYNC_RESPONSE, {
                content: room.content,
                users: Array.from(room.users.values()),
            });

            console.log(`👥 ${userName} joined room ${roomId}`);
        });

        // Leave room
        socket.on(WS_EVENTS.LEAVE_ROOM, () => {
            if (currentRoomId && currentUser) {
                leaveRoom(socket, currentRoomId, currentUser);
            }
        });

        // Cursor movement
        socket.on(WS_EVENTS.CURSOR_MOVE, ({ line, column }: { line: number; column: number }) => {
            if (currentRoomId && currentUser) {
                currentUser.cursor = { line, column };
                socket.to(currentRoomId).emit(WS_EVENTS.CURSOR_MOVE, {
                    userId: socket.id,
                    cursor: { line, column },
                });
            }
        });

        // Code changes

        //broadcasting now. CRDT remains...
        // In this implementation, the BACKEND is the authoritative source of truth for the file content inside a collaboration room.
        //
        // How it works:
        // 1. Whenever a user edits the file, the FULL file content is sent to the backend.
        // 2. The backend updates room.content (this becomes the official version).
        // 3. The backend then broadcasts this updated content to all other users.
        //
        // Important Behavior:
        // * The backend always stores the latest version of the file.
        // * If two users edit the same line at the same time, the edit that reaches the backend LAST will overwrite the previous one.
        // * This is called a "last-write-wins" strategy.
        //
        // Future Improvement:
        // * For true conflict resolution and simultaneous editing support, we will upgrade to a CRDT-based system (e.g., Yjs).

        socket.on(WS_EVENTS.CODE_CHANGE, ({ content }) => {
            if (!currentRoomId) return;

            const room = rooms.get(currentRoomId);
            if (!room) return;

            //  1. Update authoritative room state
            room.content = content;

            //  2. Broadcast updated full content to others
            socket.to(currentRoomId).emit(WS_EVENTS.CODE_CHANGE, {
                content,
                userId: socket.id,
                timestamp: Date.now(),
            });
        });

        // Sync request
        socket.on(WS_EVENTS.SYNC_REQUEST, () => {
            if (currentRoomId) {
                const room = rooms.get(currentRoomId);
                if (room) {
                    socket.emit(WS_EVENTS.SYNC_RESPONSE, {
                        content: room.content,
                        users: Array.from(room.users.values()),
                    });
                }
            }
        });

        // Disconnect
        socket.on('disconnect', () => {
            if (currentRoomId && currentUser) {
                leaveRoom(socket, currentRoomId, currentUser);
            }
            console.log(`🔌 Client disconnected: ${socket.id}`);
        });
    });
}

function leaveRoom(socket: Socket, roomId: string, user: CollabUser) {
    const room = rooms.get(roomId);
    if (room) {
        room.users.delete(socket.id);

        // Notify others
        socket.to(roomId).emit(WS_EVENTS.USER_LEFT, {
            userId: socket.id,
            users: Array.from(room.users.values()),
        });

        // Clean up empty rooms
        if (room.users.size === 0) {
            rooms.delete(roomId);
        }
    }

    socket.leave(roomId);
    console.log(`👋 ${user.name} left room ${roomId}`);
}

function generateColor(): string {
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96E6A1',
        '#DDA0DD', '#F7DC6F', '#BB8FCE', '#85C1E9',
        '#F8B500', '#00CED1', '#FF69B4', '#90EE90',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}
