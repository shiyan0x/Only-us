import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Edit3, Users } from 'lucide-react';
import { updateProfile, getUserProfile } from '../services/api';

export default function ProfileModal({
  targetUserId,
  currentUser,
  onClose,
  onProfileUpdated,
  onSelectFriend,
}) {
  const isOwnProfile = !targetUserId || targetUserId === currentUser.id;
  const [profileData, setProfileData] = useState(isOwnProfile ? currentUser : null);
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(currentUser.displayName || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [avatarImage, setAvatarImage] = useState(currentUser.avatarImage || '');
  const [loading, setLoading] = useState(!isOwnProfile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    // Always fetch full profile from API (includes friends list + count)
    const userId = isOwnProfile ? currentUser.id : targetUserId;
    setLoading(true);
    getUserProfile(userId)
      .then((data) => {
        setProfileData(data.user);
        if (isOwnProfile) {
          setDisplayName(data.user.displayName || '');
          setBio(data.user.bio || '');
          setAvatarImage(data.user.avatarImage || '');
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to load profile');
        // Fallback to local data for own profile
        if (isOwnProfile) {
          setProfileData(currentUser);
          setDisplayName(currentUser.displayName || '');
          setBio(currentUser.bio || '');
          setAvatarImage(currentUser.avatarImage || '');
        }
      })
      .finally(() => setLoading(false));
  }, [targetUserId, currentUser.id, isOwnProfile]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be under 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarImage(reader.result);
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Display name cannot be empty.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const data = await updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        avatarImage,
      });

      onProfileUpdated(data.user);
      setIsEditing(false);
      setProfileData(data.user);
    } catch (err) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const activeUser = profileData || currentUser;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h3>{isOwnProfile ? 'Your Profile' : `@${activeUser.username}'s Profile`}</h3>
          <button className="btn-icon" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="loader">
            <div className="spinner" />
          </div>
        ) : (
          <div className="modal-body">
            {error && <div className="alert-error">{error}</div>}

            {/* Profile Avatar / Photo */}
            <div className="profile-avatar-container">
              <div
                className="profile-avatar-wrapper"
                style={{
                  background: (isEditing ? avatarImage : activeUser.avatarImage)
                    ? 'transparent'
                    : activeUser.avatarColor || 'var(--accent-violet)',
                }}
              >
                {isEditing ? (
                  avatarImage ? (
                    <img src={avatarImage} alt="Avatar" className="profile-img-preview" />
                  ) : (
                    <span className="profile-initials">{getInitials(displayName)}</span>
                  )
                ) : activeUser.avatarImage ? (
                  <img src={activeUser.avatarImage} alt="Avatar" className="profile-img-preview" />
                ) : (
                  <span className="profile-initials">{getInitials(activeUser.displayName)}</span>
                )}

                {isOwnProfile && isEditing && (
                  <button
                    type="button"
                    className="profile-avatar-upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Change Photo"
                  >
                    <Camera size={18} />
                  </button>
                )}
              </div>

              {isOwnProfile && isEditing && (
                <>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageChange}
                    accept="image/*"
                    style={{ display: 'none' }}
                  />
                  {avatarImage && (
                    <button
                      type="button"
                      className="btn-text-danger"
                      onClick={() => setAvatarImage('')}
                    >
                      Remove Photo
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Edit Mode vs View Mode */}
            {isOwnProfile && isEditing ? (
              <form onSubmit={handleSave} className="profile-edit-form">
                <div className="form-group">
                  <label className="form-label">Display Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={30}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Bio / Status</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    placeholder="Tell something about yourself..."
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={200}
                  />
                  <div className="form-hint">{bio.length}/200 characters</div>
                </div>

                <div className="profile-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setIsEditing(false);
                      setDisplayName(currentUser.displayName || '');
                      setBio(currentUser.bio || '');
                      setAvatarImage(currentUser.avatarImage || '');
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="profile-view-content">
                <div className="profile-name-section">
                  <h2>{activeUser.displayName}</h2>
                  <span className="profile-username">@{activeUser.username}</span>
                </div>

                {/* Bio */}
                <div className="profile-bio-card">
                  <h4>Bio</h4>
                  <p>{activeUser.bio ? activeUser.bio : <span className="text-muted-italic">No bio added yet.</span>}</p>
                </div>

                {/* Stats / Friends Info */}
                <div className="profile-stats-card">
                  <div className="profile-stat-item">
                    <Users size={18} className="profile-stat-icon" />
                    <div>
                      <div className="profile-stat-value">
                        {activeUser.friendsCount !== undefined ? activeUser.friendsCount : (activeUser.friends?.length || 0)}
                      </div>
                      <div className="profile-stat-label">Friends</div>
                    </div>
                  </div>
                </div>

                {/* Friend list of user (if available) */}
                {activeUser.friends && activeUser.friends.length > 0 && (
                  <div className="profile-friends-section">
                    <h4>Friends List ({activeUser.friends.length})</h4>
                    <div className="profile-friends-list">
                      {activeUser.friends.map((f) => (
                        <div
                          key={f.id}
                          className="profile-friend-chip"
                          onClick={() => {
                            if (onSelectFriend && f.id !== currentUser.id) {
                              onSelectFriend(f);
                              onClose();
                            }
                          }}
                        >
                          <div
                            className="avatar avatar-sm"
                            style={{
                              background: f.avatarImage ? 'transparent' : f.avatarColor || 'var(--accent-violet)',
                            }}
                          >
                            {f.avatarImage ? (
                              <img src={f.avatarImage} alt="" className="avatar-img-round" />
                            ) : (
                              getInitials(f.displayName)
                            )}
                          </div>
                          <span>{f.displayName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Buttons */}
                {isOwnProfile && (
                  <div className="profile-actions" style={{ marginTop: 'var(--space-xl)' }}>
                    <button
                      type="button"
                      className="btn btn-primary w-full"
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit3 size={16} style={{ marginRight: 6 }} />
                      Edit Profile
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
