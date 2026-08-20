import { createContext, ReactNode, useContext, useEffect } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { User } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { registerSessionExpiredHandler, unregisterSessionExpiredHandler } from "@/lib/session-expiry";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

// Define types
type LoginData = {
  username: string;
  password: string;
};

type RegisterData = {
  username: string;
  password: string;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<User, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<User, Error, RegisterData>;
};

// Create context
const AuthContext = createContext<AuthContextType | null>(null);

// Provider component
function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [_, navigate] = useLocation();
  
  // Fetch current user
  const {
    data: user,
    error,
    isLoading,
    refetch: refetchUser
  } = useQuery<User | null, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 1000 * 60, // 1 minute
    retry: false
  });
  
  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      if (!res.ok) {
        throw new Error("Login failed");
      }
      return await res.json();
    },
    onSuccess: (userData: User) => {
      queryClient.setQueryData(["/api/user"], userData);
      refetchUser();
      toast({
        title: "Logged in successfully",
        description: `Welcome back, ${userData.username}!`,
      });
      navigate("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid username or password",
        variant: "destructive",
      });
    },
  });
  
  // Register mutation
  const registerMutation = useMutation({
    mutationFn: async (credentials: RegisterData) => {
      const res = await apiRequest("POST", "/api/register", credentials);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Registration failed");
      }
      return await res.json();
    },
    onSuccess: (userData: User) => {
      queryClient.setQueryData(["/api/user"], userData);
      refetchUser();
      toast({
        title: "Registration successful",
        description: `Welcome, ${userData.username}!`,
      });
      navigate("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        const res = await apiRequest("POST", "/api/logout");
        // Treat 401 as success since session is already gone
        if (!res.ok && res.status !== 401) {
          throw new Error("Logout failed");
        }
      } catch (error: any) {
        // If 401, session already expired - treat as success
        if (error.message && !error.message.includes("401")) {
          throw error;
        }
      }
    },
    onSuccess: () => {
      // Clear user data from cache
      queryClient.setQueryData(["/api/user"], null);
      
      // Clear all queries in the cache to force a clean state
      queryClient.clear();
      
      toast({
        title: "Logged out successfully",
      });
      
      // Force navigation to auth page and refresh
      window.location.href = "/auth";
    },
    onError: (error: Error) => {
      // Even on error, force local logout for safety
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear();
      
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
      
      // Still redirect to auth page
      window.location.href = "/auth";
    },
  });

  // Register session expiry handler on mount
  useEffect(() => {
    const handleSessionExpired = async () => {
      // Only logout if not already logged out
      if (user) {
        await logoutMutation.mutateAsync();
      }
    };
    
    registerSessionExpiredHandler(handleSessionExpired);
    
    return () => {
      unregisterSessionExpiredHandler();
    };
  }, [logoutMutation, user]);

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the auth context
function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export { AuthProvider, useAuth, AuthContext };