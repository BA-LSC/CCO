"use client";

import { useCallback, useEffect, useState } from "react";
import type { CallSummaryDto } from "@cco/shared/calls";
import {
  endCall,
  fetchActiveCall,
  joinCallById,
  leaveCall,
  startOrJoinCall,
} from "@/lib/calls-api";

export function useCallSession(conversationId: string | null) {
  const [activeCall, setActiveCall] = useState<CallSummaryDto | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [inCall, setInCall] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshActive = useCallback(async () => {
    if (!conversationId) return;
    try {
      const { call } = await fetchActiveCall(conversationId);
      setActiveCall(call);
    } catch {
      // ignore poll errors
    }
  }, [conversationId]);

  useEffect(() => {
    void refreshActive();
  }, [refreshActive]);

  const join = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await startOrJoinCall(conversationId);
      setActiveCall(result.call);
      setAuthToken(result.authToken);
      setInCall(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join call");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const joinExisting = useCallback(async (callId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await joinCallById(callId);
      setActiveCall(result.call);
      setAuthToken(result.authToken);
      setInCall(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join call");
    } finally {
      setLoading(false);
    }
  }, []);

  const hangUp = useCallback(async () => {
    if (!activeCall) {
      setInCall(false);
      setAuthToken(null);
      return;
    }
    setLoading(true);
    try {
      await leaveCall(activeCall.id);
    } catch {
      // still close local UI
    } finally {
      setInCall(false);
      setAuthToken(null);
      setLoading(false);
      void refreshActive();
    }
  }, [activeCall, refreshActive]);

  const endForAll = useCallback(async () => {
    if (!activeCall) return;
    setLoading(true);
    try {
      await endCall(activeCall.id);
    } finally {
      setInCall(false);
      setAuthToken(null);
      setActiveCall(null);
      setLoading(false);
    }
  }, [activeCall]);

  return {
    activeCall,
    setActiveCall,
    authToken,
    inCall,
    loading,
    error,
    join,
    joinExisting,
    hangUp,
    endForAll,
    refreshActive,
  };
}
