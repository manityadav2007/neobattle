'use client';

import { useEffect, useState } from 'react';
import { Loader2, MessageSquareMore, Bug, CheckCircle, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';

interface Ticket {
  id: string;
  type: 'BUG' | 'FEEDBACK';
  subject: string;
  description: string;
  status: 'PENDING' | 'RESOLVED';
  createdAt: string;
  user: { id: string; username: string; email: string; uid: string } | null;
}

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTickets = async () => {
    try {
      const { data } = await api.get('/support');
      setTickets(data.data);
    } catch (err) {
      console.error('[AdminSupport] Failed to fetch tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleResolve = async (id: string) => {
    try {
      await api.patch(`/support/${id}/resolve`);
      fetchTickets();
    } catch (err) {
      console.error('[AdminSupport] Failed to resolve ticket:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this ticket permanently?')) return;
    try {
      await api.delete(`/support/${id}`);
      fetchTickets();
    } catch (err) {
      console.error('[AdminSupport] Failed to delete ticket:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-fire-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-fire-400">Admin</p>
        <h1 className="text-3xl font-display font-bold text-white mt-2">Support Dashboard</h1>
        <p className="text-zinc-400 mt-1">Manage bug reports and product feedback from users.</p>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.03]">
                <th className="text-left px-5 py-4 text-zinc-400 font-medium">Type</th>
                <th className="text-left px-5 py-4 text-zinc-400 font-medium">Subject</th>
                <th className="text-left px-5 py-4 text-zinc-400 font-medium hidden md:table-cell">Description</th>
                <th className="text-left px-5 py-4 text-zinc-400 font-medium">User</th>
                <th className="text-left px-5 py-4 text-zinc-400 font-medium hidden lg:table-cell">Date</th>
                <th className="text-left px-5 py-4 text-zinc-400 font-medium">Status</th>
                <th className="text-right px-5 py-4 text-zinc-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-zinc-500">
                    No support tickets yet.
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => (
                  <tr key={ticket.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${
                        ticket.type === 'BUG'
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {ticket.type === 'BUG' ? <Bug className="h-3 w-3" /> : <MessageSquareMore className="h-3 w-3" />}
                        {ticket.type === 'BUG' ? 'Bug' : 'Feedback'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-white font-medium max-w-[200px] truncate">{ticket.subject}</td>
                    <td className="px-5 py-4 text-zinc-400 max-w-[250px] truncate hidden md:table-cell">{ticket.description}</td>
                    <td className="px-5 py-4 text-zinc-300">
                      {ticket.user ? (
                        <span className="text-xs">{ticket.user.uid || ticket.user.username || ticket.user.email}</span>
                      ) : (
                        <span className="text-xs text-zinc-500">Guest</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-zinc-400 text-xs hidden lg:table-cell">
                      {new Date(ticket.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        ticket.status === 'RESOLVED'
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-yellow-500/10 text-yellow-400'
                      }`}>
                        {ticket.status === 'RESOLVED' ? 'Resolved' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {ticket.status === 'PENDING' && (
                          <button
                            onClick={() => handleResolve(ticket.id)}
                            className="rounded-lg p-2 text-green-400 hover:bg-green-500/10 transition-colors"
                            title="Mark as resolved"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(ticket.id)}
                          className="rounded-lg p-2 text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete ticket"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
