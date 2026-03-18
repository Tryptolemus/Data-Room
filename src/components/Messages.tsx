import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, orderBy } from 'firebase/firestore';
import { Send, MessageSquare, Loader2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';

export default function Messages() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    const q = query(collection(db, 'messages'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !profile) return;

    setSending(true);
    try {
      await addDoc(collection(db, 'messages'), {
        senderId: profile.email,
        text: newMessage.trim(),
        timestamp: new Date().toISOString(),
        isRead: false
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const markAsRead = async (id: string) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, 'messages', id), { isRead: true });
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  const filteredMessages = isAdmin 
    ? messages 
    : messages.filter(m => m.senderId === profile?.email);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Messages</h1>
        <p className="text-sm text-zinc-500 mt-1 mb-6">
          {isAdmin ? 'Messages from viewers.' : 'Send a message to the administrator.'}
        </p>
      </div>

      <div className="flex-1 bg-white shadow-sm rounded-2xl border border-zinc-200 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex-1 flex justify-center items-center">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {filteredMessages.map((msg) => {
              const isMine = msg.senderId === profile?.email;
              return (
                <div key={msg.id} className={clsx("flex flex-col", isMine ? "items-end" : "items-start")}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-zinc-900">{isMine ? 'You' : msg.senderId}</span>
                    <span className="text-xs text-zinc-500">{format(new Date(msg.timestamp), 'HH:mm')}</span>
                  </div>
                  <div 
                    className={clsx(
                      "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
                      isMine ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-900"
                    )}
                  >
                    {msg.text}
                  </div>
                  {isAdmin && !isMine && !msg.isRead && (
                    <button 
                      onClick={() => markAsRead(msg.id)}
                      className="mt-1 text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Mark as read
                    </button>
                  )}
                  {isAdmin && !isMine && msg.isRead && (
                    <span className="mt-1 text-xs text-zinc-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Read
                    </span>
                  )}
                </div>
              );
            })}
            {filteredMessages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                <MessageSquare className="w-12 h-12 mb-4 text-zinc-300" />
                <p>No messages yet.</p>
              </div>
            )}
          </div>
        )}

        <div className="p-4 bg-zinc-50 border-t border-zinc-200">
          <form onSubmit={handleSendMessage} className="flex gap-4">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={isAdmin ? "Admins cannot reply directly yet..." : "Type your message to the admin..."}
              disabled={sending || isAdmin}
              className="flex-1 rounded-xl border-zinc-300 shadow-sm focus:ring-zinc-500 focus:border-zinc-500 sm:text-sm px-4 py-3 border disabled:bg-zinc-100 disabled:text-zinc-500"
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim() || isAdmin}
              className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-zinc-900 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 disabled:opacity-50 transition-colors"
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
