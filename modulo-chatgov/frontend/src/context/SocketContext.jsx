import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { auth } = useAuth();
  const socketRef = useRef(null);
  const [socketInstance, setSocketInstance] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!auth?.token) {
      setConnected(false);
      return;
    }

    const socket = io('/', {
      auth: { token: auth.token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socketRef.current = socket;
    setSocketInstance(socket);

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketInstance(null);
      setConnected(false);
    };
  }, [auth?.token]);

  return React.createElement(SocketContext.Provider, { value: { socket: socketInstance, connected } }, children);
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
