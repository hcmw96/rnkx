export const AuthenticatedAthleteProvider = ({ children }: any) => children;
export const useAuthenticatedAthlete = () => ({
  athleteId: null,
  wearables: [],
  isPremium: false,
  primarySource: null,
  isLoading: false,
});
