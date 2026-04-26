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

export function useWebSocket(
  tournamentId: number | null, 
  role?: 'HOST' | 'CAPTAIN' | null, 
  teamId?: number | null,
  onConnectError?: (errorMsg: string) => void
) {
  const clientRef = useRef<Client | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);

  useEffect(() => {
    if (!tournamentId) return;

    const client = new Client({
      webSocketFactory: () => new SockJS(getWsUrl()) as WebSocket,
      connectHeaders: {
        ...(role ? { role: role } : {}),
        ...(teamId ? { teamId: String(teamId) } : {})
      },
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
        const errorText = (frame.headers?.message || '') + (frame.body || '');
        if (errorText.includes('ALREADY_CONNECTED')) {
          client.deactivate(); // Stop reconnecting
          if (onConnectError) onConnectError('이미 접속 중인 팀장입니다. (중복 접속 불가)');
        }
      },
      onWebSocketError: (event) => {
        console.error('WebSocket Error', event);
      }
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

  const sendChatMessage = useCallback((tournamentId: number, teamId: number | null, message: string) => {
    if (clientRef.current?.connected) {
      clientRef.current.publish({
        destination: '/app/chat',
        body: JSON.stringify({ tournamentId, teamId, message }),
      });
    }
  }, []);

  return { connected, lastMessage, sendBid, sendChatMessage };
}
