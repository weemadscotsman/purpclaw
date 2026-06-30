'use client';

import { useState, useEffect, useCallback } from 'react';

export interface GatekeeperStatus {
  queueDepth: number;
  passRate: number;
  lastProbeAt: string | null;
  lastProbePass: boolean | null;
  amendmentsPending: number;
  checksHistory: { pass: number; fail: number; timestamp: number }[];
}

export interface SkillAmendment {
  id: string;
  file: string;
  reason: string;
  confidence: number;
  originalCode: string;
  proposedFix: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export function useGatekeeperStatus() {
  const [status, setStatus] = useState<GatekeeperStatus | null>(null);
  const [amendments, setAmendments] = useState<SkillAmendment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const [statusRes, amendRes] = await Promise.all([
        fetch('/api/gatekeeper-status', { signal: AbortSignal.timeout(3000) }),
        fetch('/api/skill-amendments', { signal: AbortSignal.timeout(5000) }),
      ]);

      if (statusRes.ok) {
        const s = await statusRes.json();
        setStatus({
          queueDepth: s.queueDepth ?? s.validationQueue?.depth ?? 0,
          passRate: s.passRate ?? s.adversarialProbe?.passRate ?? 0,
          lastProbeAt: s.lastProbeAt ?? s.adversarialProbe?.lastRun ?? null,
          lastProbePass: s.lastProbePass ?? s.adversarialProbe?.lastPass ?? null,
          amendmentsPending: s.amendmentsPending ?? 0,
          checksHistory: s.checksHistory ?? [],
        });
      }

      if (amendRes.ok) {
        const a = await amendRes.json();
        const raw = Array.isArray(a) ? a : a.amendments ?? a.proposals ?? [];
        setAmendments(raw.map((proposal: any) => ({
          id: proposal.proposalId || proposal.id,
          file: proposal.patch?.targetPath || proposal.file || proposal.skillId || 'unknown',
          reason: proposal.summary || proposal.reason || proposal.rationale || 'Skill amendment proposal',
          confidence: Math.round((proposal.confidence ?? 0) * 100),
          originalCode: proposal.patch?.original || proposal.originalCode || '',
          proposedFix: proposal.patch?.preview || proposal.proposedFix || '',
          status: proposal.status === 'proposed' ? 'pending' : proposal.status || 'pending',
          createdAt: proposal.generatedAt || proposal.createdAt || new Date().toISOString(),
          proposal,
        })));
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const acceptAmendment = useCallback(async (id: string) => {
    try {
      const proposal = (amendments as any[]).find(am => am.id === id)?.proposal;
      if (!proposal) return;
      const res = await fetch('/api/gatekeeper-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amendmentId: id, action: 'accept', proposal }),
      });
      if (res.ok) await fetchStatus();
    } catch {}
  }, [amendments, fetchStatus]);

  const rejectAmendment = useCallback(async (id: string) => {
    setAmendments(prev => prev.map(am => am.id === id ? { ...am, status: 'rejected' } : am));
  }, []);

  return { status, amendments, loading, acceptAmendment, rejectAmendment, refetch: fetchStatus };
}
