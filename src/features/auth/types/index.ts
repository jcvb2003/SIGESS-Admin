export interface AuthUser {
  id: string;
  email: string | null;
  isAdmin: boolean;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}
