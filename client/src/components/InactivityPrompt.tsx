import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

const INACTIVITY_WARNING = 14 * 60 * 1000; // 14 minutes - show warning 1 minute before timeout
const HEARTBEAT_INTERVAL = 2 * 60 * 1000; // Send heartbeat every 2 minutes during activity

interface InactivityPromptProps {
  onLogout: () => void;
}

export function InactivityPrompt({ onLogout }: InactivityPromptProps) {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const { toast } = useToast();
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Send heartbeat to keep session alive
  const sendHeartbeat = useCallback(async () => {
    try {
      await apiRequest('POST', '/api/session/heartbeat', {});
    } catch (error) {
      // If heartbeat fails with 401, session has expired
      console.log('Heartbeat failed - session likely expired');
    }
  }, []);
  
  const resetTimer = useCallback(() => {
    // Clear existing timers
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    
    // Hide warning if showing
    setShowWarning(false);
    setCountdown(60);
    
    // Set new warning timer (show warning at 14 minutes)
    warningTimeoutRef.current = setTimeout(() => {
      console.log('⏰ Showing inactivity warning after 14 minutes');
      setShowWarning(true);
      setCountdown(60);
      
      // Start countdown
      let secondsLeft = 60;
      countdownIntervalRef.current = setInterval(() => {
        secondsLeft--;
        setCountdown(secondsLeft);
        
        if (secondsLeft <= 0) {
          // Time's up - logout
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
          }
          console.log('⏰ Session expired - logging out');
          toast({
            title: "Session Expired",
            description: "You've been logged out due to inactivity",
            variant: "destructive",
          });
          onLogout();
        }
      }, 1000);
    }, INACTIVITY_WARNING);
  }, [onLogout, toast]);
  
  // Handle user activity
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      if (!showWarning) {
        resetTimer();
      }
    };
    
    events.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });
    
    // Start initial timer
    console.log('⏰ Starting inactivity timer (14 minutes until warning)');
    resetTimer();
    
    // Start heartbeat interval
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    
    // Cleanup
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [resetTimer, sendHeartbeat]);
  
  const handleStayLoggedIn = () => {
    // User wants to stay logged in - send heartbeat and reset timer
    sendHeartbeat();
    resetTimer();
  };
  
  const handleLogoutNow = () => {
    onLogout();
  };
  
  return (
    <Dialog open={showWarning} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md" 
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Session Expiring Soon</DialogTitle>
          <DialogDescription>
            You've been inactive for 14 minutes. Your session will expire in {countdown} seconds due to inactivity.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 text-center">
          <p className="text-lg font-semibold">
            {countdown} second{countdown !== 1 ? 's' : ''} remaining
          </p>
        </div>
        
        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button 
            variant="outline" 
            onClick={handleLogoutNow}
            data-testid="button-logout-now"
          >
            Logout Now
          </Button>
          <Button 
            onClick={handleStayLoggedIn}
            data-testid="button-stay-logged-in"
          >
            Stay Logged In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
