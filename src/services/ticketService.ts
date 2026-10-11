import { Ticket, TicketStatus, Priority, TicketHistory, SLAConfig } from '../types';
import { fetchWithTimeout } from '../lib/fetchUtils';

// spreadsheet-safe CSV cell: quoted, and a leading = + - @ is neutralised so Excel never runs it as a formula
const csvCell = (v: unknown) => {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return `"${t.replace(/"/g, '""')}"`;
};

export const ticketService = {
  getTickets: async (): Promise<Ticket[]> => {
    try {
      const res = await fetchWithTimeout('/api/tickets', {}, 15000);
      if (!res.ok) throw new Error('Failed to fetch tickets');
      return await res.json();
    } catch (err) {
      console.error(err);
      return [];
    }
  },

  createTicket: async (ticketData: Partial<Ticket>, slaConfigs: SLAConfig[]): Promise<Ticket> => {
    const priorityHours = slaConfigs.find(c => c.priority === ticketData.priority)?.hours || 24;
    
    const now = new Date();
    const deadline = new Date(now.getTime() + priorityHours * 60 * 60 * 1000);

    const newTicket: any = {
      title: ticketData.title!,
      description: ticketData.description!,
      type: ticketData.type!,
      subtype: ticketData.subtype!,
      priority: ticketData.priority!,
      status: 'New',
      requesterId: ticketData.requesterId!,
      requesterEmail: ticketData.requesterEmail!,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      slaDeadline: deadline.toISOString(),
      totalPausedTime: 0,
      history: [{
        id: Math.random().toString(),
        action: 'Ticket Created',
        actor: ticketData.requesterEmail!,
        date: now.toISOString()
      }],
      attachments: ticketData.attachments || [],
      ...ticketData
    };

    const res = await fetchWithTimeout('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTicket)
    }, 15000);

    if (!res.ok) throw new Error('Failed to save ticket');
    
    return await res.json();
  },

  updateTicket: async (id: string | number, updates: Partial<Ticket>, actorEmail: string, currentTicket?: Ticket, slaConfigs?: SLAConfig[]): Promise<Ticket> => {
    let ticket = currentTicket;
    if (!ticket) {
      const tickets = await ticketService.getTickets();
      ticket = tickets.find(t => String(t.id) === String(id));
    }
    
    if (!ticket) throw new Error('Ticket not found');

    const now = new Date();

    // SLA Logic: Pause/Resume
    let { slaPausedAt, totalPausedTime, slaDeadline } = ticket;
    
    // Determine if we are currently in a pausing status
    const isPausingStatus = ['Waiting on User', 'Waiting on Vendor'].includes(updates.status || ticket.status);
    const wasPausedStatus = !!ticket.slaPausedAt;

    if (updates.status) {
      const newStatusIsPausing = ['Waiting on User', 'Waiting on Vendor'].includes(updates.status);
      
      if (newStatusIsPausing && !wasPausedStatus) {
        // Just entered a pausing status
        slaPausedAt = now.toISOString();
      } else if (!newStatusIsPausing && wasPausedStatus) {
        // Just exited a pausing status
        const pausedDuration = now.getTime() - new Date(slaPausedAt!).getTime();
        totalPausedTime = (totalPausedTime || 0) + pausedDuration;
        slaPausedAt = null;
        // Shift deadline
        const currentDeadline = new Date(slaDeadline);
        slaDeadline = new Date(currentDeadline.getTime() + pausedDuration).toISOString();
      }
    }

    // Recalculate SLA if priority changes
    if (updates.priority && updates.priority !== ticket.priority && slaConfigs) {
      const newPriorityConfig = slaConfigs.find(c => c.priority === updates.priority);
      if (newPriorityConfig) {
        const created = new Date(ticket.createdAt);
        const newDeadline = new Date(created.getTime() + (newPriorityConfig.hours * 60 * 60 * 1000) + (totalPausedTime || 0));
        slaDeadline = newDeadline.toISOString();
      }
    }

    const historyEntry: TicketHistory = {
      id: Math.random().toString(),
      action: updates.status ? `Status changed to ${updates.status}` : 'Ticket updated',
      actor: actorEmail,
      date: now.toISOString(),
      note: updates.history?.[0]?.note,
      isInternal: updates.history?.[0]?.isInternal,
      attachments: updates.history?.[0]?.attachments
    };

    const updatedTicket: Ticket = {
      ...ticket,
      ...updates,
      updatedAt: now.toISOString(),
      slaPausedAt: slaPausedAt as any,
      totalPausedTime,
      slaDeadline,
      history: [...ticket.history, historyEntry],
      resolvedAt: updates.status === 'Resolved' 
        ? now.toISOString() 
        : (['Resolved', 'Closed'].includes(updates.status || ticket.status) ? ticket.resolvedAt : undefined)
    };

    const res = await fetchWithTimeout(`/api/tickets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedTicket)
    }, 15000);

    if (!res.ok) throw new Error('Failed to update ticket');

    // Notification Logic (Async - don't wait to avoid lag)
    (async () => {
      try {
        const isRequester = actorEmail === updatedTicket.requesterEmail;
        const hasNote = updates.history?.[0]?.note;
        const statusChanged = updates.status && updates.status !== ticket!.status;

        if (statusChanged || (hasNote && !updates.history?.[0]?.isInternal)) {
          // Notify Requester if technician updated
          if (!isRequester) {
            fetchWithTimeout('/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: updatedTicket.requesterEmail,
                subject: `Ticket Update: ${updatedTicket.id}`,
                ticketId: updatedTicket.id,
                userEmail: actorEmail,
                action: statusChanged ? `Status: ${updatedTicket.status}` : 'New Comment',
                body: statusChanged 
                  ? `Your ticket status has been updated to ${updatedTicket.status} by ${actorEmail}.\n\nDescription: ${updatedTicket.description}\n\nNote: ${hasNote || 'No additional notes.'}`
                  : `A new comment has been added to your ticket by ${actorEmail}:\n\n"${hasNote}"\n\nDescription: ${updatedTicket.description}`
              })
            }, 5000).catch(err => console.warn('Requester notification failed', err));
          }

          // Notify Assigned Technician if requester updated
          if (isRequester && updatedTicket.assignedTo) {
            const usersRes = await fetchWithTimeout('/api/users', {}, 5000);
            if (usersRes.ok) {
              const users = await usersRes.json();
              const tech = users.find((u: any) => u.id === updatedTicket.assignedTo);
              if (tech) {
                fetchWithTimeout('/api/notify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    to: tech.email,
                    subject: `User Update on Ticket: ${updatedTicket.id}`,
                    ticketId: updatedTicket.id,
                    userEmail: actorEmail,
                    action: statusChanged ? `Status: ${updatedTicket.status}` : 'User Comment',
                    body: statusChanged
                      ? `The requester has updated the ticket status to ${updatedTicket.status}.\n\nDescription: ${updatedTicket.description}\n\nNote: ${hasNote || 'No additional notes.'}`
                      : `The requester (${actorEmail}) has added a comment to the ticket:\n\n"${hasNote}"\n\nDescription: ${updatedTicket.description}`
                  })
                }, 5000).catch(err => console.warn(`Tech notification failed for ${tech.email}`, err));
              }
            }
          }
        }
      } catch (err) {
        console.warn('Notification failed', err);
      }
    })();

    return updatedTicket;
  },

  deleteTicket: async (id: string | number, userId?: string, userName?: string): Promise<void> => {
    const query = new URLSearchParams();
    if (userId) query.append('userId', userId);
    if (userName) query.append('userName', userName);
    
    const res = await fetchWithTimeout(`/api/tickets/${id}?${query.toString()}`, {
      method: 'DELETE'
    }, 10000);
    if (!res.ok) throw new Error('Failed to delete ticket');
  },

  completeStep: async (ticketId: string | number, stepId: string, actorEmail: string, actorName: string, note?: string): Promise<Ticket> => {
    const res = await fetchWithTimeout(`/api/tickets/${ticketId}/steps/${stepId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorEmail, actorName, note })
    }, 15000);
    if (!res.ok) throw new Error('Failed to complete workflow step');
    return await res.json();
  },

  exportTickets: async () => {
    const tickets = await ticketService.getTickets();
    if (tickets.length === 0) {
      alert("No tickets to export");
      return;
    }

    // Define headers
    const headers = [
      "ID", "Title", "Description", "Type", "Subtype", "Priority", 
      "Status", "Requester Email", "Created At", "Updated At", "SLA Deadline"
    ];

    // Map tickets to rows
    const rows = tickets.map(t => [
      t.id, t.title, t.description, t.type, t.subtype, t.priority,
      t.status, t.requesterEmail, t.createdAt, t.updatedAt, t.slaDeadline
    ].map(csvCell));

    // Combine into CSV string
    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.join(","))
    ].join("\n");

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fusion_dev_desk_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  },

  importTickets: async (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const tickets = JSON.parse(e.target?.result as string);
          const res = await fetchWithTimeout('/api/tickets/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tickets)
          }, 30000);
          if (!res.ok) throw new Error('Failed to import tickets');
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  }
};

