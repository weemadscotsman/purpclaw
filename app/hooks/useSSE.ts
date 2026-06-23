export type SSEConnectionState = 'connected' | 'reconnecting' | 'error' | 'disconnected';

interface SSEReturn {
  connected: boolean;
  reconnecting: boolean;
  error: boolean;
  lastEvent: any;
  reconnect: () => void;
  disconnect: () => void;
}

export function useSSE(onEvent: (event: any) => void): SSEReturn {
  let eventSource: EventSource | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lastEventTime: number = Date.now();

  const state = {
    connected: false,
    reconnecting: false,
    error: false,
    lastEvent: null as any,
  };

  const startHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - lastEventTime;
      if (elapsed > 45000 && eventSource) {
        eventSource.close();
        scheduleReconnect();
      }
    }, 30000);
  };

  const scheduleReconnect = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    state.reconnecting = true;
    reconnectTimer = setTimeout(() => {
      connect();
    }, 3000);
  };

  const connect = () => {
    if (eventSource) {
      eventSource.close();
    }

    try {
      eventSource = new EventSource('/api/logs/stream');

      eventSource.onopen = () => {
        state.connected = true;
        state.reconnecting = false;
        state.error = false;
        lastEventTime = Date.now();
        startHeartbeat();
      };

      eventSource.onmessage = (e: MessageEvent) => {
        lastEventTime = Date.now();
        try {
          const data = JSON.parse(e.data);
          state.lastEvent = data;
          onEvent(data);
        } catch (err) {
          console.error('SSE parse error:', err);
        }
      };

      eventSource.onerror = () => {
        state.connected = false;
        state.error = true;
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        scheduleReconnect();
      };
    } catch (err) {
      state.error = true;
      scheduleReconnect();
    }
  };

  const disconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    state.connected = false;
    state.reconnecting = false;
    state.error = false;
  };

  const reconnect = () => {
    disconnect();
    connect();
  };

  connect();

  return {
    get connected() { return state.connected; },
    get reconnecting() { return state.reconnecting; },
    get error() { return state.error; },
    get lastEvent() { return state.lastEvent; },
    reconnect,
    disconnect,
  };
}
