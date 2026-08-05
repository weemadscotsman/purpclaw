'use client';

import React, { useState } from 'react';
import type { MissionData } from '../hooks/useMissionData';

type SortKey = 'id' | 'route' | 'state' | 'created';
type SortDir = 'asc' | 'desc';

export function DataAnalysisPanel({ data }: { data: MissionData }) {
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filter, setFilter] = useState('');

  const jobs = data.kernelJobs ?? [];

  const filtered = jobs.filter(j =>
    !filter ||
    j.id?.toLowerCase().includes(filter.toLowerCase()) ||
    j.route?.toLowerCase().includes(filter.toLowerCase()) ||
    j.state?.toLowerCase().includes(filter.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    let av = '', bv = '';
    if (sortKey === 'id') { av = a.id ?? ''; bv = b.id ?? ''; }
    else if (sortKey === 'route') { av = a.route ?? ''; bv = b.route ?? ''; }
    else if (sortKey === 'state') { av = a.state ?? ''; bv = b.state ?? ''; }
    else if (sortKey === 'created') { av = a.created ?? ''; bv = b.created ?? ''; }
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const stateColor = (state?: string) => {
    switch (state) {
      case 'completed': return 'text-green-400';
      case 'running': return 'text-blue-400';
      case 'queued': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-white/40';
    }
  };

  const activeCount = jobs.filter(j => ['running','queued','delegated','planning','executing','reviewing','synthesizing'].includes(j.state ?? '')).length;
  const completedCount = jobs.filter(j => j.state === 'completed').length;
  const errorCount = jobs.filter(j => j.state === 'error').length;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Total Jobs</p>
          <p className="text-2xl font-mono text-white">{jobs.length}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Active</p>
          <p className="text-2xl font-mono text-blue-400">{activeCount}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Completed</p>
          <p className="text-2xl font-mono text-green-400">{completedCount}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Errors</p>
          <p className="text-2xl font-mono text-red-400">{errorCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Filter by id, route, state..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-fuchsia-500/50"
        />
        <span className="text-white/30 text-xs font-mono">{sorted.length} shown</span>
      </div>

      {/* Jobs table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="border-b border-white/10">
              {([['id','ID'],['route','Route'],['state','State'],['created','Created']] as [SortKey,string][]).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  className="text-left px-3 py-2 text-white/40 uppercase tracking-wider text-xs cursor-pointer hover:text-white/60 select-none"
                >
                  {label}{sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-white/30">No jobs recorded</td>
              </tr>
            ) : sorted.map((job) => (
              <tr key={job.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-3 py-2 text-white/60">{job.id ?? '—'}</td>
                <td className="px-3 py-2 text-fuchsia-400">{job.route ?? '—'}</td>
                <td className={`px-3 py-2 font-medium ${stateColor(job.state)}`}>{job.state ?? '—'}</td>
                <td className="px-3 py-2 text-white/40">{job.created ? new Date(job.created).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
