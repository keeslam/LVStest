import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { useState, useRef, useEffect } from "react";
import {
  User,
  LogOut,
  UserCog,
  ChevronDown,
  Database,
  Globe,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserRole } from "@shared/schema";
import { BackupDialog } from "@/components/dialogs/backup-dialog";
import { UsersDialog } from "@/components/dialogs/users-dialog";
import { ProfileDialog } from "@/components/dialogs/profile-dialog";

export function UserMenu() {
  const { user, logoutMutation } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [usersDialogOpen, setUsersDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const getUserInitials = () => {
    if (!user) return "?";
    
    if (user.fullName) {
      const nameParts = user.fullName.split(" ");
      if (nameParts.length >= 2) {
        return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase();
      }
      return user.fullName[0].toUpperCase();
    }
    
    return user.username[0].toUpperCase();
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuRef]);

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleOpenUsersDialog = () => {
    setIsOpen(false);
    setUsersDialogOpen(true);
  };

  const handleOpenBackupDialog = () => {
    setIsOpen(false);
    setBackupDialogOpen(true);
  };

  const handleOpenProfileDialog = () => {
    setIsOpen(false);
    setProfileDialogOpen(true);
  };

  if (!user) return null;

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button 
          className="flex items-center space-x-1 rounded-full p-1 hover:bg-gray-100 transition-colors duration-200"
          onClick={() => setIsOpen(!isOpen)}
          data-testid="user-menu-button"
        >
          <Avatar className="h-8 w-8 border border-gray-200">
            <AvatarFallback>{getUserInitials()}</AvatarFallback>
          </Avatar>
          <span className="max-w-[150px] truncate font-medium text-sm hidden sm:block">
            {user.fullName || user.username}
          </span>
          <ChevronDown className="h-4 w-4 text-gray-500 hidden sm:block" />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50">
            <div className="p-3 border-b border-gray-100">
              <p className="text-sm font-medium">{user.fullName || user.username}</p>
              <p className="text-xs text-gray-500 truncate">{user.email || 'No email set'}</p>
            </div>
            
            <div className="py-1">
              <button
                onClick={handleOpenProfileDialog}
                className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left"
                data-testid="menu-profile"
              >
                <User className="mr-2 h-4 w-4" />
                Profile
              </button>

              {user.role === UserRole.ADMIN && (
                <>
                  <div className="px-3 py-1 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-500">Administration</p>
                  </div>
                  <button
                    onClick={handleOpenUsersDialog}
                    className="flex w-full items-center px-4 py-2 text-sm text-primary-600 hover:bg-gray-100 text-left font-medium"
                    data-testid="menu-users"
                  >
                    <UserCog className="mr-2 h-4 w-4" />
                    Users
                  </button>
                  <button
                    onClick={handleOpenBackupDialog}
                    className="flex w-full items-center px-4 py-2 text-sm text-primary-600 hover:bg-gray-100 text-left font-medium"
                    data-testid="menu-backup"
                  >
                    <Database className="mr-2 h-4 w-4" />
                    Backup Management
                  </button>
                  <Link
                    href="/settings"
                    onClick={() => setIsOpen(false)}
                    className="flex w-full items-center px-4 py-2 text-sm text-primary-600 hover:bg-gray-100 text-left font-medium"
                    data-testid="menu-settings"
                  >
                    <Globe className="mr-2 h-4 w-4" />
                    App Settings
                  </Link>
                </>
              )}
            </div>
            
            <div className="py-1 border-t border-gray-100">
              <button
                className="flex w-full items-center px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                onClick={handleLogout}
                data-testid="menu-logout"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </button>
            </div>
          </div>
        )}
      </div>

      <BackupDialog open={backupDialogOpen} onOpenChange={setBackupDialogOpen} />
      <UsersDialog open={usersDialogOpen} onOpenChange={setUsersDialogOpen} />
      <ProfileDialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen} />
    </>
  );
}
