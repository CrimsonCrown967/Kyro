import { me } from "./convex.js";
export const useAuth = () => ({
  user: me,
  isLoading: false,
  isAuthenticated: true,
  signIn: async () => {},
  signOut: async () => {},
});
