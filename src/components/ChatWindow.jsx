import React, { useRef, useEffect, useState } from 'react';
import { Send, ArrowLeft, MessageSquare } from 'lucide-react';

export default function ChatWindow({
  user,
  friend,
  messages,
  isTyping,
  onSendMessage,
  onTyping,
  onBack,
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Focus input when friend changes
  useEffect(() => {
    if (friend) {
      inputRef.current?.focus();
    }
  }, [friend]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput('');
    onTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);

    // Typing indicator
    onTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false);
    }, 2000);
  };

  const getInitials = (name) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatMessageTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateSeparator = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / 86400000);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'long' });
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const shouldShowDateSeparator = (msg, idx) => {
    if (idx === 0) return true;
    const prevDate = new Date(messages[idx - 1].createdAt).toDateString();
    const currDate = new Date(msg.createdAt).toDateString();
    return prevDate !== currDate;
  };

  // Empty state
  if (!friend) {
    return (
      <div className="chat-area">
        <div className="chat-empty">
          <div className="chat-empty-icon">
            <MessageSquare size={32} />
          </div>
          <h3>Welcome to OnlyUs</h3>
          <p>Select a friend from the sidebar to start chatting privately</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-area">
      {/* Header */}
      <div className="chat-header">
        <button
          className="btn-icon"
          onClick={onBack}
          style={{ display: 'none' }}
          id="btn-chat-back"
        >
          <ArrowLeft size={18} />
        </button>
        <div
          className="avatar"
          style={{ background: friend.avatarColor }}
        >
          {getInitials(friend.displayName)}
        </div>
        <div className="chat-header-info">
          <div className="chat-header-name">{friend.displayName}</div>
          <div className="chat-header-status">
            <span
              className={`status-dot ${friend.isOnline ? 'online' : ''}`}
            />
            {friend.isOnline ? 'Online' : 'Offline'}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state" style={{ flex: 1 }}>
            <div className="empty-state-icon">
              <Send size={20} />
            </div>
            <h4>Start the conversation</h4>
            <p>Say hello to {friend.displayName}!</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <React.Fragment key={msg.id || idx}>
            {shouldShowDateSeparator(msg, idx) && (
              <div className="date-separator">
                <span>{formatDateSeparator(msg.createdAt)}</span>
              </div>
            )}
            <div
              className={`message ${
                msg.senderId === user.id ? 'sent' : 'received'
              }`}
            >
              {msg.content}
              <div className="message-time">
                {formatMessageTime(msg.createdAt)}
              </div>
            </div>
          </React.Fragment>
        ))}

        {isTyping && (
          <div className="typing-indicator">
            <div className="typing-dots">
              <span />
              <span />
              <span />
            </div>
            {friend.displayName} is typing...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-container">
        <div className="chat-input-wrapper">
          <textarea
            ref={inputRef}
            id="chat-message-input"
            className="chat-input"
            placeholder={`Message ${friend.displayName}...`}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            id="btn-send-message"
            className="btn-send"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* Responsive back button style override */}
      <style>{`
        @media (max-width: 768px) {
          #btn-chat-back {
            display: flex !important;
          }
        }
      `}</style>
    </div>
  );
}
