'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

const getWsUrl = () => {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  if (typeof window !== 'undefined') {
    return `http://${window.location.hostname}:8080/ws`;
  }
  return 'http://localhost:8080/ws';
};

export interface WsMessage {
  type: string;
  data: unknown;
}

export function useWebSocket(tournamentId: number | null) {
  const clientRef = useRef<Client | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);

  useEffect(() => {
    if (!tournamentId) return;

    const client = new Client({
      webSocketFactory: () => new SockJS(getWsUrl()) as WebSocket,
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onConnect: () => {
        setConnected(true);
        client.subscribe(`/topic/auction/${tournamentId}`, (message) => {
          const parsed: WsMessage = JSON.parse(message.body);
          setLastMessage(parsed);
        });
      },
      onDisconnect: () => {
        setConnected(false);
      },
      onStompError: (frame) => {
        console.error('STOMP error:', frame);
      },
    });

    client.activate();
    clientRef.current = client;

    return () => {
      client.deactivate();
    };
  }, [tournamentId]);

  const sendBid = useCallback((roundId: number, teamId: number, amount: number) => {
    if (clientRef.current?.connected) {
      clientRef.current.publish({
        destination: '/app/bid',
        body: JSON.stringify({ roundId, teamId, amount }),
      });
    }
  }, []);

  return { connected, lastMessage, sendBid };
}
