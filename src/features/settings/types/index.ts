export interface UserProfile {
  name: string;
  email: string;
}

export interface NotificationSettings {
  newClients: boolean;
  subscriptionExpiry: boolean;
  storageLimit: boolean;
}

export interface SettingsState {
  profile: UserProfile;
  notifications: NotificationSettings;
}
