import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Users, UserPlus, MessageCircle, LogOut, Shield,
  Check, X, Clock, Send, UserCheck,
} from 'lucide-react';
import {
  searchUsers, sendFriendRequest, getFriendRequests,
  acceptFriendRequest, rejectFriendRequest, removeFriend, getFriends,
  getMessages,
} from '../services/api';
import { getSocket } from '../services/socket';
import ChatWindow from '../components/ChatWindow';
import ProfileModal from '../components/ProfileModal';
import CallModal from '../components/CallModal';

export default function Dashboard({ user, onLogout, onUserUpdate }) {
  const [currentUser, setCurrentUser] = useState(user);
  const [activeTab, setActiveTab] = useState('friends'); // 'friends' | 'requests'
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [chatOpen, setChatOpen] = useState(false);
  const [profileModalUserId, setProfileModalUserId] = useState(undefined);
  // Call state
  const [callState, setCallState] = useState(null); // null | 'incoming' | 'outgoing' | 'active'
  const [callType, setCallType] = useState(null);   // 'video' | 'audio'
  const [callFriend, setCallFriend] = useState(null);
  const searchTimeout = useRef(null);

  // Load friends & requests
  const loadFriends = useCallback(async () => {
    try {
      const data = await getFriends();
      setFriends(data.friends);
    } catch (err) {
      console.error('Failed to load friends:', err);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const data = await getFriendRequests();
      setRequests(data);
    } catch (err) {
      console.error('Failed to load requests:', err);
    }
  }, []);

  useEffect(() => {
    loadFriends();
    loadRequests();
  }, [loadFriends, loadRequests]);

  // Socket event listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleMessageReceive = (message) => {
      if (selectedFriend && message.senderId === selectedFriend.id) {
        setMessages((prev) => [...prev, message]);
        // Mark as read
        socket.emit('message:read', { friendId: message.senderId });
      }
      // Update friends list for last message
      loadFriends();
    };

    const handleMessageSent = (message) => {
      setMessages((prev) => [...prev, message]);
    };

    const handleFriendRequest = () => {
      loadRequests();
    };

    const handleFriendAccepted = () => {
      loadFriends();
      loadRequests();
    };

    const handleFriendRemoved = ({ userId }) => {
      if (selectedFriend?.id === userId) {
        setSelectedFriend(null);
        setMessages([]);
        setChatOpen(false);
      }
      loadFriends();
    };

    const handleUserStatus = ({ userId, isOnline }) => {
      setFriends((prev) =>
        prev.map((f) => (f.id === userId ? { ...f, isOnline } : f))
      );
      if (selectedFriend?.id === userId) {
        setSelectedFriend((prev) => prev ? { ...prev, isOnline } : prev);
      }
    };

    const handleTypingStart = ({ userId }) => {
      setTypingUsers((prev) => new Set([...prev, userId]));
    };

    const handleTypingStop = ({ userId }) => {
      setTypingUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    };

    const handleMessageRead = ({ readBy }) => {
      if (selectedFriend && readBy === selectedFriend.id) {
        setMessages((prev) => prev.map((m) => ({ ...m, read: 1 })));
      }
    };

    socket.on('message:receive', handleMessageReceive);
    socket.on('message:sent', handleMessageSent);
    socket.on('friend:request', handleFriendRequest);
    socket.on('friend:accepted', handleFriendAccepted);
    socket.on('friend:removed', handleFriendRemoved);
    socket.on('user:status', handleUserStatus);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('message:read', handleMessageRead);

    // Call events
    const handleIncomingCall = ({ from, callType: type }) => {
      // Don't accept if already in a call
      if (callState) return;
      setCallFriend(from);
      setCallType(type);
      setCallState('incoming');
    };

    const handleCallUnavailable = () => {
      alert('User is offline and cannot receive calls right now.');
      setCallState(null);
      setCallFriend(null);
      setCallType(null);
    };

    socket.on('call:incoming', handleIncomingCall);
    socket.on('call:unavailable', handleCallUnavailable);

    return () => {
      socket.off('message:receive', handleMessageReceive);
      socket.off('message:sent', handleMessageSent);
      socket.off('friend:request', handleFriendRequest);
      socket.off('friend:accepted', handleFriendAccepted);
      socket.off('friend:removed', handleFriendRemoved);
      socket.off('user:status', handleUserStatus);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('message:read', handleMessageRead);
      socket.off('call:incoming', handleIncomingCall);
      socket.off('call:unavailable', handleCallUnavailable);
    };
  }, [selectedFriend, loadFriends, loadRequests, callState]);

  // Handle start call (from chat header buttons)
  const handleStartCall = (type) => {
    if (!selectedFriend) return;
    if (!selectedFriend.isOnline) {
      alert('This user is offline. You can only call online friends.');
      return;
    }
    setCallFriend(selectedFriend);
    setCallType(type);
    setCallState('outgoing');
  };

  // Handle remove friend
  const handleRemoveFriend = async (friendId) => {
    if (!window.confirm('Are you sure you want to remove this friend? All chat history will be permanently deleted for both of you.')) return;
    try {
      await removeFriend(friendId);
      if (selectedFriend?.id === friendId) {
        setSelectedFriend(null);
        setMessages([]);
        setChatOpen(false);
      }
      loadFriends();
    } catch (err) {
      console.error('Failed to remove friend:', err);
    }
  };

  // Search users
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (searchQuery.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const data = await searchUsers(searchQuery);
        setSearchResults(data.users);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(searchTimeout.current);
  }, [searchQuery]);

  // Select friend & load messages
  const handleSelectFriend = async (friend) => {
    setSelectedFriend(friend);
    setChatOpen(true);
    try {
      const data = await getMessages(friend.id);
      setMessages(data.messages);
      // Mark as read
      const socket = getSocket();
      if (socket) socket.emit('message:read', { friendId: friend.id });
      // Update unread count
      setFriends((prev) =>
        prev.map((f) => (f.id === friend.id ? { ...f, unreadCount: 0 } : f))
      );
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  // Send friend request
  const handleSendRequest = async (toUserId) => {
    try {
      await sendFriendRequest(toUserId);
      setSearchResults((prev) =>
        prev.map((u) =>
          u.id === toUserId ? { ...u, friendStatus: 'sent' } : u
        )
      );
      loadRequests();
    } catch (err) {
      console.error('Failed to send request:', err);
    }
  };

  // Accept/reject friend request
  const handleAcceptRequest = async (requestId) => {
    try {
      await acceptFriendRequest(requestId);
      loadFriends();
      loadRequests();
    } catch (err) {
      console.error('Failed to accept:', err);
    }
  };

  const handleRejectRequest = async (requestId) => {
    try {
      await rejectFriendRequest(requestId);
      loadRequests();
    } catch (err) {
      console.error('Failed to reject:', err);
    }
  };

  // Send message
  const handleSendMessage = (content) => {
    const socket = getSocket();
    if (!socket || !selectedFriend) return;
    socket.emit('message:send', {
      receiverId: selectedFriend.id,
      content,
      type: 'text',
    });
  };

  // Typing
  const handleTyping = (isTyping) => {
    const socket = getSocket();
    if (!socket || !selectedFriend) return;
    socket.emit(isTyping ? 'typing:start' : 'typing:stop', {
      receiverId: selectedFriend.id,
    });
  };

  const getInitials = (name) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
  };

  const totalIncoming = requests.incoming?.length || 0;

  return (
    <div className={`dashboard ${chatOpen ? 'chat-open' : ''}`}>
      {/* ── Sidebar ── */}
      <div className="sidebar">
        {/* Header */}
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">
              <Shield size={16} color="white" />
            </div>
            <h2>OnlyUs</h2>
          </div>
          <div className="sidebar-user-actions">
            <button className="btn-icon" onClick={onLogout} title="Sign Out">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="search-container">
          <div className="search-input-wrapper">
            <Search size={16} className="search-icon" />
            <input
              id="search-users"
              type="text"
              className="search-input"
              placeholder="Search users by username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Show search results or tabs */}
        {searchQuery.length >= 2 ? (
          <div className="sidebar-content">
            <div className="request-section-title">
              {isSearching ? 'Searching...' : `Search Results (${searchResults.length})`}
            </div>
            {searchResults.length === 0 && !isSearching ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <Search size={20} />
                </div>
                <h4>No users found</h4>
                <p>Try a different username</p>
              </div>
            ) : (
              searchResults.map((u) => (
                <div key={u.id} className="search-result-item">
                  <div
                    className="avatar"
                    style={{ background: u.avatarImage ? 'transparent' : u.avatarColor }}
                    onClick={() => setProfileModalUserId(u.id)}
                    title="View Profile"
                  >
                    {u.avatarImage ? (
                      <img src={u.avatarImage} alt="" className="avatar-img-round" />
                    ) : (
                      getInitials(u.displayName)
                    )}
                  </div>
                  <div
                    className="search-result-info"
                    onClick={() => setProfileModalUserId(u.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="search-result-name">{u.displayName}</div>
                    <div className="search-result-username">@{u.username}</div>
                  </div>
                  {u.friendStatus === 'none' && (
                    <button
                      className="btn-request"
                      onClick={() => handleSendRequest(u.id)}
                    >
                      <UserPlus size={12} style={{ marginRight: 4 }} />
                      Add
                    </button>
                  )}
                  {u.friendStatus === 'sent' && (
                    <button className="btn-request pending" disabled>
                      <Clock size={12} style={{ marginRight: 4 }} />
                      Pending
                    </button>
                  )}
                  {u.friendStatus === 'received' && (
                    <button className="btn-request pending" disabled>
                      Respond ↓
                    </button>
                  )}
                  {u.friendStatus === 'friends' && (
                    <button className="btn-request friends" disabled>
                      <Check size={12} style={{ marginRight: 4 }} />
                      Friends
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="sidebar-tabs">
              <button
                className={`sidebar-tab ${activeTab === 'friends' ? 'active' : ''}`}
                onClick={() => setActiveTab('friends')}
              >
                <MessageCircle size={14} />
                Chats
              </button>
              <button
                className={`sidebar-tab ${activeTab === 'requests' ? 'active' : ''}`}
                onClick={() => setActiveTab('requests')}
              >
                <UserPlus size={14} />
                Requests
                {totalIncoming > 0 && (
                  <span className="tab-badge">{totalIncoming}</span>
                )}
              </button>
            </div>

            {/* Tab Content */}
            <div className="sidebar-content">
              {activeTab === 'friends' && (
                <>
                  {friends.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">
                        <Users size={20} />
                      </div>
                      <h4>No friends yet</h4>
                      <p>Search for users by their username and send a friend request to start chatting</p>
                    </div>
                  ) : (
                    friends.map((friend) => (
                      <div
                        key={friend.id}
                        className={`friend-item ${
                          selectedFriend?.id === friend.id ? 'active' : ''
                        }`}
                        onClick={() => handleSelectFriend(friend)}
                      >
                        <div
                          className="avatar"
                          style={{ background: friend.avatarImage ? 'transparent' : friend.avatarColor }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setProfileModalUserId(friend.id);
                          }}
                          title="View Profile"
                        >
                          {friend.avatarImage ? (
                            <img src={friend.avatarImage} alt="" className="avatar-img-round" />
                          ) : (
                            getInitials(friend.displayName)
                          )}
                          {friend.isOnline && <div className="online-dot" />}
                        </div>
                        <div className="friend-info">
                          <div className="friend-name">{friend.displayName}</div>
                          <div className="friend-last-msg">
                            {friend.lastMessage
                              ? friend.lastMessage.senderId === currentUser.id
                                ? `You: ${friend.lastMessage.content}`
                                : friend.lastMessage.content
                              : `@${friend.username}`}
                          </div>
                        </div>
                        <div className="friend-meta">
                          {friend.lastMessage && (
                            <span className="friend-time">
                              {formatTime(friend.lastMessage.createdAt)}
                            </span>
                          )}
                          {friend.unreadCount > 0 && (
                            <span className="unread-badge">
                              {friend.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}

              {activeTab === 'requests' && (
                <>
                  {requests.incoming?.length > 0 && (
                    <>
                      <div className="request-section-title">
                        Incoming ({requests.incoming.length})
                      </div>
                      {requests.incoming.map((req) => (
                        <div key={req.id} className="request-item">
                          <div
                            className="avatar avatar-sm"
                            style={{ background: req.avatarImage ? 'transparent' : req.avatarColor }}
                            onClick={() => setProfileModalUserId(req.userId)}
                            title="View Profile"
                          >
                            {req.avatarImage ? (
                              <img src={req.avatarImage} alt="" className="avatar-img-round" />
                            ) : (
                              getInitials(req.displayName)
                            )}
                          </div>
                          <div
                            className="request-info"
                            onClick={() => setProfileModalUserId(req.userId)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div className="request-name">{req.displayName}</div>
                            <div className="request-username">@{req.username}</div>
                          </div>
                          <div className="request-actions">
                            <button
                              className="btn btn-accept btn-sm"
                              onClick={() => handleAcceptRequest(req.id)}
                            >
                              <Check size={14} />
                            </button>
                            <button
                              className="btn btn-reject btn-sm"
                              onClick={() => handleRejectRequest(req.id)}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {requests.outgoing?.length > 0 && (
                    <>
                      <div className="request-section-title">
                        Sent ({requests.outgoing.length})
                      </div>
                      {requests.outgoing.map((req) => (
                        <div key={req.id} className="request-item">
                          <div
                            className="avatar avatar-sm"
                            style={{ background: req.avatarImage ? 'transparent' : req.avatarColor }}
                            onClick={() => setProfileModalUserId(req.userId)}
                            title="View Profile"
                          >
                            {req.avatarImage ? (
                              <img src={req.avatarImage} alt="" className="avatar-img-round" />
                            ) : (
                              getInitials(req.displayName)
                            )}
                          </div>
                          <div
                            className="request-info"
                            onClick={() => setProfileModalUserId(req.userId)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div className="request-name">{req.displayName}</div>
                            <div className="request-username">@{req.username}</div>
                          </div>
                          <span
                            style={{
                              color: 'var(--text-tertiary)',
                              fontSize: 'var(--font-xs)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Clock size={12} /> Pending
                          </span>
                        </div>
                      ))}
                    </>
                  )}

                  {requests.incoming?.length === 0 &&
                    requests.outgoing?.length === 0 && (
                      <div className="empty-state">
                        <div className="empty-state-icon">
                          <UserPlus size={20} />
                        </div>
                        <h4>No requests</h4>
                        <p>Search for users to send them a friend request</p>
                      </div>
                    )}
                </>
              )}
            </div>
          </>
        )}

        {/* Profile Footer - Click to view/edit own profile */}
        <div
          className="sidebar-profile"
          onClick={() => setProfileModalUserId(currentUser.id)}
          title="Click to view & edit your profile"
        >
          <div
            className="avatar avatar-sm"
            style={{ background: currentUser.avatarImage ? 'transparent' : currentUser.avatarColor }}
          >
            {currentUser.avatarImage ? (
              <img src={currentUser.avatarImage} alt="" className="avatar-img-round" />
            ) : (
              getInitials(currentUser.displayName)
            )}
            <div className="online-dot" />
          </div>
          <div className="sidebar-profile-info">
            <div className="sidebar-profile-name">{currentUser.displayName}</div>
            <div className="sidebar-profile-username">@{currentUser.username}</div>
          </div>
        </div>
      </div>

      {/* ── Chat Area ── */}
      <ChatWindow
        user={currentUser}
        friend={selectedFriend}
        messages={messages}
        isTyping={selectedFriend ? typingUsers.has(selectedFriend.id) : false}
        onSendMessage={handleSendMessage}
        onTyping={handleTyping}
        onRemoveFriend={handleRemoveFriend}
        onViewProfile={(friendId) => setProfileModalUserId(friendId)}
        onStartCall={handleStartCall}
        onBack={() => setChatOpen(false)}
      />

      {/* ── Profile Modal ── */}
      {profileModalUserId !== undefined && (
        <ProfileModal
          targetUserId={profileModalUserId}
          currentUser={currentUser}
          onClose={() => setProfileModalUserId(undefined)}
          onProfileUpdated={(updated) => {
            setCurrentUser(updated);
            if (onUserUpdate) onUserUpdate(updated);
            loadFriends();
          }}
          onSelectFriend={(friend) => {
            handleSelectFriend(friend);
          }}
        />
      )}

      {/* ── Call Modal ── */}
      {callState && callFriend && (
        <CallModal
          callState={callState}
          callType={callType}
          friend={callFriend}
          currentUser={currentUser}
          onClose={() => {
            setCallState(null);
            setCallFriend(null);
            setCallType(null);
          }}
        />
      )}
    </div>
  );
}
