"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const leavingRef = useRef(false);
  const activeCallIdRef = useRef<string | null>(null);

  const refreshActive = useCallback(async () => {
    if (!conversationId) return;
    try {
      const { call } = await fetchActiveCall(conversationId);
      setActiveCall(call?.participantCount ? call : null);
    } catch {
      // ignore poll errors
    }
  }, [conversationId]);

  useEffect(() => {
    void refreshActive();
  }, [refreshActive]);

  const join = useCallback(async () => {
    if (!conversationId) return;
    leavingRef.current = false;
    setLoading(true);
    setError(null);
    try {
      const result = await startOrJoinCall(conversationId);
      activeCallIdRef.current = result.call.id;
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
    leavingRef.current = false;
    setLoading(true);
    setError(null);
    try {
      const result = await joinCallById(callId);
      activeCallIdRef.current = result.call.id;
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
    if (leavingRef.current) return;
    leavingRef.current = true;

    const callId = activeCall?.id ?? activeCallIdRef.current;
    setInCall(false);
    setAuthToken(null);
    setError(null);
    activeCallIdRef.current = null;

    if (!callId) {
      leavingRef.current = false;
      return;
    }

    setLoading(true);
    try {
      await leaveCall(callId);
    } catch {
      // still close local UI
    } finally {
      setLoading(false);
      leavingRef.current = false;
    }
  }, [activeCall]);

  const endForAll = useCallback(async () => {
    if (!activeCall || leavingRef.current) return;
    leavingRef.current = true;

    const callId = activeCall.id;
    activeCallIdRef.current = null;
    setInCall(false);
    setAuthToken(null);
    setActiveCall(null);
    setError(null);
    setLoading(true);
    try {
      await endCall(callId);
    } finally {
      setLoading(false);
      leavingRef.current = false;
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
