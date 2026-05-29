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
  const ignoredCallIdsRef = useRef(new Set<string>());

  const applyActiveCall = useCallback((call: CallSummaryDto | null) => {
    if (call && ignoredCallIdsRef.current.has(call.id)) {
      setActiveCall(null);
      return;
    }
    setActiveCall(call?.participantCount ? call : null);
  }, []);

  const refreshActive = useCallback(async () => {
    if (!conversationId) return;
    try {
      const { call } = await fetchActiveCall(conversationId);
      applyActiveCall(call ?? null);
    } catch {
      // ignore poll errors
    }
  }, [applyActiveCall, conversationId]);

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
      ignoredCallIdsRef.current.delete(result.call.id);
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
      ignoredCallIdsRef.current.delete(result.call.id);
      activeCallIdRef.current = result.call.id;
      setActiveCall(result.call);
      setAuthToken(result.authToken);
      setInCall(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not join call";
      setError(message.includes("Forbidden") ? "You cannot join your own call" : message);
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

    if (callId) {
      ignoredCallIdsRef.current.add(callId);
      setActiveCall(null);
    } else {
      leavingRef.current = false;
      return;
    }

    setLoading(true);
    try {
      await leaveCall(callId);
      await refreshActive();
    } catch {
      await refreshActive();
    } finally {
      setLoading(false);
      leavingRef.current = false;
    }
  }, [activeCall, refreshActive]);

  const endForAll = useCallback(async () => {
    if (!activeCall || leavingRef.current) return;
    leavingRef.current = true;

    const callId = activeCall.id;
    ignoredCallIdsRef.current.add(callId);
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

  const ignoreCall = useCallback((callId: string) => {
    ignoredCallIdsRef.current.add(callId);
    setActiveCall(null);
  }, []);

  const acknowledgeCallEnded = useCallback((callId: string) => {
    ignoredCallIdsRef.current.add(callId);
    setActiveCall(null);
  }, []);

  const acceptCallUpdate = useCallback(
    (call: CallSummaryDto) => {
      applyActiveCall(call);
    },
    [applyActiveCall],
  );

  const shouldIgnoreCall = useCallback(
    (callId: string) => ignoredCallIdsRef.current.has(callId),
    [],
  );

  return {
    activeCall,
    setActiveCall: applyActiveCall,
    authToken,
    inCall,
    loading,
    error,
    join,
    joinExisting,
    hangUp,
    endForAll,
    refreshActive,
    ignoreCall,
    acknowledgeCallEnded,
    acceptCallUpdate,
    shouldIgnoreCall,
  };
};
