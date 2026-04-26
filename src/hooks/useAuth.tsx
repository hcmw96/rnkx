export function useAuth() {
  return {
    user: null,
    session: null,
    loading: false,
    signOut: async () => {},
  };
}
