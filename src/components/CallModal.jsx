import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, X } from 'lucide-react';
import { getSocket } from '../services/socket';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function CallModal({
  callState, // 'incoming' | 'outgoing' | 'active'
  callType,  // 'video' | 'audio'
  friend,    // { id, displayName, avatarColor, avatarImage }
  currentUser,
  onClose,
}) {
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(callType === 'audio');
  const [callDuration, setCallDuration] = useState(0);
  const [connected, setConnected] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const timerRef = useRef(null);
  const iceCandidateQueueRef = useRef([]);

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup everything
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    iceCandidateQueueRef.current = [];
  }, []);

  // Get user media
  const getMedia = useCallback(async () => {
    try {
      const constraints = {
        audio: true,
        video: callType === 'video' ? { width: 640, height: 480, facingMode: 'user' } : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.error('Failed to get media:', err);
      alert('Could not access camera/microphone. Please allow permissions.');
      onClose();
      return null;
    }
  }, [callType, onClose]);

  // Create peer connection
  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const socket = getSocket();
        socket.emit('call:ice-candidate', {
          to: friend.id,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setConnected(true);
        // Start call timer
        if (!timerRef.current) {
          timerRef.current = setInterval(() => {
            setCallDuration((prev) => prev + 1);
          }, 1000);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        handleEndCall();
      }
    };

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    peerConnectionRef.current = pc;
    return pc;
  }, [friend.id]);

  // Handle outgoing call — create offer
  const startCall = useCallback(async () => {
    const stream = await getMedia();
    if (!stream) return;

    const pc = createPeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const socket = getSocket();
    socket.emit('call:offer', { to: friend.id, offer });
  }, [getMedia, createPeerConnection, friend.id]);

  // Handle incoming call accepted — wait for offer
  const acceptCall = useCallback(async () => {
    await getMedia();
    const socket = getSocket();
    socket.emit('call:accept', { to: friend.id });
  }, [getMedia, friend.id]);

  // Handle end call
  const handleEndCall = useCallback(() => {
    const socket = getSocket();
    socket.emit('call:end', { to: friend.id });
    cleanup();
    onClose();
  }, [friend.id, cleanup, onClose]);

  // Handle reject
  const handleReject = useCallback(() => {
    const socket = getSocket();
    socket.emit('call:reject', { to: friend.id });
    cleanup();
    onClose();
  }, [friend.id, cleanup, onClose]);

  // Toggle mic
  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Toggle camera
  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
      }
    }
  };

  // Socket event listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleOffer = async ({ from, offer }) => {
      if (from !== friend.id) return;
      const pc = createPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Process queued ICE candidates
      for (const candidate of iceCandidateQueueRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      iceCandidateQueueRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('call:answer', { to: friend.id, answer });
    };

    const handleAnswer = async ({ from, answer }) => {
      if (from !== friend.id) return;
      const pc = peerConnectionRef.current;
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));

        // Process queued ICE candidates
        for (const candidate of iceCandidateQueueRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        iceCandidateQueueRef.current = [];
      }
    };

    const handleIceCandidate = async ({ from, candidate }) => {
      if (from !== friend.id) return;
      const pc = peerConnectionRef.current;
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        // Queue if remote description not set yet
        iceCandidateQueueRef.current.push(candidate);
      }
    };

    const handleCallEnded = ({ from }) => {
      if (from === friend.id) {
        cleanup();
        onClose();
      }
    };

    const handleCallRejected = ({ from }) => {
      if (from === friend.id) {
        cleanup();
        onClose();
      }
    };

    const handleCallAccepted = ({ from }) => {
      if (from === friend.id) {
        // Peer accepted, start the WebRTC flow
        startCall();
      }
    };

    socket.on('call:offer', handleOffer);
    socket.on('call:answer', handleAnswer);
    socket.on('call:ice-candidate', handleIceCandidate);
    socket.on('call:ended', handleCallEnded);
    socket.on('call:rejected', handleCallRejected);
    socket.on('call:accepted', handleCallAccepted);

    return () => {
      socket.off('call:offer', handleOffer);
      socket.off('call:answer', handleAnswer);
      socket.off('call:ice-candidate', handleIceCandidate);
      socket.off('call:ended', handleCallEnded);
      socket.off('call:rejected', handleCallRejected);
      socket.off('call:accepted', handleCallAccepted);
    };
  }, [friend.id, createPeerConnection, startCall, cleanup, onClose]);

  // Auto-start: outgoing call sends initiate, incoming waits
  useEffect(() => {
    if (callState === 'outgoing') {
      const socket = getSocket();
      socket.emit('call:initiate', { to: friend.id, callType });
    }
    // cleanup on unmount
    return () => {
      cleanup();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="call-overlay">
      {/* Remote Video (fullscreen background) */}
      <video
        ref={remoteVideoRef}
        className={`call-remote-video ${!connected || (callType === 'audio' && !connected) ? 'hidden' : ''}`}
        autoPlay
        playsInline
      />

      {/* Avatar fallback for audio calls or before connection */}
      {(!connected || callType === 'audio') && (
        <div className="call-avatar-section">
          <div className="call-avatar-ring">
            <div
              className="call-avatar"
              style={{
                background: friend.avatarImage ? 'transparent' : friend.avatarColor || 'var(--accent-violet)',
              }}
            >
              {friend.avatarImage ? (
                <img src={friend.avatarImage} alt="" className="call-avatar-img" />
              ) : (
                <span className="call-avatar-initials">{getInitials(friend.displayName)}</span>
              )}
            </div>
          </div>
          <h2 className="call-friend-name">{friend.displayName}</h2>
          <p className="call-status">
            {callState === 'incoming' && '📞 Incoming Call...'}
            {callState === 'outgoing' && !connected && '📲 Calling...'}
            {connected && formatDuration(callDuration)}
          </p>
        </div>
      )}

      {/* Connected timer overlay for video calls */}
      {connected && callType === 'video' && (
        <div className="call-timer-overlay">
          <span>{formatDuration(callDuration)}</span>
        </div>
      )}

      {/* Local Video PiP */}
      <video
        ref={localVideoRef}
        className={`call-local-video ${callType === 'audio' || isCameraOff ? 'hidden' : ''}`}
        autoPlay
        playsInline
        muted
      />

      {/* Call type badge */}
      <div className="call-type-badge">
        {callType === 'video' ? <Video size={14} /> : <Phone size={14} />}
        {callType === 'video' ? 'Video Call' : 'Audio Call'}
      </div>

      {/* Controls */}
      <div className="call-controls">
        {callState === 'incoming' ? (
          <>
            <button
              className="call-btn call-btn-accept"
              onClick={acceptCall}
              title="Accept Call"
            >
              <Phone size={24} />
            </button>
            <button
              className="call-btn call-btn-reject"
              onClick={handleReject}
              title="Reject Call"
            >
              <PhoneOff size={24} />
            </button>
          </>
        ) : (
          <>
            <button
              className={`call-btn ${isMuted ? 'call-btn-muted' : 'call-btn-control'}`}
              onClick={toggleMic}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            {callType === 'video' && (
              <button
                className={`call-btn ${isCameraOff ? 'call-btn-muted' : 'call-btn-control'}`}
                onClick={toggleCamera}
                title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
              >
                {isCameraOff ? <VideoOff size={20} /> : <Video size={20} />}
              </button>
            )}

            <button
              className="call-btn call-btn-reject"
              onClick={handleEndCall}
              title="End Call"
            >
              <PhoneOff size={24} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
