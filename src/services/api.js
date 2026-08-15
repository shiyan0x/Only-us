const API_BASE = '/api';

function getHeaders() {
  const token = localStorage.getItem('onlyus_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: getHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Something went wrong');
  }

  return data;
}

// Auth
export const signup = (username, displayName, password) =>
  request('POST', '/auth/signup', { username, displayName, password });

export const signin = (username, password) =>
  request('POST', '/auth/signin', { username, password });

export const getMe = () => request('GET', '/auth/me');

// Users
export const searchUsers = (q) => request('GET', `/users/search?q=${encodeURIComponent(q)}`);

// Friends
export const sendFriendRequest = (toUserId) =>
  request('POST', '/friends/request', { toUserId });

export const getFriendRequests = () => request('GET', '/friends/requests');

export const acceptFriendRequest = (requestId) =>
  request('PUT', `/friends/accept/${requestId}`);

export const rejectFriendRequest = (requestId) =>
  request('PUT', `/friends/reject/${requestId}`);

export const getFriends = () => request('GET', '/friends');

// Messages
export const getMessages = (friendId) => request('GET', `/messages/${friendId}`);
