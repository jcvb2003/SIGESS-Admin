import { supabase } from "@/lib/supabase";

// Settings service - interacts with Supabase Auth for profile and localStorage for local UI preferences
export const settingsService = {
  async getSettings() {
    const { data: { user } } = await supabase.auth.getUser();
    
    // UI preferences stored locally
    const savedNotifications = localStorage.getItem("ui_notifications");
    const notifications = savedNotifications ? JSON.parse(savedNotifications) : {
      newClients: true,
      subscriptionExpiry: true,
      storageLimit: true
    };

    return {
      profile: { 
        name: user?.user_metadata?.full_name || "Administrador", 
        email: user?.email || "admin@empresa.com" 
      },
      notifications
    };
  },
  async updateProfile(profile: { name: string }) {
    const { data, error } = await supabase.auth.updateUser({
      data: { full_name: profile.name }
    });

    if (error) throw new Error(error.message);
    return data.user;
  },
  async updateNotifications(notifications: Record<string, boolean>) {
    localStorage.setItem("ui_notifications", JSON.stringify(notifications));
    return notifications;
  }
};
